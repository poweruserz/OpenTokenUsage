# Kimi API

Shows the pay-as-you-go balance of a [Moonshot (Kimi)](https://platform.moonshot.ai) platform API key. The Kimi Code
plan is a separate card ([Kimi Code](kimi.md)).

## Overview

- **Protocol:** REST (JSON)
- **Endpoints:** `GET https://api.moonshot.ai/v1/users/me/balance`, then `https://api.moonshot.cn/v1/users/me/balance`
  (a key from one platform is rejected by the other)
- **Auth:** `Authorization: Bearer <MOONSHOT_API_KEY>` (not `KIMI_API_KEY`: the Kimi CLI keeps its Kimi Code key
  there, which this endpoint refuses)

## Setup

1. Create a key at [platform.moonshot.ai](https://platform.moonshot.ai/console/api-keys) (or platform.moonshot.cn).
2. Add it as a Windows **user** environment variable named `MOONSHOT_API_KEY`. The card's error has a button that
   opens Windows' Environment Variables dialog.
3. Turn Kimi API on in Settings → Providers (new providers start off).

## Response

```json
{ "data": { "available_balance": 49.58, "voucher_balance": 46.58, "cash_balance": 3.0 } }
```

## Lines

| Label    | Scope    | What it shows                                                        |
| -------- | -------- | -------------------------------------------------------------------- |
| Balance  | overview | `$49.58` (global) or `¥49.58` (China); red at zero (calls stop then) |
| Vouchers | detail   | voucher credit, when there is some                                   |
| Cash     | detail   | the topped-up part                                                   |

## Errors

| Condition                    | Message                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| No key                       | "No MOONSHOT_API_KEY found. Set up environment variable first." |
| 401/403 on both platforms    | "API key invalid. Check your Kimi API key." (one platform not answering isn't proof) |
| Other HTTP error             | "Usage request failed (HTTP {status}). Try again later."       |
| Network error                | "Usage request failed. Check your connection."                 |
| Unreadable response          | "Usage response invalid. Try again later."                     |

Endpoints as [Pane](https://github.com/ItsJazii/pane) (MIT) reads them.
