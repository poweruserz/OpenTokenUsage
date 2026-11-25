//! Claude Code's and Codex's live sessions on this machine. Each running `claude` keeps
//! `<config dir>/sessions/<pid>.json` (its name, folder and busy/idle state). A file whose process
//! is gone (a crash leaves it behind) or whose pid now belongs to another process is skipped. With
//! the statusLine bridge on, a session also carries the context fill Claude Code last reported.
//! Codex keeps no such file: see `codex_live_logs`.

use crate::AppState;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

const MAX_FILES: usize = 64;
const MAX_FILE_BYTES: u64 = 64 * 1024;
/// A number `procStart` went through JavaScript, which rounds a value this large by a few units.
const START_TOLERANCE: u64 = 10_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionFile {
    pid: u32,
    session_id: String,
    #[serde(default)]
    cwd: String,
    name: Option<String>,
    status: Option<String>,
    kind: Option<String>,
    #[serde(default)]
    started_at: f64,
    #[serde(default, deserialize_with = "proc_start")]
    proc_start: Option<u64>,
}

/// The process's creation time in 100 ns units (a FILETIME). Claude Code writes it as a decimal
/// string, which a JavaScript number can't hold exactly; a number is taken too.
fn proc_start<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<u64>, D::Error> {
    Ok(
        match Option::<serde_json::Value>::deserialize(deserializer)? {
            Some(serde_json::Value::String(text)) => text.trim().parse().ok(),
            Some(serde_json::Value::Number(number)) => number
                .as_u64()
                .or_else(|| number.as_f64().map(|value| value as u64)),
            _ => None,
        },
    )
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LiveSession {
    id: String,
    name: String,
    cwd: String,
    /// busy | shell | idle | waiting (passed on as Claude Code writes it).
    status: Option<String>,
    context_percent: Option<f64>,
    /// When the prompt cache of the last answer runs out (unix ms; Claude only).
    cache_expires_at: Option<u64>,
    /// The model of the last answer (Claude) or turn (Codex), as the CLI logged its id.
    model: Option<String>,
    /// The thinking level it ran at (`effort`: low … xhigh, max, ultra), as the CLI logged it.
    effort: Option<String>,
}

/// The sessions in one `sessions` folder whose process still runs, oldest first.
fn read_sessions(dir: &Path, is_running: impl Fn(u32, Option<u64>) -> bool) -> Vec<LiveSession> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    // Newest first, then capped: a running session rewrites its file, so files a crash left
    // behind sort last and can't crowd the live ones out of the cap.
    let mut files: Vec<(std::time::SystemTime, std::path::PathBuf)> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            (meta.is_file() && meta.len() <= MAX_FILE_BYTES)
                .then(|| Some((meta.modified().ok()?, entry.path())))?
        })
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    let mut sessions: Vec<(f64, LiveSession)> = files
        .into_iter()
        .take(MAX_FILES)
        .filter_map(|(_, path)| {
            serde_json::from_slice::<SessionFile>(&std::fs::read(path).ok()?).ok()
        })
        // A daemon supervises background sessions; it isn't one itself.
        .filter(|file| !matches!(file.kind.as_deref(), Some("daemon" | "daemon-worker")))
        .filter(|file| is_running(file.pid, file.proc_start))
        .map(|file| {
            let name = file
                .name
                .filter(|name| !name.trim().is_empty())
                .or_else(|| {
                    Path::new(&file.cwd)
                        .file_name()
                        .map(|name| name.to_string_lossy().into_owned())
                })
                .unwrap_or_else(|| file.cwd.clone());
            let config = dir.parent().unwrap_or(dir);
            let tail = claude_transcript(config, &file.cwd, &file.session_id)
                .map(|path| claude_tail(&path))
                .unwrap_or_default();
            let (model, effort) = claude_model(&tail);
            let session = LiveSession {
                context_percent: crate::claude_statusline::context_percent(&file.session_id),
                cache_expires_at: claude_cache_expiry(&tail),
                model,
                effort,
                id: file.session_id,
                name,
                cwd: file.cwd,
                status: file.status,
            };
            (file.started_at, session)
        })
        .collect();
    sessions.sort_by(|a, b| a.0.total_cmp(&b.0));
    sessions.into_iter().map(|(_, session)| session).collect()
}

const CLAUDE_TAIL_BYTES: u64 = 256 * 1024;
const CLAUDE_LONG_TAIL_BYTES: u64 = 4 * 1024 * 1024;

