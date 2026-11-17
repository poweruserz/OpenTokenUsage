# Kilo

Shows a [Kilo](https://kilo.ai) account's credit blocks and its Kilo Pass month.

> Undocumented API. May change without notice.

## Overview

- **Protocol:** tRPC batch (JSON), one request
- **Endpoint:** `GET https://app.kilo.ai/api/trpc/user.getCreditBlocks,kiloPass.getState?batch=1&input=…`
- **Auth:** `Authorization: Bearer <token>`: `KILO_API_KEY`, else the Kilo CLI's login in
  `~/.local/share/kilo/auth.json` (`kilo.access`)

## Setup

1. Sign in with the Kilo CLI, or add a `KILO_API_KEY` user environment variable. The card's error has a button that
   opens Windows' Environment Variables dialog.
2. Turn Kilo on in Settings → Providers (new providers start off).

## Response

Each batch entry is `{ "result": { "data": { "json": … } } }`. Credit blocks carry `amount_mUsd` and `balance_mUsd`
(millionths of a dollar); the Pass state carries `subscription` (`null` without a Pass) with `tier`,
`currentPeriodUsageUsd`, `currentPeriodBaseCreditsUsd`, `currentPeriodBonusCreditsUsd` and `nextBillingAt`.

## Lines

| Label     | Scope    | What it shows                                                        |
| --------- | -------- | -------------------------------------------------------------------- |
| Credits   | overview | dollars used of all credit blocks (a fresh account: its balance)     |
| Kilo Pass | overview | the Pass month's usage of its base + bonus credits, with the renewal |

The badge names the Pass tier (`tier_19` Starter, `tier_49` Pro, `tier_199` Expert). A Pass whose `status` is not
`active`, `past_due` or `trialing` (a cancelled one comes back whole) is left off the card.

## Errors

| Condition              | Message                                                       |
| ---------------------- | ------------------------------------------------------------- |
| No key or login        | "No KILO_API_KEY found. Set up environment variable first."   |
| 401/403                | "API key invalid or expired. Check your Kilo API key."        |
| Other HTTP error       | "Usage request failed (HTTP {status}). Try again later."      |
| Network error          | "Usage request failed. Check your connection."                |
| Unreadable response    | "Usage response invalid. Try again later."                    |

Endpoint and answer shapes as [Pane](https://github.com/ItsJazii/pane) (MIT) reads them.
