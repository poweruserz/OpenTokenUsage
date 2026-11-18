//! The Claude desktop app's sign-in, for people who use the app without Claude Code's CLI login
//! (Settings → Claude Code, on by default). Read only: the app renews its own login, and a refresh
//! from here would rotate its refresh token and sign the app out. Only the access token, its expiry,
//! the plan and the account id reach the plugin; the refresh token never leaves this file.
//!
//! The Store (MSIX) app keeps its data in `%LOCALAPPDATA%\Claude-Data\<package>\`, older installs in
//! `%APPDATA%\Claude\`. `config.json`'s `oauth:tokenCacheV2` is Electron's safeStorage: `v10` and
//! AES-256-GCM under the DPAPI-wrapped key in `Local State`, as for Cursor.

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

static ENABLED: AtomicBool = AtomicBool::new(true);
const TOKEN_CACHE_KEY: &str = "oauth:tokenCacheV2";
/// A cache key ends with the API it is for and its scopes: `acct:<account>|…:https://api.anthropic.com:<scopes>`.
const API_SCOPES_AT: &str = "https://api.anthropic.com:";
const READ_FAILED: &str = "could not read the Claude app's sign-in";

#[tauri::command]
pub fn set_claude_desktop_login(enabled: bool) {
    ENABLED.store(enabled, Ordering::Relaxed);
}

/// The app's login that lasts longest among those that can read usage (`user:profile`), as JSON
/// (`accessToken`, `expiresAt` ms, `subscriptionType`, `rateLimitTier`, `account`). None when the
/// setting is off, the app isn't installed or nobody is signed in.
pub fn read_login() -> Result<Option<String>, String> {
    if !ENABLED.load(Ordering::Relaxed) {
        return Ok(None);
    }
    let Some(dir) = newest_data_dir(data_dirs()) else {
        return Ok(None);
    };
    login_in(&dir).map(|login| login.map(|value| value.to_string()))
}

fn data_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(local) = dirs::data_local_dir() {
        if let Ok(entries) = std::fs::read_dir(local.join("Claude-Data")) {
            dirs.extend(entries.flatten().map(|entry| entry.path()));
        }
    }
    if let Some(roaming) = dirs::data_dir() {
        dirs.push(roaming.join("Claude"));
    }
    dirs
}

/// The folder whose `config.json` was written last: an old install's folder can outlive it.
fn newest_data_dir(dirs: Vec<PathBuf>) -> Option<PathBuf> {
    dirs.into_iter()
        .filter_map(|dir| {
            let written = std::fs::metadata(dir.join("config.json"))
                .ok()?
                .modified()
                .ok()?;
            dir.join("Local State").is_file().then_some((written, dir))
        })
        .max_by_key(|(written, _)| *written)
        .map(|(_, dir)| dir)
}

fn login_in(dir: &Path) -> Result<Option<Value>, String> {
    let config =
        std::fs::read_to_string(dir.join("config.json")).map_err(|_| READ_FAILED.to_string())?;
    let config: Value = serde_json::from_str(&config).map_err(|_| READ_FAILED.to_string())?;
    let Some(sealed) = config.get(TOKEN_CACHE_KEY).and_then(Value::as_str) else {
        return Ok(None);
    };
    let blob = BASE64_STANDARD
        .decode(sealed.trim())
        .map_err(|_| READ_FAILED.to_string())?;
    let cache = open_cache(dir, &blob)?;
    Ok(pick_login(&cache))
}

#[cfg(windows)]
fn open_cache(dir: &Path, blob: &[u8]) -> Result<String, String> {
    use super::cursor_safe_storage::{open_v10, read_wrapped_key, unwrap_dpapi};
    let local_state =
        std::fs::read_to_string(dir.join("Local State")).map_err(|_| READ_FAILED.to_string())?;
    let key = unwrap_dpapi(&read_wrapped_key(&local_state).map_err(|_| READ_FAILED.to_string())?)?;
    open_v10(&key, blob).map_err(|_| READ_FAILED.to_string())
}

