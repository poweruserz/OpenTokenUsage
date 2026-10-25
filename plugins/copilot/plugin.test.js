import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePluginTestContext } from "../test-helpers.js";

const loadPlugin = async () => {
  await import("./plugin.js");
  return globalThis.__openusage_plugin;
};

function makeUsageResponse(overrides = {}) {
  return {
    copilot_plan: "pro",
    quota_reset_date: "2099-01-15T00:00:00Z",
    quota_snapshots: {
      premium_interactions: {
        percent_remaining: 80,
        entitlement: 300,
        remaining: 240,
        quota_id: "premium",
      },
      chat: {
        percent_remaining: 95,
        entitlement: 1000,
        remaining: 950,
        quota_id: "chat",
      },
    },
    ...overrides,
  };
}

function setGhCliKeychain(ctx, value) {
  // gh's Credential Manager item for the active account: `gh:github.com:` (empty user).
  ctx.host.keychain.readGenericPassword.mockImplementation((service, account) => {
    if (service === "gh:github.com" && account === "") return value;
    return null;
  });
}

function setStateFileToken(ctx, token) {
  ctx.host.fs.writeText(
    ctx.app.pluginDataDir + "/auth.json",
    JSON.stringify({ token }),
  );
}

function mockUsageOk(ctx, body) {
  ctx.host.http.request.mockReturnValue({
    status: 200,
    bodyText: JSON.stringify(body || makeUsageResponse()),
  });
}

