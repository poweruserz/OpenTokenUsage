//! Claude Code's statusLine bridge. Claude Code hands its status-line command a JSON object on
//! stdin that carries the account's 5-hour and weekly usage (`rate_limits`), taken from its own API
//! responses. With the bridge on, Claude's `settings.json` runs curl to post that object to the
//! local HTTP API, and the Claude plugin shows it instead of asking Anthropic's usage endpoint
//! (about 30 reads an hour per account, shared with Claude Code itself).

use serde::de::{Deserializer, MapAccess, Visitor};
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub(crate) const ROUTE: &str = "/v1/claude/statusline";
/// Fixed: the webview can only switch the bridge on or off, never choose what Claude Code runs.
/// `curl.exe` ships with Windows 10 and 11; `-s` keeps a failed post (app not running) quiet, and
/// `--noproxy` keeps an `HTTP_PROXY` in Claude Code's environment from sending the post (and the
/// session's paths) to a proxy that can't reach this machine's loopback.
const COMMAND: &str =
    "curl.exe -s -m 2 --noproxy 127.0.0.1 --data-binary @- http://127.0.0.1:6736/v1/claude/statusline";
pub(crate) const MAX_BODY_BYTES: usize = 64 * 1024;
/// Claude Code runs the command after every message; an unchanged answer is rewritten this often,
/// only so the plugin can tell a live snapshot from an old one.
const REWRITE_AFTER: Duration = Duration::from_secs(60);
const SNAPSHOT_FILE: &str = "statusline.json";
const STATUS_LINE_KEY: &str = "statusLine";

// ---------------------------------------------------------------------------
// The snapshot Claude Code posts
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct Input {
    rate_limits: Option<InputLimits>,
}

#[derive(Deserialize)]
struct InputLimits {
    five_hour: Option<InputWindow>,
    seven_day: Option<InputWindow>,
}

#[derive(Deserialize)]
struct InputWindow {
    used_percentage: Option<f64>,
    /// Unix seconds.
    resets_at: Option<f64>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Window {
    used_percent: f64,
    resets_at_ms: u64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Limits {
    five_hour: Option<Window>,
    seven_day: Option<Window>,
}

fn window(input: Option<InputWindow>) -> Option<Window> {
    let input = input?;
    let used = input
        .used_percentage
        .filter(|v| v.is_finite() && *v >= 0.0)?;
    let resets = input.resets_at.filter(|v| v.is_finite() && *v > 0.0)?;
    Some(Window {
        used_percent: used.min(1000.0),
        resets_at_ms: (resets * 1000.0) as u64,
    })
}

/// The 5-hour and weekly windows in a statusLine object, or `None` when it has neither (an API-key
/// session, or before Claude Code's first answer).
fn parse_limits(body: &[u8]) -> Option<Limits> {
    let limits = serde_json::from_slice::<Input>(body).ok()?.rate_limits?;
    let limits = Limits {
        five_hour: window(limits.five_hour),
        seven_day: window(limits.seven_day),
    };
    (limits.five_hour.is_some() || limits.seven_day.is_some()).then_some(limits)
}

#[derive(Deserialize)]
struct ContextInput {
    session_id: Option<String>,
    context_window: Option<InputContext>,
}

#[derive(Deserialize)]
struct InputContext {
    used_percentage: Option<f64>,
}

/// How full each session's context window is, by session id, as its latest post said. In memory
/// only: Claude Code posts again after every message, and a session ends with its process.
type Contexts = HashMap<String, (f64, Instant)>;
const CONTEXT_KEPT: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_CONTEXTS: usize = 256;

fn contexts() -> &'static Mutex<Contexts> {
    static CONTEXTS: OnceLock<Mutex<Contexts>> = OnceLock::new();
    CONTEXTS.get_or_init(Default::default)
}

/// Keeps the context fill a statusLine object reports; false when it has none (no message yet).
fn remember_context(body: &[u8]) -> bool {
    let Ok(input) = serde_json::from_slice::<ContextInput>(body) else {
        return false;
    };
    let (Some(id), Some(used)) = (
        input
            .session_id
            .filter(|id| !id.is_empty() && id.len() <= 128),
        input
            .context_window
            .and_then(|c| c.used_percentage)
            .filter(|v| v.is_finite() && *v >= 0.0),
    ) else {
        return false;
    };
    let mut contexts = contexts().lock().unwrap_or_else(|e| e.into_inner());
    contexts.retain(|_, (_, at)| at.elapsed() < CONTEXT_KEPT);
    if contexts.len() >= MAX_CONTEXTS && !contexts.contains_key(&id) {
        return false;
    }
    contexts.insert(id, (used.min(100.0), Instant::now()));
    true
}

/// The context fill (0-100) Claude Code last reported for a session, with the bridge on.
pub(crate) fn context_percent(session_id: &str) -> Option<f64> {
    let contexts = contexts().lock().unwrap_or_else(|e| e.into_inner());
    contexts.get(session_id).map(|(used, _)| *used)
}

fn last_written() -> &'static Mutex<Option<(Limits, Instant)>> {
    static LAST: Mutex<Option<(Limits, Instant)>> = Mutex::new(None);
    &LAST
}

