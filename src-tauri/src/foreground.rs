//! "Follow the active app": which provider the focused window's tool uses, sent to the frontend as
//! `foreground:provider` (a base plugin id). A desktop app is told by its exe name; in a terminal the
//! AI CLI is looked for among the shell's descendants. A window that matches nothing (the desktop,
//! this app's panel) sends nothing, so the last tool stays. The table and the CLI markers follow
//! TaskbarQuota (github.com/zioder/TaskbarQuota, MIT).
//!
//! Its own thread, polling every 500 ms while the setting is on; a provider must be seen twice in a
//! row (Alt+Tab passes over windows).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Once;
use std::time::Duration;

static ENABLED: AtomicBool = AtomicBool::new(false);
static START: Once = Once::new();
const POLL: Duration = Duration::from_millis(500);

/// Desktop apps by exe name (lower case, no `.exe`).
const APPS: &[(&str, &str)] = &[
    ("cursor", "cursor"),
    ("antigravity", "antigravity"),
    ("agy", "antigravity"),
    ("chatgpt", "codex"),
    ("codex", "codex"),
    ("claude", "claude"),
    ("code", "copilot"),
    ("code - insiders", "copilot"),
    ("devin", "devin"),
    ("zcode", "zai"),
    ("kiro", "kiro"),
    ("idea64", "jetbrains-ai-assistant"),
    ("pycharm64", "jetbrains-ai-assistant"),
    ("webstorm64", "jetbrains-ai-assistant"),
    ("rider64", "jetbrains-ai-assistant"),
    ("goland64", "jetbrains-ai-assistant"),
    ("clion64", "jetbrains-ai-assistant"),
    ("phpstorm64", "jetbrains-ai-assistant"),
    ("rustrover64", "jetbrains-ai-assistant"),
];

/// Windows whose tool is the program running inside them.
const TERMINALS: &[&str] = &[
    "windowsterminal",
    "wt",
    "openconsole",
    "conhost",
    "powershell",
    "pwsh",
    "cmd",
    "wezterm-gui",
    "alacritty",
    "mintty",
    "tabby",
    "hyper",
    "warp",
];

/// AI CLIs by exe name.
const CLIS: &[(&str, &str)] = &[
    ("claude.exe", "claude"),
    ("codex.exe", "codex"),
    ("cursor-agent.exe", "cursor"),
    ("opencode.exe", "opencode-go"),
    ("copilot.exe", "copilot"),
    ("grok.exe", "grok"),
    ("devin.exe", "devin"),
    ("kimi.exe", "kimi"),
    ("droid.exe", "factory"),
    ("kiro-cli.exe", "kiro"),
    ("amp.exe", "amp"),
];

/// CLIs that run on a script runner, told by a word in its command line (the more specific first).
const RUNNERS: &[&str] = &["node.exe", "bun.exe", "deno.exe"];
const MARKERS: &[(&str, &str)] = &[
    ("claude-code", "claude"),
    ("cursor-agent", "cursor"),
    ("@github/copilot", "copilot"),
    ("@qwen-code", "qwen-code"),
    ("@sourcegraph/amp", "amp"),
    ("@kilocode", "kilo"),
    ("codebuff", "codebuff"),
    ("opencode", "opencode-go"),
    ("copilot", "copilot"),
    ("grok", "grok"),
    ("devin", "devin"),
    ("kimi", "kimi"),
    ("qwen", "qwen-code"),
    ("droid", "factory"),
    ("claude", "claude"),
    ("codex", "codex"),
];

/// Claude Code titles its terminal with one of these before the task's name.
const CLAUDE_TITLE_GLYPHS: &[char] = &['✳', '✶', '✻', '✽', '✢'];

/// Settings → Taskbar strip → Follow the active app.
#[tauri::command]
pub fn set_follow_foreground(app_handle: tauri::AppHandle, enabled: bool) {
    ENABLED.store(enabled, Ordering::Relaxed);
    if enabled {
        START.call_once(|| {
            std::thread::spawn(move || watch(app_handle));
        });
    }
}

