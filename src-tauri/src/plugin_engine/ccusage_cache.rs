//! Smart polls reuse successful local-history scans for 15 minutes. Manual/fixed polls stay fresh.
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const TTL: Duration = Duration::from_secs(15 * 60);

struct Entry {
    options: String,
    value: String,
    at: Instant,
}

#[derive(Default)]
struct Cache(HashMap<String, Entry>);

impl Cache {
    fn get(&self, account: &str, options: &str, now: Instant) -> Option<String> {
        self.0
            .get(account)
            .filter(|entry| entry.options == options && now.duration_since(entry.at) < TTL)
            .map(|entry| entry.value.clone())
    }

    fn put(&mut self, account: &str, options: &str, value: &str, now: Instant) {
        self.0.retain(|_, entry| now.duration_since(entry.at) < TTL);
        if serde_json::from_str::<serde_json::Value>(value)
            .ok()
            .is_some_and(|value| value["status"] == "ok")
        {
            self.0.insert(
                account.into(),
                Entry {
                    options: options.into(),
                    value: value.into(),
                    at: now,
                },
            );
        } else {
            self.0.remove(account);
        }
    }
}

pub(crate) fn query(account: &str, options: &str, reuse: bool, fetch: impl FnOnce() -> String) -> String {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(Cache::default()));
    if reuse {
        if let Some(value) = cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(account, options, Instant::now())
        {
            return value;
        }
    }
    // Never hold the lock while starting a subprocess; other accounts can scan independently.
    let value = fetch();
    cache
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .put(account, options, &value, Instant::now());
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expires_and_isolates_accounts_and_query_ranges() {
        let mut cache = Cache::default();
        let now = Instant::now();
        let ok = r#"{"status":"ok","data":{"daily":[]}}"#;
        cache.put("claude-work", "today", ok, now);
        assert_eq!(cache.get("claude-work", "today", now).as_deref(), Some(ok));
        assert!(cache.get("claude-personal", "today", now).is_none());
        assert!(cache.get("claude-work", "tomorrow", now).is_none());
        assert!(cache.get("claude-work", "today", now + TTL).is_none());
        cache.put("claude-work", "today", r#"{"status":"runner_failed"}"#, now);
        assert!(cache.get("claude-work", "today", now).is_none());
    }

    #[test]
    fn smart_reuses_but_manual_refresh_replaces_the_cache() {
        let old = r#"{"status":"ok","data":{"daily":[1]}}"#;
        let new = r#"{"status":"ok","data":{"daily":[2]}}"#;
        assert_eq!(query("cache-test", "opts", true, || old.into()), old);
        assert_eq!(query("cache-test", "opts", true, || panic!("must reuse")), old);
        assert_eq!(query("cache-test", "opts", false, || new.into()), new);
        assert_eq!(
            query("cache-test", "opts", true, || panic!("must reuse latest")),
            new
        );
    }
}
