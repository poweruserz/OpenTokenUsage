use reqwest::Proxy;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

/// The file as messages name it: the real path holds the Windows user name, and they reach the log.
const SHOWN_PATH: &str = r"%APPDATA%\com.poweruserz.opentokenusage\config.json";
const LEGACY_SHOWN_PATH: &str = "~/.openusage/config.json";

/// How messages (the log, Settings' "not saved") name the file in use (`in_use`).
fn shown(path: &std::path::Path) -> &'static str {
    if crate::data_dirs::legacy_config().as_deref() == Some(path) {
        LEGACY_SHOWN_PATH
    } else {
        SHOWN_PATH
    }
}

/// The app's data folder (`%APPDATA%\<identifier>`), set once at start, before anything reads the file.
static APP_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn init(app_data_dir: PathBuf) {
    let _ = APP_DATA_DIR.set(app_data_dir);
}

/// Proxy configuration loaded from config.json in the app's data folder
#[derive(Debug, Clone, Deserialize)]
pub struct ProxyConfig {
    pub enabled: bool,
    pub url: String,
}

/// Top-level application config
#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub proxy: Option<ProxyConfig>,
}

/// The proxy in effect: None until first read from disk, then Some(the proxy, or None for none).
/// Settings replaces it, so a new proxy applies from the next request (clients are built per request).
static RESOLVED_PROXY: Mutex<Option<Option<Proxy>>> = Mutex::new(None);

/// The proxy every outgoing request goes through (localhost bypassed), or None.
pub fn resolved_proxy() -> Option<Proxy> {
    let mut slot = RESOLVED_PROXY.lock().unwrap_or_else(|e| e.into_inner());
    slot.get_or_insert_with(load_and_resolve_proxy).clone()
}

fn config_path() -> Option<PathBuf> {
    let new = APP_DATA_DIR.get()?.join(crate::data_dirs::CONFIG_FILE);
    Some(in_use(new, crate::data_dirs::legacy_config()))
}

/// The app folder's file, or 0.9.2's while the start couldn't move it (`data_dirs::move_config`):
/// read and saved where it is, so nothing in it is lost. The custom-balance plugin picks the same way.
fn in_use(new: PathBuf, old: Option<PathBuf>) -> PathBuf {
    match old {
        Some(old) if !new.exists() && old.is_file() => old,
        _ => new,
    }
}

fn read_config() -> Option<AppConfig> {
    let path = config_path()?;
    let contents = std::fs::read_to_string(&path).ok()?;
    match serde_json::from_str::<AppConfig>(&contents) {
        Ok(cfg) => Some(cfg),
        Err(e) => {
            log::warn!(
                "[config] failed to parse {}: {e}, using defaults",
                shown(&path)
            );
            None
        }
    }
}

/// Loads config from disk, resolves proxy, logs result.
fn load_and_resolve_proxy() -> Option<Proxy> {
    let Some(proxy_cfg) = read_config()
        .and_then(|config| config.proxy)
        .filter(|p| p.enabled)
    else {
        log::debug!("[config] proxy disabled");
        return None;
    };
    match to_proxy(&proxy_cfg.url) {
        Ok(proxy) => {
            log::debug!(
                "[config] proxy enabled: {}",
                redact_proxy_url(&proxy_cfg.url)
            );
            Some(proxy)
        }
        Err(e) => {
            log::warn!("[config] proxy disabled due to invalid URL: {}", e);
            None
        }
    }
}

const MAX_PROXY_URL: usize = 2048;

/// A proxy URL Settings may save: http, https, socks5 or socks5h, with a host. Localhost is never
/// proxied (local language servers, the status-line bridge).
fn to_proxy(url: &str) -> Result<Proxy, String> {
    if url.len() > MAX_PROXY_URL {
        return Err("too long".into());
    }
    let parsed = reqwest::Url::parse(url).map_err(|e| e.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https" | "socks5" | "socks5h") {
        return Err("unsupported scheme".into());
    }
    if parsed.host_str().is_none_or(str::is_empty) {
        return Err("no host".into());
    }
    let proxy = Proxy::all(url).map_err(|e| e.to_string())?;
    Ok(proxy.no_proxy(reqwest::NoProxy::from_string("localhost,127.0.0.1,::1")))
}

/// What Settings shows and saves.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProxySetting {
    pub enabled: bool,
    pub url: String,
}

#[tauri::command]
pub fn get_proxy_setting() -> ProxySetting {
    read_config()
        .and_then(|config| config.proxy)
        .map(|proxy| ProxySetting {
            enabled: proxy.enabled,
            url: proxy.url,
        })
        .unwrap_or(ProxySetting {
            enabled: false,
            url: String::new(),
        })
}

