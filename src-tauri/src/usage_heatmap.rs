//! Tokens over time from the CLIs' own session logs, for the heatmap on Claude and Codex detail
//! pages: Claude Code's `<config dir>/projects/**/*.jsonl` and Codex's `<CODEX_HOME>/sessions/**/*.jsonl`.
//! The logs only grow, so each file is read once and afterwards only from where the last read stopped.

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use time::format_description::well_known::Rfc3339;

/// Four whole weeks, so every weekday and hour of the grid adds up the same number of days.
const DAYS: i64 = 28;
/// Usage is kept per quarter hour: every time zone is a whole number of them off UTC, so the
/// frontend can put each one in the right local hour (half-hour zones included).
const SLOT_SECS: i64 = 900;
/// `projects/<project>/<session>/subagents/<agent>.jsonl`, `sessions/<year>/<month>/<day>/<rollout>.jsonl`.
const MAX_DEPTH: usize = 5;

#[derive(Clone, Copy)]
enum Log {
    Claude,
    Codex,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Heatmap {
    /// `[UTC quarter hour (Unix seconds / 900), tokens]`, oldest first.
    slots: Vec<(i64, u64)>,
    /// Log files and folders that couldn't be read: the slots leave them out.
    unreadable: usize,
}

/// What one file has added up so far, and where its next read starts.
#[derive(Default)]
struct FileScan {
    len: u64,
    offset: u64,
    /// Quarter hour → tokens.
    slots: HashMap<i64, u64>,
    /// Claude writes a line per content block of a message, each with the message's usage so far:
    /// the message being read, its quarter hour and the tokens counted for it.
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

fn slot_of(timestamp: &str) -> Option<i64> {
    let at = time::OffsetDateTime::parse(timestamp, &Rfc3339).ok()?;
    Some(at.unix_timestamp().div_euclid(SLOT_SECS))
}

fn bump(slots: &mut HashMap<i64, u64>, slot: i64, tokens: u64) {
    if tokens > 0 {
        *slots.entry(slot).or_default() += tokens;
    }
}

/// Counts a log file or folder that couldn't be read. One that went away meanwhile isn't a failure.
fn note(unreadable: &mut usize, path: &Path, error: &std::io::Error) {
    if error.kind() != std::io::ErrorKind::NotFound {
        log::warn!("usage heatmap: couldn't read {}: {error}", path.display());
        *unreadable += 1;
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
        let Some(slot) = slot_of(&line.timestamp) else {
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
                    bump(&mut self.slots, *at, more);
                } else {
                    bump(&mut self.slots, slot, tokens);
                    self.message = Some((id, slot, tokens));
                }
            }
            Log::Codex => {
                let Some(payload) = line.payload else {
                    return;
                };
                if line.kind == "token_usage_record" {
                    self.records = true;
                    let tokens = payload.usage.and_then(|u| u.total_tokens).unwrap_or(0);
                    bump(&mut self.slots, slot, tokens);
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
                    bump(&mut self.slots, slot, tokens);
                }
            }
        }
    }

    /// Reads what was added since the last read; a file that got shorter was rewritten and is read
    /// again. After a failed read, the next one goes on from the last complete line.
    fn update(&mut self, path: &Path, len: u64, log: Log) -> std::io::Result<()> {
        if len < self.len || len < self.offset {
            *self = FileScan::default();
        }
        let mut file = std::fs::File::open(path)?;
        file.seek(SeekFrom::Start(self.offset))?;
        let mut reader = BufReader::new(file);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            let read = reader.read_until(b'\n', &mut buf)?;
            // A line still being written is read once it's complete.
            if read == 0 || !buf.ends_with(b"\n") {
                break;
            }
            self.offset += read as u64;
            if let Ok(text) = std::str::from_utf8(&buf) {
                self.read_line(log, text);
            }
        }
        self.len = len;
        Ok(())
    }
}

