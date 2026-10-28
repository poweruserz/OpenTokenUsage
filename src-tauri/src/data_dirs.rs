//! Up to 0.7.8 the app identifier was upstream's `com.sunstory.openusage`. Tauri names the app's
//! folders after it: `%APPDATA%\<id>` (settings, accounts, plugin data, usage cache) and
//! `%LOCALAPPDATA%\<id>` (logs, WebView2), so the first start under the new identifier moves them.

use std::path::Path;

const LEGACY_IDENTIFIER: &str = "com.sunstory.openusage";

/// Call before Tauri builds the app: its log plugin and the webview open the new folders.
/// Returns the lines to log once logging is up.
pub fn migrate_legacy(identifier: &str) -> Vec<String> {
    let mut log = Vec::new();
    for (name, base) in [
        ("%APPDATA%", dirs::data_dir()),
        ("%LOCALAPPDATA%", dirs::data_local_dir()),
    ] {
        if let Some(base) = base {
            let old = base.join(LEGACY_IDENTIFIER);
            move_entries(&old, &base.join(identifier), name, &mut log);
        }
    }
    log
}

/// Moves every entry the new folder doesn't have yet (one that fails to move is tried again on the
/// next start), then removes the old folder once it's empty.
fn move_entries(old: &Path, new: &Path, name: &str, log: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(old) else {
        return;
    };
    if let Err(err) = std::fs::create_dir_all(new) {
        log.push(format!("{name}: can't create the new data folder: {err}"));
        return;
    }
    let (mut moved, mut kept) = (0, 0);
    for entry in entries.flatten() {
        let target = new.join(entry.file_name());
        // Already written under the new identifier: newer than the old copy.
        if target.exists() {
            kept += 1;
            continue;
        }
        match std::fs::rename(entry.path(), &target) {
            Ok(()) => moved += 1,
            Err(err) => log.push(format!(
                "{name}: can't move {} from {LEGACY_IDENTIFIER}: {err}",
                entry.file_name().to_string_lossy()
            )),
        }
    }
    let _ = std::fs::remove_dir(old);
    if moved + kept > 0 {
        log.push(format!(
            "{name}: moved {moved} item(s) from {LEGACY_IDENTIFIER}, kept {kept} the new folder already had"
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::move_entries;
    use std::fs;

    #[test]
    fn moves_the_old_folder_and_never_overwrites_the_new_one() {
        let root =
            std::env::temp_dir().join(format!("opentokenusage-data-dirs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let (old, new) = (root.join("old"), root.join("new"));
        let mut log = Vec::new();

        move_entries(&root.join("missing"), &new, "test", &mut log);
        assert!(!new.exists(), "nothing to move creates nothing");

        fs::create_dir_all(old.join("accounts").join("claude-1")).unwrap();
        fs::write(
            old.join("accounts").join("claude-1").join("login.json"),
            "a",
        )
        .unwrap();
        fs::write(old.join("settings.json"), "first").unwrap();
        move_entries(&old, &new, "test", &mut log);
        let account = new.join("accounts").join("claude-1").join("login.json");
        assert_eq!(fs::read_to_string(account).unwrap(), "a");
        assert_eq!(
            fs::read_to_string(new.join("settings.json")).unwrap(),
            "first"
        );
        assert!(!old.exists(), "an emptied old folder is removed");

        // An old copy next to a newer one (e.g. the old version ran again) stays where it is.
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("settings.json"), "second").unwrap();
        move_entries(&old, &new, "test", &mut log);
        assert_eq!(
            fs::read_to_string(new.join("settings.json")).unwrap(),
            "first"
        );
        assert!(old.join("settings.json").exists());

        fs::remove_dir_all(&root).unwrap();
    }
}
