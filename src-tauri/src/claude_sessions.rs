//! Claude Code's live sessions on this machine. Each running `claude` keeps
//! `<config dir>/sessions/<pid>.json` (its name, folder and busy/idle state). A file whose process
//! is gone (a crash leaves it behind) or whose pid now belongs to another process is skipped. With
//! the statusLine bridge on, a session also carries the context fill Claude Code last reported.

use crate::AppState;
use serde::{Deserialize, Deserializer, Serialize};
use std::path::Path;
use std::sync::Mutex;

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
fn process_running(pid: u32, proc_start: Option<u64>) -> bool {
    process_start(pid).is_some_and(|created| {
        proc_start.is_none_or(|start| created.abs_diff(start) < START_TOLERANCE)
    })
}

/// When the running process `pid` was created (FILETIME, 100 ns units); None once it has exited.
#[cfg(windows)]
fn process_start(pid: u32) -> Option<u64> {
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
fn process_start(_pid: u32) -> Option<u64> {
    None
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
    fn a_reused_pid_or_a_gone_process_is_not_a_live_session() {
        let me = std::process::id();
        assert!(process_running(me, None));
        // This process started long after 1601: a file naming our pid with that start time
        // belonged to an earlier process.
        assert!(!process_running(me, Some(1)));
        assert!(!process_running(0, None));
    }
}
