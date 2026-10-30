(function () {
  const PROVIDER_ID = "opencode-go";
  const DATA_DIR = "~/.local/share/opencode";
  const AUTH_PATH = DATA_DIR + "/auth.json";
  // OpenCode 2 moves logins out of auth.json into each channel database's `credential` table
  // (opencode.db, opencode-next.db, ...) once this migration has run. OpenCode 1 creates the table
  // too but keeps using auth.json (upstream #1323, #1365).
  const CREDENTIALS_IMPORTED_SQL =
    "SELECT 1 AS imported FROM migration WHERE id = '20260805200742_import_legacy_credentials' LIMIT 1";
  const GO_KEY_SQL =
    "SELECT json_extract(value, '$.key') AS key FROM credential " +
    "WHERE integration_id = 'opencode-go' AND (active IS NULL OR active = 1) " +
    "ORDER BY active DESC, time_updated DESC, id DESC LIMIT 1";
  // Official Go usage endpoint: account-wide percents, same numbers as the OpenCode dashboard.
  const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WINDOWS = [
    { key: "rolling", label: "Session", periodMs: 5 * 60 * 60 * 1000 },
    { key: "weekly", label: "Weekly", periodMs: 7 * DAY_MS },
    { key: "monthly", label: "Monthly", periodMs: 30 * DAY_MS },
  ];
  const AUTH_UNREADABLE =
    "Couldn't read OpenCode's auth.json. Check its file permissions or log into OpenCode Go again.";
  const PARSE_FAILED = "Could not parse usage data.";

  function queryRows(ctx, path, sql) {
    const rows = ctx.util.tryParseJson(ctx.host.sqlite.query(path, sql));
    return Array.isArray(rows) ? rows : [];
  }

  // OpenCode 2's key; null once a database holds the logins but no Go key (a logout there, which
  // auth.json must not revive); undefined when no database took the logins over yet.
  function loadDatabaseKey(ctx) {
    let names;
    try {
      names = ctx.host.fs.exists(DATA_DIR) ? ctx.host.fs.listDir(DATA_DIR) : [];
    } catch (e) {
      // An unreadable folder fails loud below when auth.json can't be read either.
      ctx.host.log.warn("opencode data dir list failed: " + String(e));
      return undefined;
    }
    let imported = false;
    let unreadable = null;
    for (const name of names.filter((n) => n.startsWith("opencode") && n.endsWith(".db"))) {
      const path = DATA_DIR + "/" + name;
      try {
        if (queryRows(ctx, path, CREDENTIALS_IMPORTED_SQL).length === 0) continue;
        const row = queryRows(ctx, path, GO_KEY_SQL)[0];
        imported = true;
        const key = row && typeof row.key === "string" ? row.key.trim() : "";
        if (key) return key;
      } catch (e) {
        if (/no such table/i.test(String(e))) continue;
        ctx.host.log.error("opencode credential read failed (" + name + "): " + String(e));
        unreadable = unreadable || name;
      }
    }
    // Broken storage is never mistaken for a logout.
    if (unreadable) {
      throw "Couldn't read OpenCode's " + unreadable + ". Check its file permissions or log into OpenCode Go again.";
    }
    return imported ? null : undefined;
  }

  // Missing file = not logged in (null). Present but unreadable/invalid = broken storage: fail loud.
  function loadAuthKey(ctx) {
    const databaseKey = loadDatabaseKey(ctx);
    if (databaseKey !== undefined) return databaseKey;
    if (!ctx.host.fs.exists(AUTH_PATH)) return null;

    let parsed;
    try {
      parsed = ctx.util.tryParseJson(ctx.host.fs.readText(AUTH_PATH));
    } catch (e) {
      ctx.host.log.error("opencode auth read failed: " + String(e));
      throw AUTH_UNREADABLE;
    }
    if (!parsed || typeof parsed !== "object") {
      ctx.host.log.error("opencode auth file is not valid json");
      throw AUTH_UNREADABLE;
    }
    const entry = parsed[PROVIDER_ID];
    if (!entry || typeof entry !== "object") return null;
    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    return key || null;
  }

  function readNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  // `{ type, error: { type, message } }` error bodies carry a discriminator like `EntitlementError`.
  function errorType(json) {
    const type = json && json.error && json.error.type;
    return typeof type === "string" ? type.trim() : "";
  }

  function buildLine(ctx, raw, window, capturedAt) {
    const percent = raw && typeof raw === "object" ? readNumber(raw.percent) : null;
    if (percent === null) {
      ctx.host.log.error("usage response missing percent for " + window.key);
      throw PARSE_FAILED;
    }
    let resetsAt = typeof raw.resetsAt === "string" ? ctx.util.toIso(raw.resetsAt) : null;
    // An untouched rolling window reports now + 5h. A real sub-1% session rounds to 0,
    // but keeps its earlier reset. Compare at capture time, preferably on the server clock.
    if (window.key === "rolling" && percent <= 0 && resetsAt &&
        Math.abs(Date.parse(resetsAt) - capturedAt - window.periodMs) <= 2000) {
      resetsAt = null;
    }
    return ctx.line.progress({
      label: window.label,
      used: Math.max(0, Math.min(100, percent)),
      limit: 100,
      format: { kind: "percent" },
      resetsAt,
      periodDurationMs: window.periodMs,
    });
  }

  function probe(ctx) {
    const apiKey = loadAuthKey(ctx);
    if (!apiKey) {
      throw "OpenCode Go not detected. Log in with OpenCode Go first.";
    }

    let result;
    try {
      result = ctx.util.requestJson({
        method: "GET",
        url: USAGE_URL,
        headers: {
          Authorization: "Bearer " + apiKey,
          Accept: "application/json",
        },
        timeoutMs: 15000,
      });
    } catch (e) {
      ctx.host.log.error("usage request failed: " + String(e));
      throw "Request failed. Check your connection.";
    }

    const status = result.resp.status;
    const json = result.json;
    if (status === 401) {
      throw "OpenCode Go key was rejected. Log into OpenCode Go again.";
    }
    if (status === 403 && errorType(json) === "EntitlementError") {
      throw "No OpenCode Go subscription on this key.";
    }
    if (status < 200 || status >= 300) {
      ctx.host.log.error("usage api returned: " + status);
      throw "Request failed (HTTP " + status + "). Try again later.";
    }

    const usage = json && json.usage;
    if (!usage || typeof usage !== "object") {
      ctx.host.log.error("usage response missing usage object");
      throw PARSE_FAILED;
    }

    const headers = result.resp.headers || {};
    const dateHeader = Object.keys(headers).find((key) => key.toLowerCase() === "date");
    const serverTime = dateHeader ? Date.parse(headers[dateHeader]) : NaN;
    const capturedAt = Number.isFinite(serverTime) ? serverTime : Date.now();
    return {
      plan: "Go",
      lines: WINDOWS.map((window) => buildLine(ctx, usage[window.key], window, capturedAt)),
    };
  }

  // Who is signed in, for the WSL same-account check (wsl.rs): the Go key itself. Local only.
  function accountKey(ctx) {
    return loadAuthKey(ctx);
  }

  globalThis.__openusage_plugin = { id: PROVIDER_ID, probe, accountKey };
})();
