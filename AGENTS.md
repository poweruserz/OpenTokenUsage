# OpenUsage

## Instructions
- CRITICAL: Use simple, concise language. Avoid overtechnical jargon.
- Be radically precise. No fluff. Pure information only (drop grammar; min tokens).
- Critical: DO NOT OVER-ENGINEER! This app is typically used by 2-5 people, internally only.

## Guardrails
- Use `trash` for deletes
- Use `mv` / `cp` to move and copy files
- Bugs: add regression test when it fits
- A self-contained new feature gets its own module/component. Existing large files (`src/lib/settings.ts`, `src/pages/settings.tsx`, `src/components/provider-card.tsx`) are not split as part of a feature change; splitting one is its own change
- Simplicity first: handle only important cases; no enterprise over-engineering/fallbacks
- New functionality: small OR absolutely necessary
- NEVER delete files, folders or other data unless explicilty approved or part of a plan
- Before writing code, stricly follow the below research rules
- User-facing text added/changed → translate it in all 11 languages (`src/locales/*.ts`, `src/locales/plugin-errors/*.ts`) in the same change, then `bun run locales:lock`. Never re-lock without translating.

## Research
- Prefer skills if available over research.
- Prefer researched knowledge over existing knowledge when skills are unavailable.
- Research: Exa to websearch early, and Ref to seek specific documention or web fetch.
- Best results: Quote exact errors; prefer 2025-2026+ sources.

## Error Handling
- Expected issues: explicit result types (not throw/try/catch).
- Unexpected issues: fail LOUD (throw/console.error); NEVER add silent fallbacks. Show the failure where the user acted when there is a place for it (an inline message, the card's error). The app has no toast system: don't call `toast.error`.
- A failed settings save is logged with `console.error` only, the same for every setting; a visible save error would be one app-wide change, not part of a feature PR.

## Before Creating Pull Request
- Before creating a PR or pushing to main, ensure that `README.md` is updated with what plugins are supported.
- On any plugin change/new plugin, audit plugin-exposed request/response fields against `src-tauri/src/plugin_engine/host_api.rs` redaction lists and add/update tests for gaps. Compare with existing plugins for patterns.
- In `plugin.json`, set `brandColor` to the provider's real brand color.
- Plugin SVG logos must use `currentColor` so icon theming works correctly.
- If the PR includes visual changes, refuse to create it without providing before/after screenshots.

## Code Review Rules
Read by every reviewer (Claude in ai-review, Codex, Greptile). Report bugs, security holes and data loss; skip style, naming and formatting. `CLAUDE.md` explains each rule below.

Flag:
- Plugin state kept in module variables: each probe runs in a fresh QuickJS runtime (keep it under `ctx.app.pluginDataDir`).
- A label a plugin can show on the overview card that `plugin.json` doesn't declare with `scope: "overview"` (that card goes blank).
- A new endpoint's identity fields (email, name, ids, card, checkout links) missing from `redact_body` in `src-tauri/src/plugin_engine/host_api.rs`, or without a test there. Any token, key, cookie or full response body written to a log.
- A plugin that sends a request, or throws an error `isNotSetUpError` doesn't know, when nothing of it is set up: first start would turn its card on for everyone. A rejected login reported as "not set up".
- JS re-implementing what the host already does: 429 backoff, probe timeouts, one probe at a time.
- User-facing text added or changed without all 11 languages (`src/locales/*.ts`, `src/locales/plugin-errors/*.ts`), or `en.lock.json` updated without the translations.
- Date math in local time where the provider uses UTC, or a month stepped back with `setMonth` without clamping the day (Mar 31 → Feb 28, not Mar 3).
- Tauri command arguments sent from JS in snake_case (they silently don't match).
- Files of other tools (Claude Code's `settings.json`, Cursor's `state.vscdb`, a CLI's login) changed beyond what the feature needs; a login refreshed by a plugin documented as read-only.
- A command started from text a provider returned that is not in `ALLOWED_COMMANDS` (`src-tauri/src/setup_actions.rs`).
- A failure swallowed: it shows where the user acted (an inline message, the card's error), never a silent fallback.
- macOS code paths, telemetry or analytics.
- A `tauri*` crate in `src-tauri/Cargo.lock` moved to a major.minor that the matching `@tauri-apps/*` package doesn't have (the release build then fails; CI doesn't build it).

Don't flag:
- A failed settings save logged with `console.error` only: on purpose, the same for every setting.
- Large existing files left unsplit (`src/lib/settings.ts`, `src/pages/settings.tsx`, `src/components/provider-card.tsx`).
- Rare cases outside what the change set out to do; this app stays small on purpose.
- Behavior the PR description or a commit message says is intended, except the security items above (secrets in logs, other tools' files, commands, telemetry): those are flagged whatever the description says.
- `bun.lock` churn, images and videos.

## Project Memories
Use below list to store and recall user notes when asked to do so.

- Use this list when asked to remember things. Keep each list item concise.
- Tauri IPC: JS must use camelCase (`{ batchId, pluginIds }`), Tauri auto-converts to Rust's snake_case. Never send snake_case from JS—params silently won't match.
- tauri-action `latest.json`: Parallel matrix builds are safe—action fetches existing `latest.json`, merges platform entries, re-uploads. No `max-parallel: 1` needed.
