# OpenRouter

Tracks an [OpenRouter](https://openrouter.ai) account's credit balance and the spend of one API key.

## Overview

- **Protocol:** REST (JSON), documented: [Limits](https://openrouter.ai/docs/api/reference/limits)
- **Auth:** `Authorization: Bearer <OPENROUTER_API_KEY>`
- **Amounts:** US dollars (the currency setting converts them on the card)

## Setup

1. Create a key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).
2. Add it as a Windows **user** environment variable named `OPENROUTER_API_KEY`. The card's error has a button that
   opens Windows' Environment Variables dialog. The app reads the variable again on every refresh, so no restart is needed.
3. Turn OpenRouter on in Settings → Providers (new providers start off).

## Endpoints

### GET /api/v1/key

The key's own data. Any valid key can read it; 401/403 means the key is wrong or disabled.

| Field             | Used for                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| `limit`           | The key's spending cap in dollars (`null`: none)                         |
| `limit_remaining` | What's left of the cap in its current window                             |
| `limit_reset`     | `daily` / `weekly` / `monthly` / `null` (never resets)                   |
| `usage_daily`     | This key's spend today (UTC)                                             |
| `usage_weekly`    | This week (UTC, from Monday): the cap's spend when `limit_remaining` is missing |
| `usage_monthly`   | This month (UTC)                                                         |
| `usage`           | All time: the spend of a cap that never resets                           |

### GET /api/v1/credits

`total_credits` (bought) and `total_usage` (spent) for the whole account. OpenRouter may answer it only for
management keys (403 "Only management keys can perform this operation"); the card then shows the key's lines alone.

## Lines

| Label     | Scope    | What it shows                                                                  |
| --------- | -------- | ------------------------------------------------------------------------------ |
| Credits   | overview | Account credits spent of those bought (switch to "left" for the balance). Tray primary. |
| API usage | overview | The key's spend against its cap, resetting with it (UTC midnight, Monday, the 1st). Only for a key with a cap. |
| Today     | overview | The key's spend today (UTC)                                                     |
| Monthly   | detail   | The key's spend this month (UTC)                                                |

Today and Monthly are this key's spend, not the account's: other keys on the same account aren't counted.

## Errors

| Condition            | Message                                                            |
| -------------------- | ------------------------------------------------------------------ |
| No key               | "No OPENROUTER_API_KEY found. Set up environment variable first." |
| 401/403 on `/key`    | "API key invalid. Check your OpenRouter API key."                  |
| Other HTTP error     | "Usage request failed (HTTP {status}). Try again later."           |
| Network error        | "Usage request failed. Check your connection."                     |
| Unreadable response  | "Usage response invalid. Try again later."                         |

The key's `label` (by default part of the key itself), `creator_user_id`, `organization_id`, `workspace_id` and
`guardrail_id` are redacted from the logs.
