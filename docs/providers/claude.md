# Claude Code

> Reverse-engineered, undocumented API. May change without notice.

## Overview

- **Protocol:** REST (plain JSON)
- **Base URL:** `https://api.anthropic.com`
- **Auth provider:** `platform.claude.com` (OAuth 2.0)
- **Client ID:** `9d1c250a-e61b-44d9-88ed-5944d1962f5e`
- **Beta header required:** `anthropic-beta: oauth-2025-04-20`
- **Utilization:** integer percentage (0-100)
- **Credits:** cents (divide by 100 for dollars)
- **Timestamps:** ISO 8601 (response), unix milliseconds (credentials file)

## Endpoints

### GET /api/oauth/usage

Returns rate limit windows and optional extra credits. Every refresh reads this plain endpoint.

Reset grants (`cedar_ember`) come from Claude Code's own request, `GET /api/oauth/usage?cedar_ember=1&skip_spend=1`, per account (per token pair when `.claude.json` has no account id) at most once an hour while the last answer was `eligible` or a limit is at 100%, otherwise once a day; asking for them on every refresh drew 429s with a Retry-After of about 50 minutes, and Anthropic limits this variant hard. Grants that arrive within that day (a model launch hands them out) would show as "0 available" until it ends, so the day isn't waited out when Claude Code has noticed them: it asks for grants itself when it starts and notes in `.claude.json` (`unusedLimitResetStatusCache`) whether the account holds an unused reset, and a note newer than the kept "none" brings the hourly check back, until an answer newer than the note comes (a failed check isn't one). The last answer is kept in `reset-grants.json` in the plugin's data folder and shown in between. A failed check (a 429 or an outage) keeps it, leaves the bars alone, and is retried when the next one is due. The check shares the plain usage poll's 429 gate: Anthropic budgets the usage endpoint per account (about 30 reads an hour, shared with Claude Code and any other monitor on the login) and its penalty covers the whole account, so after a 429 on either nothing goes out until it passes. When `.claude.json` (which tells accounts apart) exists but can't be read, the check is skipped.

#### Claude Code's status line

With **Settings → Claude Code status line** on, Claude Code posts its status-line JSON to the local API (see `docs/local-http-api.md`). Its `rate_limits` carry the 5-hour and weekly windows from Claude Code's own API answers, so they cost no read of this endpoint. While that snapshot is under 5 minutes old, a probe lays its windows over the last usage answer (`last-usage.json`, kept per account) and reads the endpoint only when that answer is 30 minutes old, for the rows the status line lacks (model limits, extra usage). A 429 then shows the status line instead of the rate-limit error, even before any answer was kept (only its two rows then). A window the status line leaves out has reset. The status line carries no account, so a snapshot captured before the probe first saw the current login (`account-seen.json`) is ignored: after a switch, the previous account's windows never reach the new one's card. The bridge is written to the `settings.json` of `CLAUDE_CONFIG_DIR` (or `~/.claude`), never over a status line of the user's own, and only the usual login gets it: extra accounts have their own folders and plugin ids.

After a 429 the host waits what Retry-After asks, but at least 5, 10, 20, then 30 minutes for each 429 in a row, until a read succeeds (`http_gate.rs`). Anthropic has asked for an hour each time. Claude Code reads this endpoint too (its own `/usage`, a reset-grants check per account when it starts, offers, a check at a limit), so the app reads it at most once per 10 minutes, whatever asks: Smart refresh waits 10 minutes between Claude checks, and a probe sooner than that (the app restarting or updating, the panel opening, a manual refresh) shows the kept answer (`last-usage.json`) with the time it was read, a window whose reset has passed counted as reset. While a 429 is waited out, the card keeps its last bars under a grey note rather than a red error.

#### Headers

| Header | Required | Value |
|---|---|---|
| Authorization | yes | `Bearer <access_token>` |
| Accept | yes | `application/json` |
| Content-Type | yes | `application/json` |
| anthropic-beta | yes | `oauth-2025-04-20` |

#### Response

```jsonc
{
  "five_hour": {
    "utilization": 25,              // % used in 5h rolling window
    "resets_at": "2026-01-28T15:00:00Z"
  },
  "seven_day": {
    "utilization": 40,              // % used in 7-day window
    "resets_at": "2026-02-01T00:00:00Z"
  },
  "seven_day_opus": {               // separate weekly Opus limit (optional, plan-dependent)
    "utilization": 0,
    "resets_at": "2026-02-01T00:00:00Z"
  },
  "seven_day_omelette": {           // separate weekly Claude Design limit (optional, plan-dependent)
    "utilization": 0,
    "resets_at": "2026-02-01T00:00:00Z"
  },
  "extra_usage": {                  // on-demand overage credits (optional)
    "is_enabled": true,
    "used_credits": 500,            // cents spent
    "monthly_limit": 10000,         // cents cap (0 = unlimited)
    "currency": "USD"
  }
}
```

All windows are enforced simultaneously — hitting any limit throttles the user.

## Authentication

### Token Location

On macOS, OpenUsage reads Claude Code credentials from Keychain first. The default service name is:

```text
Claude Code-credentials
```

When `CLAUDE_CONFIG_DIR` is set, Claude Code may use a config-specific service name instead. OpenUsage checks this hashed name before the default service:

```text
Claude Code-credentials-<sha256(CLAUDE_CONFIG_DIR).slice(0, 8)>
```

Keychain values use the same JSON structure as the legacy credentials file:

```jsonc
{
  "claudeAiOauth": {
    "accessToken": "<jwt>",          // OAuth access token (Bearer)
    "refreshToken": "<token>",
    "expiresAt": 1738300000000,      // unix ms
    "scopes": ["..."],
    "subscriptionType": "pro",
    "rateLimitTier": "..."
  }
}
```

**Fallback:** `~/.claude/.credentials.json`. This file can be left behind by older Claude Code versions, so it is treated as a fallback when Keychain does not contain usable credentials.

### Token Refresh

Access tokens are short-lived JWTs. The login is Claude Code's: it renews it ahead of expiry while it runs, and its refresh tokens are single-use, so refreshing alongside it can sign Claude Code out (upstream #1417). The plugin therefore refreshes only once the token has expired, or on 401/403, and right before refreshing reads the stored login again: if Claude Code renewed it meanwhile, that login is used instead. When the refresh comes back `invalid_grant` (Claude Code used the refresh token first), the login Claude Code stored is used; "Session expired" shows only when there is none.

```
POST https://platform.claude.com/v1/oauth/token
Content-Type: application/json
```

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "<refresh_token>",
  "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  "scope": "user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload"
}
```

```jsonc
{
  "access_token": "<new_jwt>",
  "refresh_token": "<new_refresh_token>",  // may be same as previous
  "expires_in": 3600                       // seconds
}
```

## Plan

The badge shows the plan under Anthropic's own name: `organization.plan_display_name` from `GET /api/oauth/profile` (`Pro`, `Max`, `Ultra`), the name Claude Code shows too. The profile is read at most once per token pair, after a usage read that worked, and the answer is kept in `live-plan.json`; Claude Code stamps the plan into the login at sign-in and never updates it, so an upgrade would otherwise show the old plan until the next sign-in.

When the profile gives no usable name, the plan is named from its `organization_type` and `rate_limit_tier`, with the login's `subscriptionType` and `rateLimitTier` for what it omits; until the profile has answered, from the login's alone. Anthropic renamed the Max tiers on 2026-10-30, and the ids didn't change:

| Type | Tier | Name | Before 2026-10-30 |
|---|---|---|---|
| `max` | `default_claude_max_5x` | Max | Max 5x |
| `max` | `default_claude_max_20x` | Ultra | Max 20x |

A verified Ultra account has no 5-hour limit: `five_hour` comes back `null` and the card shows no Session row.

## Live sessions

The Claude card (the usual login and each extra account) lists the Claude Code sessions running on this machine, read every 5 seconds while the panel is shown. Each running `claude` keeps `sessions/<pid>.json` in its config folder (`CLAUDE_CONFIG_DIR` or `~/.claude`) with its name, folder and state (`busy`, `shell`, `idle`, `waiting`). A file is skipped when its process has ended (a crash leaves it behind) or its pid now belongs to a process started at another time than the file's `procStart`; daemon processes aren't sessions. With the status line on, each session also shows how full its context window is (`context_window.used_percentage` from its last post, kept in memory): yellow from 70%, red with "Compacts soon" from 85%. A WSL card lists none: its processes aren't Windows processes.

## WSL

A login inside a running WSL distro shows as its own `Claude · WSL` card when it's a different account than the ones already shown. A stopped distro is never started; its card keeps its last data.

## Banked reset expiry

The resets section shows the available count beside its title and a row per kind of reset: how many, the time left, and the day they expire (the exact local time on hover). Expired entries are removed locally between probes. The usage-page button opens the provider dashboard; this app never redeems a reset.

Usage notifications also remind you during the final seven days and final 24 hours. The app must be running, notifications enabled, and the provider data current. Reminders are persisted so restarting does not repeat them. A missing expiry is shown as unavailable and never guessed.

`cedar_ember.grants[].ends_at` supplies expiry dates; `resets_left` supplies counts. Spent, expired, paused, and explicitly unusable grants are excluded.

Each entry names what it resets, as Claude Code does: a grant with `gives_back_weekly` is a **Fable reset**, otherwise its `type` (`session`, `weekly`, `full`) names it, and without a type what it `clears` does (only `five_hour`: 5-hour reset; no `five_hour`: weekly reset; both: full reset). A Fable reset clears the 5-hour and Fable limits and gives the weekly limit back only what Fable used, so the row says so under it: counted with a weekly reset as one number, it read as a reset of the whole week. Resets of one kind that expire together are shown as one entry with their count. A grant that says neither has no name.

Implementation reference: [T3 Code Claude reset credits](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/claudeResetCredits.ts). T3 Code also implements explicit redemption; OpenTokenUsage opens the provider’s usage page instead.

## Usage by hour

The Claude detail page shows a 7 × 24 grid of tokens per weekday and local hour over the last 4 weeks (input, output, cache writes and cache reads), read from Claude Code's own transcripts: `projects/**/*.jsonl` in `CLAUDE_CONFIG_DIR` or `~/.claude`, extra accounts in their own folders, never a WSL copy. Only usage and timestamps are read, and nothing leaves the PC. Claude Code writes a line per content block of a message, each with the message's usage so far; a message counts once, at its largest usage. Each file is read once and afterwards only from where the last read stopped (the first read after the app starts can take a few seconds on gigabytes of transcripts); the grid refreshes every 5 minutes while it's shown. A log it can't read is left out and counted under the grid. Arrow keys move between cells; the header then reads out the focused hour.
## Usage by project

Under the grid, the Claude detail page lists this month's (or last month's) projects: each repository's share of the month, its cost at API list prices, and its git branches with any ticket key in the branch name (`KST-482-rate-limits` → `KST-482`). Every transcript line names the folder (`cwd`) and git branch (`gitBranch`, `HEAD` when Claude Code couldn't name one) its message was written in; a folder counts toward the repository it's in (a worktree toward its main checkout). Dollars come from ccusage's daily report for the month, the same as the card's totals: each model's cost is shared out over the projects that used it, by their tokens weighted at Anthropic's price ratios (output 5×, cache writes 1.25×, cache reads 0.1× of input; cache reads 0.05× on Opus 5.5 and Sonnet 5.5, 0.025× on Fable and Mythos 5.1 and 5.2), so the projects add up to ccusage's total. On a subscription that total is what the usage would cost through the API, not what the plan bills. Without bun or Node.js for ccusage, tokens are shown instead. Nothing leaves the PC.

A project can have a monthly budget (open it in the list; typed in the currency the app shows, kept in US dollars). Its bar then shows the budget used, yellow from 80% and red at 100%, and a notification comes at 80% and at 100%, once each per project and month; the app checks every 15 minutes while it runs, with notifications on, whether the panel is open or not. During the month the list also shows where the spend is heading by its end at the pace so far (from the second day). **Export CSV** saves the month to Downloads (`OpenTokenUsage-projects-<card>-<YYYY-MM>.csv`), one row per branch, with the dollars and, for another currency, the converted amount.
