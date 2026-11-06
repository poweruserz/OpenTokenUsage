//! Saves a preferences backup (built by the frontend, `settings-backup.ts`) to the Downloads folder
//! and shows it in Explorer. The webview may only hand over JSON for this one file name; reading a
//! backup back goes through the page's own file picker.

use std::path::{Path, PathBuf};

const FILE_NAME: &str = "OpenTokenUsage-settings.json";
const MAX_BYTES: usize = 1024 * 1024;

fn write_backup(dir: &Path, json: &str) -> Result<PathBuf, String> {
    if json.len() > MAX_BYTES {
        return Err("the backup is too large".to_string());
    }
    let value: serde_json::Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    if !value.is_object() {
        return Err("the backup isn't a JSON object".to_string());
    }
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    let path = dir.join(FILE_NAME);
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Writes the backup to Downloads (the home folder without one) and selects it in Explorer.
#[tauri::command]
pub fn export_settings(app: tauri::AppHandle, json: String) -> Result<String, String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "no Downloads folder".to_string())?;
    let path = write_backup(&dir, &json)?;
    if let Err(e) = app.opener().reveal_item_in_dir(&path) {
        log::warn!("settings backup saved but not shown in Explorer: {e}");
    }
    Ok(path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_only_a_json_object_of_bounded_size_to_its_fixed_name() {
        let dir = std::env::temp_dir().join(format!("openusage-backup-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let path = write_backup(
            &dir,
            r#"{"app":"OpenTokenUsage","settings":{"themeMode":"light"}}"#,
        )
        .unwrap();
        assert_eq!(path, dir.join(FILE_NAME));
        let saved: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(saved["settings"]["themeMode"], "light");

        assert!(write_backup(&dir, "[1, 2]").is_err());
        assert!(write_backup(&dir, "not json").is_err());
        assert!(write_backup(&dir, &format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_BYTES))).is_err());
    }
}
