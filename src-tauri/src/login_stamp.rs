//! When a provider's CLI last wrote its login file. While a card asks for a sign-in, the frontend
//! checks this every few seconds and probes the card again the moment a sign-in lands, instead of
//! at the next refresh. Only a file's time is read here, never its contents.

use crate::plugin_engine::manifest::LoadedPlugin;
use crate::AppState;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

/// The CLIs that sign in to a file: the variable that moves their home, its default under the user
/// home, and the login file inside it.
const LOGIN_FILES: [(&str, &str, &str, &str); 2] = [
    (
        "claude",
        "CLAUDE_CONFIG_DIR",
        ".claude",
        ".credentials.json",
    ),
    ("codex", "CODEX_HOME", ".codex", "auth.json"),
];

fn login_file(plugin: &LoadedPlugin) -> Option<PathBuf> {
    let account = plugin.account.as_ref();
    let base_id = account.map_or(plugin.manifest.id.as_str(), |a| a.base_id.as_str());
    let (_, var, default_dir, file) = LOGIN_FILES.iter().find(|(id, ..)| *id == base_id)?;
    // An extra account names its folder in the variable; a WSL login has its own home and sees no
    // Windows variables.
    let bound = account.and_then(|a| {
        a.env
            .iter()
            .find(|(name, _)| name == var)
            .map(|(_, value)| value.clone())
    });
    let configured = match bound {
        Some(value) => value,
        None if account.is_some_and(|a| a.isolated_env) => None,
        None => crate::plugin_engine::host_api::resolve_env_value(var),
    };
    let home = account
        .and_then(|a| a.home.clone())
        .or_else(dirs::home_dir)?;
    let dir = match configured {
        Some(dir) => match dir.strip_prefix('~') {
            Some(rest) => home.join(rest.trim_start_matches(['/', '\\'])),
            None => PathBuf::from(dir),
        },
        None => home.join(default_dir),
    };
    Some(dir.join(file))
}

/// Unix ms of the last write to the plugin's login file; `None` when the plugin has no login file
/// or it doesn't exist yet.
#[tauri::command]
pub fn login_file_stamp(
    state: tauri::State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Option<u64> {
    let path = {
        let state = state.lock().ok()?;
        let plugin = state.plugins.iter().find(|p| p.manifest.id == plugin_id)?;
        login_file(plugin)?
    };
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_engine::manifest::AccountBinding;

    fn plugin(id: &str, account: Option<AccountBinding>) -> LoadedPlugin {
        let manifest: crate::plugin_engine::manifest::PluginManifest =
            serde_json::from_value(serde_json::json!({
                "schemaVersion": 1, "id": id, "name": id, "version": "1.0.0",
                "entry": "plugin.js", "icon": "icon.svg", "lines": []
            }))
            .expect("manifest");
        LoadedPlugin {
            manifest,
            plugin_dir: PathBuf::new(),
            entry_script: String::new(),
            icon_data_url: String::new(),
            account,
        }
    }

    #[test]
    fn an_extra_account_watches_the_login_in_its_own_folder() {
        let account = AccountBinding {
            base_id: "claude".into(),
            env: vec![(
                "CLAUDE_CONFIG_DIR".into(),
                Some(r"C:\data\accounts\work".into()),
            )],
            ..Default::default()
        };
        assert_eq!(
            login_file(&plugin("claude-1a2b3c4d", Some(account))),
            Some(PathBuf::from(r"C:\data\accounts\work").join(".credentials.json"))
        );
    }

    #[test]
    fn a_wsl_login_is_found_under_its_linux_home_without_windows_variables() {
        let account = AccountBinding {
            base_id: "codex".into(),
            home: Some(PathBuf::from(r"\\wsl.localhost\Ubuntu\home\me")),
            isolated_env: true,
            ..Default::default()
        };
        assert_eq!(
            login_file(&plugin("codex-wsl-0011aabb", Some(account))),
            Some(
                PathBuf::from(r"\\wsl.localhost\Ubuntu\home\me")
                    .join(".codex")
                    .join("auth.json")
            )
        );
    }

    #[test]
    fn providers_without_a_login_file_have_nothing_to_watch() {
        assert_eq!(login_file(&plugin("cursor", None)), None);
        assert!(login_file(&plugin("claude", None))
            .is_some_and(|path| path.ends_with(".credentials.json")));
    }
}