/// The config file with its `proxy` entry replaced; anything else in it stays.
fn with_proxy(config: serde_json::Value, setting: &ProxySetting) -> serde_json::Value {
    let mut object = match config {
        serde_json::Value::Object(object) => object,
        _ => serde_json::Map::new(),
    };
    object.insert(
        "proxy".into(),
        serde_json::json!({ "enabled": setting.enabled, "url": setting.url }),
    );
    serde_json::Value::Object(object)
}

/// Saves the proxy to config.json and uses it from the next request on. An address that
/// isn't a usable proxy is refused ("invalidUrl"), even while turned off, so it never lands on disk.
#[tauri::command]
pub fn set_proxy_setting(enabled: bool, url: String) -> Result<(), String> {
    let url = url.trim().to_string();
    let proxy = if url.is_empty() {
        None
    } else {
        Some(to_proxy(&url).map_err(|_| "invalidUrl".to_string())?)
    };
    if enabled && proxy.is_none() {
        return Err("invalidUrl".into());
    }
    update_config(|current| with_proxy(current, &ProxySetting { enabled, url }))?;
    *RESOLVED_PROXY.lock().unwrap_or_else(|e| e.into_inner()) =
        Some(if enabled { proxy } else { None });
    log::info!(
        "[config] proxy {}",
        if enabled {
            "set from Settings"
        } else {
            "turned off from Settings"
        }
    );
    Ok(())
}

/// Rewrites config.json through `change`, which gets what's there (Null when there is no
/// file). A file it can't read or parse stops the save: rewriting it would drop the other settings.
fn update_config(
    change: impl FnOnce(serde_json::Value) -> serde_json::Value,
) -> Result<(), String> {
    update_config_at(&config_path().ok_or("no app data folder")?, change)
}

fn update_config_at(
    path: &std::path::Path,
    change: impl FnOnce(serde_json::Value) -> serde_json::Value,
) -> Result<(), String> {
    let current = match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| {
            log::warn!(
                "[config] {} is not valid JSON ({e}): not saved",
                shown(path)
            );
            // Settings names the file to fix: the old one while it couldn't be moved.
            format!("configBroken:{}", shown(path))
        })?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => serde_json::Value::Null,
        Err(e) => return Err(format!("can't read {}: {e}", shown(path))),
    };
    let text = serde_json::to_string_pretty(&change(current)).map_err(|e| e.to_string())?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // Write aside, then swap: a crash mid-write never leaves half a config.
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, path).map_err(|e| e.to_string())
}

/// A balance endpoint (Settings → Providers → Custom balances) the `custom-balance` plugin reads. The
/// key itself is never stored: `token_env` names the environment variable holding it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceEndpoint {
    pub name: String,
    /// newapi (account) | newapi-token | sub2api | custom
    pub preset: String,
    pub base_url: String,
    pub token_env: String,
    #[serde(default)]
    pub user_id: String,
    /// custom: the GET path and the dot paths of the numbers in its answer.
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub remaining: String,
    #[serde(default)]
    pub used: String,
    #[serde(default)]
    pub total: String,
    #[serde(default = "one")]
    pub divisor: f64,
    #[serde(default = "usd")]
    pub currency: String,
    /// custom: "bearer" (Authorization: Bearer) or "x-api-key".
    #[serde(default)]
    pub auth: String,
}

fn one() -> f64 {
    1.0
}

fn usd() -> String {
    "USD".into()
}

const MAX_BALANCES: usize = 5;

fn is_dot_path(path: &str) -> bool {
    let parts: Vec<&str> = path.split('.').collect();
    path.len() <= 160
        && parts.len() <= 12
        && parts.iter().all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
                && !matches!(*part, "__proto__" | "prototype" | "constructor")
        })
}

/// A variable the custom-balance plugin may read: `OTU_` and then A–Z, 0–9, _. Plugins read only a fixed
/// list of variables; the prefix keeps this one to keys set up for it, so a balance pointed at another
/// host can never be handed a key like ANTHROPIC_API_KEY.
fn is_balance_env(name: &str) -> bool {
    name.len() <= 64
        && name.strip_prefix("OTU_").is_some_and(|rest| {
            !rest.is_empty()
                && rest
                    .bytes()
                    .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
        })
}

/// The variables the custom-balance plugin may read (`host_api::inject_env`): its balances' names.
pub(crate) fn balance_env_names() -> Vec<String> {
    get_custom_balances()
        .into_iter()
        .map(|balance| balance.token_env)
        .filter(|name| is_balance_env(name))
        .collect()
}

