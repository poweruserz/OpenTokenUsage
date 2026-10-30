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
- Every line label a plugin can emit on the overview card must be declared `scope: "overview"` in
  `plugin.json`, or that account type gets a blank card (the card filters by manifest labels).
- Response bodies are logged (first 500 chars) after `redact_body` in
  `src-tauri/src/plugin_engine/host_api.rs` — on any new endpoint, add identity fields
  (email, name, uuid, ids) to the redaction list with a test.
- Host already handles: HTTP 429 backoff per plugin+URL (`plugin_engine/http_gate.rs`, saved to
  `http-gates.json` so it outlives a restart), probe timeout (30 s), one probe per plugin at a time,
  panics → error result. Don't re-implement in JS. Anthropic's usage endpoint allows ~30 reads an hour
  per login, shared with Claude Code: Smart refresh keeps Claude cards at ≥5 min (`smartFloorMinutes`).
- Paths: `~/Library/Application Support/<X>` is mapped to `%APPDATA%\<X>` by `expand_path`.
  SQLite goes through bundled `rusqlite` (no `sqlite3` CLI); no `ps`/`lsof`/`security` on Windows.
- Release builds run only the bundled plugins (copied to `%APPDATA%\com.poweruserz.opentokenusage\plugins`);
  the repo's `plugins/` is picked up from the cwd in **debug builds only** (`#[cfg(debug_assertions)]`
  in `plugin_engine/mod.rs`) — never make that path reachable in release. Plugin ids must match
  `[a-z0-9-]`; `entry` and `icon` must stay inside the plugin folder.
- Host HTTP caps response bodies at 8 MB and honors `dangerouslyIgnoreTls` for loopback URLs only.

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
- Errors: `getPluginErrorAction` turns known errors into one-click fixes: a login command →
  `run_in_terminal` (Rust allow-list in `setup_actions.rs`, test-synced with the plugin fixtures),
  a missing API-key env var → the Windows Environment Variables dialog. Env vars are also read from
  the registry, so a key added while the app is running works on the next refresh.
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
  in `TASKBAR_STRIP_COLOR_SCALES`, "base" = the text color). The strip and the tray styles that show numbers
  exclude each other: enabling the strip sets the tray to "icon", picking another style turns it off.
  A strip click opens the panel above the strip (`tray::toggle_panel_at`, via `run_on_main_thread`).
  Placement (`taskbar_strip/placement.rs`): Right = beside the tray; "left" = the free side away from it,
  the left edge, or the middle when `TaskbarAl` = 0 (icons left; Settings then labels it Center). The
  strip keeps to the gaps between the buttons that `taskbar_strip/uia.rs` measures every second with UI
  Automation (Windows 11's Start, Widgets and app buttons are XAML, no windows to measure), on its own
  thread because those calls wait on Explorer.
- Panel: the title bar pin (`panelPinned`) keeps it always on top. "Remember position": `tray.rs`
  records every position it sets itself (`place`); any other move while visible is the user's drag
  and is saved as `panelPosition` (outer top-left, physical px) in settings.json, then used by
  `anchor_panel`/`toggle_panel_at`, clamped into the work area. Move the panel only through `place()`,
  or your move is remembered as a drag.
- Support: the side-nav coffee cup (`BmcCup`, from Buy Me a Coffee's brand kit: outline `currentColor`, coffee
  `--support` yellow) opens `SupportDialog`; the About window and the tray menu open `SUPPORT_URL` (TS ↔ tray.rs,
  test-synced). A dialog taller than a short panel sets `data-panel-dialog`: app-shell's `has-[…]:min-h` grows the
  panel while it's open (the window follows the content height).
- Ring logos are sized by `measureLogoExtent` (how far the logo's pixels reach) so square logos stay
  inside the ring and round ones grow.
- Themes: `dark` (default, pure black: classes `.dark.oled`) | `light`. `useSettingsTheme` also sets the
  window theme: Mica takes its tint from the window, so a light page on dark Windows needs it.
- Notifications (`src/lib/usage-alerts.ts`, pure + tested): the usage levels the user picks
  (`alertSettings.levels`, default 80/95), pace, reset; each once per provider+line+window, keys
  persisted in settings (`sentUsageAlerts`). Windows are matched by reset time ±1 h, not the exact
  string: Claude's `resets_at` jitters by milliseconds every probe (it caused repeat 80% and fake reset alerts). Toasts are silent (an unpackaged app can't give a toast
  its own sound): `alert_sound.rs` plays the chosen sound with PlaySound (the `Notification.Default`
  alias, bundled `src-tauri/sounds/*.wav` from Kenney, CC0, ids test-synced with `ALERT_SOUNDS`, or
  the user's file, converted to 16-bit PCM WAV in `src/lib/alert-sound.ts`) and skips it during Do
  Not Disturb.
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
  the NSIS setup and signs updater artifacts with the `TAURI_SIGNING_*` repo secrets. The updater points
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
