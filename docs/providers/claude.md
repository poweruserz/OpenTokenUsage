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

Reset grants (`cedar_ember`) come from Claude Code's own request, `GET /api/oauth/usage?cedar_ember=1&skip_spend=1`, sent at most once an hour per account; asking for them on every refresh drew 429s with a Retry-After of about 50 minutes. The last answer is kept in `reset-grants.json` in the plugin's data folder and shown in between. A failed check (a 429 or an outage) keeps it, leaves the bars alone, and is retried an hour later. The check has its own 429 gate (`gateScope`), so its 429 never holds the plain usage poll. When `.claude.json` (which tells accounts apart) exists but can't be read, the check is skipped.

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

## WSL

A login inside a running WSL distro shows as its own `Claude · WSL` card when it's a different account than the ones already shown. A stopped distro is never started; its card keeps its last data.

## Banked reset expiry

The reset row shows the available count and each expiry in local time, with a live days/hours countdown. Expired entries are removed locally between probes. The usage-page button opens the provider dashboard; this app never redeems a reset.

Usage notifications also remind you during the final seven days and final 24 hours. The app must be running, notifications enabled, and the provider data current. Reminders are persisted so restarting does not repeat them. A missing expiry is shown as unavailable and never guessed.

`cedar_ember.grants[].ends_at` supplies expiry dates; `resets_left` supplies counts. Spent, expired, paused, and explicitly unusable grants are excluded.

Implementation reference: [T3 Code Claude reset credits](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/claudeResetCredits.ts). T3 Code also implements explicit redemption; OpenTokenUsage opens the provider’s usage page instead.
