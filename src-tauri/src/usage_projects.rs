//! What each project cost a Claude or Codex login over a month, for the projects list on its detail
//! page. Tokens come from the CLI's own logs (`usage_heatmap::scan_logs`), each with the folder and
//! git branch it was spent in; dollars from ccusage's daily report, the same source as the card's
//! totals, shared out by what each project's tokens cost. Nothing leaves the PC.

use crate::usage_heatmap::{scan_logs, Log, Parts, SLOT_SECS};
use crate::AppState;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, UNIX_EPOCH};

#[derive(Serialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Projects {
    /// Whether ccusage priced the month; without it only tokens are known.
    priced: bool,
    /// Unpriced because no bun or Node.js was found to run ccusage (else ccusage failed this time).
    no_runner: bool,
    total_cost: f64,
    total_tokens: u64,
    /// Dollars ccusage counted for models the logs don't show this month.
    unattributed_cost: f64,
    /// Most expensive first (most tokens first when unpriced).
    projects: Vec<Project>,
    /// Log files and folders that couldn't be read.
    unreadable: usize,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    /// The repository's folder name (empty when the logs don't name a folder).
    name: String,
    path: String,
    cost: f64,
    tokens: u64,
    branches: Vec<Branch>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    name: String,
    /// The first `ABC-123` in the branch name.
    ticket: Option<String>,
    cost: f64,
    tokens: u64,
}

/// Tokens by model, folder and branch.
type Usage = HashMap<(String, String, String), Parts>;

/// What a token of each kind costs next to an uncached input token. Anthropic and OpenAI price their
/// models in these ratios (Anthropic's 5-minute cache writes, OpenAI's GPT-5 family), so sharing a
/// model's dollars by them is exact but for 1-hour cache writes and long-context rates.
fn weight(log: Log, parts: &Parts) -> f64 {
    let (output, cache_write, cache_read) = match log {
        Log::Claude => (5.0, 1.25, 0.1),
        Log::Codex => (8.0, 1.0, 0.1),
    };
    parts.input as f64
        + parts.output as f64 * output
        + parts.cache_write as f64 * cache_write
        + parts.cache_read as f64 * cache_read
}

/// ccusage's dollars for the month by model. Its Codex report has no per-model dollars: those are
/// kept under "" and shared out over every model's tokens.
fn month_costs(report: &serde_json::Value) -> Option<HashMap<String, f64>> {
    if report["status"] != "ok" {
        return None;
    }
    let mut costs: HashMap<String, f64> = HashMap::new();
    for day in report["data"]["daily"].as_array()? {
        match day["modelBreakdowns"].as_array() {
            Some(models) => {
                for model in models {
                    let name = model["modelName"].as_str().unwrap_or_default();
                    *costs.entry(name.to_string()).or_default() +=
                        model["cost"].as_f64().unwrap_or(0.0);
                }
            }
            // Codex's day total, or a Claude report without its per-model rows.
            None => {
                *costs.entry(String::new()).or_default() += day["costUSD"]
                    .as_f64()
                    .or(day["totalCost"].as_f64())
                    .unwrap_or(0.0)
            }
        }
    }
    Some(costs)
}

/// `a\b\..\c` → `a\c`, without touching the disk.
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other),
        }
    }
    out
}

/// The repository a folder belongs to (a worktree, and a submodule, go with the checkout whose
/// `.git` holds theirs), else the folder. A network path (`\\server\…`, a WSL distro's
/// `\\wsl.localhost\…`) isn't looked into: that can wait on the network or start a stopped distro.
fn repository_of(cwd: &str) -> PathBuf {
    let start = Path::new(cwd);
    if cwd.starts_with(r"\\") || cwd.starts_with("//") {
        return start.to_path_buf();
    }
    for dir in start.ancestors() {
        let git = dir.join(".git");
        if git.is_dir() {
            return dir.to_path_buf();
        }
        if git.is_file() {
            // `gitdir: <main checkout>/.git/worktrees/<name>`, or relative (`../.git/modules/<name>`).
            let main = std::fs::read_to_string(&git).ok().and_then(|text| {
                let gitdir = normalize(&dir.join(text.trim().strip_prefix("gitdir:")?.trim()));
                let dot_git = gitdir
                    .ancestors()
                    .find(|p| p.file_name() == Some(".git".as_ref()))?;
                dot_git.parent().map(Path::to_path_buf)
            });
            return main.unwrap_or_else(|| dir.to_path_buf());
        }
    }
    start.to_path_buf()
}

