//! Sessions using tokens far faster than usual, which is mostly an agent stuck in a loop. From the
//! same scan of the CLI's own logs as the hour grid (`usage_heatmap::scan_logs`): each log file is
//! one session (or one sub-agent), its last 15 minutes measured against the busy quarter hours of
//! the past week. Nothing leaves the PC.

use crate::usage_heatmap::{scan_logs, Log, Parts, Spot, SPOT_SECS};
use crate::usage_projects::weight;
use crate::AppState;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Both sides are clock-aligned UTC quarter hours, the shape the factor was measured on: now is the
/// current quarter so far or the last whole one, whichever is bigger (a sliding window would see a
/// burst whole that the history saw split over two quarters, and read up to twice as high).
/// What sets the usual: the past week's quarters up to an hour ago, so a spike in the making stays out.
const HISTORY_DAYS: i64 = 7;
const HISTORY_GAP_QUARTERS: i64 = 4;
/// A session's quarter hour must reach this many times the usual busy quarter hour (its 90th
/// percentile)... Measured on 4 weeks of real Claude Code logs (1,842 busy session quarter hours),
/// the busiest ordinary one was 2.9 times the usual: 3 flags none of them and still catches a loop
/// well below the 4 times a more cautious bar would wait for.
const FACTOR: f64 = 3.0;
/// ...and this many price-weighted tokens (input-token equivalents), so a quiet week's small usual
/// doesn't make every ordinary burst a spike.
const MIN_WEIGHT: f64 = 300_000.0;
/// Busy quarter hours of history needed before anything is called unusual.
const MIN_HISTORY: usize = 20;
const QUARTER_SPOTS: i64 = 900 / SPOT_SECS;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Spike {
    /// The folder the session worked in (its last path part).
    folder: String,
    /// Its full path, which tells apart two folders of the same name.
    path: String,
    /// Tokens the session used in that quarter hour.
    tokens: u64,
    /// How many times the usual busy quarter hour that is, by price-weighted tokens.
    times: f64,
}

/// Adds sessions up one at a time (the scan hands them over under its lock), then names the spikes.
struct Spikes {
    log: Log,
    /// The current quarter hour (Unix seconds / 900).
    now: i64,
    /// Price-weighted tokens of every busy quarter hour of every session in the history.
    history: Vec<f64>,
    /// Each session active in the current or last quarter hour: its folder, tokens and weighted tokens.
    recent: Vec<(String, u64, f64)>, // (cwd, tokens, weighted)
}

impl Spikes {
    /// `minute`: the current minute (Unix seconds / `SPOT_SECS`).
    fn new(log: Log, minute: i64) -> Self {
        Spikes {
            log,
            now: minute.div_euclid(QUARTER_SPOTS),
            history: Vec::new(),
            recent: Vec::new(),
        }
    }

    fn add(&mut self, spots: &HashMap<Spot, Parts>) {
        let history_from = self.now - HISTORY_DAYS * 24 * 4;
        let history_to = self.now - HISTORY_GAP_QUARTERS;
        let mut quarters: HashMap<i64, f64> = HashMap::new();
        // The current and the last quarter: tokens, weighted tokens, and weighted tokens per folder.
        let mut live: HashMap<i64, (u64, f64, HashMap<&str, f64>)> = HashMap::new();
        for (spot, parts) in spots {
            let w = weight(self.log, &spot.model, parts);
            let quarter = spot.slot.div_euclid(QUARTER_SPOTS);
            if quarter == self.now || quarter == self.now - 1 {
                let (tokens, weighted, folders) = live.entry(quarter).or_default();
                *tokens += parts.total();
                *weighted += w;
                *folders.entry(spot.cwd.as_str()).or_default() += w;
            } else if quarter >= history_from && quarter < history_to {
                *quarters.entry(quarter).or_default() += w;
            }
        }
        self.history
            .extend(quarters.into_values().filter(|w| *w > 0.0));
        let busiest = live.into_values().max_by(|a, b| a.1.total_cmp(&b.1));
        if let Some((tokens, weighted, folders)) = busiest.filter(|(_, w, _)| *w > 0.0) {
            let cwd = folders
                .into_iter()
                .max_by(|a, b| a.1.total_cmp(&b.1))
                .map_or("", |(cwd, _)| cwd);
            self.recent.push((cwd.to_string(), tokens, weighted));
        }
    }

    fn finish(mut self) -> Vec<Spike> {
        if self.history.len() < MIN_HISTORY {
            return Vec::new();
        }
        self.history.sort_by(f64::total_cmp);
        let usual = self.history[(self.history.len() - 1) * 9 / 10];
        let mut found: Vec<Spike> = self
            .recent
            .into_iter()
            .filter(|(_, _, w)| *w >= MIN_WEIGHT && *w >= usual * FACTOR)
            .map(|(path, tokens, w)| Spike {
                folder: folder_name(&path),
                path,
                tokens,
                times: w / usual,
            })
            .collect();
        found.sort_by(|a, b| b.times.total_cmp(&a.times));
        found
    }
}

/// `C:\work\shop` and `/home/me/shop` → `shop`.
fn folder_name(cwd: &str) -> String {
    cwd.rsplit(['\\', '/'])
        .find(|part| !part.is_empty())
        .unwrap_or_default()
        .to_string()
}