fn unix_ms(at: SystemTime) -> u64 {
    at.duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// Saves the windows from a posted statusLine object where the Claude plugin reads them
/// (`plugins_data/claude/statusline.json`), and the session's context fill. Returns false when the
/// body has neither.
pub(crate) fn record(body: &[u8], app_data_dir: &Path) -> bool {
    let has_context = remember_context(body);
    let Some(limits) = parse_limits(body) else {
        return has_context;
    };
    let mut last = last_written().lock().unwrap_or_else(|e| e.into_inner());
    if last
        .as_ref()
        .is_some_and(|(prev, at)| *prev == limits && at.elapsed() < REWRITE_AFTER)
    {
        return true;
    }
    let dir = app_data_dir.join("plugins_data").join("claude");
    let snapshot = serde_json::json!({
        "capturedAt": unix_ms(SystemTime::now()),
        "fiveHour": limits.five_hour,
        "sevenDay": limits.seven_day,
    });
    match write_atomic(&dir.join(SNAPSHOT_FILE), &snapshot.to_string()) {
        Ok(()) => *last = Some((limits, Instant::now())),
        Err(e) => log::warn!("claude statusLine snapshot not saved: {e}"),
    }
    true
}

fn write_atomic(path: &Path, text: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)
}

// ---------------------------------------------------------------------------
// Claude's settings.json
// ---------------------------------------------------------------------------

/// Top-level entries in file order, each value kept as written, so switching the bridge leaves the
/// rest of the user's settings exactly as they were.
struct Entries(Vec<(String, Box<RawValue>)>);

impl<'de> Deserialize<'de> for Entries {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct EntriesVisitor;
        impl<'de> Visitor<'de> for EntriesVisitor {
            type Value = Entries;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a JSON object")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Entries, A::Error> {
                let mut entries = Vec::new();
                while let Some(entry) = map.next_entry::<String, Box<RawValue>>()? {
                    entries.push(entry);
                }
                Ok(Entries(entries))
            }
        }
        deserializer.deserialize_map(EntriesVisitor)
    }
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BridgeState {
    Off,
    On,
    /// The user has a status line of their own: the bridge never replaces it.
    Other,
    /// settings.json exists but isn't a JSON object: it's never rewritten.
    Unreadable,
}

fn settings_path() -> Option<PathBuf> {
    let home = dirs::home_dir();
    let configured = crate::plugin_engine::host_api::resolve_env_value("CLAUDE_CONFIG_DIR");
    let dir = match configured.as_deref() {
        Some(dir) => match dir.strip_prefix('~') {
            Some(rest) => home?.join(rest.trim_start_matches(['/', '\\'])),
            None => PathBuf::from(dir),
        },
        None => home?.join(".claude"),
    };
    Some(dir.join("settings.json"))
}

fn read_entries(path: &Path) -> Result<(Entries, &'static str), BridgeState> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(_) => return Err(BridgeState::Unreadable),
    };
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let text = text.trim_start_matches('\u{feff}');
    if text.trim().is_empty() {
        return Ok((Entries(Vec::new()), newline));
    }
    serde_json::from_str::<Entries>(text)
        .map(|entries| (entries, newline))
        .map_err(|_| BridgeState::Unreadable)
}

fn state_of(entries: &Entries) -> BridgeState {
    let Some((_, value)) = entries.0.iter().find(|(key, _)| key == STATUS_LINE_KEY) else {
        return BridgeState::Off;
    };
    let command = serde_json::from_str::<serde_json::Value>(value.get())
        .ok()
        .and_then(|v| v.get("command")?.as_str().map(str::to_string));
    if command.as_deref() == Some(COMMAND) {
        BridgeState::On
    } else {
        BridgeState::Other
    }
}

