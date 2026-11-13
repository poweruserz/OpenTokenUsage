# Codex

> Reverse-engineered, undocumented API. May change without notice.

## Overview

- **Protocol:** REST (plain JSON)
- **Base URL:** `https://chatgpt.com`
- **Auth provider:** `auth.openai.com` (OAuth 2.0)
- **Client ID:** `app_EMoamEEZ73f0CkXaXp7hrann`
- **Percentages:** integers (0-100)
- **Timestamps:** unix seconds
- **Window durations:** seconds (18000 = 5h, 604800 = 7d)

## Endpoints

### GET /backend-api/wham/usage

Returns rate limit windows, optional credits, and available on-demand rate limit resets.

#### Headers

| Header | Required | Value |
|---|---|---|
| Authorization | yes | `Bearer <access_token>` |
| Accept | yes | `application/json` |
| ChatGPT-Account-Id | no | `<account_id>` |

#### Response

```jsonc
{
  "plan_type": "plus",                     // plan tier
  "rate_limit": {
    "primary_window": {
      "used_percent": 6,                   // % used in 5h rolling window
      "reset_at": 1738300000,              // unix seconds
      "limit_window_seconds": 18000        // 5 hours
    },
    "secondary_window": {
      "used_percent": 24,                  // % used in 7-day window
      "reset_at": 1738900000,
      "limit_window_seconds": 604800       // 7 days
    }
  },
  "code_review_rate_limit": {              // separate weekly code review limit (optional)
    "primary_window": {
      "used_percent": 0,
      "reset_at": 1738900000,
      "limit_window_seconds": 604800
    }
  },
  "credits": {                             // purchased credits (optional)
    "has_credits": true,
    "unlimited": false,
    "balance": 820.6969075                 // remaining credits
  },
  "rate_limit_reset_credits": {            // on-demand resets (optional)
    "available_count": 1
  }
}
```

Both rate_limit windows are enforced simultaneously — hitting either limit throttles the user.

OpenUsage floors the remaining credit balance to a whole number and displays its fixed USD
equivalent at `$0.04` per credit. For example, `820.6969075` renders as
`$32.80 · 820 credits`. The credit balance is unbounded; the API does not provide a maximum.

When available, OpenUsage displays the on-demand reset count as the first detail text metric,
for example `1 available`.

## Authentication

### Credential Storage Locations

Codex CLI supports multiple credential storage modes:

- **file** (default): `CODEX_HOME/auth.json` (or `~/.codex/auth.json` by default)
- **keyring**: OS keychain/credential manager entry (service name `Codex Auth`)
- **auto**: keyring first, fallback to file
- **ephemeral**: memory-only (no persistence)

For `keyring`/`auto`, Codex may not keep `auth.json` on disk. If keyring save succeeds, Codex removes the fallback `auth.json`.

OpenUsage Codex plugin auth lookup order:

1. `CODEX_HOME/auth.json` (when `CODEX_HOME` is set)
2. `~/.config/codex/auth.json`
3. `~/.codex/auth.json`
4. macOS keychain service `Codex Auth` (fallback)

If file-based OAuth credentials are missing, invalid, or fail with an auth/session error during refresh or usage lookup, OpenUsage tries the macOS keychain fallback. Non-auth usage failures, such as server errors or invalid responses, are shown directly.

Keychain fallback is available on macOS only.

Expected auth payload shape (file or keychain JSON value):

```jsonc
{
  "OPENAI_API_KEY": null,                  // legacy API key field
  "tokens": {
    "access_token": "<jwt>",               // OAuth access token (Bearer)
    "refresh_token": "<token>",
    "id_token": "<jwt>",                   // OpenID Connect ID token
    "account_id": "<uuid>"                 // sent as ChatGPT-Account-Id header
  },
  "last_refresh": "2026-01-28T08:05:37Z"  // ISO 8601
}
```

> Note: Codex also stores MCP OAuth tokens in `~/.codex/.credentials.json` (or keyring), but that is separate from ChatGPT CLI auth used by this plugin.

### Token Refresh

Access tokens are short-lived JWTs. Refreshed when `last_refresh` is older than 8 days, or on 401/403.

```
POST https://auth.openai.com/oauth/token
Content-Type: application/x-www-form-urlencoded
```

```
grant_type=refresh_token
&client_id=app_EMoamEEZ73f0CkXaXp7hrann
&refresh_token=<refresh_token>
```

Response returns new `access_token`, and optionally new `refresh_token` and `id_token`.

## WSL

A login inside a running WSL distro shows as its own `Codex · WSL` card when it's a different account than the ones already shown. A stopped distro is never started; its card keeps its last data.