describe("copilot plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin;
    if (vi.resetModules) vi.resetModules();
  });

  it("uses GH_HOST for keychain service and API host", async () => {
    const ctx = makePluginTestContext();
    ctx.host.env.get.mockImplementation((name) => (name === "GH_HOST" ? "example.ghe.com" : null));
    ctx.host.keychain.readGenericPassword.mockImplementation((service, account) =>
      service === "gh:example.ghe.com" && account === "" ? "gho_ghe_token" : null,
    );
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    const call = ctx.host.http.request.mock.calls[0][0];
    expect(call.url).toBe("https://api.example.ghe.com/copilot_internal/user");
    expect(call.headers.Authorization).toBe("token gho_ghe_token");
  });

  it("falls back to a stored *.ghe.com login when github.com has none", async () => {
    const ctx = makePluginTestContext();
    ctx.host.keychain.listGenericPasswordTargets.mockReturnValue(
      JSON.stringify(["gh:example.ghe.com:", "gh:example.ghe.com:someuser"]),
    );
    ctx.host.keychain.readGenericPassword.mockImplementation((service, account) =>
      service === "gh:example.ghe.com" && account === "" ? "gho_ghe_token" : null,
    );
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    const call = ctx.host.http.request.mock.calls[0][0];
    expect(call.url).toBe("https://api.example.ghe.com/copilot_internal/user");
  });

  it("ignores a GH_HOST outside github.com / *.ghe.com and never sends the token there", async () => {
    const ctx = makePluginTestContext();
    ctx.host.env.get.mockImplementation((name) => (name === "GH_HOST" ? "evil.example.com" : null));
    ctx.host.keychain.readGenericPassword.mockImplementation((service) =>
      service === "gh:github.com" ? "gho_github_token" : "gho_leaked_token",
    );
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    const urls = ctx.host.http.request.mock.calls.map((c) => c[0].url);
    expect(urls).toEqual(["https://api.github.com/copilot_internal/user"]);
  });

  it("rejects malformed ghe.com hosts from the credential listing", async () => {
    const ctx = makePluginTestContext();
    ctx.host.keychain.listGenericPasswordTargets.mockReturnValue(
      JSON.stringify(["gh:evil.com:", "gh:..ghe.com:", "gh:-a.ghe.com:", "gh:notghe.com:"]),
    );
    ctx.host.keychain.readGenericPassword.mockReturnValue(null);
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Not logged in");
    expect(ctx.host.http.request).not.toHaveBeenCalled();
  });

  it("does not list credentials when github.com already works", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "gho_plain_token");
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    expect(ctx.host.keychain.listGenericPasswordTargets).not.toHaveBeenCalled();
  });

  it("falls through to a ghe.com host when the github.com token is rejected", async () => {
    const ctx = makePluginTestContext();
    ctx.host.keychain.listGenericPasswordTargets.mockReturnValue(
      JSON.stringify(["gh:github.com:", "gh:example.ghe.com:"]),
    );
    ctx.host.keychain.readGenericPassword.mockImplementation((service) =>
      service === "gh:github.com" ? "gho_stale" : "gho_ghe_token",
    );
    ctx.host.http.request.mockImplementation((req) =>
      req.url.indexOf("api.github.com") !== -1
        ? { status: 401, bodyText: "{}" }
        : { status: 200, bodyText: JSON.stringify(makeUsageResponse()) },
    );
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Credits")).toBeTruthy();
    expect(ctx.host.http.request.mock.calls.map((c) => c[0].url)).toEqual([
      "https://api.github.com/copilot_internal/user",
      "https://api.example.ghe.com/copilot_internal/user",
    ]);
  });

  it("reports an invalid token when every host rejects it", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "gho_stale");
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "{}" });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Token invalid");
  });

  it("survives a failing credential listing", async () => {
    const ctx = makePluginTestContext();
    ctx.host.keychain.listGenericPasswordTargets.mockImplementation(() => {
      throw new Error("boom");
    });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Not logged in");
  });

  it("throws when no token found", async () => {
    const ctx = makePluginTestContext();
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Not logged in. Run `gh auth login` first.");
  });

  it("loads token from gh CLI keychain (plain)", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "gho_plain_token");
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Credits")).toBeTruthy();
    const call = ctx.host.http.request.mock.calls[0][0];
    expect(call.headers.Authorization).toBe("token gho_plain_token");
  });

  it("loads token from gh CLI keychain (base64-encoded)", async () => {
    const ctx = makePluginTestContext();
    const encoded = ctx.base64.encode("gho_encoded_token");
    setGhCliKeychain(ctx, "go-keyring-base64:" + encoded);
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Credits")).toBeTruthy();
    const call = ctx.host.http.request.mock.calls[0][0];
    expect(call.headers.Authorization).toBe("token gho_encoded_token");
  });

  // The gh token can carry repo/org/workflow scopes: it stays in Credential Manager only.
  it("never writes the gh token to disk", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "gho_secret");
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    const writes = ctx.host.fs.writeText.mock.calls.map((call) => String(call[1]));
    expect(writes.some((text) => text.includes("gho_secret"))).toBe(false);
  });

  it("wipes a token an older version cached in auth.json and never uses it", async () => {
    const ctx = makePluginTestContext();
    setStateFileToken(ctx, "gho_old_copy");
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Not logged in. Run `gh auth login` first.");
    expect(ctx.host.fs.readText(ctx.app.pluginDataDir + "/auth.json")).not.toContain("gho_old_copy");
    expect(ctx.host.http.request).not.toHaveBeenCalled();
  });

  it("renders both Credits and Chat lines for paid tier", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const credits = result.lines.find((l) => l.label === "Credits");
    const chat = result.lines.find((l) => l.label === "Chat");
    expect(credits).toBeTruthy();
    expect(credits.used).toBe(20); // 100 - 80
    expect(credits.limit).toBe(100);
    expect(chat).toBeTruthy();
    expect(chat.used).toBe(5); // 100 - 95
  });

  it("renders only Credits when Chat is missing", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          quota_snapshots: {
            premium_interactions: {
              percent_remaining: 50,
              entitlement: 300,
              remaining: 150,
              quota_id: "premium",
            },
          },
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Credits")).toBeTruthy();
    expect(result.lines.find((l) => l.label === "Chat")).toBeFalsy();
  });

  it("shows 'No usage data' when both snapshots missing", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ copilot_plan: "free" }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines[0].text).toBe("No usage data");
  });

  it("returns plan label from copilot_plan", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.plan).toBe("Pro");
  });

  it("returns a null plan when copilot_plan is missing", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "gho_tok");
    mockUsageOk(ctx, makeUsageResponse({ copilot_plan: null }));
    const plugin = await loadPlugin();
    expect(plugin.probe(ctx).plan).toBeNull();
  });

  it("capitalizes multi-word plan labels", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({ copilot_plan: "business plus" }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.plan).toBe("Business Plus");
  });

  it("propagates resetsAt from quota_reset_date", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const premium = result.lines.find((l) => l.label === "Credits");
    expect(premium.resetsAt).toBe("2099-01-15T00:00:00.000Z");
  });

  it("clamps usedPercent to 0 when percent_remaining > 100", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          quota_snapshots: {
            premium_interactions: {
              percent_remaining: 120,
              entitlement: 300,
              remaining: 360,
              quota_id: "premium",
            },
          },
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Credits").used).toBe(0);
  });

  it("suppresses buckets flagged unlimited", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          quota_snapshots: {
            premium_interactions: {
              percent_remaining: 80,
              entitlement: 300,
              remaining: 240,
              quota_id: "premium",
            },
            chat: {
              percent_remaining: 100,
              unlimited: true,
              entitlement: -1,
              remaining: -1,
              quota_id: "chat",
            },
          },
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Credits")).toBeTruthy();
    expect(result.lines.find((l) => l.label === "Chat")).toBeFalsy();
  });

  it("suppresses buckets with the -1 entitlement/remaining sentinel", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          quota_snapshots: {
            chat: {
              percent_remaining: 100,
              entitlement: -1,
              remaining: 500,
              quota_id: "chat",
            },
            completions: {
              percent_remaining: 100,
              entitlement: 1000,
              remaining: -1,
              quota_id: "completions",
            },
          },
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Chat")).toBeFalsy();
    expect(result.lines.find((l) => l.label === "Completions")).toBeFalsy();
    expect(result.lines[0].text).toBe("No usage data");
  });

  it("suppresses zero-entitlement placeholder buckets", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          copilot_plan: "business",
          quota_snapshots: {
            premium_interactions: {
              percent_remaining: 100,
              entitlement: 0,
              remaining: 0,
              quota_id: "premium",
            },
          },
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Credits")).toBeFalsy();
    expect(result.lines[0].text).toBe("No usage data");
  });

  it("renders Completions from quota_snapshots", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          quota_snapshots: {
            completions: {
              percent_remaining: 60,
              entitlement: 4000,
              remaining: 2400,
              quota_id: "completions",
            },
          },
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const completions = result.lines.find((l) => l.label === "Completions");
    expect(completions).toBeTruthy();
    expect(completions.used).toBe(40); // 100 - 60
  });

  it("emits Extra Usage alongside a real Credits meter when overage is permitted", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          quota_snapshots: {
            premium_interactions: {
              percent_remaining: 20,
              entitlement: 300,
              remaining: 60,
              overage_permitted: true,
              overage_count: 42,
              quota_id: "premium",
            },
          },
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const extra = result.lines.find((l) => l.label === "Extra Usage");
    expect(extra).toBeTruthy();
    expect(extra.type).toBe("text");
    expect(extra.value).toBe("42");
  });

  it("shows a real zero for Extra Usage when overage is permitted but unused", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          quota_snapshots: {
            premium_interactions: {
              percent_remaining: 50,
              entitlement: 300,
              remaining: 150,
              overage_permitted: true,
              quota_id: "premium",
            },
          },
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const extra = result.lines.find((l) => l.label === "Extra Usage");
    expect(extra).toBeTruthy();
    expect(extra.value).toBe("0");
  });

  it("omits Extra Usage when overage is not permitted", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          quota_snapshots: {
            premium_interactions: {
              percent_remaining: 50,
              entitlement: 300,
              remaining: 150,
              overage_permitted: false,
              quota_id: "premium",
            },
          },
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Extra Usage")).toBeFalsy();
  });

  it("does not emit Extra Usage for a zero-entitlement placeholder bucket", async () => {
    // Org-managed Business placeholder: overage_permitted true on a zero-entitlement
    // bucket. Without a real Credits meter, an "Extra Usage: 0" row is meaningless.
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          copilot_plan: "business",
          quota_snapshots: {
            premium_interactions: {
              percent_remaining: 100,
              entitlement: 0,
              remaining: 0,
              overage_permitted: true,
              overage_count: 0,
              quota_id: "premium",
            },
          },
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Extra Usage")).toBeFalsy();
    expect(result.lines[0].text).toBe("No usage data");
  });

  it("shows personal credits_used as Credits on an org-managed placeholder seat", async () => {
    // Org-managed Business seat: zero entitlement, but the premium bucket carries the
    // user's own consumption. Must show it instead of an empty "No usage data" card.
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    const bucket = (creditsUsed) => ({
      unlimited: true, token_based_billing: true, credits_used: creditsUsed,
      entitlement: 0, percent_remaining: 100.0,
    });
    mockUsageOk(ctx, {
      copilot_plan: "business",
      token_based_billing: true,
      quota_snapshots: {
        chat: bucket(0),
        completions: bucket(0),
        premium_interactions: { ...bucket(2111), overage_permitted: true },
      },
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.plan).toBe("Business");
    expect(result.lines).toEqual([{ type: "text", label: "Credits", value: "2111 used" }]);
  });

  it("keeps 'No usage data' on an unused org-managed seat", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    mockUsageOk(ctx, {
      copilot_plan: "business",
      token_based_billing: true,
      quota_snapshots: {
        premium_interactions: { entitlement: 0, remaining: 0, credits_used: 0, percent_remaining: 100 },
      },
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe("No usage data");
  });

  it("declares the Status badge as an overview line in the manifest", () => {
    // Unlimited/org-managed accounts can suppress every quota meter, leaving only the
    // Status badge — the overview filter drops undeclared labels, so without this
    // declaration those accounts render a blank overview card.
    const manifest = JSON.parse(readFileSync("plugins/copilot/plugin.json", "utf8"));
    expect(manifest.lines).toContainEqual({ type: "badge", label: "Status", scope: "overview" });
  });

  it("does not render limited_user_quotas when quota_snapshots produced lines", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          quota_snapshots: {
            premium_interactions: {
              percent_remaining: 80,
              entitlement: 300,
              remaining: 240,
              quota_id: "premium",
            },
            chat: {
              percent_remaining: 100,
              unlimited: true,
              entitlement: -1,
              remaining: -1,
              quota_id: "chat",
            },
          },
          limited_user_quotas: { chat: 410, completions: 4000 },
          monthly_quotas: { chat: 500, completions: 4000 },
          limited_user_reset_date: "2026-02-11",
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Credits")).toBeTruthy();
    expect(result.lines.find((l) => l.label === "Chat")).toBeFalsy();
    expect(result.lines.find((l) => l.label === "Completions")).toBeFalsy();
  });

  it("falls back to limited_user_quotas when all snapshots are suppressed", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(
        makeUsageResponse({
          copilot_plan: "individual",
          quota_snapshots: {
            chat: {
              percent_remaining: 100,
              unlimited: true,
              entitlement: -1,
              remaining: -1,
              quota_id: "chat",
            },
          },
          limited_user_quotas: { chat: 250, completions: 2000 },
          monthly_quotas: { chat: 500, completions: 4000 },
          limited_user_reset_date: "2026-02-11",
        }),
      ),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const chat = result.lines.find((l) => l.label === "Chat");
    const completions = result.lines.find((l) => l.label === "Completions");
    expect(chat).toBeTruthy();
    expect(chat.used).toBe(50);
    expect(completions).toBeTruthy();
    expect(completions.used).toBe(50);
  });

  it("throws on 401", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Token invalid. Run `gh auth login` to re-authenticate.");
  });

  it("throws on 403", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({ status: 403, bodyText: "" });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Token invalid. Run `gh auth login` to re-authenticate.");
  });

  it("throws on HTTP 500", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({ status: 500, bodyText: "" });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow(
      "Usage request failed (HTTP 500). Try again later.",
    );
  });

  it("throws on network error", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockImplementation(() => {
      throw new Error("ECONNREFUSED");
    });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow(
      "Usage request failed. Check your connection.",
    );
  });

  it("throws on invalid JSON response", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: "not-json",
    });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow(
      "Usage response invalid. Try again later.",
    );
  });

  it("uses 'token' auth header format (not 'Bearer')", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "ghu_format");
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    const call = ctx.host.http.request.mock.calls[0][0];
    expect(call.headers.Authorization).toMatch(/^token /);
    expect(call.headers.Authorization).not.toMatch(/^Bearer /);
  });

  it("includes correct User-Agent and editor headers", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    const call = ctx.host.http.request.mock.calls[0][0];
    expect(call.headers["User-Agent"]).toBe("GitHubCopilotChat/0.26.7");
    expect(call.headers["Editor-Version"]).toBe("vscode/1.96.2");
    expect(call.headers["X-Github-Api-Version"]).toBe("2025-04-01");
  });

  it("includes periodDurationMs on paid tier progress lines", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    mockUsageOk(ctx);
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const premium = result.lines.find((l) => l.label === "Credits");
    const chat = result.lines.find((l) => l.label === "Chat");
    expect(premium.periodDurationMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(chat.periodDurationMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("renders Chat and Completions for free tier (limited_user_quotas)", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        copilot_plan: "individual",
        access_type_sku: "free_limited_copilot",
        limited_user_quotas: { chat: 410, completions: 4000 },
        monthly_quotas: { chat: 500, completions: 4000 },
        limited_user_reset_date: "2026-02-11",
      }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const chat = result.lines.find((l) => l.label === "Chat");
    const completions = result.lines.find((l) => l.label === "Completions");
    expect(chat).toBeTruthy();
    expect(chat.used).toBe(18); // (500 - 410) / 500 * 100 = 18%
    expect(completions).toBeTruthy();
    expect(completions.used).toBe(0); // (4000 - 4000) / 4000 * 100 = 0%
  });

  it("includes periodDurationMs on free tier progress lines", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        copilot_plan: "individual",
        limited_user_quotas: { chat: 400, completions: 3000 },
        monthly_quotas: { chat: 500, completions: 4000 },
        limited_user_reset_date: "2026-02-11",
      }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const chat = result.lines.find((l) => l.label === "Chat");
    const completions = result.lines.find((l) => l.label === "Completions");
    expect(chat.periodDurationMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(completions.periodDurationMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("propagates resetsAt from limited_user_reset_date for free tier", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        copilot_plan: "individual",
        limited_user_quotas: { chat: 450, completions: 3500 },
        monthly_quotas: { chat: 500, completions: 4000 },
        limited_user_reset_date: "2026-02-11",
      }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const chat = result.lines.find((l) => l.label === "Chat");
    expect(chat.resetsAt).toBe("2026-02-11T00:00:00.000Z");
  });

  it("handles free tier with partially used quotas", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        copilot_plan: "individual",
        limited_user_quotas: { chat: 250, completions: 2000 },
        monthly_quotas: { chat: 500, completions: 4000 },
        limited_user_reset_date: "2026-02-15",
      }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const chat = result.lines.find((l) => l.label === "Chat");
    const completions = result.lines.find((l) => l.label === "Completions");
    expect(chat.used).toBe(50); // 50% used
    expect(completions.used).toBe(50); // 50% used
  });

  it("shows status badge when free-tier quotas are present but invalid", async () => {
    const ctx = makePluginTestContext();
    setGhCliKeychain(ctx, "tok");
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        limited_user_quotas: { chat: 10, completions: "x" },
        monthly_quotas: { chat: 0, completions: 0 },
        limited_user_reset_date: "2026-02-11",
      }),
    });

    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe("No usage data");
  });
});
