import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx } from "../test-helpers.js";

const AUTH_PATH = "~/.local/share/opencode/auth.json";
const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const DAY_MS = 24 * 60 * 60 * 1000;

const loadPlugin = async () => {
  await import("./plugin.js");
  return globalThis.__openusage_plugin;
};

function setAuth(ctx, value = "go-key") {
  ctx.host.fs.writeText(
    AUTH_PATH,
    JSON.stringify({
      "opencode-go": { type: "api", key: value },
    }),
  );
}

const DB_PATH = "~/.local/share/opencode/opencode.db";
const NEXT_DB_PATH = "~/.local/share/opencode/opencode-next.db";

// OpenCode channel databases by path: `imported` = OpenCode 2 moved the logins in (false = an
// OpenCode 1 database), `goKey` = its opencode-go row, `error` = the query fails.
function setDatabases(ctx, databases) {
  for (const path of Object.keys(databases)) ctx.host.fs.writeText(path, "");
  ctx.host.sqlite.query.mockImplementation((path, sql) => {
    const db = databases[path];
    if (db.error) throw new Error(db.error);
    if (sql.includes("FROM migration")) {
      if (db.imported === undefined) throw new Error("no such table: migration");
      return JSON.stringify(db.imported ? [{ imported: 1 }] : []);
    }
    return JSON.stringify(db.goKey ? [{ key: db.goKey }] : []);
  });
}

