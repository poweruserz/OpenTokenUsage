use super::cache::{cache_state, enabled_snapshots_ordered};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

const BIND_ADDR: &str = "127.0.0.1:6736";
const MAX_CONCURRENT_CONNECTIONS: usize = 16;
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(5);

struct ConnectionLimiter {
    active: Arc<AtomicUsize>,
    max: usize,
}

struct ConnectionPermit {
    active: Arc<AtomicUsize>,
}

impl ConnectionLimiter {
    fn new(max: usize) -> Self {
        Self {
            active: Arc::new(AtomicUsize::new(0)),
            max,
        }
    }

    fn acquire(&self) -> Option<ConnectionPermit> {
        loop {
            let active = self.active.load(Ordering::Acquire);
            if active >= self.max {
                return None;
            }
            if self
                .active
                .compare_exchange(active, active + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Some(ConnectionPermit {
                    active: Arc::clone(&self.active),
                });
            }
        }
    }

    #[cfg(test)]
    fn active_count(&self) -> usize {
        self.active.load(Ordering::Acquire)
    }
}

impl Drop for ConnectionPermit {
    fn drop(&mut self) {
        self.active.fetch_sub(1, Ordering::AcqRel);
    }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

pub fn start_server() {
    std::thread::spawn(|| {
        let listener = match TcpListener::bind(BIND_ADDR) {
            Ok(l) => {
                log::info!("local HTTP API listening on {}", BIND_ADDR);
                l
            }
            Err(e) => {
                log::warn!(
                    "failed to bind local HTTP API on {}: {} — feature disabled for this session",
                    BIND_ADDR,
                    e
                );
                return;
            }
        };

        let limiter = ConnectionLimiter::new(MAX_CONCURRENT_CONNECTIONS);
        for stream in listener.incoming() {
            match stream {
                Ok(mut stream) => {
                    let Some(permit) = limiter.acquire() else {
                        log::warn!(
                            "local HTTP API connection limit reached (max={})",
                            MAX_CONCURRENT_CONNECTIONS
                        );
                        let _ = stream.set_write_timeout(Some(CONNECTION_TIMEOUT));
                        let _ = stream.write_all(response_service_unavailable().as_bytes());
                        let _ = stream.flush();
                        continue;
                    };
                    std::thread::spawn(move || handle_connection(stream, permit));
                }
                Err(e) => log::debug!("local HTTP API accept error: {}", e),
            }
        }
    });
}

fn handle_connection(mut stream: TcpStream, _permit: ConnectionPermit) {
    let _ = stream.set_read_timeout(Some(CONNECTION_TIMEOUT));
    let _ = stream.set_write_timeout(Some(CONNECTION_TIMEOUT));

    let Some(request) = read_request(&mut stream) else {
        return;
    };
    let response = handle_request(&request);
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

const MAX_HEADER_BYTES: usize = 8 * 1024;

fn header_end(data: &[u8]) -> Option<usize> {
    data.windows(4).position(|w| w == b"\r\n\r\n")
}

fn content_length(head: &str) -> usize {
    head.lines()
        .filter_map(|line| line.split_once(':'))
        .find(|(name, _)| name.trim().eq_ignore_ascii_case("content-length"))
        .and_then(|(_, value)| value.trim().parse().ok())
        .unwrap_or(0)
}

/// Headers, then as much body as `Content-Length` announces (a statusLine post carries one), up to
/// `MAX_BODY_BYTES`. A longer body is cut there and fails its JSON parse.
fn read_request(stream: &mut impl Read) -> Option<Vec<u8>> {
    let mut data = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        if let Some(end) = header_end(&data) {
            let wanted = content_length(&String::from_utf8_lossy(&data[..end]))
                .min(crate::claude_statusline::MAX_BODY_BYTES);
            if data.len() >= end + 4 + wanted {
                return Some(data);
            }
        } else if data.len() > MAX_HEADER_BYTES {
            return Some(data);
        }
        match stream.read(&mut buf) {
            Ok(0) => return (!data.is_empty()).then_some(data),
            Ok(n) => data.extend_from_slice(&buf[..n]),
            Err(_) => return (!data.is_empty()).then_some(data),
        }
    }
}

fn handle_request(raw: &[u8]) -> String {
    let (head, body) = match header_end(raw) {
        Some(end) => (&raw[..end], &raw[end + 4..]),
        None => (raw, &[][..]),
    };
    let request = String::from_utf8_lossy(head);
    let body = &body[..body.len().min(content_length(&request))];
    // Parse request line: "METHOD /path HTTP/1.x\r\n..."
    let mut lines = request.lines();
    let first_line = lines.next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let raw_path = parts.next().unwrap_or("");

    let mut host = None;
    let mut origin = None;
    for line in lines.take_while(|l| !l.is_empty()) {
        if let Some((name, value)) = line.split_once(':') {
            let name = name.trim();
            if name.eq_ignore_ascii_case("host") {
                host.get_or_insert(value.trim());
            } else if name.eq_ignore_ascii_case("origin") {
                origin.get_or_insert(value.trim());
            }
        }
    }

    // Block browsers: a DNS-rebound page sends its own Host, a cross-site page sends its Origin.
    let host_ok = host.is_some_and(is_loopback_host);
    let origin_ok = origin.is_none_or(|o| o.strip_prefix("http://").is_some_and(is_loopback_host));
    if !host_ok || !origin_ok {
        return response_forbidden();
    }

    // Strip query string and trailing slash (but keep root "/v1/usage" intact)
    let path = raw_path.split('?').next().unwrap_or(raw_path);
    let path = if path.len() > 1 {
        path.trim_end_matches('/')
    } else {
        path
    };

    route(method, path, body)
}

/// `127.0.0.1`, `localhost` or `[::1]`, optionally with this server's port.
fn is_loopback_host(value: &str) -> bool {
    let value = value.to_ascii_lowercase();
    let port_suffix = &BIND_ADDR[BIND_ADDR.rfind(':').unwrap_or(BIND_ADDR.len())..];
    let host = value.strip_suffix(port_suffix).unwrap_or(&value);
    matches!(host, "127.0.0.1" | "localhost" | "[::1]")
}

fn route(method: &str, path: &str, body: &[u8]) -> String {
    // Match routes
    if path == crate::claude_statusline::ROUTE {
        return match method {
            "POST" => handle_post_claude_statusline(body),
            _ => response_method_not_allowed(),
        };
    }

    if path == "/v1/usage" {
        return match method {
            "GET" => handle_get_usage_collection(),
            _ => response_method_not_allowed(),
        };
    }

    if let Some(provider_id) = path.strip_prefix("/v1/usage/") {
        if !provider_id.is_empty() && !provider_id.contains('/') {
            return match method {
                "GET" => handle_get_usage_single(provider_id),
                _ => response_method_not_allowed(),
            };
        }
    }

    response_not_found("not_found")
}

fn handle_get_usage_collection() -> String {
    let snapshots = {
        let state = cache_state().lock().expect("cache state poisoned");
        enabled_snapshots_ordered(&state)
    };
    let body = serde_json::to_string(&snapshots).unwrap_or_else(|_| "[]".to_string());
    response_json(200, "OK", &body)
}

/// Claude Code's status-line command posts its stdin here (see `claude_statusline.rs`). The empty
/// answer leaves Claude Code's status line blank.
fn handle_post_claude_statusline(body: &[u8]) -> String {
    let app_data_dir = cache_state()
        .lock()
        .map(|state| state.app_data_dir.clone())
        .unwrap_or_default();
    if app_data_dir.as_os_str().is_empty() || !crate::claude_statusline::record(body, &app_data_dir)
    {
        return response_json(400, "Bad Request", r#"{"error":"no_rate_limits"}"#);
    }
    response_no_content()
}

fn handle_get_usage_single(provider_id: &str) -> String {
    let state = cache_state().lock().expect("cache state poisoned");

    // Check if provider is known at all
    let is_known = state.known_plugin_ids.iter().any(|id| id == provider_id);
    if !is_known {
        return response_not_found("provider_not_found");
    }

    match state.snapshots.get(provider_id) {
        Some(snapshot) => {
            let body = serde_json::to_string(snapshot).unwrap_or_else(|_| "{}".to_string());
            response_json(200, "OK", &body)
        }
        None => response_no_content(),
    }
}

// ---------------------------------------------------------------------------
// HTTP response builders
// ---------------------------------------------------------------------------

// No CORS headers on purpose: browsers must not read usage data (see docs/local-http-api.md).
fn response_json(status: u16, reason: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {} {}\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
        status,
        reason,
        body.len(),
        body,
    )
}

fn response_no_content() -> String {
    "HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n".to_string()
}

fn response_forbidden() -> String {
    response_json(403, "Forbidden", r#"{"error":"forbidden"}"#)
}

fn response_not_found(error_code: &str) -> String {
    let body = format!(r#"{{"error":"{}"}}"#, error_code);
    response_json(404, "Not Found", &body)
}

fn response_method_not_allowed() -> String {
    let body = r#"{"error":"method_not_allowed"}"#;
    response_json(405, "Method Not Allowed", body)
}

fn response_service_unavailable() -> String {
    let body = r#"{"error":"server_busy"}"#;
    response_json(503, "Service Unavailable", body)
}

#[cfg(test)]
mod tests {
    use super::super::cache::{cache_state, CachedPluginSnapshot};
    use super::*;
    use serial_test::serial;

    fn make_snapshot(id: &str, name: &str) -> CachedPluginSnapshot {
        CachedPluginSnapshot {
            provider_id: id.to_string(),
            display_name: name.to_string(),
            plan: Some("Pro".to_string()),
            lines: vec![],
            fetched_at: "2026-03-26T08:15:30Z".to_string(),
        }
    }

    #[test]
    fn route_get_usage_returns_200() {
        let resp = route("GET", "/v1/usage", b"");
        assert!(resp.starts_with("HTTP/1.1 200"));
    }

    #[test]
    fn route_unknown_path_returns_404() {
        let resp = route("GET", "/v2/something", b"");
        assert!(resp.starts_with("HTTP/1.1 404"));
    }

    #[test]
    fn route_post_returns_405() {
        let resp = route("POST", "/v1/usage", b"");
        assert!(resp.starts_with("HTTP/1.1 405"));
    }

    fn request(headers: &str) -> String {
        handle_request(format!("GET /v1/usage HTTP/1.1\r\n{headers}\r\n").as_bytes())
    }

    #[test]
    fn loopback_host_is_allowed_without_cors_headers() {
        for host in [
            "127.0.0.1:6736",
            "localhost:6736",
            "[::1]:6736",
            "LOCALHOST:6736",
            "127.0.0.1",
        ] {
            let resp = request(&format!("Host: {host}\r\n"));
            assert!(resp.starts_with("HTTP/1.1 200"), "host {host}: {resp}");
            assert!(!resp.contains("Access-Control-Allow"), "{resp}");
        }
    }

    #[test]
    fn foreign_or_missing_host_is_forbidden() {
        for headers in [
            "Host: evil.com:6736\r\n",
            "Host: evil.com\r\n",
            "Host: 127.0.0.1:80\r\n",
            "Host: 127.0.0.1.evil.com:6736\r\n",
            "",
        ] {
            let resp = request(headers);
            assert!(resp.starts_with("HTTP/1.1 403"), "{headers}: {resp}");
            assert!(resp.contains(r#"{"error":"forbidden"}"#));
        }
    }

    #[test]
    fn foreign_origin_is_forbidden() {
        for origin in ["https://evil.com", "http://evil.com:6736", "null"] {
            let resp = request(&format!("Host: 127.0.0.1:6736\r\nOrigin: {origin}\r\n"));
            assert!(resp.starts_with("HTTP/1.1 403"), "{origin}: {resp}");
        }
    }

    #[test]
    fn loopback_origin_is_allowed() {
        let resp = request("host: localhost:6736\r\norigin: http://localhost:6736\r\n");
        assert!(resp.starts_with("HTTP/1.1 200"), "{resp}");
    }

    #[test]
    fn options_preflight_is_not_granted() {
        let resp = handle_request(b"OPTIONS /v1/usage HTTP/1.1\r\nHost: 127.0.0.1:6736\r\n\r\n");
        assert!(resp.starts_with("HTTP/1.1 405"), "{resp}");
        assert!(!resp.contains("Access-Control-Allow"));
    }

    #[test]
    #[serial]
    fn route_unknown_provider_returns_404() {
        {
            let mut state = cache_state().lock().unwrap();
            state.known_plugin_ids = vec!["claude".to_string()];
            state.snapshots.clear();
        }

        let resp = route("GET", "/v1/usage/nonexistent", b"");
        assert!(resp.starts_with("HTTP/1.1 404"));
        assert!(resp.contains("provider_not_found"));
    }

    #[test]
    #[serial]
    fn route_known_uncached_provider_returns_204() {
        {
            let mut state = cache_state().lock().unwrap();
            state.known_plugin_ids = vec!["claude".to_string()];
            state.snapshots.clear();
        }

        let resp = route("GET", "/v1/usage/claude", b"");
        assert!(resp.starts_with("HTTP/1.1 204"));
    }

    #[test]
    #[serial]
    fn route_known_cached_provider_returns_200() {
        {
            let mut state = cache_state().lock().unwrap();
            state.known_plugin_ids = vec!["claude".to_string()];
            state
                .snapshots
                .insert("claude".to_string(), make_snapshot("claude", "Claude"));
        }

        let resp = route("GET", "/v1/usage/claude", b"");
        assert!(resp.starts_with("HTTP/1.1 200"));
        assert!(resp.contains("fetchedAt"));
    }

    #[test]
    fn response_json_has_no_cors_headers() {
        let resp = response_json(200, "OK", "[]");
        assert!(!resp.contains("Access-Control-Allow"));
        assert!(resp.contains("Content-Type: application/json; charset=utf-8"));
    }

    #[test]
    fn connection_limiter_rejects_above_capacity_and_releases_on_drop() {
        let limiter = ConnectionLimiter::new(2);
        let first = limiter.acquire().expect("first permit");
        let second = limiter.acquire().expect("second permit");

        assert!(limiter.acquire().is_none());
        assert_eq!(limiter.active_count(), 2);

        drop(first);

        let third = limiter.acquire().expect("permit after release");
        assert_eq!(limiter.active_count(), 2);

        drop(second);
        drop(third);
        assert_eq!(limiter.active_count(), 0);
    }

    #[test]
    fn response_service_unavailable_returns_503_json() {
        let resp = response_service_unavailable();

        assert!(resp.starts_with("HTTP/1.1 503"));
        assert!(resp.contains(r#""error":"server_busy""#));
    }

    /// Hands out one chunk per read, the way a socket delivers a request in pieces.
    struct Chunks(Vec<Vec<u8>>);

    impl Read for Chunks {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            if self.0.is_empty() {
                return Ok(0);
            }
            let chunk = self.0.remove(0);
            buf[..chunk.len()].copy_from_slice(&chunk);
            Ok(chunk.len())
        }
    }

    #[test]
    fn reads_a_body_that_arrives_after_the_headers() {
        let body = r#"{"rate_limits":{}}"#;
        let head = format!(
            "POST /v1/claude/statusline HTTP/1.1\r\nHost: 127.0.0.1:6736\r\nContent-Length: {}\r\n\r\n",
            body.len()
        );
        let mut stream = Chunks(vec![
            head.into_bytes(),
            body[..5].as_bytes().to_vec(),
            body[5..].as_bytes().to_vec(),
        ]);
        let request = read_request(&mut stream).unwrap();
        assert!(request.ends_with(body.as_bytes()));
        assert!(stream.0.is_empty());
    }

    #[test]
    #[serial]
    fn a_statusline_post_saves_the_claude_snapshot() {
        let dir =
            std::env::temp_dir().join(format!("openusage-http-statusline-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        cache_state().lock().unwrap().app_data_dir = dir.clone();

        let body = r#"{"rate_limits":{"five_hour":{"used_percentage":42,"resets_at":1793500000}}}"#;
        let post = |headers: &str| {
            handle_request(
                format!(
                    "POST /v1/claude/statusline HTTP/1.1\r\n{headers}Content-Length: {}\r\n\r\n{body}",
                    body.len()
                )
                .as_bytes(),
            )
        };
        assert!(post("Origin: https://evil.com\r\nHost: 127.0.0.1:6736\r\n")
            .starts_with("HTTP/1.1 403"));
        assert!(!dir.exists(), "a cross-site post writes nothing");

        let resp = post("Host: 127.0.0.1:6736\r\n");
        assert!(resp.starts_with("HTTP/1.1 204"), "{resp}");
        let saved =
            std::fs::read_to_string(dir.join("plugins_data/claude/statusline.json")).unwrap();
        assert!(saved.contains(r#""usedPercent":42.0"#), "{saved}");

        assert!(route("GET", "/v1/claude/statusline", b"").starts_with("HTTP/1.1 405"));
        assert!(route("POST", "/v1/claude/statusline", b"{}").starts_with("HTTP/1.1 400"));
    }
}
