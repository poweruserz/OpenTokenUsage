//! Tokens per hour from the CLIs' own session logs, for the heatmap on Claude and Codex detail
//! pages: Claude Code's `<config dir>/projects/**/*.jsonl` and Codex's `<CODEX_HOME>/sessions/**/*.jsonl`.
//! The logs only grow, so each file is read once and afterwards only from where the last read stopped.

use crate::AppState;
use serde::Deserialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use time::format_description::well_known::Rfc3339;

/// Four whole weeks, so every weekday and hour of the grid adds up the same number of days.
const DAYS: i64 = 28;
/// `projects/<project>/<session>/subagents/<agent>.jsonl`, `sessions/<year>/<month>/<day>/<rollout>.jsonl`.
const MAX_DEPTH: usize = 5;

#[derive(Clone, Copy)]
enum Log {
    Claude,
    Codex,
}

/// What one file has added up so far, and where its next read starts.
#[derive(Default)]
struct FileScan {
    len: u64,
    offset: u64,
    /// UTC hour (Unix seconds / 3600) → tokens.
    hours: HashMap<i64, u64>,
    /// Claude writes a line per content block of a message, each with the message's usage so far:
    /// the message being read, its hour and the tokens counted for it.
    message: Option<(String, i64, u64)>,
    /// Codex 0.40+ writes a `token_usage_record` per model response. Older logs only have
    /// `token_count` events, repeated with an unchanged total.
    records: bool,
    last_total: Option<u64>,
}

#[derive(Deserialize)]
struct Line {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    timestamp: String,
    message: Option<Message>,
    payload: Option<Payload>,
}

#[derive(Deserialize)]
struct Message {
    #[serde(default)]
    id: String,
    usage: Option<ClaudeUsage>,
}

#[derive(Deserialize)]
struct ClaudeUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
}

#[derive(Deserialize)]
struct Payload {
    #[serde(rename = "type", default)]
    kind: String,
    usage: Option<CodexTokens>,
    info: Option<CodexInfo>,
}

#[derive(Deserialize)]
struct CodexInfo {
    total_token_usage: Option<CodexTokens>,
    last_token_usage: Option<CodexTokens>,
}

#[derive(Deserialize)]
struct CodexTokens {
    total_tokens: Option<u64>,
}

fn hour_of(timestamp: &str) -> Option<i64> {
    let at = time::OffsetDateTime::parse(timestamp, &Rfc3339).ok()?;
    Some(at.unix_timestamp().div_euclid(3600))
}

fn bump(hours: &mut HashMap<i64, u64>, hour: i64, tokens: u64) {
    if tokens > 0 {
        *hours.entry(hour).or_default() += tokens;
    }
}