/// The `.jsonl` files under `dir` written to since `since`, with their length.
fn log_files(
    dir: &Path,
    depth: usize,
    since: SystemTime,
    out: &mut Vec<(PathBuf, u64)>,
    unreadable: &mut usize,
) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => return note(unreadable, dir, &e),
    };
    for entry in entries {
        let (path, kind) = match entry.and_then(|entry| Ok((entry.path(), entry.file_type()?))) {
            Ok(found) => found,
            Err(e) => {
                note(unreadable, dir, &e);
                continue;
            }
        };
        if kind.is_dir() && depth > 0 {
            log_files(&path, depth - 1, since, out, unreadable);
        } else if kind.is_file() && path.extension().is_some_and(|ext| ext == "jsonl") {
            // Not `entry.metadata()`: Windows' folder listing keeps the size and time a file had
            // when it was last closed, and a CLI can hold its log open for a whole session.
            match std::fs::metadata(&path) {
                Ok(meta) if meta.modified().is_ok_and(|modified| modified >= since) => {
                    out.push((path, meta.len()))
                }
                Ok(_) => {}
                Err(e) => note(unreadable, &path, &e),
            }
        }
    }
}

/// Each log folder's files as read so far. Files that leave the window are dropped.
fn scans() -> &'static Mutex<HashMap<PathBuf, HashMap<PathBuf, FileScan>>> {
    static SCANS: OnceLock<Mutex<HashMap<PathBuf, HashMap<PathBuf, FileScan>>>> = OnceLock::new();
    SCANS.get_or_init(Default::default)
}

/// Tokens per quarter hour over the last four weeks, and how many logs couldn't be read.
fn heatmap(log: Log, dirs: &[PathBuf], now: SystemTime) -> Heatmap {
    let since = now - Duration::from_secs(DAYS as u64 * 86_400);
    let first_slot = now
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64 / SLOT_SECS)
        - DAYS * 86_400 / SLOT_SECS;
    let mut scans = scans().lock().unwrap_or_else(|e| e.into_inner());
    let mut totals: HashMap<i64, u64> = HashMap::new();
    let mut unreadable = 0;
    for dir in dirs {
        let mut files = Vec::new();
        log_files(dir, MAX_DEPTH, since, &mut files, &mut unreadable);
        let mut previous = scans.remove(dir).unwrap_or_default();
        let mut current = HashMap::with_capacity(files.len());
        for (path, len) in files {
            let mut scan = previous.remove(&path).unwrap_or_default();
            if len != scan.len {
                if let Err(e) = scan.update(&path, len, log) {
                    note(&mut unreadable, &path, &e);
                }
            }
            for (&slot, &tokens) in &scan.slots {
                if slot > first_slot {
                    *totals.entry(slot).or_default() += tokens;
                }
            }
            current.insert(path, scan);
        }
        scans.insert(dir.clone(), current);
    }
    let mut slots: Vec<(i64, u64)> = totals.into_iter().collect();
    slots.sort_unstable();
    Heatmap { slots, unreadable }
}

