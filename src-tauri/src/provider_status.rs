//! "Is it me or them?" — reads a provider's public Statuspage `status.json`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

const CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderStatus {
    /// "none" | "minor" | "major" | "critical" | "maintenance"
    pub indicator: String,
    pub description: String,
}

#[derive(Deserialize)]
struct StatusResponse {
    status: ProviderStatus,
}

/// Last successful status per plugin id, so reopening the panel doesn't refetch.
static CACHE: LazyLock<Mutex<HashMap<String, (Instant, ProviderStatus)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn parse_status(body: &str) -> Result<ProviderStatus, String> {
    serde_json::from_str::<StatusResponse>(body)
        .map(|r| r.status)
        .map_err(|e| format!("invalid status.json: {}", e))
}

fn cache_get(plugin_id: &str, now: Instant) -> Option<ProviderStatus> {
    let cache = CACHE.lock().expect("status cache poisoned");
    cache
        .get(plugin_id)
        .filter(|(at, _)| now.duration_since(*at) < CACHE_TTL)
        .map(|(_, status)| status.clone())
}

fn cache_put(plugin_id: &str, status: ProviderStatus, now: Instant) {
    let mut cache = CACHE.lock().expect("status cache poisoned");
    cache.insert(plugin_id.to_string(), (now, status));
}

async fn fetch_status(base_url: &str) -> Result<ProviderStatus, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .user_agent("OpenTokenUsage");
    if let Some(proxy) = crate::config::resolved_proxy() {
        builder = builder.proxy(proxy);
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    let response = client
        .get(format!("{}/api/v2/status.json", base_url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let body = response.text().await.map_err(|e| e.to_string())?;
    parse_status(&body)
}

/// `None` when the plugin declares no `statusPageUrl`.
#[tauri::command]
pub async fn get_provider_status(
    state: tauri::State<'_, Mutex<crate::AppState>>,
    plugin_id: String,
) -> Result<Option<ProviderStatus>, String> {
    let base_url = {
        let locked = state.lock().expect("plugin state poisoned");
        locked
            .plugins
            .iter()
            .find(|p| p.manifest.id == plugin_id)
            .and_then(|p| p.manifest.status_page_url.clone())
    };
    let Some(base_url) = base_url else {
        return Ok(None);
    };
    if let Some(status) = cache_get(&plugin_id, Instant::now()) {
        return Ok(Some(status));
    }
    let status = fetch_status(&base_url).await.map_err(|e| {
        log::warn!("[status] {} status check failed: {}", plugin_id, e);
        e
    })?;
    cache_put(&plugin_id, status.clone(), Instant::now());
    Ok(Some(status))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_statuspage_and_incident_io_shapes() {
        // Atlassian Statuspage (status.claude.com)
        let atlassian = r#"{"page":{"id":"x","name":"Claude","url":"https://status.claude.com"},
            "status":{"indicator":"major","description":"Partial System Outage"}}"#;
        assert_eq!(
            parse_status(atlassian).unwrap(),
            ProviderStatus {
                indicator: "major".to_string(),
                description: "Partial System Outage".to_string(),
            }
        );
        // incident.io (status.openai.com): same fields, different order
        let incident_io = r#"{"page":{"id":"y"},"status":{"description":"All Systems Operational","indicator":"none"}}"#;
        assert_eq!(parse_status(incident_io).unwrap().indicator, "none");
    }

    #[test]
    fn rejects_non_statuspage_bodies() {
        assert!(parse_status("<!DOCTYPE html>").is_err());
        assert!(parse_status(r#"{"status":"ok"}"#).is_err());
    }

    #[test]
    fn cache_expires_after_ttl() {
        let t0 = Instant::now();
        let status = ProviderStatus {
            indicator: "minor".to_string(),
            description: "Degraded".to_string(),
        };
        cache_put("cache-test", status.clone(), t0);

        assert_eq!(
            cache_get("cache-test", t0 + Duration::from_secs(299)),
            Some(status)
        );
        assert_eq!(cache_get("cache-test", t0 + CACHE_TTL), None);
        assert_eq!(cache_get("cache-test-other", t0), None);
    }
}
