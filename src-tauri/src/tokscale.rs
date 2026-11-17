//! Other tools' spend through tokscale (github.com/junhoyeo/tokscale, MIT), only when Settings turns it
//! on (Usage → On the cards): its `graph` report gives each day's tokens and dollars by tool and model,
//! priced from its own catalog. Only tools no card and no `local_spend` reader already count are asked
//! for. The package is pinned and run like ccusage; a run takes seconds, so its answer is kept 30 min.

use crate::local_spend::{now_ms, summarize, valid_bounds, Bounds, Source, Usage, DAY_MS};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const PACKAGE: &str = "tokscale@4.23.0";
const TIMEOUT: Duration = Duration::from_secs(120);
const KEEP: Duration = Duration::from_secs(30 * 60);

/// tokscale's client ids (all in 4.23.0's list: an unknown one fails the whole run) and their names.
/// Only tools with records on this PC: asked for Cursor, tokscale copies the Cursor app's saved login
/// and downloads that account's usage from Cursor's servers; asked for Amp, it runs Amp to download
/// its threads. Neither is left in.
const CLIENTS: &[(&str, &str)] = &[
    ("gemini", "Gemini CLI"),
    ("antigravity", "Antigravity"),
    ("copilot", "GitHub Copilot"),
    ("droid", "Droid"),
    ("kimi", "Kimi CLI"),
    ("qwen", "Qwen Code"),
    ("kilo", "Kilo"),
    ("kilocode", "Kilo Code"),
    ("roocode", "Roo Code"),
    ("kiro", "Kiro"),
    ("goose", "Goose"),
    ("zed", "Zed"),
    ("crush", "Crush"),
    ("codebuff", "Codebuff"),
    ("trae", "Trae"),
    ("junie", "Junie"),
    ("augment", "Augment"),
    ("openclaw", "OpenClaw"),
    ("pi", "Pi"),
    ("hermes", "Hermes"),
    ("muse", "Muse"),
    ("devin-cli", "Devin"),
    ("codebuddy", "CodeBuddy"),
    ("commandcode", "Command Code"),
    ("micode", "MiCode"),
    ("vibe", "Mistral Vibe"),
    ("qoder", "Qoder"),
];

/// The last run: when, from which day, and its report (None: it failed, also kept 30 min).
type Run = (Instant, String, Option<Value>);
static LAST: Mutex<Option<Run>> = Mutex::new(None);

