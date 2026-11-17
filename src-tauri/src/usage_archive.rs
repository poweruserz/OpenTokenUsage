//! A year of tokens per local day for a Claude or Codex card, from the CLIs' own logs as the hour grid
//! reads them (`usage_heatmap::scan_logs`). With "Keep deleted usage" on, every UTC day seen is also
//! kept in `usage-days-utc.json` in the app's data folder, so a day whose logs are gone (Claude Code
//! deletes transcripts after `cleanupPeriodDays`, 30 by default) keeps its tokens. Only day totals are
//! kept, by UTC day: a local day moves with DST and travel, and a kept maximum would then hold the
//! hours that moved on both days for good.

use crate::usage_heatmap::{scan_logs, Log, SPOT_SECS};
use crate::AppState;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// 53 weeks: the year grid's columns, whichever weekday today is.
const YEAR_DAYS: i64 = 371;
pub(crate) const ARCHIVE_FILE: &str = "usage-days-utc.json";
pub(crate) const DAY_SECS: i64 = 86_400;

/// Card id → UTC day (days since 1970-01-01) → tokens.
type Archive = BTreeMap<String, BTreeMap<i64, u64>>;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YearUsage {
    /// `[local day, tokens]` over the last 371 days, oldest first; days without use left out.
    pub(crate) days: Vec<(i64, u64)>,
    /// Logs that couldn't be read.
    pub(crate) unreadable: usize,
}

/// Tokens per local day and per UTC day from the logs written since `since`. shortcut: local days use
/// today's UTC offset, so around a DST change an hour shows on the neighbouring day (never kept so).
fn days_from_logs(
    log: Log,
    dirs: &[PathBuf],
    since: SystemTime,
    offset_secs: i64,
) -> (BTreeMap<i64, u64>, BTreeMap<i64, u64>, usize) {
    let (mut local, mut utc) = (BTreeMap::new(), BTreeMap::new());
    let unreadable = scan_logs(log, dirs, since, |scan| {
        for (spot, parts) in &scan.spots {
            let at = spot.slot * SPOT_SECS;
            *local
                .entry((at + offset_secs).div_euclid(DAY_SECS))
                .or_default() += parts.total();
            *utc.entry(at.div_euclid(DAY_SECS)).or_default() += parts.total();
        }
    });
    (local, utc, unreadable)
}

/// Each day keeps the most it was ever seen with: logs only grow, so less means some were deleted.
fn merge(kept: &mut BTreeMap<i64, u64>, scanned: &BTreeMap<i64, u64>) {
    for (&day, &tokens) in scanned {
        let entry = kept.entry(day).or_default();
        *entry = (*entry).max(tokens);
    }
}

/// What the logs no longer hold of each kept UTC day (all of it, or the sessions deleted from it)
/// goes on the local day of the same date: off by the UTC offset's hours, never counted twice (the
/// scanned rest is already on its own hours' days).
fn fill_deleted(
    days: &mut BTreeMap<i64, u64>,
    kept: &BTreeMap<i64, u64>,
    scanned: &BTreeMap<i64, u64>,
) {
    for (&day, &tokens) in kept {
        let missing = tokens.saturating_sub(scanned.get(&day).copied().unwrap_or(0));
        if missing > 0 {
            *days.entry(day).or_default() += missing;
        }
    }
}

fn read_archive(path: &Path) -> Archive {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| {
            serde_json::from_slice::<HashMap<String, BTreeMap<String, u64>>>(&bytes).ok()
        })
        .map(|cards| {
            cards
                .into_iter()
                .map(|(card, days)| {
                    let days = days
                        .into_iter()
                        .filter_map(|(day, tokens)| Some((day.parse().ok()?, tokens)))
                        .collect();
                    (card, days)
                })
                .collect()
        })
        .unwrap_or_default()
}

fn write_archive(path: &Path, archive: &Archive) -> std::io::Result<()> {
    let text = serde_json::to_string(archive).map_err(std::io::Error::other)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)
}

/// One card's year: the logs, merged into (and kept in) the archive when `keep` is on.
pub(crate) fn year_usage(
    log: Log,
    dirs: &[PathBuf],
    card: &str,
    archive_path: Option<&Path>,
    now: SystemTime,
    offset_secs: i64,
) -> YearUsage {
    let since = now - Duration::from_secs((YEAR_DAYS * DAY_SECS) as u64);
    let (mut days, utc, unreadable) = days_from_logs(log, dirs, since, offset_secs);
    if let Some(path) = archive_path {
        // Two cards' reads mustn't interleave their read-modify-write of the one file.
        static ARCHIVE_LOCK: Mutex<()> = Mutex::new(());
        let _guard = ARCHIVE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let mut archive = read_archive(path);
        let kept = archive.entry(card.to_owned()).or_default();
        merge(kept, &utc);
        fill_deleted(&mut days, kept, &utc);
        if let Err(e) = write_archive(path, &archive) {
            log::warn!("usage archive not written: {e}");
        }
    }
    let today = (now
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64)
        + offset_secs)
        .div_euclid(DAY_SECS);
    YearUsage {
        days: days
            .into_iter()
            .filter(|&(day, tokens)| tokens > 0 && day > today - YEAR_DAYS && day <= today)
            .collect(),
        unreadable,
    }
}

