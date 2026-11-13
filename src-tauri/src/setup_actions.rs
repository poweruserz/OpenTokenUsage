//! One-click fixes offered under provider errors (see `getPluginErrorAction` in the frontend).

use std::path::Path;
use std::process::Command;

/// Login commands the bundled plugins tell the user to run. Error text can carry server strings,
/// so only these exact commands are ever started.
const ALLOWED_COMMANDS: [&str; 10] = [
    "claude",
    "codex",
    "droid",
    "agy",
    "agent login",
    "devin auth login",
    "gh auth login",
    "grok login",
    "kimi login",
    "muse login",
];

fn is_allowed(command: &str) -> bool {
    ALLOWED_COMMANDS.contains(&command)
}

/// Opens a terminal window in the user's home folder and runs a login command there.
#[tauri::command]
pub fn run_in_terminal(command: String) -> Result<(), String> {
    if !is_allowed(&command) {
        return Err(format!("command not allowed: {command}"));
    }
    open_terminal(&command, None, &[])
}

/// Runs a fixed login command (never text from the webview) in a new terminal in the user's home
/// folder, optionally with one variable set (an account's login folder) and some removed.
/// `cmd /k` instead of PowerShell: npm installs `.ps1` shims that PowerShell's default
/// execution policy refuses to run, while `cmd` picks the `.cmd` shim.
pub(crate) fn open_terminal(command: &str, set: Option<(&str, &Path)>, remove: &[&str]) -> Result<(), String> {
    let mut cmd = Command::new("cmd.exe");
    cmd.args(["/k", command]);
    if let Some((name, value)) = set {
        cmd.env(name, value);
    }
    for name in remove {
        cmd.env_remove(name);
    }
    if let Some(home) = std::env::var_os("USERPROFILE") {
        cmd.current_dir(home);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        cmd.creation_flags(CREATE_NEW_CONSOLE);
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Opens Windows' own "Environment Variables" dialog (user variables, no admin needed).
#[tauri::command]
pub fn open_env_editor() -> Result<(), String> {
    Command::new("rundll32.exe")
        .arg("sysdm.cpl,EditEnvironmentVariables")
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Opens Settings > Personalization > Taskbar, where "Other system tray icons" pins our icons
/// next to the clock (Windows puts new tray icons in the overflow; only the user can move them).
#[tauri::command]
pub fn open_taskbar_settings() -> Result<(), String> {
    Command::new("explorer.exe")
        .arg("ms-settings:taskbar")
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_login_commands_are_allowed() {
        assert!(is_allowed("agy"));
        assert!(is_allowed("gh auth login"));
        assert!(!is_allowed("agy & del x"));
        assert!(!is_allowed("rm -rf ~"));
        assert!(!is_allowed(""));
    }

    #[test]
    fn run_in_terminal_rejects_unknown_commands() {
        assert!(run_in_terminal("calc".into()).is_err());
    }
}