/// Local midnights as `local_spend` takes them, plus the local offset to name tokscale's days.
#[tauri::command]
pub async fn tokscale_spend(
    today_ms: i64,
    yesterday_ms: i64,
    since_ms: i64,
    utc_offset_minutes: i64,
) -> Result<Vec<Source>, String> {
    if !valid_bounds(today_ms, yesterday_ms, since_ms, now_ms()) || utc_offset_minutes.abs() > 840 {
        return Err("invalid period bounds".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let offset = utc_offset_minutes * 60_000;
        // Rounded: a daylight-saving change inside the 30 days moves a midnight by an hour.
        let day = |ms: i64| (ms + offset + DAY_MS / 2).div_euclid(DAY_MS);
        let report = graph(&date_of_day(day(since_ms))).ok_or("tokscale unavailable")?;
        let bounds = Bounds {
            today: day(today_ms) * DAY_MS,
            yesterday: day(yesterday_ms) * DAY_MS,
            since: day(since_ms) * DAY_MS,
        };
        Ok(sources(&report, bounds))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// tokscale's graph report from `since` (YYYY-MM-DD) on, at most one run per 30 min; a second caller
/// waits for the run in progress instead of starting its own.
fn graph(since: &str) -> Option<Value> {
    let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((at, kept_since, report)) = last.as_ref() {
        if kept_since == since && at.elapsed() < KEEP {
            return report.clone();
        }
    }
    let clients = CLIENTS
        .iter()
        .map(|(id, _)| *id)
        .collect::<Vec<_>>()
        .join(",");
    let args = [
        "graph",
        "--since",
        since,
        "--client",
        &clients,
        "--no-spinner",
    ]
    .map(String::from);
    let report =
        crate::plugin_engine::host_api::run_npm_package(PACKAGE, "tokscale", &args, TIMEOUT)
            .and_then(|out| serde_json::from_str::<Value>(&out).ok())
            .filter(|report| report["contributions"].is_array());
    *last = Some((Instant::now(), since.to_string(), report.clone()));
    report
}

/// Each tool's three periods from the report's days (`contributions[].clients[]`), days as day-number ms.
fn sources(report: &Value, bounds: Bounds) -> Vec<Source> {
    let mut by_client: HashMap<&str, Vec<Usage>> = HashMap::new();
    for (i, day) in report["contributions"]
        .as_array()
        .into_iter()
        .flatten()
        .enumerate()
    {
        let Some(at_ms) = day["date"]
            .as_str()
            .and_then(day_of_date)
            .map(|d| d * DAY_MS)
        else {
            continue;
        };
        for (j, row) in day["clients"].as_array().into_iter().flatten().enumerate() {
            let Some(client) = row["client"].as_str() else {
                continue;
            };
            let tokens = ["input", "output", "cacheRead", "cacheWrite", "reasoning"]
                .iter()
                .filter_map(|kind| row["tokens"][kind].as_f64())
                .sum();
            by_client.entry(client).or_default().push(Usage {
                key: format!("{i}/{j}"),
                at_ms,
                model: row["modelId"].as_str().unwrap_or("?").to_string(),
                tokens,
                usd: row["cost"]
                    .as_f64()
                    .filter(|usd| usd.is_finite() && *usd >= 0.0),
            });
        }
    }
    CLIENTS
        .iter()
        .filter_map(|(id, name)| {
            summarize(
                id,
                name,
                true,
                by_client.remove(*id).unwrap_or_default(),
                bounds,
            )
        })
        .collect()
}

/// Days since 1970-01-01 of a YYYY-MM-DD date (Howard Hinnant's days_from_civil).
fn day_of_date(date: &str) -> Option<i64> {
    if date.len() != 10 || date.get(4..5)? != "-" || date.get(7..8)? != "-" {
        return None;
    }
    let number = |range: std::ops::Range<usize>| date.get(range)?.parse::<i64>().ok();
    let (y, m, d) = (number(0..4)?, number(5..7)?, number(8..10)?);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * ((m + 9) % 12) + 2) / 5 + d - 1;
    Some(era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468)
}

/// The YYYY-MM-DD date of a day since 1970-01-01 (civil_from_days).
fn date_of_day(day: i64) -> String {
    let z = day + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_and_day_numbers_round_trip() {
        assert_eq!(day_of_date("1970-01-01"), Some(0));
        assert_eq!(
            day_of_date("2024-03-01").map(|d| d - 1),
            day_of_date("2024-02-29")
        );
        for day in [-1, 0, 19_782, 20_408, 20_773] {
            assert_eq!(day_of_date(&date_of_day(day)), Some(day));
        }
        for bad in [
            "2026-13-01",
            "2026/11/16",
            "26-11-16",
            "2026-11-1x",
            "2026-11-16T",
        ] {
            assert_eq!(day_of_date(bad), None, "{bad}");
        }
    }

    #[test]
    fn tools_tokscale_signs_in_to_are_never_asked_for() {
        for id in ["cursor", "amp"] {
            assert!(CLIENTS.iter().all(|(client, _)| *client != id), "{id}");
        }
    }

    #[test]
    fn each_tool_gets_its_days_dollars_and_models() {
        let today = day_of_date("2026-11-16").unwrap();
        let report = serde_json::json!({ "contributions": [
            { "date": "2026-10-01", "clients": [{ "client": "copilot", "modelId": "old", "tokens": { "input": 9 }, "cost": 9 }] },
            { "date": "2026-11-15", "clients": [
                { "client": "copilot", "modelId": "auto", "tokens": { "input": 100, "output": 20, "cacheRead": 5 }, "cost": 1.5 },
                { "client": "claude", "modelId": "opus", "tokens": { "input": 1000 }, "cost": 30 },
                { "client": "cursor", "modelId": "grok-bot-automation", "tokens": { "input": 500 }, "cost": 5 }
            ]},
            { "date": "2026-11-16", "clients": [
                { "client": "copilot", "modelId": "auto", "tokens": { "output": 10 }, "cost": 0.25 },
                { "client": "gemini", "modelId": "pro", "tokens": { "input": 40, "reasoning": 2 } }
            ]}
        ]});
        let bounds = Bounds {
            today: today * DAY_MS,
            yesterday: (today - 1) * DAY_MS,
            since: (today - 29) * DAY_MS,
        };
        let found = serde_json::to_value(sources(&report, bounds)).unwrap();
        assert_eq!(
            found,
            serde_json::json!([
                { "id": "gemini", "name": "Gemini CLI", "periods": {
                    "today": { "usd": 0.0, "tokens": 42.0 },
                    "yesterday": { "usd": 0.0, "tokens": 0.0 },
                    "month": { "usd": 0.0, "tokens": 42.0 } },
                  "models": [{ "name": "pro", "tokens": 42.0 }] },
                { "id": "copilot", "name": "GitHub Copilot", "periods": {
                    "today": { "usd": 0.25, "tokens": 10.0 },
                    "yesterday": { "usd": 1.5, "tokens": 125.0 },
                    "month": { "usd": 1.75, "tokens": 135.0 } },
                  "models": [{ "name": "auto", "tokens": 135.0 }] }
            ])
        );
    }
}
