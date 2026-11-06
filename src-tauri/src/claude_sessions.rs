//! Claude Code's live sessions on this machine. Each running `claude` keeps
//! `<config dir>/sessions/<pid>.json` (its name, folder and busy/idle state). A file whose process
//! is gone (a crash leaves it behind) or whose pid now belongs to another process is skipped. With
//! the statusLine bridge on, a session also carries the context fill Claude Code last reported.

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

const MAX_FILES: usize = 64;
const MAX_FILE_BYTES: u64 = 64 * 1024;
/// `procStart` is the process's creation time in 100 ns units. Claude Code writes it from
/// JavaScript, whose numbers round a value this large by a few units.
const START_TOLERANCE: f64 = 10_000.0;

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
    proc_start: Option<f64>,
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
}

/// The sessions in one `sessions` folder whose process still runs, oldest first.
fn read_sessions(dir: &Path, is_running: impl Fn(u32, Option<f64>) -> bool) -> Vec<LiveSession> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut sessions: Vec<(f64, LiveSession)> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
        .take(MAX_FILES)
        .filter(|entry| {
            entry
                .metadata()
                .is_ok_and(|meta| meta.is_file() && meta.len() <= MAX_FILE_BYTES)
        })
        .filter_map(|entry| {
            serde_json::from_slice::<SessionFile>(&std::fs::read(entry.path()).ok()?).ok()
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
            let session = LiveSession {
                context_percent: crate::claude_statusline::context_percent(&file.session_id),
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

/// Whether `pid` runs and, when the file gives one, was started at `proc_start` (else the pid was
/// reused by another process after the session ended).
#[cfg(windows)]
fn process_running(pid: u32, proc_start: Option<f64>) -> bool {
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
            return false;
        }
        let running = GetExitCodeProcess(handle, &mut code) != 0
            && code == STILL_ACTIVE
            && GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) != 0;
        CloseHandle(handle);
        running
    };
    let created = (u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime);
    running && proc_start.is_none_or(|start| (created as f64 - start).abs() < START_TOLERANCE)
}

#[cfg(not(windows))]
fn process_running(_pid: u32, _proc_start: Option<f64>) -> bool {
    false
}

/// The live Claude Code sessions of a Claude card's login (the usual one or an extra account).
/// Empty for any other card and for a WSL copy, whose processes aren't Windows processes.
#[tauri::command]
pub fn claude_sessions(
    state: tauri::State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Vec<LiveSession> {
    let dirs = {
        let Ok(state) = state.lock() else {
            return Vec::new();
        };
        let Some(plugin) = state.plugins.iter().find(|p| p.manifest.id == plugin_id) else {
            return Vec::new();
        };
        match crate::login_stamp::cli_dirs(plugin) {
            Some(("claude", dirs, _)) => dirs,
            _ => return Vec::new(),
        }
    };
    dirs.iter()
        .flat_map(|dir| read_sessions(&dir.join("sessions"), process_running))
        .collect()
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
                },
                LiveSession {
                    id: "newer".into(),
                    name: "newer".into(),
                    cwd: r"C:\work\newer".into(),
                    status: Some("busy".into()),
                    context_percent: Some(91.0),
                },
            ]
        );
        assert!(read_sessions(&dir.join("missing"), |_, _| true).is_empty());
    }

    #[test]
    fn a_reused_pid_or_a_gone_process_is_not_a_live_session() {
        let me = std::process::id();
        assert!(process_running(me, None));
        // This process started long after 1601: a file naming our pid with that start time
        // belonged to an earlier process.
        assert!(!process_running(me, Some(1.0)));
        assert!(!process_running(0, None));
    }
}
