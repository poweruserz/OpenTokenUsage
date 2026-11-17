# Codebuff

Shows a [Codebuff](https://www.codebuff.com) account's credits and its plan's weekly limit.

> Undocumented API. May change without notice.

## Overview

- **Protocol:** REST (JSON)
- **Endpoints:** `POST https://www.codebuff.com/api/v1/usage` (body `{"fingerprintId": "opentokenusage"}`),
  `GET https://www.codebuff.com/api/user/subscription` (plan and weekly limit; the card stands without it)
- **Auth:** `Authorization: Bearer <token>`: `CODEBUFF_API_KEY`, else the login `codebuff login` saves in
  `~/.config/manicode/credentials.json` (`default.authToken`)

## Setup

1. Run `codebuff login` (or set a `CODEBUFF_API_KEY` user environment variable).
2. Turn Codebuff on in Settings → Providers (new providers start off).

## Lines

| Label   | Scope    | What it shows                                                                  |
| ------- | -------- | ------------------------------------------------------------------------------ |
| Credits | overview | credits used of the quota (`usage`/`quota`, or used + `remainingBalance`), with the reset |
| Weekly  | overview | the plan's weekly limit in percent (`rateLimit.weeklyUsed`/`weeklyLimit`)      |

The badge shows the plan's `displayName` (or `tier`).

## Errors

| Condition              | Message                                                    |
| ---------------------- | ---------------------------------------------------------- |
| No token               | "Codebuff not logged in. Run `codebuff login`."            |
| 401/403 (CLI login)    | "Codebuff auth expired. Run `codebuff login` again."       |
| 401/403 (API key)      | "API key invalid. Check your Codebuff API key."            |
| Other HTTP error       | "Usage request failed (HTTP {status}). Try again later."   |
| Network error          | "Usage request failed. Check your connection."             |
| Unreadable response    | "Usage response invalid. Try again later."                 |

Endpoints and answer shapes as [Pane](https://github.com/ItsJazii/pane) (MIT) reads them.