/// The end of a transcript, holding its last answer: tool outputs after it (one session had 1 MB of
/// them) push it out of the usual read, so a longer one is read then.
/// shortcut: an answer further back than 4 MB shows no model or cache; remember it per session if that shows.
fn claude_tail(path: &Path) -> String {
    let tail = read_tail(path, CLAUDE_TAIL_BYTES);
    if claude_model(&tail).0.is_some() {
        return tail;
    }
    read_tail(path, CLAUDE_LONG_TAIL_BYTES)
}

/// A session's transcript: `projects/<cwd, every other character a dash>/<session id>.jsonl`, else
/// the first project folder holding it. The id must look like one (it names a file).
fn claude_transcript(config: &Path, cwd: &str, session_id: &str) -> Option<PathBuf> {
    if session_id.is_empty()
        || !session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return None;
    }
    let projects = config.join("projects");
    let file = format!("{session_id}.jsonl");
    let encoded: String = cwd
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let direct = projects.join(encoded).join(&file);
    if direct.is_file() {
        return Some(direct);
    }
    std::fs::read_dir(&projects)
        .ok()?
        .flatten()
        .map(|entry| entry.path().join(&file))
        .find(|path| path.is_file())
}

/// When the prompt cache of a Claude session's last answer runs out (unix ms): its cache writes name
/// their tier (5 min or 1 h) from the answer's time. None when the last answer used no cache or its
/// tier can't be told (a read alone doesn't say it), or after a compaction. As token-monitor
/// (github.com/Javis603/token-monitor, MIT) reads it.
fn claude_cache_expiry(tail: &str) -> Option<u64> {
    let mut expiry = None;
    let mut previous = String::new();
    for line in tail.lines() {
        let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let Some(at) = entry["timestamp"].as_str().and_then(|text| {
            time::OffsetDateTime::parse(text, &time::format_description::well_known::Rfc3339).ok()
        }) else {
            continue;
        };
        if entry["isSidechain"] == true {
            continue;
        }
        if entry["subtype"] == "compact_boundary" || entry["isCompactSummary"] == true {
            expiry = None;
            previous.clear();
            continue;
        }
        let message = &entry["message"];
        let usage = &message["usage"];
        if entry["type"] != "assistant" || !usage.is_object() || entry["isApiErrorMessage"] == true
        {
            continue;
        }
        // One streamed answer is written several times: its first line is the earliest anchor.
        let id = message["id"].as_str().unwrap_or("");
        if !id.is_empty() && id == previous {
            continue;
        }
        previous = id.to_owned();
        let measured = usage["iterations"]
            .as_array()
            .and_then(|steps| {
                steps
                    .iter()
                    .filter(|step| {
                        matches!(step["type"].as_str(), Some("message" | "fallback_message"))
                    })
                    .last()
            })
            .unwrap_or(usage);
        let count = |key: &str| measured[key].as_u64();
        let (Some(read), Some(write)) = (
            count("cache_read_input_tokens"),
            count("cache_creation_input_tokens"),
        ) else {
            expiry = None;
            continue;
        };
        let tier = |key: &str| measured["cache_creation"][key].as_u64().unwrap_or(0);
        let ttl_secs = if read + write == 0 {
            0
        } else if tier("ephemeral_5m_input_tokens") > 0 {
            300
        } else if tier("ephemeral_1h_input_tokens") > 0 {
            3600
        } else {
            0
        };
        let at_ms = (at.unix_timestamp_nanos() / 1_000_000).max(0) as u64;
        expiry = (ttl_secs > 0).then_some(at_ms + ttl_secs * 1000);
    }
    expiry
}

/// A model id or thinking level from a log, shown as text: a short plain word or nothing.
fn log_word(value: &serde_json::Value) -> Option<String> {
    value
        .as_str()
        .filter(|text| {
            !text.is_empty()
                && text.len() <= 64
                && text
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_'))
        })
        .map(str::to_owned)
}

/// The model and thinking level of a Claude session's last answer (not a sub-agent's, not an API
/// error's `<synthetic>` stand-in). Each answer line carries both: `message.model` and `effort`.
fn claude_model(tail: &str) -> (Option<String>, Option<String>) {
    tail.lines()
        .rev()
        .filter(|line| line.contains("\"assistant\""))
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .find_map(|entry| {
            if entry["type"] != "assistant"
                || entry["isSidechain"] == true
                || entry["isApiErrorMessage"] == true
            {
                return None;
            }
            let model = log_word(&entry["message"]["model"])?;
            Some((Some(model), log_word(&entry["effort"])))
        })
        .unwrap_or((None, None))
}

