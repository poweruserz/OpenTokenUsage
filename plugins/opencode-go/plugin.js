(function () {
  const PROVIDER_ID = "opencode-go";
  const AUTH_PATH = "~/.local/share/opencode/auth.json";
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

  // Missing file = not logged in (null). Present but unreadable/invalid = broken storage: fail loud.
  function loadAuthKey(ctx) {
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
