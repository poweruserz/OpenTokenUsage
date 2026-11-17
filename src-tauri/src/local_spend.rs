//! Spend from other AI CLIs' own local records, for the overview's spend summary next to the
//! Claude/Codex cards: OpenCode (its Zen/Go providers), Z.ai's ZCode, Grok and Cline's CLI. Dollars
//! are only what the tool itself recorded (ZCode records none: it is a coding plan, so tokens only);
//! there is no price list. Paths and fields as TaskbarQuota (github.com/zioder/TaskbarQuota, MIT)
//! reads them. Only usage numbers, models and times are read, never messages.

use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};

/// Grok reports cost in ticks: 1 USD = 10^10 ticks.
const GROK_TICKS_PER_USD: f64 = 1e10;
const MAX_LOG_BYTES: u64 = 64 * 1024 * 1024;
const MAX_FILES: usize = 2_000;
const MAX_ENTRIES: usize = 50_000;

/// One response's usage.
pub(crate) struct Usage {
    pub(crate) key: String,
    pub(crate) at_ms: i64,
    pub(crate) model: String,
    pub(crate) tokens: f64,
    pub(crate) usd: Option<f64>,
}

#[derive(Serialize, Debug, PartialEq, Clone, Copy)]
pub struct Amount {
    usd: Option<f64>,
    tokens: f64,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Periods {
    today: Amount,
    yesterday: Amount,
    month: Amount,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Model {
    name: String,
    tokens: f64,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Source {
    id: &'static str,
    name: &'static str,
    periods: Periods,
    models: Vec<Model>,
}

/// Local midnights (ms) from the frontend, which knows the time zone: today's, yesterday's and the
/// first of the 30 days.
#[derive(Clone, Copy)]
pub(crate) struct Bounds {
    pub(crate) today: i64,
    pub(crate) yesterday: i64,
    pub(crate) since: i64,
}

type Reader = fn(&Path, &dyn Fn(&str) -> Option<String>, i64) -> Vec<Usage>;

/// Each tool: id (as Settings names it), name, whether it records dollars, and its reader.
const TOOLS: [(&str, &str, bool, Reader); 4] = [
    ("opencode-go", "OpenCode", true, opencode),
    ("zai", "Z.ai", false, zcode),
    ("grok", "Grok", true, grok),
    ("cline", "Cline", true, cline),
];

/// The spend of the `tools` Settings leaves on; the others' logs are never read.
#[tauri::command]
pub async fn local_spend(
    today_ms: i64,
    yesterday_ms: i64,
    since_ms: i64,
    tools: Vec<String>,
) -> Result<Vec<Source>, String> {
    if !valid_bounds(today_ms, yesterday_ms, since_ms, now_ms()) {
        return Err("invalid period bounds".into());
    }
    let bounds = Bounds {
        today: today_ms,
        yesterday: yesterday_ms,
        since: since_ms,
    };
    tauri::async_runtime::spawn_blocking(move || {
        let home = dirs::home_dir().unwrap_or_default();
        let env = |name: &str| crate::plugin_engine::host_api::resolve_env_value(name);
        TOOLS
            .iter()
            .filter(|(id, ..)| tools.iter().any(|wanted| wanted == id))
            .filter_map(|(id, name, priced, read)| {
                summarize(id, name, *priced, read(&home, &env, bounds.since), bounds)
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

pub(crate) const DAY_MS: i64 = 86_400_000;

/// In order, today's midnight within a day of now (any time zone), at most 32 days back in all: the
/// webview can't make the host read every log ever written.
pub(crate) fn valid_bounds(today: i64, yesterday: i64, since: i64, now: i64) -> bool {
    0 < since
        && since <= yesterday
        && yesterday <= today
        && (today - now).abs() <= 2 * DAY_MS
        && today - since <= 32 * DAY_MS
}

pub(crate) fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

/// A source's three periods and its models over the 30 days; None when it has nothing there.
pub(crate) fn summarize(
    id: &'static str,
    name: &'static str,
    priced: bool,
    events: Vec<Usage>,
    bounds: Bounds,
) -> Option<Source> {
    let empty = Amount {
        usd: priced.then_some(0.0),
        tokens: 0.0,
    };
    let mut periods = Periods {
        today: empty,
        yesterday: empty,
        month: empty,
    };
    let mut models: BTreeMap<String, f64> = BTreeMap::new();
    let mut seen = HashSet::new();
    let mut any = false;
    for event in events {
        if event.at_ms < bounds.since || event.tokens <= 0.0 || !seen.insert(event.key) {
            continue;
        }
        any = true;
        let add = |amount: &mut Amount| {
            amount.tokens += event.tokens;
            if let (Some(total), Some(usd)) = (amount.usd.as_mut(), event.usd) {
                *total += usd;
            }
        };
        add(&mut periods.month);
        if event.at_ms >= bounds.today {
            add(&mut periods.today);
        } else if event.at_ms >= bounds.yesterday {
            add(&mut periods.yesterday);
        }
        *models.entry(event.model).or_default() += event.tokens;
    }
    any.then(|| Source {
        id,
        name,
        periods,
        models: models
            .into_iter()
            .map(|(name, tokens)| Model { name, tokens })
            .collect(),
    })
}

fn configured(env: &dyn Fn(&str) -> Option<String>, name: &str) -> Option<PathBuf> {
    env(name)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn rows(path: &Path, sql: &str) -> Vec<Value> {
    let Some(path) = path.to_str() else {
        return Vec::new();
    };
    match crate::plugin_engine::sqlite::query_json(path, sql) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(e) => {
            log::warn!("local spend: database not readable: {}", e);
            Vec::new()
        }
    }
}

fn number(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str()?.trim().parse().ok())
        .filter(|n| n.is_finite())
}

fn text(value: &Value, fallback: &str) -> String {
    value
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

/// OpenCode keeps every message in `opencode.db`; only answers billed by OpenCode itself (Zen and Go)
/// count, with the cost it recorded.
fn opencode(home: &Path, env: &dyn Fn(&str) -> Option<String>, since: i64) -> Vec<Usage> {
    let candidates = [
        configured(env, "OPENCODE_DB_PATH"),
        configured(env, "LOCALAPPDATA").map(|dir| dir.join("opencode").join("opencode.db")),
        configured(env, "APPDATA").map(|dir| dir.join("opencode").join("opencode.db")),
        Some(home.join(".local/share/opencode/opencode.db")),
        configured(env, "XDG_DATA_HOME").map(|dir| dir.join("opencode").join("opencode.db")),
    ];
    let Some(db) = candidates.into_iter().flatten().find(|path| path.is_file()) else {
        return Vec::new();
    };
    let sql = format!(
        "SELECT id,
            json_extract(data,'$.modelID') AS model,
            COALESCE(json_extract(data,'$.time.completed'), json_extract(data,'$.time.created'), time_created) AS at,
            COALESCE(json_extract(data,'$.tokens.input'),0) + COALESCE(json_extract(data,'$.tokens.output'),0)
              + COALESCE(json_extract(data,'$.tokens.reasoning'),0) + COALESCE(json_extract(data,'$.tokens.cache.read'),0)
              + COALESCE(json_extract(data,'$.tokens.cache.write'),0) AS tokens,
            json_extract(data,'$.cost') AS usd
         FROM message
         WHERE time_created >= {since} AND json_extract(data,'$.role') = 'assistant'
           AND json_extract(data,'$.providerID') IN ('opencode','opencode-go')"
    );
    rows(&db, &sql)
        .iter()
        .filter_map(|row| {
            Some(Usage {
                key: text(&row["id"], ""),
                at_ms: number(&row["at"])? as i64,
                model: text(&row["model"], "opencode"),
                tokens: number(&row["tokens"])?,
                usd: number(&row["usd"]),
            })
        })
        .collect()
}

/// Z.ai's ZCode CLI: `model_usage`, whose input counts the cache reads and writes in it and whose
/// output leaves reasoning out. No cost: the coding plan is a subscription.
fn zcode(home: &Path, env: &dyn Fn(&str) -> Option<String>, since: i64) -> Vec<Usage> {
    let db =
        configured(env, "ZCODE_DB_PATH").unwrap_or_else(|| home.join(".zcode/cli/db/db.sqlite"));
    if !db.is_file() {
        return Vec::new();
    }
    let sql = format!(
        "SELECT id, model_id AS model, COALESCE(completed_at, started_at) AS at,
            MAX(COALESCE(input_tokens,0), COALESCE(cache_read_input_tokens,0) + COALESCE(cache_creation_input_tokens,0))
              + COALESCE(output_tokens,0) + COALESCE(reasoning_tokens,0) AS tokens
         FROM model_usage
         WHERE COALESCE(completed_at, started_at) >= {since} AND status <> 'running'"
    );
    rows(&db, &sql)
        .iter()
        .filter_map(|row| {
            Some(Usage {
                key: text(&row["id"], ""),
                at_ms: number(&row["at"])? as i64,
                model: text(&row["model"], "zai"),
                tokens: number(&row["tokens"])?,
                usd: None,
            })
        })
        .collect()
}

/// The newest `MAX_FILES` files under `dir` (4 levels down at most, `MAX_ENTRIES` looked at) named
/// by `wanted`, written since `since`.
fn recent_files(dir: &Path, since: i64, wanted: &dyn Fn(&str) -> bool) -> Vec<PathBuf> {
    let since = UNIX_EPOCH + Duration::from_millis(since.max(0) as u64);
    let mut found = Vec::new();
    let mut looked = 0;
    let mut stack = vec![(dir.to_path_buf(), 0)];
    'walk: while let Some((folder, depth)) = stack.pop() {
        for entry in std::fs::read_dir(&folder).into_iter().flatten().flatten() {
            looked += 1;
            if looked > MAX_ENTRIES {
                log::warn!("local spend: stopped after {MAX_ENTRIES} entries");
                break 'walk;
            }
            let path = entry.path();
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() && depth < 4 {
                stack.push((path, depth + 1));
            } else if kind.is_file()
                && path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(wanted)
            {
                // fs::metadata: a log the tool holds open keeps an old time in the listing.
                if let Ok(modified) = std::fs::metadata(&path).and_then(|meta| meta.modified()) {
                    if modified >= since {
                        found.push((modified, path));
                    }
                }
            }
        }
    }
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found.truncate(MAX_FILES);
    found.into_iter().map(|(_, path)| path).collect()
}

fn read_capped(path: &Path) -> Option<String> {
    let meta = std::fs::metadata(path).ok()?;
    (meta.len() <= MAX_LOG_BYTES)
        .then(|| std::fs::read_to_string(path).ok())
        .flatten()
}

/// Grok Build's session logs (`sessions/**/updates.jsonl`): a `turn_completed` update carries the
/// turn's usage and billed cost, split by model in `modelUsage` (a model without its own cost takes
/// a token share of what's left). shortcut: older Grok's `logs/*.jsonl` aren't read.
fn grok(home: &Path, env: &dyn Fn(&str) -> Option<String>, since: i64) -> Vec<Usage> {
    let dir = configured(env, "GROK_HOME").unwrap_or_else(|| home.join(".grok"));
    recent_files(&dir.join("sessions"), since, &|name| {
        name == "updates.jsonl"
    })
    .iter()
    .filter_map(|path| read_capped(path))
    .flat_map(|log| grok_turns(&log))
    .collect()
}

fn grok_turns(log: &str) -> Vec<Usage> {
    let tokens = |usage: &Value| {
        let field = |name: &str| number(&usage[name]).unwrap_or(0.0).max(0.0);
        // inputTokens counts the cache reads and writes in it.
        field("inputTokens").max(field("cachedReadTokens") + field("cacheCreationTokens"))
            + field("outputTokens")
    };
    let cost = |usage: &Value| {
        number(&usage["costUsdTicks"])
            .filter(|ticks| *ticks >= 0.0)
            .map(|ticks| ticks / GROK_TICKS_PER_USD)
    };
    let mut turns = Vec::new();
    for line in log
        .lines()
        .filter(|line| line.contains("\"turn_completed\""))
    {
        let Ok(root) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let params = &root["params"];
        let update = &params["update"];
        let usage = &update["usage"];
        if update["sessionUpdate"] != "turn_completed" || !usage.is_object() {
            continue;
        }
        let Some(at_ms) = number(&params["_meta"]["agentTimestampMs"]) else {
            continue;
        };
        let session = text(&params["sessionId"], "");
        let turn = text(&update["prompt_id"], &at_ms.to_string());
        let key = |model: &str| format!("{session}:{turn}:{model}");
        let models: Vec<(&String, f64, Option<f64>)> = usage["modelUsage"]
            .as_object()
            .into_iter()
            .flatten()
            .map(|(model, usage)| (model, tokens(usage), cost(usage)))
            .filter(|(model, tokens, _)| !model.is_empty() && *tokens > 0.0)
            .collect();
        if models.is_empty() {
            turns.push(Usage {
                key: key("grok"),
                at_ms: at_ms as i64,
                model: "grok".into(),
                tokens: tokens(usage),
                usd: cost(usage),
            });
            continue;
        }
        let left = cost(usage)
            .map(|total| (total - models.iter().filter_map(|m| m.2).sum::<f64>()).max(0.0));
        let unpriced: f64 = models.iter().filter(|m| m.2.is_none()).map(|m| m.1).sum();
        for (model, model_tokens, model_cost) in models {
            turns.push(Usage {
                key: key(model),
                at_ms: at_ms as i64,
                model: model.clone(),
                tokens: model_tokens,
                usd: model_cost.or_else(|| {
                    left.filter(|_| unpriced > 0.0)
                        .map(|left| left * model_tokens / unpriced)
                }),
            });
        }
    }
    turns
}

/// Cline's CLI: `sessions/**/<id>.json` names its provider and points at its messages, each with
/// `metrics` (tokens and the cost Cline recorded). Only Cline's own billing (`cline`, `cline-pass`):
/// a session on another provider's key or plan is that provider's spend.
fn cline(home: &Path, env: &dyn Fn(&str) -> Option<String>, since: i64) -> Vec<Usage> {
    let dir = configured(env, "CLINE_DATA_DIR").unwrap_or_else(|| home.join(".cline/data"));
    recent_files(&dir.join("sessions"), since, &|name| {
        name.ends_with(".json")
            && !name.ends_with(".messages.json")
            && !name.ends_with(".compaction.json")
    })
    .iter()
    .flat_map(|path| cline_session(path))
    .collect()
}

fn cline_session(path: &Path) -> Vec<Usage> {
    let Some(meta) = read_capped(path).and_then(|text| serde_json::from_str::<Value>(&text).ok())
    else {
        return Vec::new();
    };
    if !matches!(meta["provider"].as_str(), Some("cline" | "cline-pass")) {
        return Vec::new();
    }
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let session = meta["session_id"]
        .as_str()
        .or(meta["sessionId"].as_str())
        .unwrap_or(stem)
        .to_string();
    let model = text(&meta["model"], "cline");
    let messages = if meta["messages"].is_array() {
        meta["messages"].clone()
    } else {
        let folder = path.parent().unwrap_or(Path::new(""));
        let named = meta["messages_path"]
            .as_str()
            .or(meta["messagesPath"].as_str());
        let file = match named {
            // Only beside the session: a path from the file is never followed elsewhere.
            Some(name) => folder.join(Path::new(name).file_name().unwrap_or_default()),
            None => folder.join(format!("{stem}.messages.json")),
        };
        let Some(root) =
            read_capped(&file).and_then(|text| serde_json::from_str::<Value>(&text).ok())
        else {
            return Vec::new();
        };
        if root.is_array() {
            root
        } else {
            root["messages"].clone()
        }
    };
    messages
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|message| {
            let metrics = message.get("metrics").filter(|m| m.is_object())?;
            let field = |name: &str| number(&metrics[name]).unwrap_or(0.0).max(0.0);
            Some(Usage {
                key: format!(
                    "{session}:{}",
                    text(&message["id"], &number(&message["ts"])?.to_string())
                ),
                at_ms: number(&message["ts"])? as i64,
                model: text(&message["modelInfo"]["id"], &model),
                tokens: field("inputTokens")
                    + field("outputTokens")
                    + field("cacheReadTokens")
                    + field("cacheWriteTokens"),
                usd: number(&metrics["cost"]),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: i64 = 86_400_000;
    const BOUNDS: Bounds = Bounds {
        today: 30 * DAY,
        yesterday: 29 * DAY,
        since: DAY,
    };

    fn usage(key: &str, at_ms: i64, model: &str, tokens: f64, usd: Option<f64>) -> Usage {
        Usage {
            key: key.into(),
            at_ms,
            model: model.into(),
            tokens,
            usd,
        }
    }

    #[test]
    fn period_bounds_must_be_this_month_in_order() {
        let now = 100 * DAY;
        let today = now - 5 * 3_600_000;
        assert!(valid_bounds(today, today - DAY, today - 29 * DAY, now));
        assert!(!valid_bounds(today, today - DAY, 1, now)); // every log ever written
        assert!(!valid_bounds(today, today + DAY, today - 29 * DAY, now)); // out of order
        assert!(!valid_bounds(
            now - 10 * DAY,
            now - 11 * DAY,
            now - 20 * DAY,
            now
        )); // not today
    }

    #[test]
    fn periods_add_up_each_response_once() {
        let events = vec![
            usage("a", 30 * DAY + 5, "m1", 100.0, Some(1.0)),
            usage("a", 30 * DAY + 5, "m1", 100.0, Some(1.0)), // the same response again
            usage("b", 29 * DAY + 5, "m2", 50.0, None),
            usage("c", 2 * DAY, "m1", 10.0, Some(0.5)),
            usage("d", 0, "m1", 999.0, Some(9.0)), // before the 30 days
        ];
        let source = summarize("opencode-go", "OpenCode", true, events, BOUNDS).unwrap();
        assert_eq!(
            source.periods.today,
            Amount {
                usd: Some(1.0),
                tokens: 100.0
            }
        );
        // Yesterday's response recorded no cost: zero dollars, its tokens still count.
        assert_eq!(
            source.periods.yesterday,
            Amount {
                usd: Some(0.0),
                tokens: 50.0
            }
        );
        assert_eq!(
            source.periods.month,
            Amount {
                usd: Some(1.5),
                tokens: 160.0
            }
        );
        assert_eq!(
            source.models,
            vec![
                Model {
                    name: "m1".into(),
                    tokens: 110.0
                },
                Model {
                    name: "m2".into(),
                    tokens: 50.0
                }
            ]
        );
        // A tool that records no cost has no dollars at all; nothing in the 30 days: no source.
        let zai = summarize(
            "zai",
            "Z.ai",
            false,
            vec![usage("z", 30 * DAY, "glm", 7.0, None)],
            BOUNDS,
        )
        .unwrap();
        assert_eq!(zai.periods.month.usd, None);
        assert!(summarize(
            "grok",
            "Grok",
            true,
            vec![usage("x", 0, "g", 1.0, None)],
            BOUNDS
        )
        .is_none());
    }

    #[test]
    fn grok_turns_split_by_model_and_share_the_rest_of_the_cost() {
        let log = [
            r#"{"params":{"sessionId":"s","_meta":{"agentTimestampMs":1000},"update":{"sessionUpdate":"turn_completed","prompt_id":"p1","usage":{"inputTokens":100,"outputTokens":10,"costUsdTicks":30000000000,"modelUsage":{"grok-4":{"inputTokens":60,"cachedReadTokens":20,"outputTokens":5,"costUsdTicks":10000000000},"grok-mini":{"inputTokens":40,"outputTokens":5}}}}}}"#,
            r#"{"params":{"sessionId":"s","_meta":{"agentTimestampMs":2000},"update":{"sessionUpdate":"agent_message_chunk"}}}"#,
            r#"{"params":{"sessionId":"s","_meta":{"agentTimestampMs":3000},"update":{"sessionUpdate":"turn_completed","usage":{"inputTokens":5,"cachedReadTokens":3,"cacheCreationTokens":4,"outputTokens":1}}}}"#,
        ]
        .join("\n");
        let turns = grok_turns(&log);
        let shown: Vec<(&str, &str, f64, Option<f64>)> = turns
            .iter()
            .map(|t| (t.key.as_str(), t.model.as_str(), t.tokens, t.usd))
            .collect();
        assert_eq!(
            shown,
            [
                ("s:p1:grok-4", "grok-4", 65.0, Some(1.0)),
                ("s:p1:grok-mini", "grok-mini", 45.0, Some(2.0)),
                // No modelUsage; the cache it counts (7) is more than its input (5).
                ("s:3000:grok", "grok", 8.0, None),
            ]
        );
    }

    #[test]
    fn cline_counts_only_its_own_billing() {
        let dir = std::env::temp_dir().join(format!("otu-cline-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("s1.json"),
            r#"{"provider":"cline","session_id":"s1","model":"claude-x"}"#,
        )
        .unwrap();
        std::fs::write(
            dir.join("s1.messages.json"),
            r#"{"messages":[{"id":"m1","ts":5000,"metrics":{"inputTokens":10,"outputTokens":2,"cacheReadTokens":3,"cost":0.25}},{"id":"m2","ts":6000,"content":"no metrics"}]}"#,
        )
        .unwrap();
        std::fs::write(
            dir.join("s2.json"),
            r#"{"provider":"openai-codex","messages":[{"id":"m","ts":5000,"metrics":{"inputTokens":10}}]}"#,
        )
        .unwrap();
        let one: Vec<(String, String, f64, Option<f64>)> = cline_session(&dir.join("s1.json"))
            .into_iter()
            .map(|u| (u.key, u.model, u.tokens, u.usd))
            .collect();
        assert_eq!(
            one,
            [(
                "s1:m1".to_string(),
                "claude-x".to_string(),
                15.0,
                Some(0.25)
            )]
        );
        assert!(cline_session(&dir.join("s2.json")).is_empty());
    }

    #[test]
    fn opencode_and_zcode_rows_come_from_their_databases() {
        let dir = std::env::temp_dir().join(format!("otu-spend-db-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join(".local/share/opencode")).unwrap();
        std::fs::create_dir_all(dir.join(".zcode/cli/db")).unwrap();
        let oc = rusqlite::Connection::open(dir.join(".local/share/opencode/opencode.db")).unwrap();
        oc.execute_batch(
            r#"CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
            INSERT INTO message VALUES ('m1','s',5000,0,'{"role":"assistant","providerID":"opencode-go","modelID":"deepseek","time":{"created":5000,"completed":5100},"tokens":{"input":10,"output":4,"reasoning":1,"cache":{"read":20,"write":0}},"cost":0.02}');
            INSERT INTO message VALUES ('m2','s',5000,0,'{"role":"assistant","providerID":"openai","modelID":"gpt","tokens":{"input":10},"cost":1}');
            INSERT INTO message VALUES ('m3','s',5000,0,'{"role":"user","providerID":"opencode-go"}');
            INSERT INTO message VALUES ('m4','s',10,0,'{"role":"assistant","providerID":"opencode","tokens":{"input":10}}');"#,
        )
        .unwrap();
        drop(oc);
        let zc = rusqlite::Connection::open(dir.join(".zcode/cli/db/db.sqlite")).unwrap();
        zc.execute_batch(
            "CREATE TABLE model_usage (id TEXT, model_id TEXT, status TEXT, started_at INTEGER, completed_at INTEGER,
               input_tokens INTEGER, output_tokens INTEGER, reasoning_tokens INTEGER,
               cache_creation_input_tokens INTEGER, cache_read_input_tokens INTEGER);
             INSERT INTO model_usage VALUES ('u1','GLM-5.3','completed',4000,6000,100,10,5,0,80);
             INSERT INTO model_usage VALUES ('u2','GLM-5.3','running',7000,NULL,100,10,5,0,80);",
        )
        .unwrap();
        drop(zc);
        let env = |_: &str| None;
        let oc: Vec<(String, i64, f64, Option<f64>)> = opencode(&dir, &env, 1000)
            .into_iter()
            .map(|u| (u.model, u.at_ms, u.tokens, u.usd))
            .collect();
        assert_eq!(oc, [("deepseek".to_string(), 5100, 35.0, Some(0.02))]);
        let zc: Vec<(String, i64, f64)> = zcode(&dir, &env, 1000)
            .into_iter()
            .map(|u| (u.model, u.at_ms, u.tokens))
            .collect();
        assert_eq!(zc, [("GLM-5.3".to_string(), 6000, 115.0)]);
    }
}