/// Whether `pid` runs and, when the file gives one, was started at `proc_start` (else the pid was
/// reused by another process after the session ended).
fn process_running(pid: u32, proc_start: Option<u64>) -> bool {
    process_start(pid).is_some_and(|created| {
        proc_start.is_none_or(|start| created.abs_diff(start) < START_TOLERANCE)
    })
}

/// When the running process `pid` was created (FILETIME, 100 ns units); None once it has exited.
#[cfg(windows)]
pub(crate) fn process_start(pid: u32) -> Option<u64> {
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME};
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    const STILL_ACTIVE: u32 = 259;
    let zero = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let (mut created, mut exited, mut kernel, mut user) = (zero, zero, zero, zero);
    let mut code = 0u32;
    // SAFETY: the handle is checked before use and closed once; every out-pointer is a local.
    let running = unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let running = GetExitCodeProcess(handle, &mut code) != 0
            && code == STILL_ACTIVE
            && GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) != 0;
        CloseHandle(handle);
        running
    };
    running.then(|| (u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime))
}

#[cfg(not(windows))]
pub(crate) fn process_start(_pid: u32) -> Option<u64> {
    None
}

/// A Codex log written this recently can belong to a running session.
const CODEX_RECENT: Duration = Duration::from_secs(6 * 3600);
/// A turn with no line for this long is taken as stalled, not working (a long tool call writes nothing).
const CODEX_BUSY: Duration = Duration::from_secs(10 * 60);
/// The day folders (`sessions/YYYY/MM/DD`) looked into, newest first.
const CODEX_DAYS: usize = 7;
const CODEX_TAIL_BYTES: u64 = 128 * 1024;
const CODEX_HEAD_BYTES: u64 = 256 * 1024;

/// Codex writes `sessions/YYYY/MM/DD/rollout-*.jsonl` and no pid file. While `running` Codex
/// processes run, the newest that many logs written in the last 6 h, across every Codex login's
/// folders (`dirs`), are taken as theirs; oldest first, as the Claude list.
/// shortcut: a sub-agent writes its own log in the same process, so it can stand in for its parent;
/// match logs to processes by their open handles if that shows.
fn codex_live_logs(
    dirs: &[PathBuf],
    running: usize,
    now: SystemTime,
) -> Vec<(SystemTime, PathBuf)> {
    if running == 0 {
        return Vec::new();
    }
    // A folder two cards share (an account's folder set as CODEX_HOME) is read once.
    let mut seen = HashSet::new();
    let mut logs: Vec<(SystemTime, PathBuf)> = dirs
        .iter()
        .filter(|dir| seen.insert(dir.to_path_buf()))
        .flat_map(|dir| newest_day_dirs(&dir.join("sessions"), CODEX_DAYS))
        .flat_map(|day| std::fs::read_dir(day).into_iter().flatten().flatten())
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "jsonl"))
        .filter_map(|entry| {
            // fs::metadata, not the listing's: a log the CLI holds open keeps an old time there.
            let modified = std::fs::metadata(entry.path()).ok()?.modified().ok()?;
            let age = now.duration_since(modified).unwrap_or_default();
            (age <= CODEX_RECENT).then(|| (modified, entry.path()))
        })
        .collect();
    logs.sort_by(|a, b| b.0.cmp(&a.0));
    logs.truncate(running);
    logs.reverse();
    logs
}

fn codex_session(modified: SystemTime, path: &Path, now: SystemTime) -> LiveSession {
    let tail = read_tail(path, CODEX_TAIL_BYTES);
    let (finished, cwd) = codex_tail_state(&tail);
    let cwd = cwd.or_else(|| codex_first_cwd(path)).unwrap_or_default();
    let quiet = now.duration_since(modified).unwrap_or_default() > CODEX_BUSY;
    let (model, effort) = codex_model(&tail);
    LiveSession {
        id: path
            .file_stem()
            .map(|stem| stem.to_string_lossy().into_owned())
            .unwrap_or_default(),
        name: Path::new(&cwd)
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Codex".into()),
        cwd,
        status: Some(if finished || quiet { "idle" } else { "busy" }.into()),
        context_percent: codex_context_percent(&tail),
        cache_expires_at: None,
        model,
        effort,
    }
}