/// Settings → Taskbar strip → Only while an AI tool runs: the base plugin ids of every AI app or CLI
/// running now, by the same tables as following the active app.
#[tauri::command]
pub async fn running_ai_tools() -> Result<Vec<&'static str>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        running_tools(
            &crate::processes::snapshot(),
            std::process::id(),
            command_line,
            crate::claude_sessions::process_start,
        )
    })
    .await
    .map_err(|e| e.to_string())
}

/// Sorted, each once. Our own children are left out: the Codex probe runs `@ccusage/codex` on node.
fn running_tools(
    processes: &[crate::processes::Process],
    me: u32,
    command_line: impl Fn(u32) -> Option<String>,
    started: impl Fn(u32) -> Option<u64>,
) -> Vec<&'static str> {
    let parent_of: std::collections::HashMap<u32, u32> =
        processes.iter().map(|p| (p.pid, p.parent)).collect();
    let ours = |pid: u32| {
        let mut at = pid;
        // Bounded: a parent pid can be reused and point back into a loop.
        for _ in 0..32 {
            if at == me {
                return true;
            }
            match parent_of.get(&at) {
                // A parent that started after its child is a reused pid (Claude's launcher exits
                // at once), not the child's parent.
                Some(&parent)
                    if parent != 0
                        && parent != at
                        && matches!((started(parent), started(at)), (Some(p), Some(c)) if p <= c) =>
                {
                    at = parent
                }
                _ => return false,
            }
        }
        false
    };
    let mut ids: Vec<&'static str> = processes
        .iter()
        .filter_map(|p| {
            app_provider(&p.exe)
                .or_else(|| cli_provider(&p.exe, || command_line(p.pid)))
                .map(|id| (p.pid, id))
        })
        .filter(|&(pid, _)| !ours(pid))
        .map(|(_, id)| id)
        .collect();
    ids.sort_unstable();
    ids.dedup();
    ids
}

fn watch(app_handle: tauri::AppHandle) {
    use tauri::Emitter;
    let mut seen: Option<&'static str> = None;
    let mut sent: Option<&'static str> = None;
    loop {
        std::thread::sleep(POLL);
        if !ENABLED.load(Ordering::Relaxed) {
            // Turned on again later: tell the frontend afresh.
            sent = None;
            continue;
        }
        let now = foreground_provider();
        if now.is_some() && now == seen && now != sent {
            sent = now;
            let _ = app_handle.emit("foreground:provider", now);
        }
        seen = now;
    }
}

/// Lower case, without `.exe`.
fn stem(exe: &str) -> &str {
    exe.strip_suffix(".exe").unwrap_or(exe)
}

fn app_provider(exe: &str) -> Option<&'static str> {
    let name = stem(exe);
    APPS.iter().find(|(app, _)| *app == name).map(|(_, id)| *id)
}

fn cli_provider(exe: &str, command_line: impl FnOnce() -> Option<String>) -> Option<&'static str> {
    if let Some((_, id)) = CLIS.iter().find(|(cli, _)| *cli == exe) {
        return Some(id);
    }
    if !RUNNERS.contains(&exe) {
        return None;
    }
    let text = command_line()?.to_lowercase().replace('\\', "/");
    MARKERS
        .iter()
        .find(|(marker, _)| has_word(&text, marker))
        .map(|(_, id)| *id)
}

/// `marker` in `text` with no letter, digit, `_` or `-` right before or after it, nor a `.` before
/// it: `.claude` and `.codex` are config folders, and a script in one (a plugin's worker) isn't the CLI.
fn has_word(text: &str, marker: &str) -> bool {
    let part = |c: Option<char>| c.is_some_and(|c| c.is_alphanumeric() || c == '_' || c == '-');
    text.match_indices(marker).any(|(at, _)| {
        let before = text[..at].chars().next_back();
        !part(before) && before != Some('.') && !part(text[at + marker.len()..].chars().next())
    })
}

fn title_provider(title: &str) -> Option<&'static str> {
    title
        .trim_start()
        .starts_with(CLAUDE_TITLE_GLYPHS)
        .then_some("claude")
}

