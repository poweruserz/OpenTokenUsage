---
name: run-opentokenusage
description: Build, run, and drive the OpenTokenUsage Windows tray app. Use when asked to start or launch OpenTokenUsage, try a new build on this machine, check what usage the running app shows, open its panel, take a screenshot of the panel, switch back to the installed release, or run its tests.
---

OpenTokenUsage is a Windows-only Tauri tray app with no CLI. An agent drives it through
`.claude/skills/run-opentokenusage/driver.ps1` (PowerShell 7). The driver builds the release exe,
launches it in place of the installed copy, reads live usage from the app's local API
(`http://127.0.0.1:6736/v1/usage`), opens the panel, and screenshots it.

All paths below are relative to the repo root.

## Prerequisites

Verified with bun 1.4.2, cargo 1.98.1 (stable MSVC toolchain), PowerShell 7.6, on Windows 11.

```bash
bun --version && cargo --version && pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
```

## Setup

```bash
bun install --frozen-lockfile
```

## Build

```powershell
pwsh -NoProfile -File .claude/skills/run-opentokenusage/driver.ps1 build
```

This runs `bun tauri build --no-bundle` (about 1 min incremental; no installer, no signing keys
needed) and produces `src-tauri\target\release\opentokenusage.exe`. It first stops a running copy
of that exe, which would otherwise lock it.

## Run (agent path)

```powershell
$d = ".claude/skills/run-opentokenusage/driver.ps1"
pwsh -NoProfile -File $d launch                          # stops every running copy, starts the build, waits for fresh usage
pwsh -NoProfile -File $d usage                           # one line per provider: plan, fetchedAt (UTC), line labels
pwsh -NoProfile -File $d panel                           # a second launch makes the running app show its panel
pwsh -NoProfile -File $d ss "$env:TEMP\otu-panel.png"   # PNG of the panel window (physical pixels)
pwsh -NoProfile -File $d restore                         # back to the installed release (%LOCALAPPDATA%\OpenTokenUsage, or an old Program Files MSI)
pwsh -NoProfile -File $d quit                            # stop whatever copy is running
```

`launch` prints the running exe's path; check it to tell the builds apart. Then look at the
screenshot: the panel lists every enabled provider's card with its plan badge and quota rows.

## Run (human path)

Start the installed release from the Start menu (that's what `restore` does), or double-click
`src-tauri\target\release\opentokenusage.exe` after quitting the installed copy from the tray menu.

## Test

```bash
bunx tsc --noEmit && bun run test && (cd src-tauri && cargo test --lib)
```

## Gotchas

- **Single instance.** While any copy runs (installed or this build), a new launch only shows that
  copy's panel and exits. `launch` stops every copy first; `panel` uses the handover on purpose.
- **Same data as the installed app.** Both use `%APPDATA%\com.sunstory.openusage`: settings, the
  usage cache, and the plugins folder. On start each build copies its own bundled plugins over that
  folder, so after `restore` the installed version's plugins are back, including any that only the
  newer build retires.
- **The version label doesn't change.** The About window and the log say whatever `package.json`
  says for both builds. Use the exe path that `launch` prints.
- **The release log has no plugin lines.** `%LOCALAPPDATA%\com.sunstory.openusage\logs\OpenTokenUsage.log`
  only holds startup lines. Probe results come from the local API (`usage`).
- **The local API lists only successful probes.** Errors aren't cached, so a missing provider is
  either disabled in Settings or failing. Antigravity probes slower than the rest, so `launch` can
  report only claude/codex as fresh while Antigravity still shows the previous round.
- **`Invoke-RestMethod` converts `fetchedAt` to a `DateTime`.** Re-parsing it as a string goes
  through the local culture and time zone (tr-TR: `2.10.2026 18:57:35`, 3 h off). The driver compares
  in UTC.
- **Screenshots need `SetProcessDPIAware`.** Without it, window rects are in scaled coordinates on
  displays above 100% and the crop misses the panel. Compiling System.Drawing inside `Add-Type`
  fails on pwsh 7 / .NET 10 (CS1069, then CS0012 `System.Private.Windows.GdiPlus`), so only the Win32
  calls are compiled and the capture uses System.Drawing at run time.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `local API not answering ... (connection refused)` | The app isn't running (quit from the tray?): `driver.ps1 launch`. |
| `no fresh usage within 60 s` | Every enabled provider failed or is disabled; run `usage` and look at the panel (`panel`, `ss`). |
| build: `failed to remove file ...opentokenusage.exe (os error 5)` | A running copy locked the exe. `build` now stops it; with a manual `bun tauri build`, run `driver.ps1 quit` first. |
| `ss`: `no visible window` | The panel is closed: `driver.ps1 panel`, then `ss`. |