/// The model and thinking level of the newest `turn_context` (one starts every turn).
/// shortcut: a turn longer than the tail read shows neither until the next one; read the head too if that shows.
fn codex_model(tail: &str) -> (Option<String>, Option<String>) {
    tail.lines()
        .rev()
        .filter(|line| line.contains("\"turn_context\""))
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .find(|value| value["type"] == "turn_context")
        .map(|value| {
            let payload = &value["payload"];
            (log_word(&payload["model"]), log_word(&payload["effort"]))
        })
        .unwrap_or((None, None))
}

/// Tokens Codex keeps in every context (instructions, tools) and leaves out of the share it shows.
const CODEX_CONTEXT_BASELINE: f64 = 12_000.0;

/// How full the context window is after the last answer, as Codex itself counts it: the newest
/// `token_count`'s `last_token_usage.total_tokens` of its `model_context_window`, both less the baseline.
fn codex_context_percent(tail: &str) -> Option<f64> {
    tail.lines().rev().find_map(|line| {
        if !line.contains("\"token_count\"") {
            return None;
        }
        let value: serde_json::Value = serde_json::from_str(line).ok()?;
        let info = &value["payload"]["info"];
        let used = info["last_token_usage"]["total_tokens"].as_f64()?;
        let window = info["model_context_window"].as_f64()?;
        if window <= CODEX_CONTEXT_BASELINE {
            return None;
        }
        let share = (used - CODEX_CONTEXT_BASELINE).max(0.0) / (window - CODEX_CONTEXT_BASELINE);
        Some((share * 100.0).clamp(0.0, 100.0))
    })
}

/// `<dir>/YYYY/MM/DD` folders, newest first (names sort as dates).
fn newest_day_dirs(dir: &Path, limit: usize) -> Vec<PathBuf> {
    let sorted = |path: &Path| {
        let mut dirs: Vec<PathBuf> = std::fs::read_dir(path)
            .into_iter()
            .flatten()
            .flatten()
            .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
            .map(|entry| entry.path())
            .collect();
        dirs.sort_by(|a, b| b.cmp(a));
        dirs
    };
    let mut days = Vec::new();
    for year in sorted(dir) {
        for month in sorted(&year) {
            for day in sorted(&month) {
                if days.len() == limit {
                    return days;
                }
                days.push(day);
            }
        }
    }
    days
}

fn read_tail(path: &Path, bytes: u64) -> String {
    let Ok(mut file) = std::fs::File::open(path) else {
        return String::new();
    };
    let len = file.metadata().map(|meta| meta.len()).unwrap_or(0);
    let mut buf = Vec::new();
    if file
        .seek(SeekFrom::Start(len.saturating_sub(bytes)))
        .is_ok()
    {
        let _ = file.take(bytes).read_to_end(&mut buf);
    }
    String::from_utf8_lossy(&buf).into_owned()
}

/// From a Codex log's last lines: whether its last turn ended (`task_complete`, an aborted turn, or
/// the assistant's final answer; a newer user message or step starts a new one) and the folder the
/// newest `turn_context` names. As TaskbarQuota (MIT) reads it.
fn codex_tail_state(tail: &str) -> (bool, Option<String>) {
    let mut finished = None;
    let mut cwd = None;
    for line in tail.lines().rev() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let payload = &value["payload"];
        if cwd.is_none() {
            cwd = payload["cwd"].as_str().map(str::to_owned);
        }
        if finished.is_none() {
            let final_answer = payload["phase"] == "final_answer";
            finished = match payload["type"].as_str() {
                Some("task_complete" | "turn_aborted") => Some(true),
                Some("message") if payload["role"] == "assistant" && final_answer => Some(true),
                Some(
                    "user_message" | "agent_reasoning" | "reasoning" | "function_call"
                    | "custom_tool_call",
                ) => Some(false),
                _ if final_answer => Some(true),
                _ => None,
            };
        }
        if finished.is_some() && cwd.is_some() {
            break;
        }
    }
    (finished.unwrap_or(false), cwd)
}

/// The folder in a log's first line (`session_meta`), when that line fits the head read.
fn codex_first_cwd(path: &Path) -> Option<String> {
    let mut head = Vec::new();
    std::fs::File::open(path)
        .ok()?
        .take(CODEX_HEAD_BYTES)
        .read_to_end(&mut head)
        .ok()?;
    let first = head.split(|&byte| byte == b'\n').next()?;
    let value: serde_json::Value = serde_json::from_slice(first).ok()?;
    value["payload"]["cwd"].as_str().map(str::to_owned)
}

fn codex_processes() -> usize {
    crate::processes::snapshot()
        .iter()
        .filter(|process| process.exe == "codex.exe")
        .count()
}

