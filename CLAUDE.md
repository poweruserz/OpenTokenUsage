Read AGENTS.md first — it has the general rules (simplicity, error handling, PR checklist).
This file holds the project facts that are easy to get wrong.

## What this is
- OpenTokenUsage: **Windows-only** Tauri v2 tray app (React 19 + Tailwind v4 frontend, Rust host).
  Derived from `robinebers/openusage` (left GitHub's fork network 2026-09-28); there is no macOS build — don't add macOS code paths back.
- Upstream (`upstream` remote) is now a Swift macOS app. **Never `git merge upstream/main`.**
  Port provider fixes by hand: read `git show upstream/main:CHANGELOG.md`, compare the Swift
  provider in `upstream/main:Sources/OpenUsage/Providers/<X>/` with `plugins/<x>/plugin.js`.
  The last Tauri upstream is branch `upstream/tauri-legacy` (= v0.6.28).

## Plugins (providers)
- `plugins/<id>/plugin.js` runs in **a fresh QuickJS runtime per probe**: module-level variables
  do NOT survive between refreshes (vitest reuses one instance, so tests hide this). Persist
  anything cross-probe under `ctx.app.pluginDataDir` (see claude `live-plan.json`).
- A new install starts with every provider off and probes them all once (`use-provider-detection.ts`): a card
  turns on unless its error is one `isNotSetUpError` knows. So a plugin with nothing set up must throw such an
  error without a request (`plugins/not-set-up.test.js` checks every shipped plugin). Copilot needs a Copilot plan
  in its answer (its login is the GitHub CLI's, which any GitHub user has). The store key `providerDetectionPending`
  is set before the first settings save and cleared once every provider is decided, so a start cut short detects
  again. A plugin whose login is rejected must not throw a "not set up" message (use "Session expired …").
  Muse Code (`MANUAL_ONLY`) is never probed there: its only quota source is Meta's key endpoint, so only the user
  turns it on. Its plugin reads that endpoint at most every 5 minutes (Smart floor 5, `smartFloorMinutes`).
- Every line label a plugin can emit on the overview card must be declared `scope: "overview"` in
  `plugin.json`, or that account type gets a blank card (the card filters by manifest labels).
- Response bodies are logged (first 500 chars) after `redact_body` in
  `src-tauri/src/plugin_engine/host_api.rs` — on any new endpoint, add identity fields
  (email, name, uuid, ids) to the redaction list with a test.
- Host already handles: HTTP 429 backoff per plugin+URL (`plugin_engine/http_gate.rs`, saved to
  `http-gates.json` so it outlives a restart), probe timeout (30 s), one probe per plugin at a time,
  panics → error result. Don't re-implement in JS. Anthropic budgets usage-endpoint reads per login,
  shared with Claude Code's own reads, and answers one over it with Retry-After 3600: Smart
  refresh keeps Claude cards at ≥10 min (`smartFloorMinutes`), and the claude plugin itself reads at most
  once per 10 min whatever asks (restart, panel, manual refresh), returning the kept answer with
  `staleSince` in between. A 429 waits Retry-After but at least 5/10/20/30 min per 429 in a row (reset by a 2xx).
- Claude Code status-line bridge (`claude_statusline.rs`, Settings → Claude Code status line): writes a fixed
  `curl.exe` command into Claude's `settings.json` (never over the user's own `statusLine`; the other top-level
  entries keep their order and text) that posts Claude Code's statusLine JSON to `POST /v1/claude/statusline`.
  Only `rate_limits.five_hour/seven_day` are kept (`plugins_data/claude/statusline.json`). The plugin lays a
  snapshot under 5 min old over `last-usage.json` and then reads the API only every 30 min; a 429 shows the
  snapshot instead of the error. The command lives in Rust: the webview can only switch it on or off.
  Each post's `context_window.used_percentage` is kept in memory per `session_id` for the live sessions list.
- Live sessions (`claude_sessions.rs` `live_sessions`, `claude-sessions.tsx`): Claude cards list `<config dir>/sessions/*.json`
  whose pid still runs with the file's `procStart` (FILETIME as a decimal string; guards against a reused pid), polled every 5 s while
  shown. The config dir comes from `login_stamp::cli_dirs` (extra accounts use their own; never a WSL copy). Codex keeps
  no pid file: while N `codex.exe` run, the N newest `sessions/YYYY/MM/DD/*.jsonl` written in the last 6 h (7 newest day
  folders) over every Codex login are the sessions, each on the card whose folder holds it; the tail says idle (`task_complete`, `turn_aborted`, a `final_answer`) or busy (a newer user
  message or step, written in the last 10 min). `agent_activity` folds every card's sessions into "waiting" > "busy" for
  a dot on the strip's and widgets' logos (`useAgentActivity`, every 5 s while either shows, Windows success green / caution yellow).
  Both commands read files off the main thread (async + `spawn_blocking`).
- Codex Business answers `rate_limit: null`; its admin-set monthly cap is `spend_control.individual_limit` (`used_percent`,
  else `used`/`limit`, numbers or strings; reset `reset_at`, else `reset_after_seconds`): a "Monthly" line.
- Follow the active app (`foreground.rs`, `taskbarStripStyle.followActive`): its own thread reads the foreground window
  every 500 ms while on and emits `foreground:provider` (a base plugin id) once seen twice in a row; nothing on a window that
  matches none, so the last tool stays. Desktop apps by exe name; in a terminal, Claude Code's title glyph, else the newest
  AI CLI among the shell's descendants (Toolhelp; a node/bun runner by a whole word of its command line, read with
  `NtQueryInformationProcess` class 60; a shell's command line is never read). Windows Terminal runs every tab in one
  process, so with CLIs in two tabs the newest wins. The followed card goes first in the strip and widgets with both
  lines, each in detail: "Weekly 41% · 3d 4h" (name, number, time to reset; the line's `value` keeps the number alone for
  the hover text, and the strip draws again every minute while a card is followed). `stripPluginSettings`' `focusId`:
  the base id or an extra account `<id>-<8 hex>`, never a WSL copy or a provider sharing the prefix (kimi, kimi-api).
  Table after TaskbarQuota (MIT).
- Only while an AI tool runs (`taskbarStripStyle.onlyWhileRunning`, off by default): `running_ai_tools` matches every
  process against the same tables (desktop apps count: the Claude or ChatGPT app keeps the strip up) and leaves out
  our own children (the Codex probe runs `@ccusage/codex` on node); polled every 5 s while the strip is on. The strip
  hides (`useTaskbarStrip`'s `hidden`: no images to the host, the Settings preview still drawn) when no running tool
  is behind one of its cards (`stripToolRunning`, card matching as `followedCard`). Until the first answer it shows.
- Other tools' spend (`local_spend.rs`): the spend summary adds OpenCode (`opencode.db`, Zen/Go answers only), Z.ai's ZCode
  (`~/.zcode/cli/db/db.sqlite`, tokens only: a plan), Grok (`~/.grok/sessions/**/updates.jsonl`, `costUsdTicks`/1e10) and
  Cline's CLI (`~/.cline/data/sessions`, providers `cline`/`cline-pass`) as `local:<id>` sources; dollars only as each tool
  recorded them, no price list. The frontend sends local midnights (today, yesterday, 29 days back; Rust takes at most 32
  days, today's within 2 days of now); read every 5 min. Logs: the newest 2,000 of up to 50,000 entries walked.
- Early refill alert (`usage-alerts.ts`): a line that gives back ≥10 points (compared in tenths: floats) more than 2 min
  before its previous reset time (a reset credit, a banked grant) notifies once per window and level, unless the reset
  alert fired for that change. A line without a reset time never does: its monthly reset would look early.
- Desktop widgets' click-through (`desktopWidgets.clickThrough`): `WS_EX_TRANSPARENT` on every widget except while
  `clickThroughKey` (Ctrl, Alt or Shift) is held (a 100 ms thread timer runs only while the option is on).
- Every feature above has its switch in Settings: `alertSettings.refills`/`refillPoints` (5/10/20/30, Notifications),
  `taskbarStripStyle.followActive`/`followDetail`/`activityDots` (the strip and widgets' look), `desktopWidgets.clickThrough`/
  `clickThroughKey`, and `cardFeatures` (Usage → On the cards, in `BACKUP_KEYS`: `liveSessions`, `spend`, `spendToolsOff`;
  a tool left out is passed to no reader: `local_spend` reads only the `tools` it is given). A Codex "Monthly" row hides
  with the card's line layout like any row. `cardFeatures.sessionsOnOverview` off keeps live sessions to a card's detail
  page: the overview's cards then read none (`useClaudeSessions(pluginId, wanted)`). A session row's state, cache
  countdown and context fill are set apart by a middle dot.
- After token-monitor (github.com/Javis603/token-monitor, MIT), each with its switch:
  - Live sessions also show a Claude session's prompt-cache countdown (`claude_cache_expiry`: the last assistant
    message's `ephemeral_5m`/`ephemeral_1h` write, a compaction resets it) and a Codex session's context fill (last
    `token_count`: `last_token_usage.total_tokens` over `model_context_window`, 12k baseline) (`cacheTimer`, `contextFill`).
  - Plan multiple (`planPrices`, USD per card id, in `BACKUP_KEYS` via `mergeCardMap`): the spend summary shows a card's
    30 days at API prices ÷ its plan price.
  - Live token rate (`token_rates`: the last 4 whole minutes and the part of this one gone by, per minute;
    `taskbarStripStyle.tokenRate`, off by default, read only while the strip or widgets show, since its switch is
    there): after the first number on the strip and widgets, and lines (enabled cards only) in the tray tooltip, the
    "icon" style's too (the strip forces that style).
  - Year heatmap (`usage_year`, `year-heatmap.tsx`, detail section "year", starts closed: a `collapsedSections` saved
    before a section existed gets it closed, `detailSectionsSeen` records which existed). `keepUsage` keeps each *UTC*
    day's tokens in `usage-days-utc.json` (max ever seen), so days whose logs Claude Code deleted still count; a kept
    local day would move with DST or travel and the max would hold the moved hours on both days. A UTC day with no
    logs left fills the local day of the same date. Refreshed every 6 h panel open or not. Claude's
    `cleanupPeriodDays` (30 when unset) is set from Settings → Claude Code (`set_claude_log_retention`: 30/90/370,
    kept in place through `claude_statusline.rs`'s `Entries`).
  - Usage export (`export_usage`): daily tokens per card + latest limits as CSV (BOM, formula-safe) and JSON in Downloads;
    `autoExport` writes it once a day.
  - Custom balances (`config.rs` `balances` in `~/.openusage/config.json`, at most 5, each checked in Rust; the
    `custom-balance` plugin reads them): New API account (`/api/user/self`, `New-Api-User`), New API key
    (`/api/usage/token/`), quota ÷ `/api/status` `quota_per_unit` (500000 default), Sub2API (`/api/v1/auth/me`), or a
    custom GET path with dot paths, divisor and currency. Only the key's environment-variable name is stored, and it
    must start with `OTU_`: plugins read only `WHITELISTED_ENV_VARS`, and `inject_env` adds these names for
    `custom-balance` alone (else a webview script could save ANTHROPIC_API_KEY with its own address). Their identity
    fields are in `redact_body`; `display_name` only next to a `username` (Claude's models use it too). A failed
    account's line says why without words (`OTU_X ✕`, `HTTP 401`, `?`, `✕`); `tLabel` turns "Balance 2" into the
    translated "Balance" plus its number.
  - Edge dock: widget layout `edge` = one rail (`edge-rail.ts`: today's spend from `useTodaySpend`, each provider's
    logo in a ring, the summed token rate, a refresh button) against the `desktopWidgets.edgeSide` edge (right, left or
    top; the `side` option) of the outermost monitor that way (`edge_monitor`), tucked to a 6 px sliver and slid out while
    hovered (`edge_spot`; over `slideMs` with a cubic ease-out on both axes, `slide_pos`, driven by a window timer
    `SLIDE_TIMER` that recomputes the target each frame); never dragged, a press is a click, never faded,
    always on top and never click-through (forced in `set_desktop_widgets`). On the top edge the rail is drawn
    `horizontal` (each section a 64 px column side by side). Two `EDGE_BUTTON`-logical-px slots end the rail, under it
    or right of it on top (the same constant in `edge-rail.ts` and `desktop.rs`, `edge_button` along y, or x on top):
    a click in the last one emits `desktop-widgets:refresh`, in the one before `desktop-widgets:pin`, instead of opening the panel. The pin
    toggles `desktopWidgets.edgePinned` (also a Settings switch; the frontend saves it); pinned, the `pinned` option
    keeps the dock out (`draw`) and the pointer leaving doesn't tuck it. An incremental `driver build` doesn't copy
    a new plugin folder into `target/release/resources`: copy it by hand for a local check (CI builds clean).
  - tokscale (`tokscale.rs`, `cardFeatures.tokscale`, off by default): `tokscale@4.23.0 graph --since --client` through
    ccusage's runners (`host_api::run_npm_package`), only tools no card or `local_spend` reader counts; a run takes
    ~20 s, so its answer (or failure) is kept 30 min. An unknown `--client` id fails the whole run: check new ids
    against `tokscale --help`. Never add `cursor` or `amp`: asked for them, tokscale copies the Cursor app's login and
    downloads the account's usage (a bot on that account showed up as `grok-bot-*` spend), or runs Amp to download
    threads; only tools with records on this PC are asked for.
- Usage heatmap (`usage_heatmap.rs`, `usage-heatmap.tsx`): a Claude or Codex login's detail page shows tokens per
  weekday × local hour over 4 weeks (whole weeks: every cell adds up as many days), from the CLI's own logs
  (`projects/**/*.jsonl`, `sessions/**/*.jsonl`) in the `cli_dirs` folders. Only usage and timestamps are read. Logs
  only grow, so each file is read once and then from its last offset (kept in memory: the first read after a start
  takes seconds on GBs of logs). A file's size comes from `fs::metadata`, not the folder listing: Windows' listing keeps
  the size a file had when last closed, and a CLI can hold its log open. Claude writes a line per content block, each
  with the message's usage so far: a message counts once, at its largest. Codex counts `token_usage_record` lines (one
  per response); older logs only have `token_count`, a repeat with an unchanged total skipped. The scan keeps usage per
  minute (`SPOT_SECS`, so a weekly limit is cut at its reset minute) and the grid gets UTC quarter hours (`SLOT_SECS`),
  so half-hour time zones land in the right local hour; logs it can't read are counted under the grid.
  The detail page reuses the component across cards, so its data is kept with the card id it was read for. The grid
  is an ARIA grid: one tab stop, arrow keys move, the focused cell's tokens show in the header.
- Usage by project (`usage_projects.rs`, `usage-projects.tsx`): the same scan (`scan_logs`, shared cache) keeps each
  message's tokens by kind with its model, folder (`cwd`) and git branch (Claude: per line; Codex: the log's *first*
  `session_meta` (a sub-agent's log repeats its parent's after its own), model and folder per `turn_context`, a record
  going with its `turn_id`). Dollars are ccusage's daily report for the month (`host_api::ccusage_daily`: its own lock,
  never the probes' guard, one cached report per month for 15 min; pointed where the card's last probe pointed it,
  `last_ccusage_home`, since the plugin knows which login folder works), shared
  out per model (Codex's report has only day totals: pooled) by tokens weighted at the providers' price ratios, so
  projects add up to ccusage's total. A folder maps to its repository (walk up to `.git`; a `.git` file's `gitdir`,
  normalized, to the checkout holding it), looked up once per folder; network paths (`\\…`) are never looked into.
  Month bounds come from the frontend (local time); `HEAD` means no branch. The Weekly limit view passes the card's
  weekly window (reset time to the minute: Claude's moves by milliseconds) and the whole local days ccusage prices
  around it as `price_start_ms`/`price_end_ms` (`priced_days` checks them): `share_out` sets each model's rate from
  the whole days' tokens and shares only the window's.
  Budgets (`project-budgets.ts`, setting `projectBudgets`: USD per card id and project path, in `BACKUP_KEYS` via
  `mergeCardMap`): the bar turns yellow at 80% and red at 100%; `use-project-budget-alerts.ts` checks enabled cards
  with a budget every 15 min, panel open or not, and notifies at 80% and 100% once per project and month (keys in
  `sentProjectAlerts`, apart from `sentUsageAlerts`, which `use-usage-alerts.ts` rewrites from memory; the key holds
  the budget, so a corrected one alerts again). A typed budget is read in the app language's style (`parseAmount`:
  `5.000` is five thousand in Turkish), and Save re-reads the budgets from disk before writing. Forecast = spend ×
  month length ÷ time elapsed, after the first day. CSV: built in the frontend (it has the currency), written by
  `export_projects_csv` to Downloads under a validated fixed name, with a BOM; formula-like cells start with `'`; `;`
  and decimal commas when the language writes decimals with a comma (Excel splits on the system list separator);
  costs empty when the month is unpriced.
- Paths: `~/Library/Application Support/<X>` is mapped to `%APPDATA%\<X>` by `expand_path`.
  SQLite goes through bundled `rusqlite` (no `sqlite3` CLI); no `ps`/`lsof`/`security` on Windows.
- Release builds run only the bundled plugins (copied to `%APPDATA%\com.poweruserz.opentokenusage\plugins`);
  the repo's `plugins/` is picked up from the cwd in **debug builds only** (`#[cfg(debug_assertions)]`
  in `plugin_engine/mod.rs`) — never make that path reachable in release. Plugin ids must match
  `[a-z0-9-]`; `entry` and `icon` must stay inside the plugin folder.
- Host HTTP caps response bodies at 8 MB and honors `dangerouslyIgnoreTls` for loopback URLs only.
- `ctx.localDate` is today's local date (YYYY-MM-DD, `GetLocalTime`) for ledgers kept by local day (Qwen Code).
- Ollama, Kimi API, Codebuff, Kilo and Qwen Code follow Pane's reading (github.com/ItsJazii/pane, MIT): credit it in
  the plugin's header comment and its docs page when porting more.

- Extra accounts (`accounts.rs`, Claude and Codex): each lives in its own login folder
  (`<app data>/accounts/<id>`) and runs as a copy of the plugin under its own id (`claude-1a2b3c4d`),
  so everything keyed by plugin id works per account. The copy's `AccountBinding` overrides the CLI's
  home variable (`CLAUDE_CONFIG_DIR` / `CODEX_HOME`) in `ctx.host.env` and hides `CLAUDE_CODE_OAUTH_TOKEN`;
  ccusage uses the base id. Never copy the usual login's tokens into an account (a rotated refresh
  token logs the CLI out); sign-in goes through `start_account_login` (fixed commands, env set in Rust).
- WSL logins (`wsl.rs`): a plugin whose `plugin.json` has `wsl.login` gets a copy per login found in a
  *running* distro (`wsl.exe --list --running`, 5 s limit; a distro is never started): id
  `<plugin>-wsl-<8 hex>`, card `<Name> · WSL`. Its `AccountBinding.home` is the Linux home
  (`\\wsl.localhost\<distro>\home\<user>`: `~` resolves there, `~/Library/Application Support/X` →
  `~/.config/X`), `isolated_env` hides the whole Windows environment, and ccusage answers `no_runner`.
  Same-account check: each plugin's local-only `accountKey(ctx)` (the host hashes it); a WSL copy without a
  key isn't shown, one matching the usual login, an extra account or another WSL copy isn't either. Cards are
  saved in `wsl-accounts.json` after their first good probe; while the distro is stopped a card gets its
  cached data with `staleSince` (the UI shows that time). Logins are read and refreshed in place — never copy them.
  SQLite on the share always answers "database is locked", so `sqlite::query_json` reads it through its
  `immutable=1` fallback (UNC URI `file:////wsl.localhost/...`), which doesn't see the WAL.

## UI
- Windows 11 Fluent look: colors are tokens in `src/index.css` (`--accent-base` = Windows accent
  from the registry, `.backdrop` = Mica active → translucent layers). Use tokens, not hex colors.
- **i18n:** every UI string goes through `t("key")` (`src/lib/i18n.ts`); plugin line labels through
  `tLabel()`. `src/locales/en.ts` is the source; a new key must be added to **all 11 locale files**
  (TypeScript fails otherwise). Keep `{placeholders}` identical (checked by `locales.test.ts`).
  Never compare translated text in logic. The native tray menu gets its labels from the frontend
  (`set_tray_menu_labels`).
- **Translation rule (always):** whenever a feature adds or changes user-facing text, update the
  key in **all 11 languages in the same change**: `src/locales/*.ts` for UI, plus
  `src/locales/plugin-errors/*.ts` for plugin errors. Rewording the English means rewording every
  language, and never paste English into another locale. `translation-lock.test.ts` fails when
  English text changes; after translating everything, run `bun run locales:lock`. Never re-lock
  without translating first.
- Errors the user clears (sign in, open an app, a key: `isActionNeededError`, `plugin-errors.ts`) show grey with an
  info icon; red stays for failures (network, HTTP, a changed response, a crash). A card that asks for a sign-in
  (`needsSignIn`) also gets "Signed out · Sign in" in Settings → Providers (`loginFix`, the card button's click).
- Claude desktop app (`plugin_engine/claude_desktop.rs`, `claudeDesktopLogin`, on by default, Settings → Claude Code):
  without a Claude Code login, the usual Claude card reads usage with the app's `oauth:tokenCacheV2` (safeStorage, as
  Cursor's). Read only: the host passes the token, expiry, plan and account id, never the refresh token; the plugin
  never refreshes it (that would sign the app out) and asks to open Claude once it expires. The Codex app shares the
  CLI's `~/.codex`, so it needs nothing of the kind.
- Errors: `getPluginErrorAction` turns known errors into one-click fixes: a login command →
  `run_in_terminal` (Rust allow-list in `setup_actions.rs`, test-synced with the plugin fixtures),
  a missing API-key env var → the Windows Environment Variables dialog. Env vars are also read from
  the registry, so a key added while the app is running works on the next refresh. While a card shows a
  sign-in error (its fix is a login command), `use-login-recovery.ts` checks the CLI's login file time every
  5 s (`login_stamp.rs`: Claude and Codex in the folders their plugins read, and their extra accounts; never
  a WSL copy, whose share can start a stopped distro) and probes the card the moment it changes. The plugins
  rewrite that file when they refresh a token, so every card takes its time afresh after any card's probe
  (else a refresh that still ends in 401 chains probes, each rotating the login; two cards share a file when
  an extra account's folder is set as CLAUDE_CONFIG_DIR / CODEX_HOME). A card that
  worked in this run (not cached data) and loses its sign-in gets one toast per episode. Disabled cards are left alone.
- Tray metric: one setting, `trayMetric` (auto | Session | Weekly), drives bars, percent and tooltip.
  Tray provider `tightest` = "Most used" line across providers. `trayHiddenPlugins` keeps a provider
  in the nav but out of the tray. The tray icon color follows the *taskbar* theme, not the app theme:
  `window_style::watch_taskbar_theme` sends `taskbar:theme` the moment Windows switches it.
- Tray styles `numbers`/`logos` = one tray icon per provider (`use-provider-tray-icons.ts` draws,
  `tray::set_provider_tray_icons` shows them and hides the app icon). Update icons in place, never
  recreate (Windows keys "show next to clock" on tray-icon's creation-counter uID). A hidden tray
  icon rejects `setIcon`, so the app icon is redrawn after it's shown again. Our icons (the app icon
  too) are promoted via `HKCU\Control Panel\NotifyIconSettings\*\IsPromoted` only when the user hasn't
  chosen yet, matched by exe file name (Program Files paths are stored as `{GUID}\OpenTokenUsage\...`),
  retried for 30 s because Explorer writes the entry late. Explorer applies the value live.
- "New" badges (`new-features.ts`): a settings card added to in the last two releases names its entry
  (`<SettingsSection newFeature="…">`) and shows a slowly pulsing "New" pill, its group a dot, until that group
  was opened once (`seenNewFeatures`, per PC; the badges stay for the rest of that visit). When a release ships,
  drop entries older than the release before it: `new-features.test.ts` fails until then, and when an entry has no card.
- The taskbar strip is on unless the user turned it off or picked a tray style that shows numbers (`loadTaskbarStrip`:
  an unset key follows the tray style), so new installs and installs that never touched it get it.
- Taskbar strip (experimental, `taskbar_strip.rs`): layered child windows of `Shell_TrayWnd` (left of
  `TrayNotifyWnd`) and, per `taskbarStripStyle.monitors` ("primary" | "all" | picked `{id,name}`), of
  `Shell_SecondaryTrayWnd` (no tray window there: left of a fixed 88 px clock width). One thread owns
  them all (it shares Explorer's input queue: never block, never hold a lock across Win32 calls) and
  reconciles every 2 s, which also covers Explorer restarts and monitors coming and going. Monitor
  ids are model + connector UID from the display config (`monitor_id`; the middle of the device path
  changes between boots); a picked monitor that isn't connected falls back by model, then to the main
  taskbar. The frontend draws one image per taskbar DPI; the host asks for missing ones with the
  `taskbar-strip:dpis` event and meanwhile uses the nearest. Layered child windows need the Win8+ `<compatibility>` in
  `src-tauri/app.manifest` (wired in `build.rs`) — don't drop it. The frontend draws the image
  (`src/lib/taskbar-strip.ts`); its 1/255-alpha background keeps the whole strip clickable.
  Its look lives in `taskbarStripStyle` (fonts, colors, usage thresholds, and its own provider list
  and order, max 6, independent of the nav order; per provider both/session/weekly; color scales
  in `TASKBAR_STRIP_COLOR_SCALES`, "base" = the text color; `colorMode: "pace"` colors each line by its pace in the
  tray's `PACE_COLORS`, the text color when it has none; `colorMode` is "off" on a new install and stays "heat" on
  installs from 0.8.6 and older, decided once in `loadTaskbarStripStyle` by whether plugin settings were saved). A provider without a percent line (DeepSeek reports a balance) shows its
  first overview text line instead (`stripTextLabel`): in the text color, in the chosen currency, with no
  session/weekly choice. The strip and the tray styles that show numbers
  exclude each other: enabling the strip sets the tray to "icon", picking another style turns it off.
  A strip click opens the panel above the strip (`tray::toggle_panel_at`, via `run_on_main_thread`).
  Placement (`taskbar_strip/placement.rs`): Right = beside the tray; "left" = the free side away from it,
  the left edge, or the middle when `TaskbarAl` = 0 (icons left; Settings then labels it Center). The
  strip keeps to the gaps between the buttons that `taskbar_strip/uia.rs` measures every second with UI
  Automation (Windows 11's Start, Widgets and app buttons are XAML, no windows to measure), on its own
  thread because those calls wait on Explorer.
- Desktop widgets (`taskbar_strip/desktop.rs`, `use-desktop-widgets.ts`, setting `desktopWidgets`, in `BACKUP_KEYS`):
  the strip's providers, line modes and look drawn on a plate (`makeTaskbarStripSvg`'s `plate`, opacity per setting,
  1/255 at 0 % so it stays clickable), all joined in one window (`layout` "row" or "column") or one per provider
  ("separate"; an old `joined: false` reads as that), optionally with a bar under each percent (`bars`, filled to the
  share the number shows), as top-level layered tool
  windows on their own thread (not the strip's: a drag runs Windows' modal move loop). A press starts that loop
  (`WM_NCLBUTTONDOWN`/`HTCAPTION`); one that stayed within the system drag distance (`WM_MOVING`, SM_CXDRAG) is a
  click: the jitter is put back and the panel opens *beside* the widget and the ones it touches (`cluster`,
  `tray::toggle_panel_beside`), never above it, since widgets kept on top would cover the unpinned panel. Locked:
  a click only. `WM_MOVING` snaps past that distance to the work area and nearby widgets (`snap_offset`), from
  the drag's start rect plus the cursor's travel (`dragged`), never from the rect Windows proposes: that is the last
  rect handed back plus the mouse step, so a snap pulling each step back held the widget in place for good;
  `WM_EXITSIZEMOVE` after a real drag saves `desktopWidgetPositions` (id → outer top-left, physical px;
  host-written, per PC, not backed up). A new widget takes the first free slot up from the bottom-right corner.
  Topmost is set only when the option changes (re-applying HWND_NOTOPMOST would raise them over the user's
  windows on every redraw). White/black logos also pick the plate (dark/light); brand logos follow the taskbar
  theme. A shown percent that goes up (tracked per card + line label) blinks for 6 s, then keeps the Windows accent
  color for a minute: the frontend sends a highlighted image set with the time left, and the widget thread's own
  timer blinks between them (the hidden panel's page timers fire once a second). A scale or monitor change
  (`WM_DPICHANGED`/`WM_DISPLAYCHANGE`) emits `desktop-widgets:redraw` so the frontend draws the new scales.
  The pointer over a widget shows its hover text (`widgetTooltip`: each line's reset and, behind pace, run-out time;
  everything is drawn again every minute) in a comctl tooltip (`TTF_SUBCLASS`; `DarkMode_Explorer` on a dark plate),
  and fades a locked one (`UpdateLayeredWindow` without a source changes only the constant alpha). Every 2 s the
  thread asks `SHQueryUserNotificationState`: busy, D3D full screen or presentation hides the widgets on the foreground
  window's monitor. windows-sys has `WM_MOUSELEAVE` in `Win32::UI::Controls`: without that import a match arm named
  after it binds every message (rustc only warns "unreachable pattern").
  Layout "cycle": one widget whose other providers come as `frames`; the widget thread turns to the next every 8 s
  (`frame_at`, checked with the 2 s full-screen timer; its start is kept across updates so a redraw doesn't restart it).
  No rise highlight there.
- Provider nav side (`navRight`, in `BACKUP_KEYS`): Settings → Panel; `app-shell.tsx` reverses the row.
- Proxy (`config.rs`, Settings → App): `~/.openusage/config.json`'s `proxy` (http/https/socks5/socks5h, host required,
  localhost never proxied), resolved once and kept in `RESOLVED_PROXY`; `set_proxy_setting` validates, writes the file
  atomically keeping its other keys, and swaps the cached proxy. Plugin HTTP, status badges and the updater
  (`check({ proxy })`) use it.
- Hide from screen sharing (`capture_privacy.rs`, setting `capturePrivacy`): `WDA_EXCLUDEFROMCAPTURE` on the panel and
  the widgets; while Windows reports presentation mode or a remote-controlled session (`privacy:sharing`), the tray
  shows the plain icon and the strip hides.
- Cards: a click on a bar's value flips used ⇄ left (the `displayMode` setting). The header's image button draws the
  card (`share-card.ts`, opaque, 2x) and `copy_image_to_clipboard` puts it on the clipboard (`decode_rgba` caps).
  The sliders button edits the card's overview rows (`line-layout.ts`, setting `lineLayouts`: order and hidden labels
  per card id, Ctrl+Z undoes, restored via `mergeCardMap`).
- Spend (`spend.ts`, `spend-summary.tsx`, under the overview's cards, section id `spend`): Claude/Codex cards' ccusage
  rows ("Today", "Yesterday", "Last 30 Days": `$x · yM tokens`) read back and added up across cards, the 30 days by
  card as a ring, models by tokens (each card's model shares × its 30-day tokens). Tokens are only as exact as the
  card's rounding. Dollars only when ccusage priced them.
- Reset all settings (Settings → App, two-step): restores a backup holding only `plugins` and `projectBudgets`, then relaunches.
- Themes also "halloween" (dark + `.halloween` tokens). Glass (`glass`, `window_style::set_window_glass`): Acrylic
  instead of Mica, `.glass` makes the layers see-through (pure black too); only when the window really got it.
  Party mode: three clicks on the logo drop confetti (`party.ts`), nothing under reduced motion.
- Panel width: 400 to 560 logical px (`panelWidth`, in `BACKUP_KEYS`). `ResizeEdge` strips (4 px, clear of the scrollbar
  thumb) follow the pointer themselves and send one width at a time to `resize_panel` (Rust: one SetWindowPos, the
  other edge kept, the move marked as ours in `place`'s slot), saving it on release. Never Windows' own sizing loop
  (`startResizeDragging`): this transparent Mica window's webview lags its frame there and the content sizing fought
  it (grey strip, dropped frames). So the window is `"resizable": false`: a resizable undecorated window gets
  tauri-runtime-wry's `TAURI_DRAG_RESIZE_BORDERS` child, which takes a real mouse press on the edges into that loop
  before the webview sees it (mouse messages posted to the webview skip it; test edges with a real mouse or
  SendInput). `setSize` and SetWindowPos still work. The settings view is `SETTINGS_PANEL_WIDTH` (760) wide, with no edge
  strips: its groups (`SETTINGS_CATEGORIES`) in a WinUI-style list on the left (base-ui Tabs, so arrow keys and ARIA
  come with it), the chosen group's cards in one column (narrower on a work area that can't hold it). Only that
  group is mounted, so tests open a group first (`openCategory` / `openSettingsCategory`), and the window's height
  follows each group's. Going in or out calls
  `resize_panel` without `keepRight`: at a remembered spot the panel goes where `fit_into` will, elsewhere it is placed
  from `tray.rs`'s `Anchor` (the tray icon's middle, the corner's right edge, or its middle after a user move or edge
  drag), so the round trip lands where it started even when the work area clamped the wide panel; the remembered spot
  never moves. `use-panel.ts` sizes the window to that width and the content's height. The
  content's scroller reaches the card's right edge (`-mr-3`, `pr-3`) so the scrollbar sits there and the content
  keeps the same 12 px on both sides.
- Panel: the title bar pin (`panelPinned`) keeps it always on top. "Remember position": `tray.rs`
  records every position it sets itself (`place`); any other move while visible is the user's drag
  and is saved as `panelPosition` (outer top-left, physical px) in settings.json, then used by
  `anchor_panel`/`toggle_panel_at`, clamped into the work area. Move the panel only through `place()`,
  or your move is remembered as a drag. "Remember position" is on for a new install and off for one from 0.9.1 and
  older, decided once in `loadRememberPanelPosition` (before the first plugin-settings save, like `colorMode`); "Reset
  all settings" turns it on and forgets the dragged spot. Without a remembered spot a tray icon click opens the panel
  in the work area's corner (`toggle_panel_from_tray`, `click_anchor`; a tray on the left half stays centered on the
  icon; an icon in the hidden-icons flyout still opens it above the taskbar), the strip above itself, a widget beside
  it. `anchor_panel` keeps an `Anchor::Right` panel's right edge in the corner when its width changes (another scale).
- The main window's `additionalBrowserArgs` (tauri.conf.json) keep wry's defaults (`msWebOOUI,msPdfOOUI,
  msSmartScreenProtection`, `--autoplay-policy=no-user-gesture-required`) and add `CalculateNativeWinOcclusion`:
  WebView2 stops painting a hidden window's webview, and the panel (created hidden, shown from the tray) was seen
  opening black until hidden and shown again. Setting the option replaces wry's defaults, so keep them listed.
- Support: the side-nav coffee cup (`BmcCup`, from Buy Me a Coffee's brand kit: outline `currentColor`, coffee
  `--support` yellow) opens `SupportDialog`; the About window and the tray menu open `SUPPORT_URL` (TS ↔ tray.rs,
  test-synced). A dialog taller than a short panel sets `data-panel-dialog`: app-shell's `has-[…]:min-h` grows the
  panel while it's open (the window follows the content height). SupportDialog also asks for a GitHub star.
  The star card (`star-prompt.tsx`) shows once, for a minute: 3 h after a new install, on the next panel open for an
  existing one. "Existing" means plugin settings were already saved, so `initStarPrompt` must run before the
  bootstrap's first `savePluginSettings` (test-checked), or every update would look like a new install.
- Help (the side-nav ?) opens the in-app FAQ (`help-dialog.tsx`), with GitHub Issues as its last link. Its answers
  take setting names as placeholders filled from the settings' own labels: rename a setting and the FAQ follows.
- Progress bars hatch the usage spent since the open panel last showed them (`use-unseen-usage.ts`): it blinks
  3.5 s, then the fill grows over it. Seen values are in memory, per plugin + line and in used terms (switching
  used/left isn't spending). "Open" is asked from the OS (`isVisible`): the hidden panel's webview reports itself
  visible before its first show.
- Settings backup (`settings-backup.ts`, Settings → Settings backup): takes only `BACKUP_KEYS` from the store (no
  accounts, logins, panel position, sent alerts, update/star state); `settings_backup.rs` writes it to Downloads
  (write aside, then swap) and reveals it (no dialog plugin, no webview reveal permission). Import writes those keys
  raw and removes the ones the backup lacks (they were at their default there), then `relaunch()`: every loader checks
  its value at startup. Kept from this PC: a custom alert sound (its WAV isn't in the backup), and its account/WSL
  cards in every setting that names cards (`plugins`, `trayHiddenPlugins`, `providerLevels`, the strip's providers and
  line modes, `trayProvider`); the backup's card ids are dropped. A new preference key belongs in `BACKUP_KEYS` too,
  and a new setting that names cards in `restoredValue`.
- Detail page sections (`detail-section.tsx`, `detail-sections.ts`): a provider's detail page shows its bars, then
  parts under a rule and a title that closes them: banked resets, cost (the text rows before a usage chart, and the
  chart), models (the rows after the chart: both ccusage plugins list each model's share there), live sessions, the
  weekly limit by day (`week-days.tsx`, `usage_by_day`: the used percent shared out over the window's local days by
  price-weighted tokens; the frontend sends the day bounds), the hour grid, projects. A provider without a chart keeps its text rows with the bars. The closed parts are the setting
  `collapsedSections`: one list for every provider, in `BACKUP_KEYS`, read once at start (`useStoredDetailSections`);
  models and the hour grid start closed. A closed hour grid or projects list reads no logs (the spike check below does). The overview card keeps
  one run of lines.
- Pace (`pace-status.ts`): one elapsed share for everything that shows it (card dot, marker, deficit, tray,
  pace alert) via `paceElapsedFraction`; with `paceWorkdays` a ~7-day window counts Mon–Fri (local time) only.
- Currency (`src/lib/currency.ts`, setting `currency`): providers report US dollars; the card shows `dollars`
  lines via `formatMoney` and rewrites `$<number>` in plugin text via `convertUsdText`, at a rate the user
  types (no exchange-rate service: CSP and privacy). USD renders exactly as before. Plugins and the local API stay in USD.
- Ring logos are sized by `measureLogoExtent` (how far the logo's pixels reach) so square logos stay
  inside the ring and round ones grow.
- Themes: `dark` (default, pure black: classes `.dark.oled`) | `light`. `useSettingsTheme` also sets the
  window theme: Mica takes its tint from the window, so a light page on dark Windows needs it.
- Usage spikes (`usage_spikes.rs`, `use-usage-spike-alerts.ts`, setting `alertSettings.spikes`, on unless false): with
  notifications on, every 5 min, panel open or not, the same log scan names Claude/Codex sessions (one log file each)
  whose current or last clock quarter hour reaches 3x the usual busy quarter hour (p90 of the past week's busy session
  quarter hours, up to an hour ago, price-weighted via `usage_projects::weight`) and 300k weighted tokens, after 20
  such quarters of history. Both sides are aligned quarters on purpose: a sliding window would read a burst the
  history saw split over two quarters up to twice as high. Calibrated on 4 weeks of real logs (busiest ordinary
  quarter: 2.9x). One notification per card and folder an hour (a session's sub-agents share its folder), in memory.
- Notifications (`src/lib/usage-alerts.ts`, pure + tested): the usage levels the user picks
  (`alertSettings.levels`, default 80/95, or a provider's own in `providerLevels` via `alertLevelsFor`; the
  card notches its bars at them, flipped when showing what's left), pace, reset; each once per provider+line+window, keys
  persisted in settings (`sentUsageAlerts`). Windows are matched by reset time ±1 h, not the exact
  string: Claude's `resets_at` jitters by milliseconds every probe (it caused repeat 80% and fake reset alerts). Toasts are silent (an unpackaged app can't give a toast
  its own sound): `alert_sound.rs` plays the chosen sound with PlaySound (the `Notification.Default`
  alias, bundled `src-tauri/sounds/*.wav` from Kenney, CC0, ids test-synced with `ALERT_SOUNDS`, or
  the user's file, converted to 16-bit PCM WAV in `src/lib/alert-sound.ts`) and skips it during Do
  Not Disturb. Every toast needs that call (`play_alert_sound`): the update-ready one went unnoticed without it.
- Status badge: optional `statusPageUrl` in plugin.json (Atlassian Statuspage `/api/v2/status.json`
  only — verify the URL returns that JSON before adding one).
- Local HTTP API (127.0.0.1:6736) is loopback-only: no CORS, Host/Origin must be loopback. Don't add
  `Access-Control-Allow-Origin` back (any website could read usage).
- Keyboard: Ctrl (not Cmd/Win) shortcuts; show Ctrl/Alt in the UI.

## Security
- CSP lives in `tauri.conf.json` (`script-src 'self'`; `img-src` data:/blob:; `connect-src` only IPC +
  `https://api.github.com`). The dev server runs WITHOUT it, so a new remote fetch/image/font source
  works in `tauri dev` and silently breaks in release: add it to the CSP and test a release build
  (`bun tauri build --no-bundle`, run `src-tauri/target/release/opentokenusage.exe`).
- App-defined Tauri commands are callable by any script in the webview (no ACL): validate every
  argument in Rust. Images over IPC go through `tray::decode_rgba` (size caps, no u32 overflow);
  `run_in_terminal` only runs its exact allow-list.
- No telemetry: the upstream Aptabase ping (reported to upstream's account) was removed in 0.7.0.
  Don't add analytics back.

## Verify before committing
- `bunx tsc --noEmit` · `bun run test` (src + plugins) · `cd src-tauri && cargo test --lib`.
- Vitest `testTimeout` is 20 s on purpose (cold transform of a file's first test is slow on
  Windows under load); don't lower it to "fix" speed — a timeout there is not a logic failure.

## Dependencies & releases
- `bunfig.toml` has `minimumReleaseAge` (7 days): don't force newer packages.
- Tauri JS packages and Rust crates must share **major.minor** (`@tauri-apps/api` ↔ `tauri`,
  `@tauri-apps/plugin-x` ↔ `tauri-plugin-x`); the Tauri CLI refuses to build otherwise. Adding a
  crate can silently bump `tauri` in Cargo.lock: check the lock diff (`tauri-plugin-single-instance`
  is pinned `=2.4.5` because 2.5 needs tauri 2.12).
- A second launch only shows the running app's panel (single-instance plugin), and the app exits at
  once in session 0 (an installer running as SYSTEM). Both make starting the app after a winget
  install safe.
- In-app updates run the setup quietly (`plugins.updater.windows.installMode: "quiet"` = `/S /UPDATE /R`):
  `update.install()` exits the app (the JS `relaunch()` after it never runs) and the setup starts it again.
  `use-app-update.ts` saves the version being installed (`updateRelaunchVersion`); the app that starts as
  that version reopens its panel. The mode in effect is the *installed* version's, so a change here
  reaches users one update later.
- What's new (`use-whats-new.ts`, `whats_new.rs`, setting `whatsNewAfterUpdate`, on by default): once after an
  update the panel shows the release's notes (`ChangelogDialog` without `onBack`) and the video shipped as
  `src-tauri/resources/whats-new/<version>.webm` (720×720 VP9, silent, ~1.4 MB). The video goes to the webview as
  bytes (a blob URL; CSP `media-src blob:`) and is deleted once the window closes, with the panel, or isn't due.
  Due = `whatsNewVersion` differs and either was saved before (any update) or `afterUpdate` (an in-app update
  from a version that saved none); a new install only saves the version. Without the notes (offline) it waits
  for the next start. A test fails while a video for an older version is still there: rename it to the release
  version or delete it when the version moves on. To rehearse locally, copy the video as the build's version
  into `target/release/resources/whats-new/` and set `whatsNewVersion` to an older one.
- Installer: per-user NSIS only (`%LOCALAPPDATA%\OpenTokenUsage`, no admin). No MSI: Tauri's MSI is
  always per-machine, so every update asked for admin. Up to 0.7.7 the MSI shipped; those installs
  update to the NSIS setup, which uninstalls the MSI once (one admin prompt). Start on login is
  rewritten only when its Run entry names an exe that no longer exists (`autostart_stale`, which
  the removed MSI copy makes true), so a dev or test build never takes it over. WinGet gets the same setup: `InstallerType:
  nullsoft`, `Scope: user`, `InstallerSwitches: Custom: /R` (Tauri's NSIS starts the app after a
  silent install with `/R`, as the MSI's `AUTOLAUNCHAPP=True` did). komac copies the previous
  manifest's fields, so the first version after the 0.7.7 MSI needs its winget PR checked and, if
  komac kept `wix`/`machine`/`AUTOLAUNCHAPP`, fixed on its branch in the `PowerUserZ/winget-pkgs`
  fork before it merges. winget won't upgrade an MSI install to the EXE ("install technology is
  different"): those users move with the in-app update.
- Identifier `com.poweruserz.opentokenusage` (0.7.8 and older: upstream's `com.sunstory.openusage`).
  It names `%APPDATA%\<id>` and `%LOCALAPPDATA%\<id>`; `data_dirs.rs` moves the old folders' entries
  before the builder runs (never overwriting, merging folders both have, but an account folder only
  moves whole) and leaves a junction at the old path of `accounts` or of each account folder it
  moved, since Settings tells users to point CLAUDE_CONFIG_DIR / CODEX_HOME at an account's folder. Notifications use it as the AppUserModelID, which must be on the Start menu
  shortcut: updates don't recreate shortcuts, so `src-tauri/windows/hooks.nsh` stamps it on every
  install. `bundle.publisher` stays `"sunstory"` (it was the default from the old identifier)
  because the NSIS setup only removes an MSI whose Publisher matches it; change it once 0.7.7 MSI
  installs are gone.
- Release: bump the version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
  (+ `Cargo.lock`), add a `## vX.Y.Z` section to `CHANGELOG.md` (required: it becomes the release
  body the in-app changelog shows), then push a `v*` tag → `publish.yml` (windows-latest) builds
  the NSIS setup and signs updater artifacts with the `TAURI_SIGNING_*` repo secrets. Releases are immutable
  (repo setting, from 0.9.1): tauri-action fills a draft, `actions/attest` records build provenance for the setup,
  the asset checks run, and only then does the job publish the draft. A published release's assets and tag can never
  change: fix a bad release with a new version, never by re-uploading or moving the tag. A run that failed before
  publishing: "Re-run failed jobs" (tauri-action reuses the draft); after publishing, never "Re-run all jobs". The updater points
  at this fork's `latest.json`, never upstream's. `git fetch upstream` must not bring upstream's
  Swift `v0.7.x` tags (`remote.upstream.tagOpt --no-tags`).
- Workflow actions are pinned to full commit SHAs (version in a comment) and Bun to an exact
  version; bump them deliberately. The winget job needs a valid `WINGET_TOKEN` (classic PAT,
  `public_repo` + `workflow`): the branch it creates in the `PowerUserZ/winget-pkgs` fork carries
  upstream's `.github/workflows` changes, and without `workflow` GitHub refuses it
  ("does not have the correct permissions to execute `CreateRef`", 0.7.0). If it fails, submit
  with komac (see memory).
- The owner's hook blocks force pushes (and a few destructive git commands); plain pushes pass.
- `.claude/skills/tauri-*` are real copies (git symlinks don't work on Windows without
  Developer Mode); keep them in sync with `.agents/skills/` if you edit one.