/// The heatmap of a Claude or Codex card's login (the usual one or an extra account). Empty for
/// other cards and for a WSL copy, whose share can start a stopped distro.
#[tauri::command]
pub async fn usage_heatmap(
    state: tauri::State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Result<Heatmap, String> {
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
        return Ok(Heatmap {
            slots: Vec::new(),
            unreadable: 0,
        });
    };
    let dirs: Vec<PathBuf> = dirs.iter().map(|dir| dir.join(folder)).collect();
    tauri::async_runtime::spawn_blocking(move || heatmap(log, &dirs, SystemTime::now()))
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

    fn slot(timestamp: &str) -> i64 {
        slot_of(timestamp).unwrap()
    }

    fn slots(log: Log, root: &Path, now: SystemTime) -> Vec<(i64, u64)> {
        let read = heatmap(log, &[root.to_path_buf()], now);
        assert_eq!(read.unreadable, 0);
        read.slots
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

        // One message written as two blocks, its output growing; a user line mentioning usage.
        append(&file, &claude("msg_1", "2026-02-04T09:15:00Z", 5));
        append(&file, &claude("msg_1", "2026-02-04T09:15:01Z", 20));
        append(
            &file,
            r#"{"type":"user","timestamp":"2026-02-04T09:16:00Z","message":{"role":"user","content":"what is \"usage\" for \"assistant\""}}"#,
        );
        append(&file, "\n");
        append(&file, &claude("msg_2", "2026-02-04T10:59:59Z", 1));
        assert_eq!(
            slots(Log::Claude, &root, now),
            vec![
                (slot("2026-02-04T09:15:00Z"), 1130),
                (slot("2026-02-04T10:45:00Z"), 1111)
            ]
        );

        // The last message grows (counted where it started), a new one starts, and a line still
        // being written waits.
        append(&file, &claude("msg_2", "2026-02-04T11:00:01Z", 9));
        append(&file, &claude("msg_3", "2026-02-04T11:30:00Z", 0));
        let partial = claude("msg_4", "2026-02-04T11:40:00Z", 0);
        append(&file, &partial[..40]);
        assert_eq!(
            slots(Log::Claude, &root, now),
            vec![
                (slot("2026-02-04T09:15:00Z"), 1130),
                (slot("2026-02-04T10:45:00Z"), 1119),
                (slot("2026-02-04T11:30:00Z"), 1110),
            ]
        );
        append(&file, &partial[40..]);
        assert_eq!(
            slots(Log::Claude, &root, now).last(),
            Some(&(slot("2026-02-04T11:30:00Z"), 2220))
        );
    }

    #[test]
    fn leaves_out_what_is_older_than_four_weeks_and_rereads_a_rewritten_file() {
        let root = temp_dir("window");
        let file = root.join("session.jsonl");
        append(&file, &claude("old", "2026-01-01T08:00:00Z", 0));
        append(&file, &claude("new", "2026-02-03T08:00:00Z", 0));
        let now = at("2026-02-04T12:00:00Z");
        assert_eq!(
            slots(Log::Claude, &root, now),
            vec![(slot("2026-02-03T08:00:00Z"), 1110)]
        );

        std::fs::write(&file, claude("other", "2026-02-02T08:00:00Z", 0)).unwrap();
        assert_eq!(
            slots(Log::Claude, &root, now),
            vec![(slot("2026-02-02T08:00:00Z"), 1110)]
        );
        // No log folder yet is no usage, not a failure.
        assert!(slots(Log::Claude, &root.join("missing"), now).is_empty());
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
        append(&current, &codex_record("2026-02-04T09:05:00Z", 200));
        // An older log: each token_count once, a repeat with an unchanged total skipped.
        let older = day.join("rollout-old.jsonl");
        append(&older, &codex_count("2026-02-04T10:00:00Z", 50, 50));
        append(&older, &codex_count("2026-02-04T10:01:00Z", 50, 50));
        append(&older, &codex_count("2026-02-04T10:02:00Z", 80, 30));

        assert_eq!(
            slots(Log::Codex, &root, now),
            vec![
                (slot("2026-02-04T09:00:00Z"), 500),
                (slot("2026-02-04T10:00:00Z"), 80)
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
            slots(Log::Codex, &root, now),
            vec![(slot("2026-02-04T09:00:00Z"), 300)]
        );
        file.write_all(codex_record("2026-02-04T10:00:00Z", 5).as_bytes())
            .unwrap();
        assert_eq!(
            slots(Log::Codex, &root, now).last(),
            Some(&(slot("2026-02-04T10:00:00Z"), 5))
        );
    }

    #[cfg(windows)]
    #[test]
    fn counts_a_log_it_cannot_open_and_reads_it_once_it_can() {
        use std::os::windows::fs::OpenOptionsExt;
        let root = temp_dir("locked");
        let locked = root.join("locked.jsonl");
        append(&locked, &claude("a", "2026-02-04T09:00:00Z", 0));
        append(
            &root.join("free.jsonl"),
            &claude("b", "2026-02-04T10:00:00Z", 0),
        );
        let now = at("2026-02-04T12:00:00Z");

        // Opened without sharing: nobody else can read it while this handle lives.
        let handle = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&locked)
            .unwrap();
        assert_eq!(
            heatmap(Log::Claude, &[root.clone()], now),
            Heatmap {
                slots: vec![(slot("2026-02-04T10:00:00Z"), 1110)],
                unreadable: 1
            }
        );
        drop(handle);
        assert_eq!(
            slots(Log::Claude, &root, now),
            vec![
                (slot("2026-02-04T09:00:00Z"), 1110),
                (slot("2026-02-04T10:00:00Z"), 1110)
            ]
        );
    }
}
