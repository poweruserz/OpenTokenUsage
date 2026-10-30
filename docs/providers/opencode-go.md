# OpenCode Go

> Reads account-wide OpenCode Go usage from OpenCode's official usage API.

## Overview

- **Auth:** OpenCode 2 keeps the key in the `credential` table (`integration_id = 'opencode-go'`) of each `~/.local/share/opencode/opencode*.db`, once its `20260805200742_import_legacy_credentials` migration has run; until then (OpenCode 1) it's the `opencode-go` entry `key` in `~/.local/share/opencode/auth.json`. OpenCode 2 never deletes `auth.json`, so once a database holds the logins the file is ignored and a logout there stays a logout.
- **Endpoint:** `GET https://opencode.ai/zen/go/v1/usage` with `Authorization: Bearer <key>`
- **Provider ID:** `opencode-go`
- **Usage scope:** account-wide (same numbers as the OpenCode dashboard, all devices)

## Meters

| Line | Response field | Period |
|---|---|---|
| Session | `usage.rolling.percent` / `resetsAt` | 5h |
| Weekly | `usage.weekly.percent` / `resetsAt` | 7d |
| Monthly | `usage.monthly.percent` / `resetsAt` | 30d |

Percents are clamped to 0–100.

## Errors

- No `opencode-go` key in the databases or `auth.json` → "OpenCode Go not detected" (a key set only via env/config is not read; the old local `opencode.db` spend estimate was removed)
- `auth.json` or a database present but unreadable/invalid → error (not skipped)
- `401` → key rejected, log in again
- `403` with `error.type: "EntitlementError"` → no OpenCode Go subscription on this key
- Other non-2xx → HTTP error
- Missing `usage` or a missing `percent` → "Could not parse usage data"

## WSL

A login inside a running WSL distro shows as its own `OpenCode Go · WSL` card when it's a different account than the ones already shown. A stopped distro is never started; its card keeps its last data.

A zero-percent rolling session can already be active. Its real reset remains visible; only a reset
within two seconds of a full five-hour period at capture time is treated as an untouched placeholder.
The HTTP Date header supplies the reference clock when valid. Weekly and monthly resets are preserved.