impl FileScan {
    fn read_line(&mut self, log: Log, text: &str) {
        // Most lines are conversation text: parse only the ones that can carry usage.
        let wanted = match log {
            Log::Claude => text.contains("\"usage\"") && text.contains("\"assistant\""),
            Log::Codex => text.contains("token_usage_record") || text.contains("\"token_count\""),
        };
        if !wanted {
            return;
        }
        let Ok(line) = serde_json::from_str::<Line>(text) else {
            return;
        };
        let Some(hour) = hour_of(&line.timestamp) else {
            return;
        };
        match log {
            Log::Claude => {
                let Some(Message {
                    id,
                    usage: Some(usage),
                }) = line.message
                else {
                    return;
                };
                if line.kind != "assistant" {
                    return;
                }
                let tokens = [
                    usage.input_tokens,
                    usage.output_tokens,
                    usage.cache_creation_input_tokens,
                    usage.cache_read_input_tokens,
                ]
                .into_iter()
                .map(|n| n.unwrap_or(0))
                .sum::<u64>();
                // A later block of the same message: count only what its usage grew by.
                // shortcut: a message a resumed or forked session copied into its own file counts
                // again there (~0.2% of tokens here); dedupe across files if that ever shows.
                if let Some((_, at, counted)) = self
                    .message
                    .as_mut()
                    .filter(|(current, ..)| !id.is_empty() && *current == id)
                {
                    let more = tokens.saturating_sub(*counted);
                    *counted = (*counted).max(tokens);
                    bump(&mut self.hours, *at, more);
                } else {
                    bump(&mut self.hours, hour, tokens);
                    self.message = Some((id, hour, tokens));
                }
            }
            Log::Codex => {
                let Some(payload) = line.payload else {
                    return;
                };
                if line.kind == "token_usage_record" {
                    self.records = true;
                    let tokens = payload.usage.and_then(|u| u.total_tokens).unwrap_or(0);
                    bump(&mut self.hours, hour, tokens);
                } else if !self.records && payload.kind == "token_count" {
                    let Some(info) = payload.info else {
                        return;
                    };
                    let total = info.total_token_usage.and_then(|t| t.total_tokens);
                    if total.is_some() && total == self.last_total {
                        return;
                    }
                    self.last_total = total;
                    let tokens = info
                        .last_token_usage
                        .and_then(|t| t.total_tokens)
                        .unwrap_or(0);
                    bump(&mut self.hours, hour, tokens);
                }
            }
        }
    }

    /// Reads what was added since the last read; a file that got shorter was rewritten and is read again.
    fn update(&mut self, path: &Path, len: u64, log: Log) {
        if len < self.len || len < self.offset {
            *self = FileScan::default();
        }
        let Ok(mut file) = std::fs::File::open(path) else {
            return;
        };
        if file.seek(SeekFrom::Start(self.offset)).is_err() {
            return;
        }
        let mut reader = BufReader::new(file);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                // A line still being written is read once it's complete.
                Ok(n) if n > 0 && buf.ends_with(b"\n") => {
                    self.offset += n as u64;
                    if let Ok(text) = std::str::from_utf8(&buf) {
                        self.read_line(log, text);
                    }
                }
                _ => break,
            }
        }
        self.len = len;
    }
}

/// The `.jsonl` files under `dir` written to since `since`, with their length.
fn log_files(dir: &Path, depth: usize, since: SystemTime, out: &mut Vec<(PathBuf, u64)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if kind.is_dir() && depth > 0 {
            log_files(&path, depth - 1, since, out);
        } else if kind.is_file() && path.extension().is_some_and(|ext| ext == "jsonl") {
            // Not `entry.metadata()`: Windows' folder listing keeps the size and time a file had
            // when it was last closed, and a CLI can hold its log open for a whole session.
            let Ok(meta) = std::fs::metadata(&path) else {
                continue;
            };
            if meta.modified().is_ok_and(|modified| modified >= since) {
                out.push((path, meta.len()));
            }
        }
    }
}

/// Each log folder's files as read so far. Files that leave the window are dropped.
fn scans() -> &'static Mutex<HashMap<PathBuf, HashMap<PathBuf, FileScan>>> {
    static SCANS: OnceLock<Mutex<HashMap<PathBuf, HashMap<PathBuf, FileScan>>>> = OnceLock::new();
    SCANS.get_or_init(Default::default)
}

/// Tokens per UTC hour over the last four weeks, oldest first.
fn hourly(log: Log, dirs: &[PathBuf], now: SystemTime) -> Vec<(i64, u64)> {
    let since = now - Duration::from_secs(DAYS as u64 * 86_400);
    let first_hour = now
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64 / 3600)
        - DAYS * 24;
    let mut scans = scans().lock().unwrap_or_else(|e| e.into_inner());
    let mut totals: HashMap<i64, u64> = HashMap::new();
    for dir in dirs {
        let mut files = Vec::new();
        log_files(dir, MAX_DEPTH, since, &mut files);
        let mut previous = scans.remove(dir).unwrap_or_default();
        let mut current = HashMap::with_capacity(files.len());
        for (path, len) in files {
            let mut scan = previous.remove(&path).unwrap_or_default();
            if len != scan.len {
                scan.update(&path, len, log);
            }
            for (&hour, &tokens) in &scan.hours {
                if hour > first_hour {
                    *totals.entry(hour).or_default() += tokens;
                }
            }
            current.insert(path, scan);
        }
        scans.insert(dir.clone(), current);
    }
    let mut hours: Vec<(i64, u64)> = totals.into_iter().collect();
    hours.sort_unstable();
    hours
}