/// A Claude or Codex card's year by local day (`utc_offset_minutes`: the local zone's offset now).
/// `keep`: also keep every day seen in the archive and fill deleted days from it. Empty for other
/// cards and for a WSL copy.
#[tauri::command]
pub async fn usage_year(
    state: tauri::State<'_, Mutex<AppState>>,
    plugin_id: String,
    utc_offset_minutes: i64,
    keep: bool,
) -> Result<YearUsage, String> {
    if utc_offset_minutes.abs() > 14 * 60 {
        return Err("invalid UTC offset".into());
    }
    let (source, archive_path) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let plugin = state.plugins.iter().find(|p| p.manifest.id == plugin_id);
        let source = match plugin.and_then(crate::login_stamp::cli_dirs) {
            Some(("claude", dirs, _)) => Some((Log::Claude, dirs, "projects")),
            Some(("codex", dirs, _)) => Some((Log::Codex, dirs, "sessions")),
            _ => None,
        };
        (source, state.app_data_dir.join(ARCHIVE_FILE))
    };
    let Some((log, dirs, folder)) = source else {
        return Ok(YearUsage {
            days: Vec::new(),
            unreadable: 0,
        });
    };
    let dirs: Vec<PathBuf> = dirs.iter().map(|dir| dir.join(folder)).collect();
    tauri::async_runtime::spawn_blocking(move || {
        year_usage(
            log,
            &dirs,
            &plugin_id,
            keep.then_some(archive_path.as_path()),
            SystemTime::now(),
            utc_offset_minutes * 60,
        )
    })
    .await
    .map_err(|e| e.to_string())
}

/// The live rate looks this far back: long enough to smooth a turn's bursts.
const RATE_MINUTES: i64 = 5;

/// Tokens per minute over the last `RATE_MINUTES - 1` whole minutes and the part of this one gone by.
fn rate_from_logs(log: Log, dirs: &[PathBuf], now: SystemTime) -> f64 {
    let now_secs = now
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |d| d.as_secs_f64());
    let now_slot = (now_secs / SPOT_SECS as f64) as i64;
    let since = now - Duration::from_secs((RATE_MINUTES as u64 + 1) * SPOT_SECS as u64);
    let mut tokens = 0u64;
    scan_logs(log, dirs, since, |scan| {
        for (spot, parts) in &scan.spots {
            if spot.slot > now_slot - RATE_MINUTES && spot.slot <= now_slot {
                tokens += parts.total();
            }
        }
    });
    let minutes = (RATE_MINUTES - 1) as f64 + (now_secs / SPOT_SECS as f64).fract();
    tokens as f64 / minutes
}