/// `repository_of`, looked up once per folder while the app runs (the list refreshes every few
/// minutes; a drive that has gone offline would make each lookup wait).
fn repository_cached(cwd: &str) -> PathBuf {
    static FOUND: std::sync::OnceLock<Mutex<HashMap<String, PathBuf>>> = std::sync::OnceLock::new();
    let found = FOUND.get_or_init(Default::default);
    if let Some(root) = found.lock().unwrap_or_else(|e| e.into_inner()).get(cwd) {
        return root.clone();
    }
    let root = repository_of(cwd);
    found
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(cwd.to_string(), root.clone());
    root
}

/// The folder ccusage is pointed at: where the card's last probe pointed it (the plugin knows which
/// login works), else as the plugins usually do: Codex at the first folder holding its login (else
/// at its own default home, the last folder), Claude at a folder set apart from the usual
/// `~/.claude` (`CLAUDE_CONFIG_DIR`, an extra account). None leaves ccusage to its own defaults.
fn ccusage_home(
    log: Log,
    dirs: &[PathBuf],
    login_file: &str,
    probed: Option<Option<String>>,
) -> Option<PathBuf> {
    if let Some(home) = probed {
        return home.map(PathBuf::from);
    }
    match log {
        Log::Codex => dirs
            .iter()
            .find(|dir| dir.join(login_file).is_file())
            .or(dirs.last())
            .cloned(),
        Log::Claude => {
            let usual = dirs::home_dir().map(|home| home.join(".claude"));
            dirs.first()
                .filter(|dir| Some(*dir) != usual.as_ref())
                .cloned()
        }
    }
}

fn ticket_of(branch: &str) -> Option<String> {
    static TICKET: std::sync::OnceLock<Option<regex_lite::Regex>> = std::sync::OnceLock::new();
    TICKET
        .get_or_init(|| regex_lite::Regex::new(r"[A-Z][A-Z0-9]+-[0-9]+").ok())
        .as_ref()?
        .find(branch)
        .map(|m| m.as_str().to_string())
}

/// Shares each model's dollars out over the projects and branches whose tokens it served.
fn share_out(
    log: Log,
    usage: &Usage,
    costs: Option<&HashMap<String, f64>>,
    repository: impl Fn(&str) -> PathBuf,
) -> Projects {
    // Dollars per weighted token, per model ("" = every model, for Codex).
    let mut weights: HashMap<&str, f64> = HashMap::new();
    let pooled = costs.is_some_and(|costs| costs.contains_key(""));
    for ((model, ..), parts) in usage {
        let key = if pooled { "" } else { model.as_str() };
        *weights.entry(key).or_default() += weight(log, parts);
    }
    let rate = |model: &str| -> f64 {
        let key = if pooled { "" } else { model };
        let cost = costs
            .and_then(|costs| costs.get(key))
            .copied()
            .unwrap_or(0.0);
        let weight = weights.get(key).copied().unwrap_or(0.0);
        if weight > 0.0 {
            cost / weight
        } else {
            0.0
        }
    };

    let mut repositories: HashMap<String, PathBuf> = HashMap::new();
    let mut grouped: HashMap<PathBuf, HashMap<&str, (f64, u64)>> = HashMap::new();
    for ((model, cwd, branch), parts) in usage {
        let root = repositories
            .entry(cwd.clone())
            .or_insert_with(|| {
                if cwd.is_empty() {
                    PathBuf::new()
                } else {
                    repository(cwd)
                }
            })
            .clone();
        let spent = grouped
            .entry(root)
            .or_default()
            .entry(branch.as_str())
            .or_default();
        spent.0 += weight(log, parts) * rate(model);
        spent.1 += parts.total();
    }

    let mut projects: Vec<Project> = grouped
        .into_iter()
        .map(|(root, branches)| {
            let mut branches: Vec<Branch> = branches
                .into_iter()
                .map(|(name, (cost, tokens))| Branch {
                    name: name.to_string(),
                    ticket: ticket_of(name),
                    cost,
                    tokens,
                })
                .collect();
            branches.sort_by(|a, b| b.cost.total_cmp(&a.cost).then(b.tokens.cmp(&a.tokens)));
            Project {
                name: root
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                path: root.to_string_lossy().into_owned(),
                cost: branches.iter().map(|b| b.cost).sum(),
                tokens: branches.iter().map(|b| b.tokens).sum(),
                branches,
            }
        })
        .collect();
    projects.sort_by(|a, b| {
        b.cost
            .total_cmp(&a.cost)
            .then(b.tokens.cmp(&a.tokens))
            .then(a.name.cmp(&b.name))
    });

    let total_cost: f64 = costs.map_or(0.0, |costs| costs.values().sum());
    let shared: f64 = projects.iter().map(|p| p.cost).sum();
    Projects {
        priced: costs.is_some(),
        no_runner: false,
        total_cost,
        total_tokens: projects.iter().map(|p| p.tokens).sum(),
        unattributed_cost: (total_cost - shared).max(0.0),
        projects,
        unreadable: 0,
    }
}

