//! Start on login: tauri-plugin-autostart writes `HKCU\...\Run\<productName>` = this exe's path.

use std::path::Path;

/// Whether the Start-on-login entry is missing or names an exe that no longer exists, such as the
/// per-machine MSI copy a per-user install replaced. Only such an entry is rewritten, so a dev or
/// test build never takes Start on login from the installed app.
#[tauri::command]
pub fn autostart_stale(app: tauri::AppHandle) -> bool {
    run_value(&app.package_info().name).is_none_or(|value| !Path::new(entry_exe(&value)).exists())
}

#[cfg(windows)]
fn run_value(name: &str) -> Option<String> {
    winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
        .and_then(|key| key.get_value(name))
        .ok()
}

#[cfg(not(windows))]
fn run_value(_name: &str) -> Option<String> {
    None
}

/// The exe in a Run value: `"C:\a b\x.exe" --args`, or unquoted `C:\a b\x.exe --args` (as the plugin
/// writes it, with a trailing space when there are no args).
fn entry_exe(value: &str) -> &str {
    let value = value.trim();
    if let Some(rest) = value.strip_prefix('"') {
        return rest.split('"').next().unwrap_or(rest);
    }
    match value.to_ascii_lowercase().find(".exe") {
        Some(end) => &value[..end + 4],
        None => value,
    }
}

#[cfg(test)]
mod tests {
    use super::entry_exe;

    #[test]
    fn reads_the_exe_from_a_run_value() {
        assert_eq!(
            entry_exe(r"C:\Program Files\OpenTokenUsage\opentokenusage.exe "),
            r"C:\Program Files\OpenTokenUsage\opentokenusage.exe"
        );
        assert_eq!(
            entry_exe(r#""C:\a b\OpenTokenUsage.EXE" --minimized"#),
            r"C:\a b\OpenTokenUsage.EXE"
        );
        assert_eq!(entry_exe(r"C:\a b\x.exe --flag"), r"C:\a b\x.exe");
        assert_eq!(entry_exe("no exe here"), "no exe here");
    }
}
