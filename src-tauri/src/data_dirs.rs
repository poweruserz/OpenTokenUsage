//! Up to 0.7.8 the app identifier was upstream's `com.sunstory.openusage`. Tauri names the app's
//! folders after it: `%APPDATA%\<id>` (settings, accounts, plugin data, usage cache) and
//! `%LOCALAPPDATA%\<id>` (logs, WebView2), so the first start under the new identifier moves them.

use std::path::Path;

const LEGACY_IDENTIFIER: &str = "com.sunstory.openusage";
/// Settings tells users to point CLAUDE_CONFIG_DIR / CODEX_HOME at an account's folder, so the old
/// `accounts` path stays as a junction to the new one (`windows/hooks.nsh` removes it on uninstall).
const LINKED_DIR: &str = "accounts";
/// A WebView2 profile can't be merged file by file.
const WEBVIEW_PROFILE: &str = "EBWebView";

/// Call before Tauri builds the app: its log plugin and the webview open the new folders.
/// Returns the lines to log once logging is up.
pub fn migrate_legacy(identifier: &str) -> Vec<String> {
    let mut log = Vec::new();
    for (name, base) in [
        ("%APPDATA%", dirs::data_dir()),
        ("%LOCALAPPDATA%", dirs::data_local_dir()),
    ] {
        let Some(base) = base else {
            continue;
        };
        let old = base.join(LEGACY_IDENTIFIER);
        let (moved, kept) = move_entries(&old, &base.join(identifier), name, &mut log, true);
        if moved + kept > 0 {
            log.push(format!(
                "{name}: moved {moved} item(s) from {LEGACY_IDENTIFIER}, kept {kept} the new folder already had"
            ));
        }
    }
    log
}

/// Moves every entry the new folder doesn't have yet, then removes the old folder once it's empty.
/// Nothing is overwritten. An entry that fails to move is tried again on the next start, also when
/// this version has recreated its folder meanwhile (`plugins_data\<id>` is made on every probe):
/// with `merge`, folders both sides have are merged the same way.
fn move_entries(
    old: &Path,
    new: &Path,
    name: &str,
    log: &mut Vec<String>,
    merge: bool,
) -> (usize, usize) {
    let Ok(entries) = std::fs::read_dir(old) else {
        return (0, 0);
    };
    if let Err(err) = std::fs::create_dir_all(new) {
        log.push(format!("{name}: can't create the new data folder: {err}"));
        return (0, 0);
    }
    let (mut moved, mut kept) = (0, 0);
    for entry in entries.flatten() {
        let (path, file_name) = (entry.path(), entry.file_name());
        let target = new.join(&file_name);
        // The `accounts` junction from an earlier start: its data is already in the new folder.
        if entry.file_type().is_ok_and(|kind| kind.is_symlink()) {
            continue;
        }
        let accounts = file_name == LINKED_DIR && old.ends_with(LEGACY_IDENTIFIER);
        if !target.exists() {
            match std::fs::rename(&path, &target) {
                Ok(()) => moved += 1,
                Err(err) => log.push(format!(
                    "{name}: can't move {} from {LEGACY_IDENTIFIER}: {err}",
                    file_name.to_string_lossy()
                )),
            }
        } else if merge && path.is_dir() && target.is_dir() && file_name != WEBVIEW_PROFILE {
            // An account folder is a CLI's whole state: it moves whole or stays.
            let (m, k) = move_entries(&path, &target, name, log, !accounts);
            (moved, kept) = (moved + m, kept + k);
        } else {
            // Written under the new identifier: newer than the old copy.
            kept += 1;
        }
        // Only once nothing of the old `accounts` is left does its path lead to the new one.
        if accounts && !path.exists() {
            if let Err(err) = junction::create(&target, &path) {
                log.push(format!(
                    "{name}: can't link the old {LINKED_DIR} folder: {err}"
                ));
            }
        }
    }
    let _ = std::fs::remove_dir(old);
    (moved, kept)
}

