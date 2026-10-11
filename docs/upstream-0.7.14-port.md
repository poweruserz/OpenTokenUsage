# OpenUsage 0.7.14 provider port

Compared OpenTokenUsage main `d5feca2bf6a062e0fd2faedef2c1fdd9987a4f6d` (v0.7.3)
with upstream tags v0.7.13 and v0.7.14 (`cb21465e3d88d8b2075ca48d38c936b82177fb78`).
[Upstream release](https://github.com/robinebers/openusage/releases/tag/v0.7.14)
was published on October 6, 2026. The fork's v0.7.0 changelog entry records provider ports through
0.7.13; this comparison checks the code present in v0.7.3 rather than assuming those ports are complete.

| Upstream change | Windows/Tauri decision |
| --- | --- |
| Refresh and save independent Codex home tokens (#1322) | Already supported by file-backed auth, guarded reload and account environment bindings. Add a regression for Windows paths, token rotation and preserving the default login. |
| Codex multi-account local spend (#1349) | Bind local history to the selected auth file's parent, including `~/.config/codex`. Each configured account scans its own home. Swift's discovered-home/account assembly does not match the fork's explicit account cards. |
| Slow Codex history (#1338) | Keep one host worker per home across probes. Wait at most 150 ms; scope retained results by account identity and query dates. A completed result is available on later refreshes; pending history leaves live quota intact. WSL history stays disabled. |
| Codex plan names (#1332) | Map `prolite`, `pro`, `promax` to Pro 100, Pro 200, Pro 500. Keep other plan names. Swift header layout changes are excluded. |
| Cursor structured team pools (#1337) | Prefer two valid model pools and the reported total percent. Omit absent totals instead of computing them from legacy dollars. Preserve legacy meters for zero placeholders beside positive spend or incomplete/invalid pools. Keep existing labels and translations. |
| OpenCode reset below 1% | The React card already displays zero-usage resets. Preserve active session resets; drop only untouched rolling placeholders within two seconds of a full period at capture time, using HTTP Date when valid. Keep weekly/monthly resets. |
| Report an Issue (#1343) | Existing Help navigation already opens the fork's issues page. |
| macOS panel anchoring/navigation (#1345, #1346) | Excluded: native Swift panel behavior does not apply to the Windows panel. |
| PostHog 3.85.3 (#1347) | Excluded: no applicable analytics dependency in this fork. |

No plugin identities, metric labels, translations, logos or UI layout are changed. Existing brand
colors and `currentColor` logos remain valid. The new history `accountId` is local scope metadata,
not a CLI argument or network parameter. The host's existing redaction covers it and OAuth tokens;
a regression checks nested tokens while preserving pool percentages and reset timestamps.

CI now runs before a PR on `port/**` branches, and tests the native host on Windows as well as
running the frontend type check, build and full Vitest suite on Linux.