function setResponse(ctx, status, body) {
  ctx.host.http.request.mockReturnValue({
    status,
    headers: {},
    bodyText: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const USAGE_BODY = {
  usage: {
    rolling: { percent: 42.5, resetsAt: "2026-03-06T17:00:00Z" },
    weekly: { percent: 10, resetsAt: "2026-03-09T00:00:00Z" },
    monthly: { percent: 3, resetsAt: "2026-04-01T00:00:00Z" },
  },
};

describe("opencode-go plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin;
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ships plugin metadata with links and expected line layout", () => {
    const manifest = JSON.parse(
      readFileSync("plugins/opencode-go/plugin.json", "utf8"),
    );

    expect(manifest.id).toBe("opencode-go");
    expect(manifest.name).toBe("OpenCode Go");
    expect(manifest.brandColor).toBe("#000000");
    expect(manifest.links).toEqual([
      { label: "Console", url: "https://opencode.ai/auth" },
      { label: "Docs", url: "https://opencode.ai/docs/go/" },
    ]);
    expect(manifest.lines).toEqual([
      { type: "progress", label: "Session", scope: "overview", primaryOrder: 1 },
      { type: "progress", label: "Weekly", scope: "overview", period: "weekly" },
      { type: "progress", label: "Monthly", scope: "detail" },
    ]);
  });

  it("throws when auth.json is missing", async () => {
    const ctx = makeCtx();
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow(
      "OpenCode Go not detected. Log in with OpenCode Go first.",
    );
    expect(ctx.host.http.request).not.toHaveBeenCalled();
  });

  it("throws when auth.json has no opencode-go key", async () => {
    const ctx = makeCtx();
    ctx.host.fs.writeText(AUTH_PATH, JSON.stringify({ openai: { key: "x" } }));
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("OpenCode Go not detected");
  });

  it("fails loud when auth.json is not valid json", async () => {
    const ctx = makeCtx();
    ctx.host.fs.writeText(AUTH_PATH, "{not json");
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Couldn't read OpenCode's auth.json");
    expect(ctx.host.http.request).not.toHaveBeenCalled();
  });

  // Issue #39: OpenCode 2 keeps the Go key in its databases, so auth.json alone missed the login.
  it("reads OpenCode 2's Go key from its database ahead of the imported auth.json", async () => {
    const ctx = makeCtx();
    setAuth(ctx, "old-key");
    setDatabases(ctx, { [DB_PATH]: { imported: true, goKey: "  db-key  " } });
    setResponse(ctx, 200, USAGE_BODY);

    const plugin = await loadPlugin();
    plugin.probe(ctx);

    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer db-key");
    expect(plugin.accountKey(ctx)).toBe("db-key");
  });

  it("doesn't revive a Go logout in OpenCode 2 from the imported auth.json", async () => {
    const ctx = makeCtx();
    setAuth(ctx, "old-key");
    setDatabases(ctx, { [DB_PATH]: { imported: true, goKey: null } });

    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("OpenCode Go not detected");
    expect(ctx.host.http.request).not.toHaveBeenCalled();
  });

  it("keeps reading auth.json while no database has taken the logins over", async () => {
    const plugin = await loadPlugin();

    for (const db of [{ imported: false, goKey: "unused" }, {}]) {
      const ctx = makeCtx();
      setAuth(ctx, "file-key");
      setDatabases(ctx, { [DB_PATH]: db });
      setResponse(ctx, 200, USAGE_BODY);
      plugin.probe(ctx);
      expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer file-key");
    }
  });

  it("finds the Go key in any release channel's database", async () => {
    const ctx = makeCtx();
    // listDir sorts opencode-next.db first; its logout doesn't hide the stable channel's key.
    setDatabases(ctx, {
      [NEXT_DB_PATH]: { imported: true, goKey: null },
      [DB_PATH]: { imported: true, goKey: "stable-key" },
    });
    setResponse(ctx, 200, USAGE_BODY);

    const plugin = await loadPlugin();
    plugin.probe(ctx);

    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer stable-key");
  });

  it("fails loud when a database can't be read instead of reading it as a logout", async () => {
    const ctx = makeCtx();
    setAuth(ctx, "file-key");
    setDatabases(ctx, { [DB_PATH]: { error: "disk I/O error" } });

    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow(
      "Couldn't read OpenCode's opencode.db. Check its file permissions or log into OpenCode Go again.",
    );
    expect(ctx.host.http.request).not.toHaveBeenCalled();
  });

  // Regression: meters used to be a local SQLite dollar estimate that only saw this machine
  // and drifted from the dashboard. They now come from the official usage API.
  it("maps the official usage API into Session/Weekly/Monthly percent meters", async () => {
    const ctx = makeCtx();
    setAuth(ctx, "  go-key  ");
    setResponse(ctx, 200, USAGE_BODY);

    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);

    const request = ctx.host.http.request.mock.calls[0][0];
    expect(request.method).toBe("GET");
    expect(request.url).toBe(USAGE_URL);
    expect(request.headers.Authorization).toBe("Bearer go-key");
    expect(ctx.host.sqlite.query).not.toHaveBeenCalled();

    expect(result).toEqual({
      plan: "Go",
      lines: [
        {
          type: "progress",
          label: "Session",
          used: 42.5,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: "2026-03-06T17:00:00.000Z",
          periodDurationMs: 5 * 60 * 60 * 1000,
        },
        {
          type: "progress",
          label: "Weekly",
          used: 10,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: "2026-03-09T00:00:00.000Z",
          periodDurationMs: 7 * DAY_MS,
        },
        {
          type: "progress",
          label: "Monthly",
          used: 3,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: "2026-04-01T00:00:00.000Z",
          periodDurationMs: 30 * DAY_MS,
        },
      ],
    });
  });

  it("clamps percents, accepts numeric strings, and tolerates a missing resetsAt", async () => {
    const ctx = makeCtx();
    setAuth(ctx);
    setResponse(ctx, 200, {
      usage: {
        rolling: { percent: 140 },
        weekly: { percent: "-5" },
        monthly: { percent: "12.5", resetsAt: "2026-04-01T00:00:00Z" },
      },
    });

    const plugin = await loadPlugin();
    const lines = plugin.probe(ctx).lines;

    expect(lines.map((line) => line.used)).toEqual([100, 0, 12.5]);
    expect(lines[0].resetsAt).toBeUndefined();
  });

  it("reports a rejected key on 401", async () => {
    const ctx = makeCtx();
    setAuth(ctx);
    setResponse(ctx, 401, { type: "error", error: { type: "AuthError", message: "bad" } });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow(
      "OpenCode Go key was rejected. Log into OpenCode Go again.",
    );
  });

  it("reports no subscription on 403 EntitlementError", async () => {
    const ctx = makeCtx();
    setAuth(ctx);
    setResponse(ctx, 403, {
      type: "error",
      error: { type: "EntitlementError", message: "no go" },
    });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("No OpenCode Go subscription on this key.");
  });

  it("treats other non-2xx responses (including non-entitlement 403) as HTTP failures", async () => {
    const plugin = await loadPlugin();

    const forbidden = makeCtx();
    setAuth(forbidden);
    setResponse(forbidden, 403, "<html>cloudflare</html>");
    expect(() => plugin.probe(forbidden)).toThrow("Request failed (HTTP 403). Try again later.");

    const serverError = makeCtx();
    setAuth(serverError);
    setResponse(serverError, 500, "");
    expect(() => plugin.probe(serverError)).toThrow("Request failed (HTTP 500). Try again later.");
  });

  it("reports connection failures", async () => {
    const ctx = makeCtx();
    setAuth(ctx);
    ctx.host.http.request.mockImplementation(() => {
      throw new Error("dns failure");
    });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Request failed. Check your connection.");
  });

  it("fails loud when the usage body is malformed", async () => {
    const plugin = await loadPlugin();

    const noUsage = makeCtx();
    setAuth(noUsage);
    setResponse(noUsage, 200, { ok: true });
    expect(() => plugin.probe(noUsage)).toThrow("Could not parse usage data.");

    const noPercent = makeCtx();
    setAuth(noPercent);
    setResponse(noPercent, 200, {
      usage: { rolling: { percent: 1 }, weekly: {}, monthly: { percent: 1 } },
    });
    expect(() => plugin.probe(noPercent)).toThrow("Could not parse usage data.");

    const boolPercent = makeCtx();
    setAuth(boolPercent);
    setResponse(boolPercent, 200, {
      usage: { rolling: { percent: true }, weekly: { percent: 1 }, monthly: { percent: 1 } },
    });
    expect(() => plugin.probe(boolPercent)).toThrow("Could not parse usage data.");
  });
});