#[cfg(not(windows))]
fn open_cache(_dir: &Path, _blob: &[u8]) -> Result<String, String> {
    Err("not supported on this platform".to_string())
}

/// From the decrypted cache: the `user:profile` login with the latest expiry, without its refresh token.
fn pick_login(cache: &str) -> Option<Value> {
    let entries: serde_json::Map<String, Value> = serde_json::from_str(cache).ok()?;
    entries
        .iter()
        .filter_map(|(key, entry)| {
            let (_, scopes) = key.split_once(API_SCOPES_AT)?;
            if !scopes.split(' ').any(|scope| scope == "user:profile") {
                return None;
            }
            let token = entry
                .get("token")?
                .as_str()
                .filter(|token| !token.trim().is_empty())?;
            let expires_at = entry.get("expiresAt")?.as_i64()?;
            let account = key
                .strip_prefix("acct:")
                .and_then(|rest| rest.split('|').next())
                .filter(|id| !id.is_empty());
            let field = |name: &str| entry.get(name).cloned().unwrap_or(Value::Null);
            Some((
                expires_at,
                json!({
                    "accessToken": token,
                    "expiresAt": expires_at,
                    "subscriptionType": field("subscriptionType"),
                    "rateLimitTier": field("rateLimitTier"),
                    "account": account,
                }),
            ))
        })
        .max_by_key(|(expires_at, _)| *expires_at)
        .map(|(_, login)| login)
}

#[cfg(test)]
mod tests {
    use super::*;

    const API: &str = "https://api.anthropic.com";

    #[test]
    fn picks_the_profile_login_that_lasts_longest_and_leaves_its_refresh_token_out() {
        let cache = json!({
            format!("acct:acc-1|org-1:client:{API}:user:inference"): {"token": "inference-only", "expiresAt": 9_000},
            format!("acct:acc-1|org-1:client:{API}:user:profile"): {
                "token": "short", "refreshToken": "r1", "expiresAt": 2_000, "subscriptionType": "max"
            },
            format!("acct:acc-1|org-1:client:{API}:user:inference user:profile"): {
                "token": "long", "refreshToken": "r2", "expiresAt": 5_000,
                "subscriptionType": "max", "rateLimitTier": "default_claude_max_20x"
            },
        })
        .to_string();
        let login = pick_login(&cache).expect("login");
        assert_eq!(
            login,
            json!({
                "accessToken": "long", "expiresAt": 5_000, "subscriptionType": "max",
                "rateLimitTier": "default_claude_max_20x", "account": "acc-1"
            })
        );
        assert!(!login.to_string().contains("r2"));
    }

    #[test]
    fn no_login_without_a_profile_scope_or_a_token() {
        let cache = json!({
            format!("acct:a|o:c:{API}:user:inference user:office"): {"token": "t", "expiresAt": 1},
            format!("acct:a|o:c:{API}:user:profile"): {"token": " ", "expiresAt": 2},
            format!("acct:a|o:c:{API}:user:profiles"): {"token": "t", "expiresAt": 3},
            "acct:a|o:c:https://other.example:user:profile": {"token": "t", "expiresAt": 4},
        })
        .to_string();
        assert_eq!(pick_login(&cache), None);
        assert_eq!(pick_login("not json"), None);
    }

    #[test]
    fn the_newest_config_wins_and_a_folder_without_local_state_is_skipped() {
        let base = std::env::temp_dir().join(format!("otu-claude-desktop-{}", std::process::id()));
        let old = base.join("old");
        let new = base.join("new");
        let half = base.join("half");
        for dir in [&old, &new, &half] {
            std::fs::create_dir_all(dir).unwrap();
            std::fs::write(dir.join("config.json"), "{}").unwrap();
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        std::fs::write(old.join("Local State"), "{}").unwrap();
        std::fs::write(new.join("Local State"), "{}").unwrap();
        assert_eq!(
            newest_data_dir(vec![
                old.clone(),
                half.clone(),
                new.clone(),
                base.join("missing")
            ]),
            Some(new)
        );
        assert_eq!(login_in(&old).unwrap(), None);
        let _ = std::fs::remove_dir_all(&base);
    }
}
