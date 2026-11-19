---
name: add-provider
description: Add a new AI tool (provider) to OpenTokenUsage, or move an existing provider to a new API, touching every place a provider lives (plugin, manifest, tests, error strings, 11 locales, log redaction, Rust tables, docs, README, site). Use for "add X support", a provider request issue, or a provider whose endpoint changed (e.g. a 405 or a wrong number).
---

# Add or update a provider

A provider is a plugin in `plugins/<id>/` plus a few tables around it. A missed table rarely fails a test:
it shows up as a blank card, a log that leaks an email, or a "Sign in" button that does nothing. Work through
every step below and tick off the ones that don't apply. Model on a recent one: `plugins/muse/` (PR #92) or
`plugins/factory/` (PR #110).

## 0. Learn the API without guessing

- Look for it in reference projects: CodexBar (`docs/<x>.md`), ai-usagebar, quota-axi, and upstream's Swift
  provider (`git show upstream/main:Sources/OpenUsage/Providers/<X>/`, CLAUDE.md "What this is").
- Without a way to test, ask the reporter on the issue for: where the login lives (path and key names only),
  the request (host, path, method), and the response shape with values removed. Never ask for or accept tokens,
  keys or full responses. If calling the endpoint writes anything (mints a key, refreshes a token), stop and
  raise it with the owner first.
- When probing live yourself, log host, status and key names only, never bodies or headers.

## 1. The plugin

| File | What |
|---|---|
| `plugins/<id>/plugin.json` | `schemaVersion: 1`, `id`, `name`, `version: "0.0.1"`, `entry`, `icon`, `brandColor`, `links` (dashboard), `lines`. **Every label the card can show is declared with `scope: "overview"`** (and `primaryOrder`), or that account gets a blank card. Weekly windows get `"period": "weekly"`. A CLI that also runs in WSL gets `"wsl": { "login": [<login paths>] }`. |
| `plugins/<id>/icon.svg` | The brand mark in one color: `fill="currentColor"` (the app tints it). |
| `plugins/<id>/plugin.js` | IIFE ending in `globalThis.__openusage_plugin = { id, probe }` (plus `accountKey` from local files when it has WSL). A fresh QuickJS runtime per probe: nothing survives in module variables; keep state under `ctx.app.pluginDataDir`. Don't re-implement 429 backoff or timeouts (the host does). |
| `plugins/<id>/plugin.test.js` | `makeCtx` from `../test-helpers.js`, `loadPlugin` via `globalThis.__openusage_plugin`. Cover: not set up, rejected login, each line, missing fields, any date or period math (month ends, leap years). |

Rules the shared tests enforce:
- **Nothing set up** must throw a message `isNotSetUpError` (`src/lib/plugin-errors.ts`) knows, **without any
  request** (`plugins/not-set-up.test.js`); otherwise first-start detection turns the card on for everyone.
- A **rejected** login throws "Session expired …", never a not-set-up message.
- A probe with side effects (writes, key minting): add the id to `MANUAL_ONLY` in
  `src/hooks/app/use-provider-detection.ts` so first-start detection skips it and only the user turns it on.
  That is all it does: once on, Smart refresh probes it every few minutes, so the plugin itself must limit its
  calls (keep the last answer in `pluginDataDir` and return it until the next call is due, as `plugins/muse/`
  does) plus a floor in `smartFloorMinutes` (`src/lib/smart-refresh.ts`). A tight rate budget gets the same.

## 2. Text and translations

- Error strings: reuse the shapes in `src/lib/plugin-errors.ts` ("Not logged in. Run `x login` to
  authenticate.", "Session expired. …", "Rate limited by X, retry in ~10m") so they get translated. Add each
  string to `FIXTURES` in `src/lib/plugin-errors.test.ts`. A new shape needs a pattern in `PLUGIN_ERROR_PATTERNS`
  (`src/lib/plugin-errors.ts`), a key in all 11 `src/locales/plugin-errors/*.ts`, and, when it means "nothing set
  up" or "sign in", its key in `NOT_SET_UP` or `ACTION_NEEDED` in the same file (otherwise first start turns the
  card on, or a signed-out card shows red instead of grey).
- Line labels: reuse existing `label.*` keys in `src/locales/en.ts` (Session, Weekly, Monthly, Credits …). A
  new label needs `label.<Label>` in all 11 `src/locales/*.ts`, then `bun run locales:lock` to refresh
  `src/locales/en.lock.json`, **only after** all 11 are translated.

## 3. Rust tables (only those that apply)

- `src-tauri/src/plugin_engine/host_api.rs` `redact_body`: every identity field the new endpoint returns
  (email, name, ids, card, checkout links) goes into the list, **with a test** next to the others.
- `src-tauri/src/setup_actions.rs` `ALLOWED_COMMANDS`: the exact login command the error text tells users to run
  (bump the array length).
- `src-tauri/src/foreground.rs`: `APPS` (desktop exe), `CLIS` (CLI exe) or `MARKERS` (a node/bun CLI) so
  "Follow the active app" and "Only while an AI tool runs" know it.
- `src-tauri/src/tokscale.rs` `CLIENTS`: only if tokscale's pinned version lists that client id (an unknown id
  fails the whole run). When that id differs from the plugin id, map it in `LOCAL_CARDS` (`src/lib/spend.ts`), as
  `droid → factory`, or its spend is set against the wrong card.

## 4. Docs and listings

- `docs/providers/<id>.md`: Overview, Endpoints (headers, response as `jsonc`), Lines table, Authentication
  (where the login lives, refresh), WSL. Note it is reverse-engineered when it is.
- `README.md`: a line in "Supported Providers" (`- [**Name**](docs/providers/<id>.md) / what it shows`) and the
  count in the header ("Copilot and N more AI coding tools").
- `CLAUDE.md`: only a fact that is easy to get wrong (a manual-only probe, a rate floor).
- Site (`../opentokenusage.github.io`, ships **after** the release that carries the provider): the list, every
  count (`N more`, `N other AI`, `Works with N providers`, the same in meta tags, JSON-LD and the visible FAQ),
  the provider list in `llms.txt`,
  `assets/providers/<id>.svg` (copy of the icon) with a `.p-<id>` color class in `site.css` (and a light-theme
  override when the brand color is dark), then bump `site.css?v=` in both `index.html` and `404.html`.

## 5. Verify

```powershell
bunx tsc --noEmit; bun run test
cd src-tauri; cargo check; cargo test --lib   # whenever Rust changed
```

With the account on this PC, the run-opentokenusage skill can try the build, but tell the owner first:
`launch` restarts the app they may be using. Read the result with `driver.ps1 usage`, not `ss` (it copies screen
pixels and has caught other windows); ask the owner for a screenshot instead. Without the account, say plainly
that it is untested against the real service and ask the reporter to try the next build. A reviewer subagent
reads the diff before the push.