/// The sessions of a Claude or Codex card's login (the usual one or an extra account) that are
/// using tokens far faster than usual right now. Empty for other cards and for a WSL copy, whose
/// share can start a stopped distro.
#[tauri::command]
pub async fn usage_spikes(
    state: tauri::State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Result<Vec<Spike>, String> {
    let source = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let plugin = state.plugins.iter().find(|p| p.manifest.id == plugin_id);
        match plugin.and_then(crate::login_stamp::cli_dirs) {
            Some(("claude", dirs, _)) => Some((Log::Claude, dirs, "projects")),
            Some(("codex", dirs, _)) => Some((Log::Codex, dirs, "sessions")),
            _ => None,
        }
    };
    let Some((log, dirs, folder)) = source else {
        return Ok(Vec::new());
    };
    let dirs: Vec<PathBuf> = dirs.iter().map(|dir| dir.join(folder)).collect();
    tauri::async_runtime::spawn_blocking(move || {
        let now = SystemTime::now();
        let minute = now
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_secs() as i64 / SPOT_SECS);
        let mut spikes = Spikes::new(log, minute);
        let since = now - Duration::from_secs(HISTORY_DAYS as u64 * 86_400);
        scan_logs(log, &dirs, since, |scan| spikes.add(&scan.spots));
        spikes.finish()
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 30_000_000; // a minute

    fn session(cwd: &str, minutes: &[(i64, u64)]) -> HashMap<Spot, Parts> {
        minutes
            .iter()
            .map(|&(slot, input)| {
                let spot = Spot {
                    slot,
                    model: "opus".into(),
                    cwd: cwd.into(),
                    branch: "main".into(),
                };
                (
                    spot,
                    Parts {
                        input,
                        ..Parts::default()
                    },
                )
            })
            .collect()
    }

    /// A week of ordinary sessions: one busy quarter hour a day at 100k, a few at 200k.
    fn ordinary_week() -> Vec<HashMap<Spot, Parts>> {
        (1..=30)
            .map(|day| {
                let at = NOW - day * 5 * 60; // every 5 hours, well inside the week and past the gap
                session(
                    "C:/work/blog",
                    &[(at, if day % 10 == 0 { 200_000 } else { 100_000 })],
                )
            })
            .collect()
    }

    fn find(sessions: &[HashMap<Spot, Parts>]) -> Vec<Spike> {
        let mut spikes = Spikes::new(Log::Claude, NOW);
        for spots in sessions {
            spikes.add(spots);
        }
        spikes.finish()
    }

    #[test]
    fn names_a_session_burning_far_faster_than_the_usual_quarter_hour() {
        let mut sessions = ordinary_week();
        // A loop: 1.2M in the last quarter hour, 12 times the usual 100k.
        sessions.push(session(
            "C:\\work\\shop",
            &[(NOW - 10, 600_000), (NOW - 2, 600_000)],
        ));
        // An ordinary session right now.
        sessions.push(session("C:/work/blog", &[(NOW - 5, 150_000)]));
        assert_eq!(
            find(&sessions),
            [Spike {
                folder: "shop".into(),
                path: "C:\\work\\shop".into(),
                tokens: 1_200_000,
                times: 12.0
            }]
        );
    }

    #[test]
    fn stays_quiet_without_enough_history_below_the_floor_and_for_older_minutes() {
        // Two weeks of nothing: no usual to compare with.
        let loop_now = session("C:/work/shop", &[(NOW - 1, 5_000_000)]);
        assert!(find(&[loop_now.clone()]).is_empty());

        // A light usual (10k): 4 times it, but under the floor, isn't a spike.
        let light: Vec<_> = (1..=30)
            .map(|day| session("C:/work/blog", &[(NOW - day * 300, 10_000)]))
            .chain([session("C:/work/shop", &[(NOW - 1, 200_000)])])
            .collect();
        assert!(find(&light).is_empty());

        // The burst ended 20 minutes ago, and the last hour isn't part of the usual either.
        let mut sessions = ordinary_week();
        sessions.push(session("C:/work/shop", &[(NOW - 20, 5_000_000)]));
        assert!(find(&sessions).is_empty());
    }

    #[test]
    fn judges_whole_clock_quarter_hours_like_the_usual_ones() {
        // NOW starts a quarter hour. 280k at its last minute and 280k now: 560k within a few
        // minutes, but each quarter is under 3 times the usual 100k, as the history would count it.
        let mut sessions = ordinary_week();
        sessions.push(session(
            "C:/work/shop",
            &[(NOW - 1, 280_000), (NOW, 280_000)],
        ));
        assert!(find(&sessions).is_empty());

        // The current quarter counts as soon as it is over the bar.
        let mut sessions = ordinary_week();
        sessions.push(session("C:/work/shop", &[(NOW, 1_200_000)]));
        assert_eq!(find(&sessions).len(), 1);
    }

    #[test]
    fn names_folders_by_their_last_part() {
        assert_eq!(folder_name("C:\\work\\shop\\"), "shop");
        assert_eq!(folder_name("/home/me/blog"), "blog");
        assert_eq!(folder_name(""), "");
    }
}