fn render(entries: &Entries, newline: &str) -> String {
    if entries.0.is_empty() {
        return format!("{{}}{newline}");
    }
    let body = entries
        .0
        .iter()
        .map(|(key, value)| {
            let key = serde_json::to_string(key).unwrap_or_default();
            format!("  {key}: {}", value.get())
        })
        .collect::<Vec<_>>()
        .join(&format!(",{newline}"));
    format!("{{{newline}{body}{newline}}}{newline}")
}

fn bridge_value(newline: &str) -> Box<RawValue> {
    let command = serde_json::to_string(COMMAND).unwrap_or_default();
    let text = format!(
        "{{{newline}    \"type\": \"command\",{newline}    \"command\": {command}{newline}  }}"
    );
    RawValue::from_string(text).expect("bridge value is valid JSON")
}

fn state_at(path: &Path) -> BridgeState {
    match read_entries(path) {
        Ok((entries, _)) => state_of(&entries),
        Err(state) => state,
    }
}

/// Switches the bridge in `path`. Returns the state afterwards, or the state that kept it from
/// changing (`Other`, `Unreadable`) as the error.
fn set_at(path: &Path, enabled: bool) -> Result<BridgeState, BridgeState> {
    let (mut entries, newline) = read_entries(path)?;
    match (state_of(&entries), enabled) {
        (BridgeState::Other, true) => return Err(BridgeState::Other),
        (BridgeState::On, true) => return Ok(BridgeState::On),
        (BridgeState::Off | BridgeState::Other, false) => return Ok(state_of(&entries)),
        (BridgeState::Off, true) => entries
            .0
            .push((STATUS_LINE_KEY.to_string(), bridge_value(newline))),
        (BridgeState::On, false) => entries.0.retain(|(key, _)| key != STATUS_LINE_KEY),
        (BridgeState::Unreadable, _) => return Err(BridgeState::Unreadable),
    }
    write_atomic(path, &render(&entries, newline)).map_err(|e| {
        log::error!("claude settings.json not written: {e}");
        BridgeState::Unreadable
    })?;
    Ok(if enabled {
        BridgeState::On
    } else {
        BridgeState::Off
    })
}

#[tauri::command]
pub fn claude_statusline_state() -> BridgeState {
    settings_path().map_or(BridgeState::Unreadable, |path| state_at(&path))
}

