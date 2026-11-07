# DeepSeek

Shows the balance of a [DeepSeek](https://platform.deepseek.com) API account.

## Overview

- **Protocol:** REST (JSON), documented: [Get User Balance](https://api-docs.deepseek.com/api/get-user-balance)
- **Endpoint:** `GET https://api.deepseek.com/user/balance`
- **Auth:** `Authorization: Bearer <DEEPSEEK_API_KEY>`

## Setup

1. Create a key at [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys).
2. Add it as a Windows **user** environment variable named `DEEPSEEK_API_KEY`. The card's error has a button that
   opens Windows' Environment Variables dialog. The app reads the variable again on every refresh, so no restart is needed.
3. Turn DeepSeek on in Settings → Providers (new providers start off).

## Response

```json
{
  "is_available": true,
  "balance_infos": [
    { "currency": "CNY", "total_balance": "110.00", "granted_balance": "10.00", "topped_up_balance": "100.00" }
  ]
}
```

`balance_infos` has one entry per currency (`USD` or `CNY`). The card shows one: a balance with money in it first,
dollars before yuan. `total_balance` includes granted (free) credit. An empty list shows `0.00`.

## Lines

| Label   | Scope    | What it shows                                                                     |
| ------- | -------- | --------------------------------------------------------------------------------- |
| Balance | overview | `$12.50` or `¥110.00`; red when `is_available` is false (DeepSeek refuses calls) |

DeepSeek has no usage limits to fill, so the card has no bar and the provider doesn't show a number in the tray.
Dollar balances follow the currency setting; yuan stay as they are.

## Errors

| Condition            | Message                                                          |
| -------------------- | ---------------------------------------------------------------- |
| No key               | "No DEEPSEEK_API_KEY found. Set up environment variable first." |
| 401/403              | "API key invalid. Check your DeepSeek API key."                  |
| Other HTTP error     | "Usage request failed (HTTP {status}). Try again later."         |
| Network error        | "Usage request failed. Check your connection."                   |
| Unreadable response  | "Usage response invalid. Try again later."                       |
