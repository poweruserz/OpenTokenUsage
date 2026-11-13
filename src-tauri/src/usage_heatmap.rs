//! Tokens over time from the CLIs' own session logs, for the heatmap and the projects list on Claude
//! and Codex detail pages: Claude Code's `<config dir>/projects/**/*.jsonl` and Codex's
//! `<CODEX_HOME>/sessions/**/*.jsonl`. The logs only grow, so each file is read once and afterwards
//! only from where the last read stopped.

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use time::format_description::well_known::Rfc3339;

/// Four whole weeks, so every weekday and hour of the grid adds up the same number of days.
const DAYS: i64 = 28;
/// The heatmap reports usage per quarter hour: every time zone is a whole number of them off UTC, so
/// the frontend can put each one in the right local hour (half-hour zones included).
pub(crate) const SLOT_SECS: i64 = 900;
/// The scan keeps each minute (`Spot::slot`), so a range that starts at any minute (a weekly limit's
/// reset) is cut there rather than at its quarter hour.
pub(crate) const SPOT_SECS: i64 = 60;
/// `projects/<project>/<session>/subagents/<agent>.jsonl`, `sessions/<year>/<month>/<day>/<rollout>.jsonl`.
const MAX_DEPTH: usize = 5;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Log {
    Claude,
    Codex,
}

/// A message's tokens by kind, so a cost can be shared out by what each kind costs.
#[derive(Default, Clone, Copy, Debug, PartialEq)]
pub(crate) struct Parts {
    pub input: u64,
    pub output: u64,
    pub cache_write: u64,
    pub cache_read: u64,
}

impl Parts {
    pub fn total(&self) -> u64 {
        self.input + self.output + self.cache_write + self.cache_read
    }

    pub fn add(&mut self, other: Parts) {
        self.input += other.input;
        self.output += other.output;
        self.cache_write += other.cache_write;
        self.cache_read += other.cache_read;
    }

    /// What each kind grew by since `before`.
    fn grown_from(self, before: Parts) -> Parts {
        Parts {
            input: self.input.saturating_sub(before.input),
            output: self.output.saturating_sub(before.output),
            cache_write: self.cache_write.saturating_sub(before.cache_write),
            cache_read: self.cache_read.saturating_sub(before.cache_read),
        }
    }

    fn max(self, other: Parts) -> Parts {
        Parts {
            input: self.input.max(other.input),
            output: self.output.max(other.output),
            cache_write: self.cache_write.max(other.cache_write),
            cache_read: self.cache_read.max(other.cache_read),
        }
    }
}