/// The CLI running under the terminal process `root`: the newest-started one when there are
/// several. shortcut: Windows Terminal runs every tab in one process, so with CLIs in two tabs the
/// newest wins, not the shown tab; keep a per-window choice if that bothers anyone.
fn terminal_provider(
    root: u32,
    processes: &[crate::processes::Process],
    command_line: impl Fn(u32) -> Option<String>,
    started: impl Fn(u32) -> Option<u64>,
) -> Option<&'static str> {
    let mut family = vec![root];
    let mut best: Option<(u64, &'static str)> = None;
    let mut i = 0;
    while i < family.len() {
        let parent = family[i];
        for child in processes
            .iter()
            .filter(|p| p.parent == parent && p.pid != parent)
        {
            if family.contains(&child.pid) {
                continue;
            }
            family.push(child.pid);
            if let Some(id) = cli_provider(&child.exe, || command_line(child.pid)) {
                let at = started(child.pid).unwrap_or(0);
                if best.is_none_or(|(newest, _)| at >= newest) {
                    best = Some((at, id));
                }
            }
        }
        i += 1;
    }
    best.map(|(_, id)| id)
}

#[cfg(windows)]
fn foreground_provider() -> Option<&'static str> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };
    // SAFETY: plain queries on the foreground window; the out-pointers are locals.
    let (pid, title) = unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32).max(0) as usize;
        (pid, String::from_utf16_lossy(&buf[..len]))
    };
    let processes = crate::processes::snapshot();
    let me = processes.iter().find(|p| p.pid == pid)?;
    if let Some(id) = app_provider(&me.exe) {
        return Some(id);
    }
    if !TERMINALS.contains(&stem(&me.exe)) {
        return None;
    }
    if let Some(id) = title_provider(&title) {
        return Some(id);
    }
    // A console window belongs to conhost, a child of the shell: look under the shell.
    let root = if matches!(stem(&me.exe), "conhost" | "openconsole") && me.parent != 0 {
        me.parent
    } else {
        pid
    };
    terminal_provider(
        root,
        &processes,
        command_line,
        crate::claude_sessions::process_start,
    )
}

#[cfg(not(windows))]
fn foreground_provider() -> Option<&'static str> {
    None
}

#[cfg(not(windows))]
fn command_line(_pid: u32) -> Option<String> {
    None
}

