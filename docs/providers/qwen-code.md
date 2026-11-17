# Qwen Code

Counts [Qwen Code](https://github.com/QwenLM/qwen-code)'s requests today and this month from the CLI's own ledger.
Nothing is fetched: Alibaba's quota console doesn't take an API key (it answers `ConsoleNeedLogin`), and its plans
bill per request.

## Overview

- **Source:** `~/.qwen/usage/token-usage-YYYY-MM.jsonl`, one JSON line per request
  (`{"localDate":"2026-11-11","model":"qwen3-coder-plus","totalTokens":26644}`)
- **Plan:** `~/.qwen/settings.json`: a `model.baseUrl` containing `token-plan` (or, without a `baseUrl`, a
  `token-plan` entry under `providerMetadata`) shows "Token Plan"

## Setup

1. Install Qwen Code. The card looks for its `~/.qwen` folder.
2. Turn Qwen Code on in Settings → Providers (new providers start off).

## Lines

| Label               | Scope    | What it shows                                         |
| ------------------- | -------- | ----------------------------------------------------- |
| Requests today      | overview | rows of this month's ledger dated today (local time) |
| Requests this month | overview | rows of this month's ledger                           |

A row without tokens (a request that failed before the model answered) isn't counted. The quota itself is on
QwenCloud's usage page (the card's link).

## Errors

| Condition     | Message                                                       |
| ------------- | ------------------------------------------------------------- |
| No `~/.qwen`  | "Qwen Code not installed. Install Qwen Code to get started."  |

Ledger and Token Plan detection as [Pane](https://github.com/ItsJazii/pane) (MIT) reads them.