/// Tokens by model, folder and branch spent from `start_ms` up to `end_ms`.
fn month_usage(log: Log, dirs: &[PathBuf], start_ms: i64, end_ms: i64) -> (Usage, usize) {
    let (first, end) = (
        start_ms.div_euclid(1000 * SLOT_SECS),
        end_ms.div_euclid(1000 * SLOT_SECS),
    );
    let since = UNIX_EPOCH + Duration::from_millis(start_ms.max(0) as u64);
    let mut usage = Usage::new();
    let unreadable = scan_logs(log, dirs, since, |scan| {
        for (spot, parts) in &scan.spots {
            if spot.slot >= first && spot.slot < end {
                usage
                    .entry((spot.model.clone(), spot.cwd.clone(), spot.branch.clone()))
                    .or_default()
                    .add(*parts);
            }
        }
    });
    (usage, unreadable)
}

fn is_date(value: &str) -> bool {
    value.len() == 8 && value.bytes().all(|b| b.is_ascii_digit())
}

/// The projects of a Claude or Codex card's login (the usual one or an extra account) from
/// `start_ms` up to `end_ms`; `since`/`until` are the same month's first and last local day
/// (`YYYYMMDD`) for ccusage. Empty for other cards and for a WSL copy.
#[tauri::command]
pub async fn usage_projects(
    state: tauri::State<'_, Mutex<AppState>>,
    plugin_id: String,
    start_ms: i64,
    end_ms: i64,
    since: String,
    until: String,
) -> Result<Projects, String> {
    if !is_date(&since) || !is_date(&until) || end_ms <= start_ms {
        return Err("invalid month".into());
    }
    let source = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let plugin = state.plugins.iter().find(|p| p.manifest.id == plugin_id);
        match plugin.and_then(crate::login_stamp::cli_dirs) {
            Some(("claude", dirs, file)) => Some((Log::Claude, dirs, file, "projects", "claude")),
            Some(("codex", dirs, file)) => Some((Log::Codex, dirs, file, "sessions", "codex")),
            _ => None,
        }
    };
    let Some((log, dirs, login_file, folder, provider)) = source else {
        return Ok(Projects::default());
    };
    let probed = crate::plugin_engine::host_api::last_ccusage_home(&plugin_id);
    tauri::async_runtime::spawn_blocking(move || {
        let home = ccusage_home(log, &dirs, login_file, probed);
        // The logs ccusage prices: the folder it is pointed at, else the CLI's own.
        let logs: Vec<PathBuf> = match &home {
            Some(home) => vec![home.join(folder)],
            None => dirs.iter().map(|dir| dir.join(folder)).collect(),
        };
        let (usage, unreadable) = month_usage(log, &logs, start_ms, end_ms);
        let report = crate::plugin_engine::host_api::ccusage_daily(
            // One cached report per month, so switching months doesn't run ccusage again.
            &format!("{plugin_id}:projects:{since}"),
            &plugin_id,
            provider,
            &since,
            &until,
            home.as_deref().map(|h| h.to_string_lossy()).as_deref(),
        );
        let report: serde_json::Value = serde_json::from_str(&report).unwrap_or_default();
        let costs = month_costs(&report);
        let mut projects = share_out(log, &usage, costs.as_ref(), repository_cached);
        projects.no_runner = report["status"] == "no_runner";
        projects.unreadable = unreadable;
        projects
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parts(input: u64, output: u64, cache_write: u64, cache_read: u64) -> Parts {
        Parts {
            input,
            output,
            cache_write,
            cache_read,
        }
    }

    fn usage(entries: &[(&str, &str, &str, Parts)]) -> Usage {
        entries
            .iter()
            .map(|(model, cwd, branch, parts)| {
                (
                    (model.to_string(), cwd.to_string(), branch.to_string()),
                    *parts,
                )
            })
            .collect()
    }

    // Folders map to repositories by their parent: `C:/work/shop/api` is in `C:/work/shop`.
    fn by_parent(cwd: &str) -> PathBuf {
        let path = Path::new(cwd);
        if path.ends_with("api") {
            path.parent().unwrap().to_path_buf()
        } else {
            path.to_path_buf()
        }
    }

    fn cents(usd: f64) -> i64 {
        (usd * 100.0).round() as i64
    }

    #[test]
    fn shares_each_models_dollars_by_what_each_projects_tokens_cost() {
        let usage = usage(&[
            // Opus: 100 + 5*20 = 200 weighted for shop/main, 100 + 0.1*1000 = 200 for blog.
            ("opus", "C:/work/shop", "main", parts(100, 20, 0, 0)),
            (
                "opus",
                "C:/work/blog",
                "KST-482-rate-limits",
                parts(100, 0, 0, 1000),
            ),
            // Sonnet only in a subfolder of shop: all of Sonnet's dollars go there.
            ("sonnet", "C:/work/shop/api", "main", parts(10, 0, 0, 0)),
        ]);
        let costs = HashMap::from([
            ("opus".to_string(), 8.0),
            ("sonnet".to_string(), 1.5),
            ("haiku".to_string(), 0.5),
        ]);
        let out = share_out(Log::Claude, &usage, Some(&costs), by_parent);

        assert!(out.priced);
        assert_eq!(cents(out.total_cost), 1000);
        assert_eq!(cents(out.unattributed_cost), 50); // haiku isn't in the logs this month
        assert_eq!(out.total_tokens, 100 + 20 + 100 + 1000 + 10);
        let names: Vec<_> = out
            .projects
            .iter()
            .map(|p| (p.name.as_str(), cents(p.cost)))
            .collect();
        assert_eq!(names, [("shop", 550), ("blog", 400)]);
        assert_eq!(
            out.projects[1].branches[0].ticket.as_deref(),
            Some("KST-482")
        );
        assert_eq!(out.projects[0].branches.len(), 1); // the subfolder's branch merged in
        assert_eq!(out.projects[0].tokens, 130);
    }

    #[test]
    fn pools_codex_dollars_and_lists_tokens_alone_when_unpriced() {
        let usage = usage(&[
            ("gpt-a", "C:/one", "dev", parts(100, 0, 0, 0)),
            ("gpt-b", "C:/two", "", parts(0, 100, 0, 0)),
        ]);
        // 100 vs 800 weighted.
        let costs = HashMap::from([(String::new(), 9.0)]);
        let out = share_out(Log::Codex, &usage, Some(&costs), |cwd| PathBuf::from(cwd));
        assert_eq!(
            out.projects
                .iter()
                .map(|p| cents(p.cost))
                .collect::<Vec<_>>(),
            [800, 100]
        );
        assert_eq!(cents(out.unattributed_cost), 0);

        let unpriced = share_out(Log::Codex, &usage, None, |cwd| PathBuf::from(cwd));
        assert!(!unpriced.priced);
        assert!(unpriced
            .projects
            .iter()
            .all(|p| p.cost == 0.0 && p.tokens == 100));
        assert_eq!(unpriced.projects[0].name, "one"); // tokens tie: by name
    }

    #[test]
    fn reads_ccusage_reports_with_and_without_per_model_dollars() {
        let claude = serde_json::json!({ "status": "ok", "data": { "daily": [
            { "date": "2026-11-01", "modelBreakdowns": [{ "modelName": "opus", "cost": 2.0 }, { "modelName": "haiku", "cost": 0.25 }] },
            { "date": "2026-11-02", "modelBreakdowns": [{ "modelName": "opus", "cost": 1.0 }] },
        ] } });
        let costs = month_costs(&claude).unwrap();
        assert_eq!((costs["opus"], costs["haiku"]), (3.0, 0.25));

        let codex = serde_json::json!({ "status": "ok", "data": { "daily": [
            { "date": "2026-09-20", "costUSD": 1.5, "models": { "gpt-a": { "inputTokens": 5 } } },
            { "date": "2026-09-21", "costUSD": 0.5 },
        ] } });
        assert_eq!(month_costs(&codex).unwrap()[""], 2.0);
        // A Claude report without per-model rows: its day totals, pooled.
        let totals = serde_json::json!({ "status": "ok", "data": { "daily": [{ "date": "2026-11-01", "totalCost": 4.5 }] } });
        assert_eq!(month_costs(&totals).unwrap()[""], 4.5);
        assert!(month_costs(&serde_json::json!({ "status": "no_runner" })).is_none());
    }

    #[test]
    fn finds_a_folders_repository_through_a_worktree() {
        let root = std::env::temp_dir().join(format!("openusage-projects-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let main = root.join("shop");
        std::fs::create_dir_all(main.join(".git").join("worktrees").join("feature")).unwrap();
        std::fs::create_dir_all(main.join("src").join("api")).unwrap();
        let worktree = root.join("shop-feature");
        std::fs::create_dir_all(worktree.join("docs")).unwrap();
        std::fs::write(
            worktree.join(".git"),
            format!(
                "gitdir: {}\n",
                main.join(".git")
                    .join("worktrees")
                    .join("feature")
                    .display()
            ),
        )
        .unwrap();

        assert_eq!(
            repository_of(&main.join("src").join("api").to_string_lossy()),
            main
        );
        assert_eq!(
            repository_of(&worktree.join("docs").to_string_lossy()),
            main
        );
        let loose = root.join("notes");
        assert_eq!(repository_of(&loose.to_string_lossy()), loose);

        // Relative `gitdir:` lines: a worktree made with `worktree.useRelativePaths`, a submodule.
        let relative = root.join("shop-relative");
        std::fs::create_dir_all(&relative).unwrap();
        std::fs::write(
            relative.join(".git"),
            "gitdir: ../shop/.git/worktrees/feature\n",
        )
        .unwrap();
        assert_eq!(repository_of(&relative.to_string_lossy()), main);
        let submodule = main.join("lib");
        std::fs::create_dir_all(main.join(".git").join("modules").join("lib")).unwrap();
        std::fs::create_dir_all(&submodule).unwrap();
        std::fs::write(submodule.join(".git"), "gitdir: ../.git/modules/lib\n").unwrap();
        assert_eq!(repository_of(&submodule.to_string_lossy()), main);

        // A network path is taken as it is, never looked into.
        let share = r"\\wsl.localhost\Ubuntu\home\me\app";
        assert_eq!(repository_of(share), PathBuf::from(share));
    }

    #[test]
    fn points_ccusage_where_the_plugins_do() {
        let root =
            std::env::temp_dir().join(format!("openusage-ccusage-home-{}", std::process::id()));
        let (config, dot) = (root.join(".config").join("codex"), root.join(".codex"));
        std::fs::create_dir_all(&config).unwrap();
        std::fs::create_dir_all(&dot).unwrap();
        std::fs::write(dot.join("auth.json"), "{}").unwrap();
        let codex = [config.clone(), dot.clone()];
        // Where the card's probe pointed ccusage wins: the plugin knows which login works.
        let probed = Some(Some(config.to_string_lossy().into_owned()));
        assert_eq!(ccusage_home(Log::Codex, &codex, "auth.json", probed), Some(config.clone()));
        assert_eq!(ccusage_home(Log::Codex, &codex, "auth.json", Some(None)), None);
        // Before any probe: the first folder holding the login, else Codex's own home (the last).
        assert_eq!(ccusage_home(Log::Codex, &codex, "auth.json", None), Some(dot.clone()));
        assert_eq!(ccusage_home(Log::Codex, &codex, "missing.json", None), Some(dot));
        // Claude: only a folder other than the usual ~/.claude.
        let usual = dirs::home_dir().unwrap().join(".claude");
        assert_eq!(
            ccusage_home(Log::Claude, &[usual], ".credentials.json", None),
            None
        );
        assert_eq!(
            ccusage_home(Log::Claude, &[root.clone()], ".credentials.json", None),
            Some(root)
        );
    }

    #[test]
    fn counts_the_quarter_hours_inside_the_month_only() {
        let root = std::env::temp_dir().join(format!("openusage-month-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let line = |id: &str, at: &str| {
            serde_json::json!({ "type": "assistant", "timestamp": at, "cwd": "C:/work/shop", "gitBranch": "main",
                "message": { "id": id, "model": "opus", "usage": { "input_tokens": 1, "output_tokens": 0 } } })
            .to_string()
                + "\n"
        };
        let text = [
            line("before", "2026-10-31T23:59:59Z"),
            line("first", "2026-11-01T00:00:00Z"),
            line("last", "2026-11-30T23:59:59Z"),
            line("after", "2026-12-01T00:00:00Z"),
        ]
        .concat();
        std::fs::write(root.join("session.jsonl"), text).unwrap();
        let ms = |at: &str| {
            time::OffsetDateTime::parse(at, &time::format_description::well_known::Rfc3339)
                .unwrap()
                .unix_timestamp()
                * 1000
        };
        let (usage, unreadable) = month_usage(
            Log::Claude,
            &[root],
            ms("2026-11-01T00:00:00Z"),
            ms("2026-12-01T00:00:00Z"),
        );
        assert_eq!(unreadable, 0);
        let total: u64 = usage.values().map(Parts::total).sum();
        assert_eq!(total, 2);
    }
}