/// A process's command line (`ProcessCommandLineInformation`, Windows 8.1+), or None.
#[cfg(windows)]
fn command_line(pid: u32) -> Option<String> {
    use windows_sys::Win32::Foundation::{CloseHandle, UNICODE_STRING};
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    #[link(name = "ntdll")]
    unsafe extern "system" {
        fn NtQueryInformationProcess(
            process: windows_sys::Win32::Foundation::HANDLE,
            class: i32,
            info: *mut core::ffi::c_void,
            length: u32,
            returned: *mut u32,
        ) -> i32;
    }
    const PROCESS_COMMAND_LINE_INFORMATION: i32 = 60;
    // u64s keep the buffer aligned for the UNICODE_STRING at its start.
    let mut buf = vec![0u64; 4096];
    // SAFETY: the handle is checked and closed once; the buffer outlives the call and its size is
    // passed; the string read stays inside the buffer (checked against its length).
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let bytes = (buf.len() * 8) as u32;
        let mut returned = 0u32;
        let status = NtQueryInformationProcess(
            handle,
            PROCESS_COMMAND_LINE_INFORMATION,
            buf.as_mut_ptr().cast(),
            bytes,
            &mut returned,
        );
        CloseHandle(handle);
        if status < 0 {
            return None;
        }
        let text = &*(buf.as_ptr() as *const UNICODE_STRING);
        let start = text.Buffer as usize;
        let base = buf.as_ptr() as usize;
        let len = usize::from(text.Length) / 2;
        if text.Buffer.is_null() || start < base || start + len * 2 > base + bytes as usize {
            return None;
        }
        Some(String::from_utf16_lossy(std::slice::from_raw_parts(
            text.Buffer,
            len,
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::processes::Process;

    fn process(pid: u32, parent: u32, exe: &str) -> Process {
        Process {
            pid,
            parent,
            exe: exe.into(),
        }
    }

    #[test]
    fn a_desktop_app_is_told_by_its_exe() {
        assert_eq!(app_provider("cursor.exe"), Some("cursor"));
        assert_eq!(app_provider("code - insiders.exe"), Some("copilot"));
        assert_eq!(app_provider("idea64.exe"), Some("jetbrains-ai-assistant"));
        assert_eq!(app_provider("notepad.exe"), None);
    }

    #[test]
    fn a_runner_is_told_by_a_whole_word_of_its_command_line() {
        let line = |text: &str| {
            let text = text.to_string();
            move || Some(text)
        };
        assert_eq!(
            cli_provider(
                "node.exe",
                line(r"node C:\npm\node_modules\@anthropic-ai\claude-code\cli.js")
            ),
            Some("claude")
        );
        assert_eq!(
            cli_provider("node.exe", line(r"node C:\npm\@qwen-code\qwen-code\cli.js")),
            Some("qwen-code")
        );
        // "codexes" is not "codex"; a plain node script is nothing.
        assert_eq!(cli_provider("node.exe", line("node codexes.js")), None);
        assert_eq!(cli_provider("node.exe", line("node server.js")), None);
        // A shell's command line is never read: paths like `.codex` are everywhere.
        assert_eq!(cli_provider("pwsh.exe", line("pwsh -c codex")), None);
        // A script in a config folder (a Claude Code plugin's worker) isn't the CLI.
        assert_eq!(
            cli_provider(
                "bun.exe",
                line(r"bun C:\Users\x\.claude\plugins\cache\mem\worker.cjs")
            ),
            None
        );
        assert_eq!(cli_provider("codex.exe", || None), Some("codex"));
    }

    #[test]
    fn the_newest_cli_under_the_terminal_wins() {
        let processes = [
            process(10, 1, "windowsterminal.exe"),
            process(11, 10, "openconsole.exe"),
            process(12, 11, "pwsh.exe"),
            process(13, 12, "node.exe"),
            process(14, 13, "codex.exe"),
            process(20, 10, "pwsh.exe"),
            process(21, 20, "claude.exe"),
            process(30, 1, "claude.exe"),
        ];
        let started = |pid: u32| Some(u64::from(pid));
        assert_eq!(
            terminal_provider(10, &processes, |_| None, started),
            Some("claude")
        );
        // Codex started last: it wins.
        let codex_newest = |pid: u32| Some(if pid == 14 { 99 } else { u64::from(pid) });
        assert_eq!(
            terminal_provider(10, &processes, |_| None, codex_newest),
            Some("codex")
        );
        // Another terminal's CLI isn't this one's.
        assert_eq!(
            terminal_provider(12, &processes, |_| None, started),
            Some("codex")
        );
        assert_eq!(terminal_provider(30, &processes, |_| None, started), None);
    }

    #[test]
    fn running_tools_are_every_ai_app_and_cli_but_our_own_children() {
        let processes = [
            process(1, 0, "explorer.exe"),
            process(2, 1, "code.exe"),
            process(3, 1, "pwsh.exe"),
            process(4, 3, "node.exe"),
            process(5, 3, "claude.exe"),
            process(6, 1, "claude.exe"),
            process(50, 1, "opentokenusage.exe"),
            process(51, 50, "cmd.exe"),
            process(52, 51, "node.exe"),
            // Its launcher exited and we got its pid: started before us, so not our child.
            process(7, 50, "cursor.exe"),
        ];
        let lines = |pid: u32| match pid {
            4 => Some(r"node C:\npm\node_modules\@qwen-code\qwen-code\cli.js".to_string()),
            52 => Some(r"node C:\npm\node_modules\@ccusage\codex\index.js daily".to_string()),
            _ => None,
        };
        // Started in pid order.
        let started = |pid: u32| Some(u64::from(pid));
        assert_eq!(
            running_tools(&processes, 50, lines, started),
            vec!["claude", "copilot", "cursor", "qwen-code"]
        );
        assert_eq!(
            running_tools(&processes[..2], 50, |_| None, started),
            vec!["copilot"]
        );
        assert!(running_tools(&processes[..1], 50, |_| None, started).is_empty());
    }

    #[test]
    fn claude_code_is_told_by_its_terminal_title() {
        assert_eq!(title_provider("✳ Fix the login bug"), Some("claude"));
        assert_eq!(title_provider("Windows PowerShell"), None);
    }
}