/// What may be saved: as token-monitor (MIT) checks its third-party balance accounts.
fn validate_balance(balance: &BalanceEndpoint) -> Result<(), String> {
    let name = balance.name.trim();
    if name.is_empty() || name.chars().count() > 40 || name.chars().any(char::is_control) {
        return Err("invalidName".into());
    }
    if !matches!(
        balance.preset.as_str(),
        "newapi" | "newapi-token" | "sub2api" | "custom"
    ) {
        return Err("invalidPreset".into());
    }
    let url = reqwest::Url::parse(&balance.base_url).map_err(|_| "invalidUrl".to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none_or(str::is_empty)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || balance.base_url.len() > 512
    {
        return Err("invalidUrl".into());
    }
    if !is_balance_env(&balance.token_env) {
        return Err("invalidEnv".into());
    }
    if balance.user_id.len() > 20 || !balance.user_id.bytes().all(|b| b.is_ascii_digit()) {
        return Err("invalidUserId".into());
    }
    if balance.preset == "custom" {
        let path_ok = balance.path.starts_with('/')
            && balance.path.len() <= 256
            && !balance.path.contains("..")
            && !balance.path.contains(['?', '#'])
            && !balance.path.chars().any(char::is_whitespace);
        let optional = |path: &str| path.is_empty() || is_dot_path(path);
        if !path_ok
            || !is_dot_path(&balance.remaining)
            || !optional(&balance.used)
            || !optional(&balance.total)
            || !(balance.divisor > 0.0 && balance.divisor <= 1e15)
            || !(3..=8).contains(&balance.currency.len())
            || !balance.currency.bytes().all(|b| b.is_ascii_uppercase())
            || !matches!(balance.auth.as_str(), "bearer" | "x-api-key")
        {
            return Err("invalidCustom".into());
        }
    }
    Ok(())
}

#[derive(Deserialize)]
struct BalancesFile {
    #[serde(default)]
    balances: Vec<BalanceEndpoint>,
}

#[tauri::command]
pub fn get_custom_balances() -> Vec<BalanceEndpoint> {
    config_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<BalancesFile>(&text).ok())
        .map(|file| file.balances)
        .unwrap_or_default()
}

/// Saves the custom balances (at most 5, each checked) to config.json's `balances`,
/// anything else in the file kept. An invalid one is refused with what's wrong with it.
#[tauri::command]
pub fn set_custom_balances(balances: Vec<BalanceEndpoint>) -> Result<(), String> {
    if balances.len() > MAX_BALANCES {
        return Err("tooMany".into());
    }
    for balance in &balances {
        validate_balance(balance)?;
    }
    let value = serde_json::to_value(&balances).map_err(|e| e.to_string())?;
    update_config(|current| {
        let mut object = match current {
            serde_json::Value::Object(object) => object,
            _ => serde_json::Map::new(),
        };
        object.insert("balances".into(), value);
        serde_json::Value::Object(object)
    })
}

