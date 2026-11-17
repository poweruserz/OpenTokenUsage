//! Settings → App → Usage export: every Claude/Codex card's tokens per local day over the year (as the
//! year grid reads them) and every card's last limits (the local API's cache), written to Downloads as
//! `OpenTokenUsage-usage.csv` (date, card, tokens) and `OpenTokenUsage-usage.json`, for spreadsheets
//! and scripts. Written over the last export; only numbers, names and dates, never log contents.

use crate::usage_archive::{year_usage, ARCHIVE_FILE, DAY_SECS};
use crate::usage_heatmap::Log;
use crate::AppState;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

const CSV_FILE: &str = "OpenTokenUsage-usage.csv";
const JSON_FILE: &str = "OpenTokenUsage-usage.json";

/// One card: id, name and, for Claude/Codex, which logs to read.
struct Card {
    id: String,
    name: String,
    logs: Option<(Log, Vec<PathBuf>)>,
}

fn date_of(day: i64) -> String {
    time::OffsetDateTime::from_unix_timestamp(day * DAY_SECS)
        .map(|at| at.date().to_string())
        .unwrap_or_default()
}

/// A CSV text field: quoted, quotes doubled, and a formula-like start defused for spreadsheets.
fn csv_text(text: &str) -> String {
    let safe = if text.starts_with(['=', '+', '-', '@']) {
        format!("'{text}")
    } else {
        text.to_owned()
    };
    format!("\"{}\"", safe.replace('"', "\"\""))
}

/// The two files' text: CSV rows by date then card, and the JSON with each card's days and limits.
fn render(cards: &[(Card, Vec<(i64, u64)>, Option<Value>)], exported_at: &str) -> (String, String) {
    let mut rows: Vec<(i64, &str, u64)> = cards
        .iter()
        .flat_map(|(card, days, _)| {
            days.iter()
                .map(move |&(day, tokens)| (day, card.name.as_str(), tokens))
        })
        .collect();
    rows.sort();
    let mut csv = String::from("date,card,tokens\r\n");
    for (day, name, tokens) in rows {
        csv.push_str(&format!(
            "{},{},{}\r\n",
            date_of(day),
            csv_text(name),
            tokens
        ));
    }
    let json = json!({
        "app": "OpenTokenUsage",
        "exportedAt": exported_at,
        "cards": cards.iter().map(|(card, days, limits)| json!({
            "id": card.id,
            "name": card.name,
            "days": days.iter().map(|&(day, tokens)| json!({ "date": date_of(day), "tokens": tokens })).collect::<Vec<_>>(),
            "limits": limits,
        })).collect::<Vec<_>>(),
    });
    (csv, serde_json::to_string_pretty(&json).unwrap_or_default())
}

fn write_atomic(path: &Path, text: &str) -> std::io::Result<()> {
    // The daily export and "Export now" can run at once: one write at a time, each file its own temp.
    static WRITING: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    let mut partial = path.as_os_str().to_owned();
    partial.push(".tmp");
    let partial = std::path::PathBuf::from(partial);
    std::fs::write(&partial, text)
        .and_then(|()| std::fs::rename(&partial, path))
        .inspect_err(|_| {
            let _ = std::fs::remove_file(&partial);
        })
}

/// Writes the export to Downloads (`reveal`: and shows it in Explorer); returns the CSV's path.
/// `keep`: count the archive's days too, as the year grid does with "Keep deleted usage" on.
#[tauri::command]
pub async fn export_usage(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    utc_offset_minutes: i64,
    keep: bool,
    reveal: bool,
) -> Result<String, String> {
    use tauri_plugin_opener::OpenerExt;
    if utc_offset_minutes.abs() > 14 * 60 {
        return Err("invalid UTC offset".into());
    }
    let (cards, archive) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let cards: Vec<Card> = state
            .plugins
            .iter()
            .map(|plugin| Card {
                id: plugin.manifest.id.clone(),
                name: plugin.manifest.name.clone(),
                logs: match crate::login_stamp::cli_dirs(plugin) {
                    Some(("claude", dirs, _)) => Some((
                        Log::Claude,
                        dirs.iter().map(|d| d.join("projects")).collect(),
                    )),
                    Some(("codex", dirs, _)) => Some((
                        Log::Codex,
                        dirs.iter().map(|d| d.join("sessions")).collect(),
                    )),
                    _ => None,
                },
            })
            .collect();
        (cards, state.app_data_dir.join(ARCHIVE_FILE))
    };
    let dir = dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "no Downloads folder".to_string())?;
    let csv_path = tauri::async_runtime::spawn_blocking(move || -> Result<PathBuf, String> {
        let now = SystemTime::now();
        let read: Vec<(Card, Vec<(i64, u64)>, Option<Value>)> = cards
            .into_iter()
            .map(|card| {
                let days = card.logs.as_ref().map_or_else(Vec::new, |(log, dirs)| {
                    year_usage(
                        *log,
                        dirs,
                        &card.id,
                        keep.then_some(archive.as_path()),
                        now,
                        utc_offset_minutes * 60,
                    )
                    .days
                });
                let limits = crate::local_http_api::cached_snapshot(&card.id)
                    .and_then(|snapshot| serde_json::to_value(snapshot).ok());
                (card, days, limits)
            })
            // A card with neither days nor limits (off, never read) adds nothing.
            .filter(|(_, days, limits)| !days.is_empty() || limits.is_some())
            .collect();
        let exported_at = time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();
        let (csv, json) = render(&read, &exported_at);
        let csv_path = dir.join(CSV_FILE);
        write_atomic(&csv_path, &format!("\u{FEFF}{csv}")).map_err(|e| e.to_string())?;
        write_atomic(&dir.join(JSON_FILE), &json).map_err(|e| e.to_string())?;
        Ok(csv_path)
    })
    .await
    .map_err(|e| e.to_string())??;
    if reveal {
        if let Err(e) = app.opener().reveal_item_in_dir(&csv_path) {
            log::warn!("usage export saved but not shown in Explorer: {e}");
        }
    }
    Ok(csv_path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rows_come_by_date_then_card_with_safe_names() {
        let card = |id: &str, name: &str| Card {
            id: id.into(),
            name: name.into(),
            logs: None,
        };
        let day = 20_407; // 2025-11-15
        let cards = vec![
            (card("codex", "Codex"), vec![(day, 70)], None),
            (
                card("claude", "=Claude \"main\""),
                vec![(day - 1, 5), (day, 9)],
                Some(json!({ "plan": "Max" })),
            ),
        ];
        let (csv, json) = render(&cards, "2025-11-15T12:00:00Z");
        assert_eq!(
            csv,
            "date,card,tokens\r\n2025-11-14,\"'=Claude \"\"main\"\"\",5\r\n2025-11-15,\"'=Claude \"\"main\"\"\",9\r\n2025-11-15,\"Codex\",70\r\n"
        );
        let parsed: Value = serde_json::from_str(&json).unwrap();
        assert_eq!(
            parsed["cards"][1]["days"][0],
            json!({ "date": "2025-11-14", "tokens": 5 })
        );
        assert_eq!(parsed["cards"][1]["limits"]["plan"], "Max");
        assert_eq!(parsed["cards"][0]["limits"], Value::Null);
    }
}