### Upstream 0.7.14 compatibility

The plugin already refreshes OAuth tokens and saves them to the selected account's own `auth.json`.
Local spend now follows that same file's parent folder, including `~/.config/codex` and extra accounts
(a keychain login falls back to `CODEX_HOME`). History in WSL remains disabled to avoid slow network
paths.
Plans `prolite`, `pro`, and `promax` display as Pro 100, Pro 200, and Pro 500.

## Banked reset expiry

The resets section shows the available count beside its title and a row per expiry: how many resets, the time left, and the day they expire (the exact local time on hover). Expired entries are removed locally between probes. The usage-page button opens the provider dashboard; this app never redeems a reset.

Usage notifications also remind you during the final seven days and final 24 hours. The app must be running, notifications enabled, and the provider data current. Reminders are persisted so restarting does not repeat them. A missing expiry is shown as unavailable and never guessed.

When the usage summary reports resets, `GET /backend-api/wham/rate-limit-reset-credits` reads `credits[].status` and `expires_at` using the same account credentials. Only available entries are shown. If this request fails, the summary count remains visible with expiry unavailable.

Implementation reference: [T3 Code Codex usage mapping](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/codexUsageLimits.ts). This app uses its existing read-only HTTP integration rather than starting a Codex app-server.

## Usage by hour

The Codex detail page shows a 7 × 24 grid of tokens per weekday and local hour over the last 4 weeks, read from Codex's own session logs: `sessions/**/*.jsonl` in `CODEX_HOME` (or `~/.codex` and `~/.config/codex`), extra accounts in their own folders, never a WSL copy. Only usage and timestamps are read, and nothing leaves the PC. Current logs have a `token_usage_record` line per model response, which is what's counted. Older logs only have `token_count` events, and a repeat with an unchanged total is skipped. Each file is read once and afterwards only from where the last read stopped; the grid refreshes every 5 minutes while it's shown. A log it can't read is left out and counted under the grid. Arrow keys move between cells; the header then reads out the focused hour. Each weekday's total shows as a bar beside its row, the busiest weekday's solid.
## Usage spikes

With notifications on, the app checks Codex's logs every 5 minutes, panel open or not, for a session using tokens far faster than usual, which is mostly an agent stuck in a loop. Each log file is one session (a sub-agent's included). A session whose current or last quarter hour (by the clock, like the usual ones) reaches 3 times the usual busy quarter hour and at least 300,000 price-weighted tokens sends a notification naming its folder, at most once an hour per folder. The usual busy quarter hour is the 90th percentile of the past week's busy session quarter hours, up to an hour ago, weighted by what each kind of token costs; until there are 20 of them, nothing counts as unusual. On 4 weeks of real logs, the busiest ordinary quarter hour was 2.9 times the usual. It reads the same logs as the grid above (`sessions/**/*.jsonl`), and nothing leaves the PC. **Settings → Notifications** turns it off.

## Usage by project

Under the grid, the Codex detail page lists this month's (or last month's) projects: each repository's share of the month, its cost at API list prices, and its git branches with any ticket key in the branch name (`KST-482-rate-limits` → `KST-482`). The same session logs are read: a session's folder and branch come from its first `session_meta` line (a sub-agent's log repeats its parent's after it), each turn's model and folder from its `turn_context`, and a `token_usage_record` goes with the turn it names. A folder counts toward the repository it's in (a worktree toward its main checkout). Dollars come from ccusage's daily report for the month, the same as the card's totals; that report gives Codex's cost per day only, so it is shared out over the month's tokens, weighted by what each kind of token costs (input, cached input at a tenth, output at eight times). Without bun or Node.js for ccusage, tokens are shown instead. Nothing leaves the PC.

**Weekly limit** (beside the months, when the card has a weekly limit) lists the projects of the current weekly limit instead, from when it started up to now, to show which project used it. That window starts mid-day and ccusage prices whole days, so the tokens of its first and last day outside it count toward the price per token but get no share of the dollars. Budgets, the forecast and the CSV are per month and aren't shown there.

A project can have a monthly budget (open it in the list; typed in the currency the app shows, kept in US dollars). Its bar then shows the budget used, yellow from 80% and red at 100%, and a notification comes at 80% and at 100%, once each per project and month; the app checks every 15 minutes while it runs, with notifications on, whether the panel is open or not. During the month the list also shows where the spend is heading by its end at the pace so far (from the second day). **Export CSV** saves the month to Downloads (`OpenTokenUsage-projects-<card>-<YYYY-MM>.csv`), one row per branch, with the dollars and, for another currency, the converted amount.