/// Redacts user info from a proxy URL for safe logging.
pub fn redact_proxy_url(url: &str) -> String {
    // Simple redaction: look for ://user:pass@ pattern
    if let Some(at_pos) = url.find('@') {
        if let Some(scheme_end) = url.find("://") {
            let userinfo_start = scheme_end + 3;
            format!("{}***@{}", &url[..userinfo_start], &url[at_pos + 1..])
        } else {
            format!("***@{}", &url[at_pos + 1..])
        }
    } else {
        url.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_balance_endpoint_is_saved_only_when_every_part_is_safe() {
        let good = BalanceEndpoint {
            name: "My relay".into(),
            preset: "newapi".into(),
            base_url: "https://relay.example.com".into(),
            token_env: "OTU_RELAY_TOKEN".into(),
            user_id: "42".into(),
            path: String::new(),
            remaining: String::new(),
            used: String::new(),
            total: String::new(),
            divisor: 1.0,
            currency: "USD".into(),
            auth: String::new(),
        };
        assert_eq!(validate_balance(&good), Ok(()));
        let with = |change: &dyn Fn(&mut BalanceEndpoint)| {
            let mut balance = good.clone();
            change(&mut balance);
            validate_balance(&balance)
        };
        assert!(with(&|b| b.base_url = "https://user:pw@relay.example.com".into()).is_err());
        assert!(with(&|b| b.base_url = "file:///C:/x".into()).is_err());
        assert!(with(&|b| b.base_url = "https://relay.example.com/?k=1".into()).is_err());
        assert!(with(&|b| b.token_env = "sk-123".into()).is_err()); // a key, not a variable name
        assert!(with(&|b| b.token_env = "ANTHROPIC_API_KEY".into()).is_err()); // not one set up for this
        assert!(with(&|b| b.token_env = "OTU_".into()).is_err());
        assert!(with(&|b| b.user_id = "4x".into()).is_err());
        assert!(with(&|b| b.preset = "other".into()).is_err());
        let custom = |b: &mut BalanceEndpoint| {
            b.preset = "custom".into();
            b.path = "/user/balance".into();
            b.remaining = "data.balance".into();
            b.auth = "bearer".into();
        };
        assert_eq!(with(&custom), Ok(()));
        assert!(with(&|b| {
            custom(b);
            b.path = "/../admin".into();
        })
        .is_err());
        assert!(with(&|b| {
            custom(b);
            b.remaining = "data.__proto__".into();
        })
        .is_err());
        assert!(with(&|b| {
            custom(b);
            b.divisor = 0.0;
        })
        .is_err());
    }

    #[test]
    fn the_shown_path_names_the_apps_own_folder() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let identifier = conf["identifier"].as_str().unwrap();
        assert_eq!(
            SHOWN_PATH,
            format!(r"%APPDATA%\{identifier}\{}", crate::data_dirs::CONFIG_FILE)
        );
        // The old file is named as what it is while it's the one in use.
        let legacy = crate::data_dirs::legacy_config().unwrap();
        assert_eq!(shown(&legacy), LEGACY_SHOWN_PATH);
        assert!(legacy.ends_with(LEGACY_SHOWN_PATH.trim_start_matches("~/")));
        assert_eq!(shown(std::path::Path::new("elsewhere.json")), SHOWN_PATH);
    }

    #[test]
    fn a_config_the_start_couldnt_move_is_used_where_it_is() {
        let dir = std::env::temp_dir().join(format!("otu-config-in-use-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let (new, old) = (dir.join("new.json"), dir.join("old.json"));
        // Neither there: the app folder's, where Settings then saves.
        assert_eq!(in_use(new.clone(), Some(old.clone())), new);
        std::fs::write(&old, "{}").unwrap();
        assert_eq!(in_use(new.clone(), Some(old.clone())), old);
        // Once the app folder has one, the old file is never read again.
        std::fs::write(&new, "{}").unwrap();
        assert_eq!(in_use(new.clone(), Some(old.clone())), new);
        assert_eq!(in_use(new.clone(), None), new);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn redact_proxy_url_with_credentials() {
        let url = "http://user:pass@127.0.0.1:10808";
        let redacted = redact_proxy_url(url);
        assert_eq!(redacted, "http://***@127.0.0.1:10808");
        assert!(!redacted.contains("user"));
        assert!(!redacted.contains("pass"));
    }

    #[test]
    fn redact_proxy_url_without_credentials() {
        let url = "http://127.0.0.1:10808";
        let redacted = redact_proxy_url(url);
        assert_eq!(redacted, "http://127.0.0.1:10808");
    }

    #[test]
    fn settings_take_only_usable_proxy_addresses() {
        for ok in [
            "http://127.0.0.1:10808",
            "https://proxy.example.com:8443",
            "socks5://user:pass@10.0.0.2:1080",
            "socks5h://proxy.local:1080",
        ] {
            assert!(to_proxy(ok).is_ok(), "{ok}");
        }
        for bad in [
            "proxy.example.com:8080",
            "ftp://proxy.example.com",
            "file:///C:/x",
            "http://",
            "",
        ] {
            assert!(to_proxy(bad).is_err(), "{bad}");
        }
        assert!(to_proxy(&format!("http://{}", "a".repeat(MAX_PROXY_URL))).is_err());
    }

    #[test]
    fn saving_the_proxy_keeps_the_rest_of_the_config() {
        let setting = ProxySetting {
            enabled: true,
            url: "http://127.0.0.1:8080".into(),
        };
        let saved = with_proxy(
            serde_json::json!({ "other": 1, "proxy": { "enabled": false, "url": "x" } }),
            &setting,
        );
        assert_eq!(
            saved,
            serde_json::json!({ "other": 1, "proxy": { "enabled": true, "url": "http://127.0.0.1:8080" } })
        );
        // A missing or broken file becomes a config with just the proxy.
        assert_eq!(
            with_proxy(serde_json::Value::Null, &setting)["proxy"]["enabled"],
            true
        );
    }

    #[test]
    fn a_config_that_isnt_json_is_never_overwritten() {
        let dir = std::env::temp_dir().join(format!("otu-config-{}", std::process::id()));
        let path = dir.join("config.json");
        let _ = std::fs::remove_dir_all(&dir);
        let add = |value: serde_json::Value| {
            let mut object = value.as_object().cloned().unwrap_or_default();
            object.insert("added".into(), true.into());
            serde_json::Value::Object(object)
        };
        // No file yet: written.
        update_config_at(&path, add).unwrap();
        assert!(std::fs::read_to_string(&path).unwrap().contains("added"));
        // A typo in it: the save stops and the file stays as it is.
        std::fs::write(&path, "{ \"balances\": [ oops").unwrap();
        // Settings tells the user the file is the problem, not their entries.
        assert_eq!(
            update_config_at(&path, add),
            Err(format!("configBroken:{SHOWN_PATH}"))
        );
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "{ \"balances\": [ oops"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
