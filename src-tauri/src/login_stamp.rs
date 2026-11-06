//! When a provider's CLI last wrote its login file. While a card asks for a sign-in, the frontend
//! checks this every few seconds and probes the card again the moment a sign-in lands, instead of
//! at the next refresh. Only a file's time is read here, never its contents.

use crate::plugin_engine::manifest::LoadedPlugin;
use crate::AppState;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

/// The CLIs that sign in to a file: the variable that moves their home, the folders the plugin
/// looks in without it (under the user home, in the plugin's order), and the login file.
const LOGIN_FILES: [(&str, &str, &[&str], &str); 2] = [
    (
        "claude",
        "CLAUDE_CONFIG_DIR",
        &[".claude"],
        ".credentials.json",
    ),
    // plugins/codex: CONFIG_AUTH_PATHS
    (
        "codex",
        "CODEX_HOME",
        &[".config/codex", ".codex"],
        "auth.json",
    ),
];

/// The folders a plugin's CLI keeps its login in (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, or the defaults),
/// with the base plugin id and the login file's name. None for a WSL copy: reading its
/// `\\wsl.localhost` share can start a stopped distro, which the app never does.
pub(crate) fn cli_dirs(
    plugin: &LoadedPlugin,
) -> Option<(&'static str, Vec<PathBuf>, &'static str)> {
    let account = plugin.account.as_ref();
    if account.is_some_and(|a| a.home.is_some()) {
        return None;
    }
    let base_id = account.map_or(plugin.manifest.id.as_str(), |a| a.base_id.as_str());
    let (id, var, default_dirs, file) = LOGIN_FILES.iter().find(|(id, ..)| *id == base_id)?;
    // An extra account names its folder in the variable.
    let configured = match account.and_then(|a| a.env.iter().find(|(name, _)| name == var)) {
        Some((_, value)) => value.clone(),
        None => crate::plugin_engine::host_api::resolve_env_value(var),
    };
    let home = dirs::home_dir()?;
    let dirs = match configured {
        Some(dir) => vec![match dir.strip_prefix('~') {
            Some(rest) => home.join(rest.trim_start_matches(['/', '\\'])),
            None => PathBuf::from(dir),
        }],
        None => default_dirs.iter().map(|dir| home.join(dir)).collect(),
    };
    Some((id, dirs, file))
}

/// The files a plugin's login can be in (none for a WSL copy, see `cli_dirs`).
fn login_files(plugin: &LoadedPlugin) -> Vec<PathBuf> {
    cli_dirs(plugin).map_or_else(Vec::new, |(_, dirs, file)| {
        dirs.into_iter().map(|dir| dir.join(file)).collect()
    })
}

/// Unix ms of the latest write to one of the plugin's login files; `None` when it has none or none
/// exists yet.
#[tauri::command]
pub fn login_file_stamp(
    state: tauri::State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Option<u64> {
    let files = {
        let state = state.lock().ok()?;
        let plugin = state.plugins.iter().find(|p| p.manifest.id == plugin_id)?;
        login_files(plugin)
    };
    files
        .iter()
        .filter_map(|path| std::fs::metadata(path).ok()?.modified().ok())
        .filter_map(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|since| since.as_millis() as u64)
        .max()
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
            login_files(&plugin("claude-1a2b3c4d", Some(account))),
            vec![PathBuf::from(r"C:\data\accounts\work").join(".credentials.json")]
        );
    }

    #[test]
    fn codex_without_codex_home_is_watched_in_both_folders_the_plugin_reads() {
        if crate::plugin_engine::host_api::resolve_env_value("CODEX_HOME").is_some() {
            return;
        }
        let home = dirs::home_dir().unwrap();
        assert_eq!(
            login_files(&plugin("codex", None)),
            vec![
                home.join(".config/codex").join("auth.json"),
                home.join(".codex").join("auth.json")
            ]
        );
    }

    #[test]
    fn a_wsl_copy_is_never_read_so_a_stopped_distro_stays_stopped() {
        let account = AccountBinding {
            base_id: "codex".into(),
            home: Some(PathBuf::from(r"\\wsl.localhost\Ubuntu\home\me")),
            isolated_env: true,
            ..Default::default()
        };
        assert!(login_files(&plugin("codex-wsl-0011aabb", Some(account))).is_empty());
    }

    #[test]
    fn providers_without_a_login_file_have_nothing_to_watch() {
        assert!(login_files(&plugin("cursor", None)).is_empty());
        assert!(login_files(&plugin("claude", None))
            .iter()
            .all(|path| path.ends_with(".credentials.json")));
    }
}
