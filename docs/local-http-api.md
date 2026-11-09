# Local HTTP API

OpenUsage exposes an HTTP API on the loopback interface so other local apps can consume the same usage data shown in the menu bar. Its only write is the Claude Code status-line bridge below.

**Base URL:** `http://127.0.0.1:6736`

The server starts automatically with the app. If the port is already in use, the feature is silently disabled for that session.

## Routes

### `GET /v1/usage`

Returns an array of cached usage snapshots for all **enabled** providers, ordered by your plugin settings.

- **200 OK** — JSON array (may be empty `[]` if no cached data exists yet).

### `GET /v1/usage/:providerId`

Returns a single cached usage snapshot for the given provider.

- **200 OK** — JSON object with cached snapshot.
- **204 No Content** — Provider is known but has no cached snapshot yet.
- **404 Not Found** — Provider ID is unknown.

### `POST /v1/claude/statusline`

Claude Code's status-line command posts its stdin JSON here when **Settings → Claude Code status line** is on (`claude_statusline.rs` writes `curl.exe -s -m 2 --noproxy 127.0.0.1 --data-binary @- http://127.0.0.1:6736/v1/claude/statusline` into Claude's `settings.json`). Only `rate_limits.five_hour` and `rate_limits.seven_day` are kept, in `plugins_data/claude/statusline.json`, and `context_window.used_percentage` by `session_id`, in memory for the card's live sessions; the rest of the object (paths, model) is dropped. The body is read up to 64 KiB.

- **204 No Content** — saved (an unchanged answer is rewritten at most once a minute). The empty answer leaves Claude Code's status line blank.
- **400 Bad Request** — the body has neither usage windows nor a context fill (before Claude Code's first answer).

### Unsupported methods

Any other method on the above routes returns **405 Method Not Allowed**.

Unknown routes return **404 Not Found**.

## Response Shape

```json
{
  "providerId": "claude",
  "displayName": "Claude",
  "plan": "Max",
  "lines": [
    {
      "type": "progress",
      "label": "Session",
      "used": 42.0,
      "limit": 100.0,
      "format": { "kind": "percent" },
      "resetsAt": "2026-03-26T13:00:00.161Z",
      "periodDurationMs": 18000000,
      "color": null
    },
    {
      "type": "text",
      "label": "Today",
      "value": "$5.17 \u00b7 9.2M tokens",
      "color": null,
      "subtitle": null
    },
    {
      "type": "barChart",
      "label": "Usage Trend",
      "points": [
        { "label": "3/25", "value": 1200000.0, "valueLabel": "1.2M tokens" },
        { "label": "3/26", "value": 2400000.0, "valueLabel": "2.4M tokens" }
      ],
      "note": "Estimated from local logs",
      "color": null
    }
  ],
  "fetchedAt": "2026-03-26T11:16:29Z"
}
```

The `lines` array uses the same metric line types as the internal plugin output: `progress`, `text`, `badge`, and `barChart`.

`fetchedAt` is an ISO 8601 timestamp indicating when the snapshot was last successfully fetched.

`iconUrl` is intentionally omitted from the API response to keep payloads small.

## Filtering and Caching Behavior

- The collection endpoint (`/v1/usage`) returns **enabled providers only**, in the order defined by your plugin settings.
- Only **successful** probe results are cached. A failed probe never overwrites a previous successful snapshot.
- The single-provider endpoint (`/v1/usage/:providerId`) works for any known provider, including disabled ones.

## Browser access

Not allowed. The API is for local, non-browser clients (curl, scripts, Rainmeter, status-line tools).

- No CORS headers are sent and `OPTIONS` preflight is not supported, so a web page cannot read the response.
- The `Host` header must be `127.0.0.1`, `localhost` or `[::1]` (optionally with `:6736`). Anything else, or a missing `Host`, returns **403 Forbidden**. This blocks DNS-rebinding pages.
- A request with an `Origin` header other than `http://127.0.0.1:6736`, `http://localhost:6736` or `http://[::1]:6736` (port optional) returns **403 Forbidden**.

Why: usage data shows your plans and spend. Without these checks any website open in your browser could read it.

## Error Responses

Error responses use this shape:

```json
{
  "error": "provider_not_found"
}
```

Possible error codes: `forbidden`, `provider_not_found`, `not_found`, `method_not_allowed`, `server_busy`.

`forbidden` returns **403 Forbidden** when the `Host` or `Origin` header is not loopback (see [Browser access](#browser-access)).

`server_busy` returns **503 Service Unavailable** when the local API is already handling the maximum number of concurrent connections. Clients should back off and retry later.