#[cfg(test)]
mod tests {
    use super::{move_entries, LEGACY_IDENTIFIER};
    use std::fs;
    use std::path::{Path, PathBuf};

    /// A fresh `<temp>/<test>/` with the old folder (named like the real one) and the new one.
    fn folders(test: &str) -> (PathBuf, PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "opentokenusage-data-dirs-{test}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        (root.join(LEGACY_IDENTIFIER), root.join("new"), root)
    }

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    fn read(path: &Path) -> String {
        fs::read_to_string(path).unwrap()
    }

    #[test]
    fn moves_the_old_folder_and_never_overwrites_the_new_one() {
        let (old, new, root) = folders("move");
        let mut log = Vec::new();

        move_entries(&root.join("missing"), &new, "test", &mut log, true);
        assert!(!new.exists(), "nothing to move creates nothing");

        let account = Path::new("accounts").join("claude-1").join("login.json");
        write(&old.join(&account), "a");
        write(&old.join("settings.json"), "first");
        move_entries(&old, &new, "test", &mut log, true);
        assert_eq!(read(&new.join(&account)), "a");
        assert_eq!(read(&new.join("settings.json")), "first");
        // Only the junction is left, so an old CLAUDE_CONFIG_DIR still reaches the moved login.
        assert_eq!(read(&old.join(&account)), "a");
        assert_eq!(fs::read_dir(&old).unwrap().count(), 1);
        assert!(log.is_empty(), "{log:?}");

        // A later start leaves the junction alone, fills in a folder this version recreated, and
        // keeps the newer copy of what both sides have.
        let token = Path::new("plugins_data").join("kiro").join("auth.json");
        write(&old.join(&token), "saved");
        fs::create_dir_all(new.join(&token).parent().unwrap()).unwrap();
        write(&old.join("settings.json"), "second");
        let (moved, kept) = move_entries(&old, &new, "test", &mut log, true);
        assert_eq!((moved, kept), (1, 1));
        assert_eq!(read(&new.join(&token)), "saved");
        assert_eq!(read(&new.join("settings.json")), "first");
        assert_eq!(read(&old.join("settings.json")), "second");
        assert_eq!(read(&old.join(&account)), "a");

        fs::remove_dir_all(&root).unwrap();
        assert!(log.is_empty(), "{log:?}");
    }

    #[test]
    fn account_folders_move_whole_and_the_link_waits_for_the_last() {
        // `accounts` failed to move (a CLI held it open) and a sign-in in the app then made
        // `claude-1` on the new side.
        let (old, new, root) = folders("accounts");
        let accounts = old.join("accounts");
        write(&accounts.join("claude-1").join("config.json"), "cli");
        write(&accounts.join("codex-2").join("auth.json"), "codex");
        write(
            &new.join("accounts").join("claude-1").join("auth.json"),
            "app",
        );
        let mut log = Vec::new();

        move_entries(&old, &new, "test", &mut log, true);
        assert_eq!(
            read(&new.join("accounts").join("codex-2").join("auth.json")),
            "codex"
        );
        // Two copies of one account are never mixed, and the CLI's folder stays where it points.
        assert!(!new
            .join("accounts")
            .join("claude-1")
            .join("config.json")
            .exists());
        assert_eq!(read(&accounts.join("claude-1").join("config.json")), "cli");
        assert!(!fs::symlink_metadata(&accounts)
            .unwrap()
            .file_type()
            .is_symlink());

        // Once the last old account folder is gone, the old path leads to the new folder.
        fs::remove_dir_all(accounts.join("claude-1")).unwrap();
        move_entries(&old, &new, "test", &mut log, true);
        assert!(fs::symlink_metadata(&accounts)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(read(&accounts.join("codex-2").join("auth.json")), "codex");

        fs::remove_dir_all(&root).unwrap();
        assert!(log.is_empty(), "{log:?}");
    }
}