/// Each Claude/Codex card's tokens per minute right now (over the last few minutes), for the strip's,
/// widgets' and tray's live rate. Cards with none are left out.
#[tauri::command]
pub async fn token_rates(
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<HashMap<String, f64>, String> {
    let sources: Vec<(String, Log, Vec<PathBuf>)> = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state
            .plugins
            .iter()
            .filter_map(|plugin| match crate::login_stamp::cli_dirs(plugin)? {
                ("claude", dirs, _) => Some((
                    plugin.manifest.id.clone(),
                    Log::Claude,
                    dirs.iter().map(|dir| dir.join("projects")).collect(),
                )),
                ("codex", dirs, _) => Some((
                    plugin.manifest.id.clone(),
                    Log::Codex,
                    dirs.iter().map(|dir| dir.join("sessions")).collect(),
                )),
                _ => None,
            })
            .collect()
    };
    tauri::async_runtime::spawn_blocking(move || {
        let now = SystemTime::now();
        sources
            .into_iter()
            .map(|(id, log, dirs)| (id, rate_from_logs(log, &dirs, now)))
            .filter(|(_, rate)| *rate > 0.0)
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_live_rate_is_the_last_minutes_tokens_per_minute() {
        let dir = std::env::temp_dir().join(format!("otu-rate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let project = dir.join("p");
        std::fs::create_dir_all(&project).unwrap();
        // Half a minute into the current one: 4 whole minutes and a half are looked at.
        let real = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let now = UNIX_EPOCH + Duration::from_secs(real / 60 * 60 + 30);
        let at = |minutes_ago: u64| {
            let when: time::OffsetDateTime = (now - Duration::from_secs(minutes_ago * 60)).into();
            when.format(&time::format_description::well_known::Rfc3339)
                .unwrap()
        };
        let answer = |id: &str, minutes_ago: u64, output: u64| {
            serde_json::json!({
                "type": "assistant", "timestamp": at(minutes_ago), "requestId": id,
                "message": { "id": id, "model": "claude-x", "usage": {
                    "input_tokens": 0, "output_tokens": output,
                    "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0 } }
            })
            .to_string()
        };
        // 1 000 and 4 000 in the last minutes; 9 000 twenty minutes ago is outside.
        let log = [
            answer("a", 20, 9_000),
            answer("b", 3, 1_000),
            answer("c", 0, 4_000),
        ]
        .join("\n");
        std::fs::write(project.join("s.jsonl"), log + "\n").unwrap();
        assert_eq!(
            rate_from_logs(Log::Claude, &[dir.clone()], now),
            5_000.0 / 4.5
        );
    }

    #[test]
    fn a_new_utc_offset_moves_the_shown_day_but_never_the_kept_one() {
        let dir = std::env::temp_dir().join(format!("otu-archive-tz-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let project = dir.join("logs").join("p");
        std::fs::create_dir_all(&project).unwrap();
        let path = dir.join(ARCHIVE_FILE);
        let now = SystemTime::now();
        let today = now.duration_since(UNIX_EPOCH).unwrap().as_secs() as i64 / DAY_SECS;
        // 1 000 tokens at 22:30 UTC two days ago: that day in UTC, the next one at UTC+3.
        let day = today - 2;
        let when: time::OffsetDateTime =
            (UNIX_EPOCH + Duration::from_secs((day * DAY_SECS + 22 * 3600 + 1800) as u64)).into();
        let line = serde_json::json!({
            "type": "assistant", "requestId": "r",
            "timestamp": when.format(&time::format_description::well_known::Rfc3339).unwrap(),
            "message": { "id": "m", "model": "claude-x", "usage": {
                "input_tokens": 0, "output_tokens": 1_000,
                "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0 } }
        });
        std::fs::write(project.join("s.jsonl"), format!("{line}\n")).unwrap();
        let logs = [dir.join("logs")];
        let read = |offset| year_usage(Log::Claude, &logs, "claude", Some(&path), now, offset);
        assert_eq!(read(0).days, vec![(day, 1_000)]);
        assert_eq!(read(3 * 3600).days, vec![(day + 1, 1_000)]);
        assert_eq!(
            read_archive(&path)["claude"],
            BTreeMap::from([(day, 1_000)])
        );
    }

    #[test]
    fn a_day_keeps_the_most_it_was_seen_with() {
        let mut kept = BTreeMap::from([(10, 500), (11, 40)]);
        // Day 10's logs were deleted (now 0 or less), day 11 grew, day 12 is new.
        merge(&mut kept, &BTreeMap::from([(10, 0), (11, 90), (12, 7)]));
        assert_eq!(kept, BTreeMap::from([(10, 500), (11, 90), (12, 7)]));
    }

    #[test]
    fn a_day_with_some_sessions_deleted_gets_the_deleted_share_back() {
        // Day 10 kept 2 000; one of its two sessions is gone (1 000 left, shown on days 9 and 10 at
        // this UTC offset). Day 11's logs are all gone. Day 12 is whole.
        let kept = BTreeMap::from([(10, 2_000), (11, 500), (12, 70)]);
        let scanned = BTreeMap::from([(10, 1_000), (12, 70)]);
        let mut days = BTreeMap::from([(9, 300), (10, 700), (12, 70)]);
        fill_deleted(&mut days, &kept, &scanned);
        assert_eq!(
            days,
            BTreeMap::from([(9, 300), (10, 1_700), (11, 500), (12, 70)])
        );
    }

    #[test]
    fn the_archive_fills_days_whose_logs_are_gone() {
        let dir = std::env::temp_dir().join(format!("otu-archive-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(ARCHIVE_FILE);
        let now = UNIX_EPOCH + Duration::from_secs(20_000 * DAY_SECS as u64 + 3600);
        // Kept from earlier runs: day 19 990 (in the year) and one long gone (outside it).
        std::fs::write(
            &path,
            r#"{"claude":{"19990":1234,"10":5},"codex":{"19999":9}}"#,
        )
        .unwrap();
        let year = year_usage(
            Log::Claude,
            &[dir.join("none")],
            "claude",
            Some(&path),
            now,
            0,
        );
        assert_eq!(year.days, vec![(19_990, 1234)]);
        // The other card's days stay in the file; nothing is kept with `keep` off.
        let archive = read_archive(&path);
        assert_eq!(archive["codex"], BTreeMap::from([(19_999, 9)]));
        let fresh = year_usage(Log::Claude, &[dir.join("none")], "claude", None, now, 0);
        assert!(fresh.days.is_empty());
    }
}