/// Where tokens went: their quarter hour, the model, and the folder and git branch it worked in.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Default)]
pub(crate) struct Spot {
    /// Unix seconds / `SPOT_SECS`.
    pub slot: i64,
    pub model: String,
    pub cwd: String,
    pub branch: String,
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
pub(crate) struct FileScan {
    len: u64,
    offset: u64,
    /// Tokens by where they went.
    pub spots: HashMap<Spot, Parts>,
    /// Claude writes a line per content block of a message, each with the message's usage so far:
    /// the message being read, where it was counted and the tokens counted for it.
    message: Option<(String, Spot, Parts)>,
    /// Codex 0.40+ writes a `token_usage_record` per model response. Older logs only have
    /// `token_count` events, repeated with an unchanged total.
    records: bool,
    last_total: Option<u64>,
    /// Codex names the folder and branch once per session (`session_meta`) and the model and folder
    /// per turn (`turn_context`); a response record names its turn. A sub-agent's or fork's log
    /// starts with its own `session_meta` and then repeats its parent's: only the first counts.
    meta: bool,
    branch: String,
    turns: HashMap<String, (String, String)>,
    turn: (String, String),
}

#[derive(Deserialize)]
struct Line {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    timestamp: String,
    #[serde(default)]
    cwd: String,
    #[serde(rename = "gitBranch", default)]
    git_branch: String,
    message: Option<Message>,
    payload: Option<Payload>,
}

#[derive(Deserialize)]
struct Message {
    #[serde(default)]
    id: String,
    #[serde(default)]
    model: String,
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
    #[serde(default)]
    turn_id: String,
    #[serde(default)]
    model: String,
    #[serde(default)]
    cwd: String,
    git: Option<CodexGit>,
}

#[derive(Deserialize)]
struct CodexGit {
    #[serde(default)]
    branch: String,
}

#[derive(Deserialize)]
struct CodexInfo {
    total_token_usage: Option<CodexTokens>,
    last_token_usage: Option<CodexTokens>,
}

#[derive(Deserialize)]
struct CodexTokens {
    total_tokens: Option<u64>,
    input_tokens: Option<u64>,
    cached_input_tokens: Option<u64>,
    cache_write_input_tokens: Option<u64>,
    output_tokens: Option<u64>,
}

impl CodexTokens {
    /// OpenAI counts cached and cache-write tokens inside `input_tokens` (and reasoning inside
    /// `output_tokens`), so the kinds add up to `total_tokens`.
    fn parts(&self) -> Parts {
        let cache_read = self.cached_input_tokens.unwrap_or(0);
        let cache_write = self.cache_write_input_tokens.unwrap_or(0);
        let mut parts = Parts {
            input: self
                .input_tokens
                .unwrap_or(0)
                .saturating_sub(cache_read + cache_write),
            output: self.output_tokens.unwrap_or(0),
            cache_write,
            cache_read,
        };
        // A log that only gives the total.
        if parts.total() == 0 {
            parts.input = self.total_tokens.unwrap_or(0);
        }
        parts
    }
}

fn slot_of(timestamp: &str) -> Option<i64> {
    let at = time::OffsetDateTime::parse(timestamp, &Rfc3339).ok()?;
    Some(at.unix_timestamp().div_euclid(SPOT_SECS))
}

fn bump(spots: &mut HashMap<Spot, Parts>, spot: Spot, parts: Parts) {
    if parts.total() > 0 {
        spots.entry(spot).or_default().add(parts);
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
        // Most lines are conversation text: parse only the ones that can carry usage or say where
        // the work happens.
        let wanted = match log {
            Log::Claude => text.contains("\"usage\"") && text.contains("\"assistant\""),
            Log::Codex => {
                text.contains("token_usage_record")
                    || text.contains("\"token_count\"")
                    || text.contains("\"turn_context\"")
                    || text.contains("\"session_meta\"")
            }
        };
        if !wanted {
            return;
        }
        let Ok(line) = serde_json::from_str::<Line>(text) else {
            return;
        };
        match log {
            Log::Claude => {
                let Some(slot) = slot_of(&line.timestamp) else {
                    return;
                };
                let Some(Message {
                    id,
                    model,
                    usage: Some(usage),
                }) = line.message
                else {
                    return;
                };
                if line.kind != "assistant" {
                    return;
                }
                let parts = Parts {
                    input: usage.input_tokens.unwrap_or(0),
                    output: usage.output_tokens.unwrap_or(0),
                    cache_write: usage.cache_creation_input_tokens.unwrap_or(0),
                    cache_read: usage.cache_read_input_tokens.unwrap_or(0),
                };
                // A later block of the same message: count only what its usage grew by.
                // shortcut: a message a resumed or forked session copied into its own file counts
                // again there (~0.2% of tokens here); dedupe across files if that ever shows.
                if let Some((_, spot, counted)) = self
                    .message
                    .as_mut()
                    .filter(|(current, ..)| !id.is_empty() && *current == id)
                {
                    let more = parts.grown_from(*counted);
                    *counted = counted.max(parts);
                    let spot = spot.clone();
                    bump(&mut self.spots, spot, more);
                } else {
                    let spot = Spot {
                        slot,
                        model,
                        cwd: line.cwd,
                        branch: line.git_branch,
                    };
                    bump(&mut self.spots, spot.clone(), parts);
                    self.message = Some((id, spot, parts));
                }
            }
            Log::Codex => {
                let Some(payload) = line.payload else {
                    return;
                };
                if line.kind == "session_meta" {
                    if !self.meta {
                        self.meta = true;
                        self.branch = payload.git.map(|git| git.branch).unwrap_or_default();
                        self.turn.1 = payload.cwd;
                    }
                    return;
                }
                if line.kind == "turn_context" {
                    let cwd = if payload.cwd.is_empty() {
                        self.turn.1.clone()
                    } else {
                        payload.cwd
                    };
                    self.turn = (payload.model, cwd);
                    if !payload.turn_id.is_empty() {
                        self.turns.insert(payload.turn_id, self.turn.clone());
                    }
                    return;
                }
                let Some(slot) = slot_of(&line.timestamp) else {
                    return;
                };
                // Several agents can write to one log: a record goes with its own turn.
                let (model, cwd) = self
                    .turns
                    .get(&payload.turn_id)
                    .unwrap_or(&self.turn)
                    .clone();
                let spot = Spot {
                    slot,
                    model,
                    cwd,
                    branch: self.branch.clone(),
                };
                if line.kind == "token_usage_record" {
                    self.records = true;
                    let parts = payload.usage.map(|u| u.parts()).unwrap_or_default();
                    bump(&mut self.spots, spot, parts);
                } else if !self.records && payload.kind == "token_count" {
                    let Some(info) = payload.info else {
                        return;
                    };
                    let total = info.total_token_usage.and_then(|t| t.total_tokens);
                    if total.is_some() && total == self.last_total {
                        return;
                    }
                    self.last_total = total;
                    let parts = info.last_token_usage.map(|t| t.parts()).unwrap_or_default();
                    bump(&mut self.spots, spot, parts);
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

/// Each log folder's files as read so far: those any window asked for while the app runs (the
/// heatmap's four weeks, the projects list's month back to the start of the last one).
fn scans() -> &'static Mutex<HashMap<PathBuf, HashMap<PathBuf, FileScan>>> {
    static SCANS: OnceLock<Mutex<HashMap<PathBuf, HashMap<PathBuf, FileScan>>>> = OnceLock::new();
    SCANS.get_or_init(Default::default)
}

/// Brings each log under `dirs` written to since `since` up to date and hands its scan to `visit`;
/// returns how many logs couldn't be read.
pub(crate) fn scan_logs(
    log: Log,
    dirs: &[PathBuf],
    since: SystemTime,
    mut visit: impl FnMut(&FileScan),
) -> usize {
    let mut scans: MutexGuard<'_, _> = scans().lock().unwrap_or_else(|e| e.into_inner());
    let mut unreadable = 0;
    for dir in dirs {
        let mut files = Vec::new();
        log_files(dir, MAX_DEPTH, since, &mut files, &mut unreadable);
        let folder = scans.entry(dir.clone()).or_default();
        // A log outside this window stays for a wider one; a deleted one (Claude Code drops
        // transcripts after 30 days) goes.
        let listed: std::collections::HashSet<&PathBuf> =
            files.iter().map(|(path, _)| path).collect();
        folder.retain(|path, _| listed.contains(path) || path.exists());
        for (path, len) in files {
            let scan = folder.entry(path.clone()).or_default();
            if len != scan.len {
                if let Err(e) = scan.update(&path, len, log) {
                    note(&mut unreadable, &path, &e);
                }
            }
            visit(scan);
        }
    }
    unreadable
}

/// Tokens per quarter hour over the last four weeks, and how many logs couldn't be read.
fn heatmap(log: Log, dirs: &[PathBuf], now: SystemTime) -> Heatmap {
    let since = now - Duration::from_secs(DAYS as u64 * 86_400);
    let first_slot = now
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64 / SLOT_SECS)
        - DAYS * 86_400 / SLOT_SECS;
    let mut totals: HashMap<i64, u64> = HashMap::new();
    let unreadable = scan_logs(log, dirs, since, |scan| {
        for (spot, parts) in &scan.spots {
            let quarter = (spot.slot * SPOT_SECS).div_euclid(SLOT_SECS);
            if quarter > first_slot {
                *totals.entry(quarter).or_default() += parts.total();
            }
        }
    });
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

    /// The heatmap's quarter hour of a timestamp.
    fn slot(timestamp: &str) -> i64 {
        (slot_of(timestamp).unwrap() * SPOT_SECS).div_euclid(SLOT_SECS)
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

    fn spots(log: Log, root: &Path) -> HashMap<(String, String, String), Parts> {
        let mut out = HashMap::new();
        let unreadable = scan_logs(log, &[root.to_path_buf()], UNIX_EPOCH, |scan| {
            for (spot, parts) in &scan.spots {
                let key = (spot.model.clone(), spot.cwd.clone(), spot.branch.clone());
                out.entry(key).or_insert_with(Parts::default).add(*parts);
            }
        });
        assert_eq!(unreadable, 0);
        out
    }

    fn key(model: &str, cwd: &str, branch: &str) -> (String, String, String) {
        (model.into(), cwd.into(), branch.into())
    }

    #[test]
    fn keeps_each_claude_messages_model_folder_and_branch_by_kind() {
        let root = temp_dir("claude-spots");
        let file = root.join("session.jsonl");
        let line = |id: &str, branch: &str, output: u64| {
            serde_json::json!({
                "type": "assistant", "timestamp": "2026-02-04T09:15:00Z", "cwd": "C:/work/shop", "gitBranch": branch,
                "message": { "id": id, "model": "opus", "usage": { "input_tokens": 10, "cache_creation_input_tokens": 100,
                    "cache_read_input_tokens": 1000, "output_tokens": output } }
            })
            .to_string()
                + "\n"
        };
        append(&file, &line("m1", "main", 5));
        append(&file, &line("m1", "main", 20));
        append(&file, &line("m2", "KST-1-fix", 1));
        let found = spots(Log::Claude, &root);
        let part = |input, output, cache_write, cache_read| Parts {
            input,
            output,
            cache_write,
            cache_read,
        };
        assert_eq!(
            found[&key("opus", "C:/work/shop", "main")],
            part(10, 20, 100, 1000)
        );
        assert_eq!(
            found[&key("opus", "C:/work/shop", "KST-1-fix")],
            part(10, 1, 100, 1000)
        );
    }

    #[test]
    fn codex_puts_each_response_with_its_turns_model_and_the_sessions_branch() {
        let root = temp_dir("codex-spots");
        let file = root.join("rollout.jsonl");
        let line = |kind: &str, payload: serde_json::Value| {
            serde_json::json!({ "timestamp": "2026-02-04T09:00:00Z", "type": kind, "payload": payload }).to_string()
                + "\n"
        };
        append(
            &file,
            &line(
                "session_meta",
                serde_json::json!({ "cwd": "C:/one", "git": { "branch": "dev" } }),
            ),
        );
        append(
            &file,
            &line(
                "turn_context",
                serde_json::json!({ "turn_id": "t1", "model": "gpt-a", "cwd": "C:/one/sub" }),
            ),
        );
        append(
            &file,
            &line(
                "turn_context",
                serde_json::json!({ "turn_id": "t2", "model": "gpt-b" }),
            ),
        );
        // Interleaved agents: the first record belongs to the earlier turn.
        append(
            &file,
            &line(
                "token_usage_record",
                serde_json::json!({ "turn_id": "t1",
            "usage": { "input_tokens": 100, "cached_input_tokens": 40, "output_tokens": 10, "total_tokens": 110 } }),
            ),
        );
        append(
            &file,
            &line(
                "token_usage_record",
                serde_json::json!({ "turn_id": "t2",
            "usage": { "input_tokens": 5, "output_tokens": 5, "total_tokens": 10 } }),
            ),
        );
        let found = spots(Log::Codex, &root);
        assert_eq!(
            found[&key("gpt-a", "C:/one/sub", "dev")],
            Parts {
                input: 60,
                output: 10,
                cache_write: 0,
                cache_read: 40
            }
        );
        assert_eq!(found[&key("gpt-b", "C:/one/sub", "dev")].total(), 10);
    }

    #[test]
    fn codex_keeps_a_logs_first_session_meta_and_its_turns_across_reads() {
        let root = temp_dir("codex-meta");
        let file = root.join("rollout.jsonl");
        let line = |kind: &str, payload: serde_json::Value| {
            serde_json::json!({ "timestamp": "2026-02-04T09:00:00Z", "type": kind, "payload": payload })
                .to_string()
                + "\n"
        };
        // A sub-agent's log: its own session first, then its parent's (another folder, no git).
        append(
            &file,
            &line(
                "session_meta",
                serde_json::json!({ "id": "child", "cwd": "C:/one", "git": { "branch": "feat/x" } }),
            ),
        );
        append(
            &file,
            &line(
                "session_meta",
                serde_json::json!({ "id": "parent", "cwd": "C:/other" }),
            ),
        );
        append(
            &file,
            &line(
                "turn_context",
                serde_json::json!({ "turn_id": "t1", "model": "gpt-a" }),
            ),
        );
        assert!(spots(Log::Codex, &root).is_empty());
        // The response lands in a later read.
        append(
            &file,
            &line(
                "token_usage_record",
                serde_json::json!({ "turn_id": "t1",
            "usage": { "input_tokens": 7, "output_tokens": 3, "total_tokens": 10 } }),
            ),
        );
        let found = spots(Log::Codex, &root);
        assert_eq!(found.len(), 1);
        assert_eq!(found[&key("gpt-a", "C:/one", "feat/x")].total(), 10);
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