/// A card's id, its CLI ("claude" or "codex") and its login folders.
type Login = (String, &'static str, Vec<PathBuf>);

/// Every Claude and Codex login of the cards (never a WSL copy: its processes aren't Windows ones).
fn logins(state: &Mutex<AppState>) -> Vec<Login> {
    let Ok(state) = state.lock() else {
        return Vec::new();
    };
    state
        .plugins
        .iter()
        .filter_map(|plugin| {
            let (cli, dirs, _) = crate::login_stamp::cli_dirs(plugin)?;
            Some((plugin.manifest.id.clone(), cli, dirs))
        })
        .collect()
}

/// The running Codex sessions' logs over every Codex login (no process list without one).
fn codex_logs(logins: &[Login], now: SystemTime) -> Vec<(SystemTime, PathBuf)> {
    let dirs: Vec<PathBuf> = logins
        .iter()
        .filter(|(_, cli, _)| *cli == "codex")
        .flat_map(|(_, _, dirs)| dirs.iter().cloned())
        .collect();
    if dirs.is_empty() {
        return Vec::new();
    }
    codex_live_logs(&dirs, codex_processes(), now)
}

/// The live sessions of a login's folders, by its CLI; Codex's from the running logs of all logins.
fn sessions_for(
    cli: &str,
    dirs: &[PathBuf],
    codex_logs: &[(SystemTime, PathBuf)],
    now: SystemTime,
) -> Vec<LiveSession> {
    match cli {
        "claude" => dirs
            .iter()
            .flat_map(|dir| read_sessions(&dir.join("sessions"), process_running))
            .collect(),
        "codex" => codex_logs
            .iter()
            .filter(|(_, path)| {
                dirs.iter()
                    .any(|dir| path.starts_with(dir.join("sessions")))
            })
            .map(|(modified, path)| codex_session(*modified, path, now))
            .collect(),
        _ => Vec::new(),
    }
}

/// The live sessions of a Claude or Codex card's login (the usual one or an extra account).
/// Empty for any other card and for a WSL copy. Off the main thread: it reads files.
#[tauri::command]
pub async fn live_sessions(
    state: tauri::State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Result<Vec<LiveSession>, String> {
    let logins = logins(&state);
    tauri::async_runtime::spawn_blocking(move || {
        let Some((_, cli, dirs)) = logins.iter().find(|(id, ..)| *id == plugin_id) else {
            return Vec::new();
        };
        let now = SystemTime::now();
        let codex = if *cli == "codex" {
            codex_logs(&logins, now)
        } else {
            Vec::new()
        };
        sessions_for(cli, dirs, &codex, now)
    })
    .await
    .map_err(|e| e.to_string())
}

/// What each Claude/Codex card's sessions are doing, for the dot on the strip's and widgets' logos:
/// "waiting" (one asks the user) before "busy" (one works). Cards with neither are left out.
#[tauri::command]
pub async fn agent_activity(
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<HashMap<String, String>, String> {
    let logins = logins(&state);
    tauri::async_runtime::spawn_blocking(move || {
        let now = SystemTime::now();
        let codex = codex_logs(&logins, now);
        logins
            .iter()
            .filter_map(|(id, cli, dirs)| {
                let activity = activity_of(&sessions_for(cli, dirs, &codex, now))?;
                Some((id.clone(), activity.to_owned()))
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

fn activity_of(sessions: &[LiveSession]) -> Option<&'static str> {
    let has = |wanted: &[&str]| {
        sessions.iter().any(|s| {
            s.status
                .as_deref()
                .is_some_and(|status| wanted.contains(&status))
        })
    };
    if has(&["waiting"]) {
        Some("waiting")
    } else if has(&["busy", "shell"]) {
        Some("busy")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("openusage-sessions-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(dir: &Path, file: &str, json: serde_json::Value) {
        std::fs::write(dir.join(file), json.to_string()).unwrap();
    }

    #[test]
    fn lists_running_sessions_oldest_first_and_skips_ended_ones() {
        let dir = temp_dir("list");
        let session = |pid: u32, id: &str, started: u64| {
            serde_json::json!({
                "pid": pid, "sessionId": id, "cwd": format!(r"C:\work\{id}"),
                "status": "busy", "kind": "interactive", "startedAt": started, "procStart": 1
            })
        };
        write(&dir, "1.json", session(1, "newer", 200));
        let mut named = session(2, "older", 100);
        named["name"] = "fix-login".into();
        named["status"] = "waiting".into();
        write(&dir, "2.json", named);
        write(&dir, "3.json", session(3, "ended", 50));
        let mut daemon = session(4, "daemon", 10);
        daemon["kind"] = "daemon".into();
        write(&dir, "4.json", daemon);
        std::fs::write(dir.join("5.json"), "{ broken").unwrap();
        std::fs::write(dir.join("1.abc.key"), "not a session").unwrap();

        let ctx = r#"{"session_id":"newer","context_window":{"used_percentage":91}}"#;
        assert!(crate::claude_statusline::record(ctx.as_bytes(), &dir));

        let sessions = read_sessions(&dir, |pid, _| pid != 3);
        assert_eq!(
            sessions,
            vec![
                LiveSession {
                    id: "older".into(),
                    name: "fix-login".into(),
                    cwd: r"C:\work\older".into(),
                    status: Some("waiting".into()),
                    context_percent: None,
                    cache_expires_at: None,
                    model: None,
                    effort: None,
                },
                LiveSession {
                    id: "newer".into(),
                    name: "newer".into(),
                    cwd: r"C:\work\newer".into(),
                    status: Some("busy".into()),
                    context_percent: Some(91.0),
                    cache_expires_at: None,
                    model: None,
                    effort: None,
                },
            ]
        );
        assert!(read_sessions(&dir.join("missing"), |_, _| true).is_empty());
    }

    #[test]
    fn files_a_crash_left_behind_never_crowd_out_a_live_session() {
        let dir = temp_dir("crowd");
        let hour_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
        // More leftovers than the cap, each named to come before the live one.
        for i in 0..MAX_FILES + 6 {
            let path = dir.join(format!("{i:04}.json"));
            std::fs::write(
                &path,
                serde_json::json!({ "pid": 3, "sessionId": format!("old-{i}") }).to_string(),
            )
            .unwrap();
            std::fs::File::options()
                .write(true)
                .open(&path)
                .unwrap()
                .set_modified(hour_ago)
                .unwrap();
        }
        write(
            &dir,
            "9999.json",
            serde_json::json!({ "pid": 1, "sessionId": "live", "cwd": "C:\\work\\app" }),
        );

        let sessions = read_sessions(&dir, |pid, _| pid == 1);
        assert_eq!(
            sessions.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            ["live"]
        );
    }

    #[test]
    fn reads_a_session_file_as_claude_code_writes_it() {
        // Claude Code writes `procStart` as a decimal string: a JavaScript number can't hold a
        // FILETIME exactly. The other fields are as in a real file.
        let dir = temp_dir("real");
        let me = std::process::id();
        let started = process_start(me).expect("this process runs");
        write(
            &dir,
            &format!("{me}.json"),
            serde_json::json!({
                "pid": me, "sessionId": "s-1", "cwd": r"C:\work\app", "startedAt": 1_762_520_000_000u64,
                "procStart": started.to_string(), "version": "2.9.0", "kind": "interactive",
                "entrypoint": "cli", "name": "app", "status": "busy", "updatedAt": 1_762_520_000_000u64
            }),
        );
        let sessions = read_sessions(&dir, process_running);
        assert_eq!(
            sessions.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            ["s-1"]
        );

        // The same pid, started at another time: an earlier process's leftover.
        write(
            &dir,
            &format!("{me}.json"),
            serde_json::json!({ "pid": me, "sessionId": "s-1", "procStart": (started - 50_000).to_string() }),
        );
        assert!(read_sessions(&dir, process_running).is_empty());
    }

    #[test]
    fn codex_sessions_are_the_newest_recent_logs_while_codex_runs() {
        let home = temp_dir("codex");
        let other = temp_dir("codex-other");
        let line = |value: serde_json::Value| value.to_string() + "\n";
        let meta = |cwd: &str| {
            line(serde_json::json!({"type":"session_meta","payload":{"id":"t","cwd":cwd}}))
        };
        let write_in = |home: &Path, day: &str, name: &str, body: String, age_secs: u64| {
            let folder = home.join("sessions").join(day);
            std::fs::create_dir_all(&folder).unwrap();
            let path = folder.join(name);
            std::fs::write(&path, body).unwrap();
            std::fs::File::options()
                .write(true)
                .open(&path)
                .unwrap()
                .set_modified(SystemTime::now() - Duration::from_secs(age_secs))
                .unwrap();
        };
        let write_log = |day: &str, name: &str, body: String, age_secs: u64| {
            write_in(&home, day, name, body, age_secs)
        };
        // Working: its last step is a tool call; named after its turn's folder.
        write_log(
            "2026/11/15",
            "rollout-a.jsonl",
            meta(r"C:\work\old")
                + &line(
                    serde_json::json!({"type":"turn_context","payload":{"cwd":r"C:\work\api"}}),
                )
                + &line(
                    serde_json::json!({"type":"response_item","payload":{"type":"function_call","name":"shell"}}),
                ),
            5,
        );
        // Finished its turn; only the first line names its folder.
        write_log(
            "2026/11/14",
            "rollout-b.jsonl",
            meta(r"C:\work\web")
                + &line(serde_json::json!({"type":"event_msg","payload":{"type":"user_message"}}))
                + &line(serde_json::json!({"type":"event_msg","payload":{"type":"task_complete"}})),
            60,
        );
        // Too old to be running.
        write_log(
            "2026/11/14",
            "rollout-c.jsonl",
            meta(r"C:\work\gone"),
            7 * 3600,
        );

        let now = SystemTime::now();
        let mine = [home.clone()];
        let sessions = sessions_for("codex", &mine, &codex_live_logs(&mine, 3, now), now);
        let summary: Vec<(&str, &str, Option<&str>)> = sessions
            .iter()
            .map(|s| (s.id.as_str(), s.name.as_str(), s.status.as_deref()))
            .collect();
        assert_eq!(
            summary,
            [
                ("rollout-b", "web", Some("idle")),
                ("rollout-a", "api", Some("busy"))
            ]
        );
        assert_eq!(activity_of(&sessions), Some("busy"));
        // None running, none.
        assert!(codex_live_logs(&mine, 0, now).is_empty());

        // Two Codex running over two logins: the two newest logs overall, each on its own card.
        write_in(
            &other,
            "2026/11/15",
            "rollout-d.jsonl",
            meta(r"C:\work\cli"),
            30,
        );
        let both = [home.clone(), other.clone(), home.clone()];
        let logs = codex_live_logs(&both, 2, now);
        let ids = |dirs: &[PathBuf]| -> Vec<String> {
            sessions_for("codex", dirs, &logs, now)
                .into_iter()
                .map(|s| s.id)
                .collect()
        };
        assert_eq!(ids(&[home.clone()]), ["rollout-a"]);
        assert_eq!(ids(&[other.clone()]), ["rollout-d"]);
    }

    #[test]
    fn the_prompt_cache_runs_out_after_the_last_answers_tier() {
        let answer = |id: &str, at: &str, read: u64, five: u64, hour: u64| {
            serde_json::json!({
                "type": "assistant", "timestamp": at,
                "message": { "id": id, "usage": {
                    "input_tokens": 3, "output_tokens": 9, "cache_read_input_tokens": read,
                    "cache_creation_input_tokens": five + hour,
                    "cache_creation": { "ephemeral_5m_input_tokens": five, "ephemeral_1h_input_tokens": hour }
                }}
            })
            .to_string()
        };
        let at = |text: &str| {
            (time::OffsetDateTime::parse(text, &time::format_description::well_known::Rfc3339)
                .unwrap()
                .unix_timestamp() as u64)
                * 1000
        };
        // The 1 h tier from the last answer; its repeat line (same id, later) doesn't move it.
        let tail = [
            answer("a", "2026-11-15T10:00:00Z", 100, 50, 0),
            answer("b", "2026-11-15T10:05:00Z", 900, 0, 40),
            answer("b", "2026-11-15T10:05:09Z", 900, 0, 40),
        ]
        .join("\n");
        assert_eq!(
            claude_cache_expiry(&tail),
            Some(at("2026-11-15T10:05:00Z") + 3_600_000)
        );
        // A read alone doesn't say the tier; a compaction drops what was known.
        let read_only = answer("c", "2026-11-15T10:06:00Z", 900, 0, 0);
        assert_eq!(
            claude_cache_expiry(&(tail.clone() + "\n" + &read_only)),
            None
        );
        let compacted =
            r#"{"type":"system","subtype":"compact_boundary","timestamp":"2026-11-15T10:07:00Z"}"#;
        assert_eq!(claude_cache_expiry(&(tail + "\n" + compacted)), None);
    }

    #[test]
    fn codex_context_fill_is_its_last_answer_of_the_window_past_the_baseline() {
        let count = |total: u64, window: u64| {
            serde_json::json!({"type":"event_msg","payload":{"type":"token_count","info":{
                "last_token_usage":{"total_tokens": total},"model_context_window": window}}})
            .to_string()
        };
        let tail = [count(50_000, 272_000), count(142_000, 272_000)].join("\n");
        assert_eq!(codex_context_percent(&tail), Some(50.0));
        assert_eq!(codex_context_percent(&count(5_000, 272_000)), Some(0.0));
        assert_eq!(codex_context_percent("{\"type\":\"event_msg\"}"), None);
    }

    #[test]
    fn a_session_shows_the_model_and_thinking_level_of_its_last_answer() {
        let answer = |model: &str, effort: Option<&str>, extra: serde_json::Value| {
            let mut entry = serde_json::json!({"type": "assistant", "message": {"model": model}});
            if let Some(effort) = effort {
                entry["effort"] = effort.into();
            }
            for (key, value) in extra.as_object().unwrap() {
                entry[key] = value.clone();
            }
            entry.to_string()
        };
        let none = serde_json::json!({});
        let tail = [
            answer("claude-sonnet-5-5", Some("medium"), none.clone()),
            answer("claude-opus-5-5", Some("xhigh"), none.clone()),
            // A sub-agent's answer and an API error's stand-in are not the session's.
            answer(
                "claude-haiku-5-5",
                Some("low"),
                serde_json::json!({"isSidechain": true}),
            ),
            answer(
                "<synthetic>",
                None,
                serde_json::json!({"isApiErrorMessage": true}),
            ),
            r#"{"type":"user","message":{"role":"user","content":"hi"}}"#.into(),
        ]
        .join("\n");
        let some = |text: &str| Some(text.to_owned());
        assert_eq!(
            claude_model(&tail),
            (some("claude-opus-5-5"), some("xhigh"))
        );
        // An older Claude Code logs no level; a model that isn't a plain id is left out.
        assert_eq!(
            claude_model(&answer("claude-opus-5-5", None, none.clone())),
            (some("claude-opus-5-5"), None)
        );
        assert_eq!(
            claude_model(&answer("<b>x</b>", Some("high"), none)),
            (None, None)
        );
        assert_eq!(claude_model(""), (None, None));

        let turn = |model: &str, effort: &str| {
            serde_json::json!({"type": "turn_context", "payload": {"model": model, "effort": effort}})
                .to_string()
        };
        let codex = [
            turn("gpt-6.2", "high"),
            turn("gpt-6.2-astra", "ultra"),
            r#"{"type":"event_msg","payload":{"type":"agent_message","message":"turn_context"}}"#
                .into(),
        ]
        .join("\n");
        assert_eq!(codex_model(&codex), (some("gpt-6.2-astra"), some("ultra")));
        assert_eq!(codex_model(""), (None, None));
    }

    #[test]
    fn an_answer_behind_long_tool_output_is_still_found() {
        let dir = temp_dir("long-tail");
        let path = dir.join("session.jsonl");
        let answer =
            r#"{"type":"assistant","effort":"high","message":{"model":"claude-opus-5-5"}}"#;
        let output = format!(
            r#"{{"type":"attachment","text":"{}"}}"#,
            "x".repeat(80 * 1024)
        );
        let lines: Vec<&str> = std::iter::once(answer)
            .chain(std::iter::repeat_n(output.as_str(), 5))
            .collect();
        std::fs::write(&path, lines.join("\n")).unwrap();
        assert_eq!(
            claude_model(&read_tail(&path, CLAUDE_TAIL_BYTES)),
            (None, None)
        );
        assert_eq!(
            claude_model(&claude_tail(&path)),
            (Some("claude-opus-5-5".into()), Some("high".into()))
        );
    }

    #[test]
    fn a_waiting_session_outranks_a_busy_one() {
        let session = |status: &str| LiveSession {
            id: status.into(),
            name: String::new(),
            cwd: String::new(),
            status: Some(status.into()),
            context_percent: None,
            cache_expires_at: None,
            model: None,
            effort: None,
        };
        assert_eq!(
            activity_of(&[session("busy"), session("waiting")]),
            Some("waiting")
        );
        assert_eq!(activity_of(&[session("shell")]), Some("busy"));
        assert_eq!(activity_of(&[session("idle")]), None);
    }

    #[test]
    fn a_reused_pid_or_a_gone_process_is_not_a_live_session() {
        let me = std::process::id();
        assert!(process_running(me, None));
        // This process started long after 1601: a file naming our pid with that start time
        // belonged to an earlier process.
        assert!(!process_running(me, Some(1)));
        assert!(!process_running(0, None));
    }
}