/// `[UTC hour, tokens]` pairs for a Claude or Codex card's login (the usual one or an extra
/// account). Empty for other cards and for a WSL copy, whose share can start a stopped distro.
#[tauri::command]
pub async fn usage_heatmap(
    state: tauri::State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Result<Vec<(i64, u64)>, String> {
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
    tauri::async_runtime::spawn_blocking(move || hourly(log, &dirs, SystemTime::now()))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("openusage-heatmap-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn append(path: &Path, text: &str) {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .unwrap();
        file.write_all(text.as_bytes()).unwrap();
    }

    fn at(timestamp: &str) -> SystemTime {
        UNIX_EPOCH
            + Duration::from_secs(
                time::OffsetDateTime::parse(timestamp, &Rfc3339)
                    .unwrap()
                    .unix_timestamp() as u64,
            )
    }

    fn hour(timestamp: &str) -> i64 {
        hour_of(timestamp).unwrap()
    }

    fn claude(id: &str, timestamp: &str, output: u64) -> String {
        serde_json::json!({
            "type": "assistant", "timestamp": timestamp, "requestId": "req",
            "message": { "id": id, "role": "assistant", "content": [{ "type": "text", "text": "\"usage\"" }],
                "usage": { "input_tokens": 10, "cache_creation_input_tokens": 100, "cache_read_input_tokens": 1000, "output_tokens": output } }
        })
        .to_string()
            + "\n"
    }

    #[test]
    fn counts_each_claude_message_once_at_its_final_size_as_the_log_grows() {
        let root = temp_dir("claude");
        let session = root.join("project-a").join("session").join("subagents");
        std::fs::create_dir_all(&session).unwrap();
        let file = session.join("agent.jsonl");
        let now = at("2026-02-04T12:00:00Z");

        // One message written as three blocks, its output growing; a user line mentioning usage.
        append(&file, &claude("msg_1", "2026-02-04T09:15:00Z", 5));
        append(&file, &claude("msg_1", "2026-02-04T09:15:01Z", 20));
        append(
            &file,
            r#"{"type":"user","timestamp":"2026-02-04T09:16:00Z","message":{"role":"user","content":"what is \"usage\" for \"assistant\""}}"#,
        );
        append(&file, "\n");
        append(&file, &claude("msg_2", "2026-02-04T10:59:59Z", 1));
        let first = hourly(Log::Claude, &[root.clone()], now);
        assert_eq!(
            first,
            vec![
                (hour("2026-02-04T09:00:00Z"), 1130),
                (hour("2026-02-04T10:00:00Z"), 1111)
            ]
        );

        // The last message grows, a new one starts, and a line still being written waits.
        append(&file, &claude("msg_2", "2026-02-04T11:00:01Z", 9));
        append(&file, &claude("msg_3", "2026-02-04T11:30:00Z", 0));
        let partial = claude("msg_4", "2026-02-04T11:40:00Z", 0);
        append(&file, &partial[..40]);
        let second = hourly(Log::Claude, &[root.clone()], now);
        assert_eq!(
            second,
            vec![
                (hour("2026-02-04T09:00:00Z"), 1130),
                (hour("2026-02-04T10:00:00Z"), 1119),
                (hour("2026-02-04T11:00:00Z"), 1110),
            ]
        );
        append(&file, &partial[40..]);
        let third = hourly(Log::Claude, &[root.clone()], now);
        assert_eq!(third.last(), Some(&(hour("2026-02-04T11:00:00Z"), 2220)));
    }

    #[test]
    fn leaves_out_what_is_older_than_four_weeks_and_rereads_a_rewritten_file() {
        let root = temp_dir("window");
        let file = root.join("session.jsonl");
        append(&file, &claude("old", "2026-01-01T08:00:00Z", 0));
        append(&file, &claude("new", "2026-02-03T08:00:00Z", 0));
        let now = at("2026-02-04T12:00:00Z");
        assert_eq!(
            hourly(Log::Claude, &[root.clone()], now),
            vec![(hour("2026-02-03T08:00:00Z"), 1110)]
        );

        std::fs::write(&file, claude("other", "2026-02-02T08:00:00Z", 0)).unwrap();
        assert_eq!(
            hourly(Log::Claude, &[root.clone()], now),
            vec![(hour("2026-02-02T08:00:00Z"), 1110)]
        );
        assert!(hourly(Log::Claude, &[root.join("missing")], now).is_empty());
    }

    fn codex_record(timestamp: &str, total: u64) -> String {
        serde_json::json!({ "timestamp": timestamp, "type": "token_usage_record",
            "payload": { "response_id": "r", "usage": { "input_tokens": total, "total_tokens": total } } })
        .to_string()
            + "\n"
    }

    fn codex_count(timestamp: &str, total: u64, last: u64) -> String {
        serde_json::json!({ "timestamp": timestamp, "type": "event_msg",
            "payload": { "type": "token_count", "info": {
                "total_token_usage": { "total_tokens": total }, "last_token_usage": { "total_tokens": last } } } })
        .to_string()
            + "\n"
    }

    #[test]
    fn codex_counts_response_records_or_else_each_new_token_count() {
        let root = temp_dir("codex");
        let day = root.join("2026").join("02").join("04");
        std::fs::create_dir_all(&day).unwrap();
        let now = at("2026-02-04T12:00:00Z");

        // A current log: records are the count, the token_count events beside them are not.
        let current = day.join("rollout-new.jsonl");
        append(&current, &codex_record("2026-02-04T09:00:00Z", 300));
        append(&current, &codex_count("2026-02-04T09:00:00Z", 300, 300));
        append(&current, &codex_record("2026-02-04T09:30:00Z", 200));
        // An older log: each token_count once, a repeat with an unchanged total skipped.
        let older = day.join("rollout-old.jsonl");
        append(&older, &codex_count("2026-02-04T10:00:00Z", 50, 50));
        append(&older, &codex_count("2026-02-04T10:01:00Z", 50, 50));
        append(&older, &codex_count("2026-02-04T10:02:00Z", 80, 30));

        assert_eq!(
            hourly(Log::Codex, &[root.clone()], now),
            vec![
                (hour("2026-02-04T09:00:00Z"), 500),
                (hour("2026-02-04T10:00:00Z"), 80)
            ]
        );
    }

    #[test]
    fn reads_a_log_its_cli_still_holds_open() {
        // Windows' folder listing would still say 0 bytes here.
        let root = temp_dir("open");
        let mut file = std::fs::File::create(root.join("rollout.jsonl")).unwrap();
        let now = at("2026-02-04T12:00:00Z");
        file.write_all(codex_record("2026-02-04T09:00:00Z", 300).as_bytes())
            .unwrap();
        assert_eq!(
            hourly(Log::Codex, &[root.clone()], now),
            vec![(hour("2026-02-04T09:00:00Z"), 300)]
        );
        file.write_all(codex_record("2026-02-04T10:00:00Z", 5).as_bytes())
            .unwrap();
        assert_eq!(
            hourly(Log::Codex, &[root.clone()], now).last(),
            Some(&(hour("2026-02-04T10:00:00Z"), 5))
        );
    }
}
