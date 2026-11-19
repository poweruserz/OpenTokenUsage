# Factory (Droid)

> Reverse-engineered, undocumented API. May change without notice.

## Overview

- **Protocol:** REST (JSON)
- **Base URL:** `https://api.factory.ai`
- **Auth provider:** WorkOS (`api.workos.com`)
- **Client ID:** `client_01HNM792M5G5G1A2THWPXKFMXB`
- **Utilization:** integer percent (0-100)
- **Timestamps:** ISO 8601
- **Windows:** rolling 5-hour, weekly and monthly (the monthly one runs from the subscription start)

## Endpoints

### GET /api/billing/limits

Returns the usage limits Factory's web dashboard and droid show. (The old `/api/organization/subscription/usage` token pool no longer matches them and is not used.)

#### Headers

| Header | Required | Value |
|---|---|---|
| Authorization | yes | `Bearer <access_token>` |
| Accept | no | `application/json` |

#### Response

```jsonc
{
  "usesTokenRateLimitsBilling": true,
  "hasActiveSubscription": true,
  "limits": {
    "standard": {
      "fiveHour": { "usedPercent": 0,  "windowEnd": null, "secondsRemaining": null },
      "weekly":   { "usedPercent": 22, "windowEnd": "2026-11-24T02:54:20.580Z", "secondsRemaining": 436099 },
      "monthly":  { "usedPercent": 11, "windowEnd": "2026-12-17T02:54:20.580Z", "secondsRemaining": 2423299 }
    },
    "core": {                           // Droid Core (optional)
      "fiveHour": { "usedPercent": 0, "windowEnd": null, "secondsRemaining": null },
      "weekly":   { "usedPercent": 0, "windowEnd": null, "secondsRemaining": null },
      "monthly":  { "usedPercent": 0, "windowEnd": null, "secondsRemaining": null }
    }
  },
  "overagePreference": "droidCore",
  "canManageOverage": true,
  "extraUsageBalanceCents": 0,
  "extraUsageAllowed": true
}
```

The response carries no identity fields. Extra usage, overage and managed computers are not shown.

### Lines

| Bucket | Label | Scope | Period |
|---|---|---|---|
| `standard.fiveHour` | Session | overview | 5 hours |
| `standard.weekly` | Weekly | overview | 7 days |
| `standard.monthly` | Monthly | overview | `windowEnd` minus one calendar month (UTC) |
| `core.fiveHour` | Droid Core | detail | 5 hours |
| `core.weekly` | Droid Core Weekly | detail | 7 days |
| `core.monthly` | Droid Core Monthly | detail | one month |

Each line is a percent bar (`used` = `usedPercent`, `limit` = 100), reset at `windowEnd`. Like droid, a bucket whose `windowEnd` is null or already past counts as 0% with no reset time (nothing used since the window ended). A bucket with `unlimited: true` is skipped, and a missing `limits.core` just means no Core lines.

Without `limits.standard`: `hasActiveSubscription: false` shows a "No usage data" badge, otherwise the probe fails with "Usage response missing data". The card has no plan badge.

## Authentication

### Token Location

- `~/.factory/auth.v2.keyring` + its key in Windows Credential Manager (generic credential `Factory CLI/auth-encryption-key`; droid 1.x on Windows; AES-256-GCM encrypted JSON)
- `~/.factory/auth.v2.file` + `~/.factory/auth.v2.key` (current droid auth store; AES-256-GCM encrypted JSON)
- `~/.factory/auth.encrypted` (legacy droid auth file)
- `~/.factory/auth.json` (older droid auth file)
- macOS keychain entry (when droid uses keyring-backed storage)

```jsonc
{
  "access_token": "<WorkOS JWT>",       // ~1329 chars, 7-day lifetime
  "refresh_token": "<token>"            // 25-char WorkOS session token
}
```

### JWT Payload Structure

```jsonc
{
  "exp": 1738900000,                    // expiry (unix seconds)
  "org_id": "org_xxx",                  // organization ID
  "email": "user@example.com",
  "roles": ["owner"]
}
```

### Token Refresh

Access tokens have a 7-day lifetime. Refreshed when within 24 hours of expiry or on 401/403. A refreshed login is written back to the encrypted file it was read from, keeping its other fields (`active_organization_id`, `whoami`, `region`).

```
POST https://api.workos.com/user_management/authenticate
Content-Type: application/x-www-form-urlencoded
```

```
grant_type=refresh_token
&refresh_token=<refresh_token>
&client_id=client_01HNM792M5G5G1A2THWPXKFMXB
```

#### Response

```jsonc
{
  "access_token": "<new_jwt>",
  "refresh_token": "<new_refresh_token>",
  "user": { ... },
  "organization_id": "org_xxx"
}
```

## Prerequisites

The droid CLI must be installed and authenticated:

```bash
# Install droid CLI (if not already installed)
# Then authenticate:
droid
# Follow OAuth flow in browser
```

This creates auth data in the droid auth store (file and/or keychain, depending on droid version/configuration).

## WSL

A login inside a running WSL distro shows as its own `Factory · WSL` card when it's a different account than the ones already shown. A stopped distro is never started; its card keeps its last data.
