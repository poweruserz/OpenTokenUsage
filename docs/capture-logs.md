# How to Capture Logs for a Bug Report

Use this when OpenTokenUsage is not working and you need to share debug info.

- Audience: non-technical users
- Time: ~2 minutes
- Platform: Windows

## 1) Set log level to Debug

1. Find the OpenTokenUsage icon in the notification area next to the clock (it may be under `^`).
2. Right-click it.
3. Open `Log level`.
4. Select `Debug`.

If OpenTokenUsage does not open at all, skip this step and continue.

## 2) Reproduce the issue once

1. Do the action that fails.
2. Wait for the failure to happen.
3. Stop after 1-2 attempts (enough data, less noise).

## 3) Open the log folder

1. Press `Win` + `R`.
2. Paste this path:

```text
%LOCALAPPDATA%\com.poweruserz.opentokenusage\logs
```

3. Press `Enter`.

(On any version, `Log level` → `Copy log path` in the tray menu copies the log file's path.)

## 4) Attach log files to your GitHub issue

1. Attach `OpenTokenUsage.log`.
2. If you also see other `.log` files there, attach those too.
3. Drag the files directly into your issue/comment on GitHub.

## 5) Add this context in the same issue comment

Copy/paste and fill:

```text
What I expected:
What happened instead:
When it happened (local time + timezone):
Which provider was affected (Codex / Claude / Cursor / etc.):
OpenTokenUsage version:
```

## Privacy note

Logs are redacted for common secrets, but still review before sharing in public.

## Optional: switch log level back

After sending logs, set `Log level` back to `Error`.