#[tauri::command]
pub fn set_claude_statusline(enabled: bool) -> Result<BridgeState, BridgeState> {
    let path = settings_path().ok_or(BridgeState::Unreadable)?;
    set_at(&path, enabled)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "openusage-statusline-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const POSTED: &str = r#"{"session_id":"s","model":{"id":"claude"},"rate_limits":{
        "five_hour":{"used_percentage":17.4,"resets_at":1793500000},
        "seven_day":{"used_percentage":19,"resets_at":1793900000}}}"#;

    #[test]
    fn command_posts_to_this_route_on_the_local_api() {
        assert!(COMMAND.ends_with(&format!("127.0.0.1:6736{ROUTE}")));
        // Never through an HTTP_PROXY/ALL_PROXY from Claude Code's environment.
        assert!(COMMAND.contains(" --noproxy 127.0.0.1 "));
    }

    #[test]
    fn reads_the_two_windows_and_ignores_everything_else() {
        let limits = parse_limits(POSTED.as_bytes()).unwrap();
        assert_eq!(
            limits.five_hour,
            Some(Window {
                used_percent: 17.4,
                resets_at_ms: 1_793_500_000_000
            })
        );
        assert_eq!(limits.seven_day.unwrap().used_percent, 19.0);
    }

    #[test]
    fn a_body_without_usage_windows_is_not_a_snapshot() {
        for body in [
            r#"{"session_id":"s"}"#,
            r#"{"rate_limits":{}}"#,
            r#"{"rate_limits":{"five_hour":{"used_percentage":"x","resets_at":1}}}"#,
            r#"{"rate_limits":{"five_hour":{"used_percentage":-1,"resets_at":1}}}"#,
            "not json",
        ] {
            assert!(parse_limits(body.as_bytes()).is_none(), "{body}");
        }
    }

    #[test]
    #[serial]
    fn writes_the_snapshot_for_the_claude_plugin_and_skips_unchanged_rewrites() {
        let dir = temp_dir("record");
        *last_written().lock().unwrap() = None;
        assert!(record(POSTED.as_bytes(), &dir));
        let path = dir.join("plugins_data").join("claude").join(SNAPSHOT_FILE);
        let saved: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(saved["fiveHour"]["usedPercent"], 17.4);
        assert_eq!(saved["sevenDay"]["resetsAtMs"], 1_793_900_000_000u64);
        assert!(saved["capturedAt"].as_u64().unwrap() > 0);

        std::fs::remove_file(&path).unwrap();
        assert!(record(POSTED.as_bytes(), &dir));
        assert!(
            !path.exists(),
            "an unchanged answer within a minute isn't rewritten"
        );

        let changed = POSTED.replace("17.4", "18");
        assert!(record(changed.as_bytes(), &dir));
        assert!(path.exists());
        assert!(!record(b"{}", &dir));
    }

    #[test]
    fn keeps_each_sessions_context_fill_even_without_usage_windows() {
        let dir = temp_dir("context");
        // An API-key session has no rate_limits, but its context fill still counts.
        let body = r#"{"session_id":"ctx-a","context_window":{"used_percentage":87.5}}"#;
        assert!(record(body.as_bytes(), &dir));
        assert_eq!(context_percent("ctx-a"), Some(87.5));
        assert!(
            !dir.join("plugins_data").exists(),
            "no usage snapshot without windows"
        );

        let cleared = r#"{"session_id":"ctx-b","context_window":{"used_percentage":null}}"#;
        assert!(!record(cleared.as_bytes(), &dir));
        assert_eq!(context_percent("ctx-b"), None);
        assert_eq!(context_percent("ctx-a"), Some(87.5));
    }

    #[test]
    fn switching_on_and_off_keeps_the_other_settings_as_written() {
        let dir = temp_dir("toggle");
        let path = dir.join("settings.json");
        let original = "{\r\n  \"model\": \"opus\",\r\n  \"env\": {\r\n    \"B\": \"2\",\r\n    \"A\": \"1\"\r\n  }\r\n}\r\n";
        std::fs::write(&path, original).unwrap();

        assert_eq!(state_at(&path), BridgeState::Off);
        assert_eq!(set_at(&path, true), Ok(BridgeState::On));
        let on = std::fs::read_to_string(&path).unwrap();
        assert!(
            on.starts_with("{\r\n  \"model\": \"opus\",\r\n  \"env\": {\r\n    \"B\": \"2\""),
            "{on}"
        );
        let parsed: serde_json::Value = serde_json::from_str(&on).unwrap();
        assert_eq!(parsed["statusLine"]["type"], "command");
        assert_eq!(parsed["statusLine"]["command"], COMMAND);
        assert_eq!(state_at(&path), BridgeState::On);
        assert_eq!(set_at(&path, true), Ok(BridgeState::On));

        assert_eq!(set_at(&path, false), Ok(BridgeState::Off));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
    }

    #[test]
    fn never_replaces_or_removes_a_status_line_of_the_users() {
        let dir = temp_dir("other");
        let path = dir.join("settings.json");
        let mine = "{\n  \"statusLine\": {\n    \"type\": \"command\",\n    \"command\": \"my-line\"\n  }\n}\n";
        std::fs::write(&path, mine).unwrap();
        assert_eq!(state_at(&path), BridgeState::Other);
        assert_eq!(set_at(&path, true), Err(BridgeState::Other));
        assert_eq!(set_at(&path, false), Ok(BridgeState::Other));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), mine);
    }

    #[test]
    fn creates_a_missing_file_and_leaves_a_broken_one_alone() {
        let dir = temp_dir("missing");
        let path = dir.join("settings.json");
        assert_eq!(state_at(&path), BridgeState::Off);
        assert_eq!(set_at(&path, true), Ok(BridgeState::On));
        assert_eq!(state_at(&path), BridgeState::On);

        let broken = "{ \"model\": \"opus\", // comment\n}";
        std::fs::write(&path, broken).unwrap();
        assert_eq!(state_at(&path), BridgeState::Unreadable);
        assert_eq!(set_at(&path, true), Err(BridgeState::Unreadable));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), broken);
    }
}
