# Muse Code

> Undocumented API, found by other usage trackers and checked on Windows 11 by a user (#88). May change without notice.

Muse Code is off after install, and the first-start detection never turns it on: its only quota source is
Muse's key endpoint, so it is read only once you turn the card on in Settings.

## Overview

- **Protocol:** REST (plain JSON)
- **Endpoint:** `POST https://api.meta.ai/muse-code/key`
- **Token store:** `%USERPROFILE%\.config\muse\auth.json` (written by `muse login`), `providers.meta.access_token`
- **Refresh:** none. Meta refuses refresh grants; an expired login needs `muse login` again.

## Request

| Header | Value |
|---|---|
| Authorization | `Bearer <providers.meta.access_token>` (a `dca:` device token) |
| x-api-version | `1.0.0` |
| Content-Type | `application/json` |

Body `{"onboard":false}`: what the Muse CLI sends at every start (`true` is its sign-up flow).

The endpoint also returns the account's standing Model API key (`api_key`, the same one on every call in
every test so far), the account's email, name and payment method. The plugin reads only the fields below and
keeps nothing else. The host's response log shows `api_key` and `user_email` as first 4 + last 4 characters,
like other providers' keys, and drops `user_full_name`, `payment_method` (string or object) and `action_url`.

## Response

```jsonc
{
  "require_payment": false,          // true: billing was never finished
  "is_subs_active": true,
  "subs_tier_name": "Muse Code Everyday Usage",
  "subs_usage": {                    // left out (or null) while the 5-hour window is idle
    "window": { "used_percent": 0, "window_duration_mins": 300, "resets_at": 1763030400 },
    "weekly": { "used_percent": 24, "resets_at": 1763337600 }
  }
}
```

`used_percent` is a whole number and can pass 100; `resets_at` is in Unix seconds.

## How the plugin reads it

1. No `auth.json` or no `providers.meta`: "Not logged in", without a request. A login without a token in the
   file (kept in the OS keychain) can't be read.
2. `providers.meta.expires_at` in the past: "Session expired", without a request.
3. At most one request per login every 5 minutes, whatever asks (start, panel, manual refresh, Smart refresh's
   floor is 5 minutes too). The last answer, or the last error, is shown in between. Only the plan and the two
   windows are kept, in `last-read.json` in the plugin's data folder, under a hash of the token.
4. 401/403: "Session expired". 429: the host's rate-limit gate. `require_payment` or an inactive plan: "No active
   Muse Code subscription."
5. A window Meta leaves out keeps the last reading until that reading's reset; a session past its reset shows
   0% (a new window nobody has used yet) for as long as Meta leaves it out. A window never seen is not shown, and no window at all is "quota data
   unavailable", never 0%.

## Lines

| Line | Source |
|---|---|
| Session | `subs_usage.window` (5 hours) |
| Weekly | `subs_usage.weekly` |

The plan badge is `subs_tier_name` without its "Muse Code " prefix.

## References

Other trackers that read the same endpoint: CodexBar (`docs/muse.md`), ai-usagebar (`docs/muse-code.md`),
quota-axi (`src/providers/muse.ts`), OpenUsage (`Sources/OpenUsage/Providers/Muse/`). Meta's open issue about
`subs_usage` missing for every account: meta-models/muse-code-sdk#9.
