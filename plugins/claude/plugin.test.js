import crypto from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

// Helpers for keychain hash regression tests.
const expectedHash = (path) =>
  crypto.createHash("sha256").update(path).digest("hex").slice(0, 8)
const TEST_CONFIG_DIR = "/Users/test/.claude"
const HASHED_CONFIG_SERVICE = "Claude Code-credentials-" + expectedHash(TEST_CONFIG_DIR)

// The host runs every probe in a fresh runtime, so each load evaluates plugin.js anew:
// module-scope state can't leak between tests (or between probes that reload).
let loads = 0
const loadPlugin = async () => {
  await import("./plugin.js?fresh=" + loads++)
  return globalThis.__openusage_plugin
}

// Counts plain /api/oauth/usage polls only: a successful fetch is followed by one
// /api/oauth/profile lookup per token (live plan badge) and an hourly reset-grants check
// (?cedar_ember=1), which these counts ignore.
const isGrantsCheck = (url) => String(url).includes("cedar_ember=1")
const isUsagePoll = (url) => String(url).includes("/api/oauth/usage") && !isGrantsCheck(url)
const usageRequestCount = (ctx) =>
  ctx.host.http.request.mock.calls.filter((call) => isUsagePoll(call[0]?.url)).length
const grantsCheckCount = (ctx) =>
  ctx.host.http.request.mock.calls.filter((call) => isGrantsCheck(call[0]?.url)).length

const okUsageResponse = (body) => ({ status: 200, bodyText: JSON.stringify(body), headers: {} })

describe("claude plugin", () => {
  it("throws when no credentials", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
  })

  it("throws when credentials are unreadable", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () => "{bad json"
    ctx.host.keychain.readGenericPassword.mockReturnValue("{bad}")
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
  })

  it("treats credentials file read failures as missing credentials", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () => {
      throw new Error("disk read failed")
    }
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    expect(ctx.host.log.warn).toHaveBeenCalled()
  })

  it("warns when credentials file exists but lacks a usable access token", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { refreshToken: "only-refresh" } })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    expect(ctx.host.log.warn).toHaveBeenCalled()
  })

  it("treats keychain read errors as missing credentials", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPassword.mockImplementation(() => {
      throw new Error("keychain unavailable")
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    expect(ctx.host.log.info).toHaveBeenCalled()
  })

  it("prefers current-user keychain credentials when available", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockReturnValue(
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    // No CLAUDE_CONFIG_DIR → upstream uses the legacy unhashed service name only.
    expect(ctx.host.keychain.readGenericPasswordForCurrentUser).toHaveBeenCalledWith(
      "Claude Code-credentials"
    )
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("falls back to legacy keychain lookup when current-user lookup misses", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockImplementation(() => {
      throw new Error("keychain item not found")
    })
    ctx.host.keychain.readGenericPassword.mockReturnValue(
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    // No CLAUDE_CONFIG_DIR → upstream uses the legacy unhashed service name only.
    expect(ctx.host.keychain.readGenericPassword).toHaveBeenCalledWith("Claude Code-credentials")
  })

  it("prefers keychain over a stale credentials file (regression for #444)", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = vi.fn(() =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "stale-file-token",
          refreshToken: "stale-file-refresh",
          expiresAt: Date.now() - 1000,
          subscriptionType: "pro",
        },
      })
    )
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "keychain-token",
          refreshToken: "keychain-refresh",
          expiresAt: Date.now() + 60 * 60 * 1000,
          subscriptionType: "pro",
        },
      })
    )
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        throw new Error("stale file refresh should not be attempted")
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.fs.readText).not.toHaveBeenCalledWith(expect.stringContaining(".credentials.json"))
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer keychain-token" }),
      })
    )
  })

  it("falls back to keychain when credentials file is corrupt", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () => "{bad json"
    ctx.host.keychain.readGenericPassword.mockReturnValue(
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
  })

  it("reads credentials from CLAUDE_CONFIG_DIR and passes it to ccusage", async () => {
    const ctx = makeCtx()
    const configDir = "/tmp/custom-claude-home"
    const configCredFile = configDir + "/.credentials.json"
    const credsJson = JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    ctx.host.env.get.mockImplementation((name) => (name === "CLAUDE_CONFIG_DIR" ? configDir : null))
    ctx.host.fs.exists = vi.fn((path) => path === configCredFile)
    ctx.host.fs.readText = vi.fn((path) => {
      if (path !== configCredFile) {
        throw new Error("unexpected readText path: " + path)
      }
      return credsJson
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })
    ctx.host.ccusage.query = vi.fn(() => ({ status: "ok", data: { daily: [] } }))

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.fs.readText).toHaveBeenCalledWith(configCredFile)
    expect(ctx.host.ccusage.query).toHaveBeenCalledWith(
      expect.objectContaining({ homePath: configDir })
    )
  })

  it("looks up Claude Code-staging-oauth-credentials in keychain", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "USER_TYPE") return "ant"
      if (name === "USE_STAGING_OAUTH") return "1"
      return null
    })
    ctx.host.keychain.readGenericPassword.mockImplementation((service) => {
      if (service === "Claude Code-staging-oauth-credentials") {
        return JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
      }
      if (service === "Claude Code-credentials") {
        return JSON.stringify({ claudeAiOauth: { refreshToken: "fallback-only" } })
      }
      return null
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPassword).toHaveBeenCalledWith(
      "Claude Code-staging-oauth-credentials"
    )
  })

  it("finds the hashed keychain entry when CLAUDE_CONFIG_DIR is set (regression for #423)", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.env.get.mockImplementation((name) =>
      name === "CLAUDE_CONFIG_DIR" ? TEST_CONFIG_DIR : null
    )
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockImplementation((service) => {
      if (service === HASHED_CONFIG_SERVICE) {
        return JSON.stringify({ claudeAiOauth: { accessToken: "tok", subscriptionType: "pro" } })
      }
      return null
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPasswordForCurrentUser).toHaveBeenCalledWith(
      HASHED_CONFIG_SERVICE
    )
  })

  it("falls back to legacy unhashed entry when CLAUDE_CONFIG_DIR is set but no hashed entry exists", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.env.get.mockImplementation((name) =>
      name === "CLAUDE_CONFIG_DIR" ? TEST_CONFIG_DIR : null
    )
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockImplementation((service) => {
      if (service === "Claude Code-credentials") {
        return JSON.stringify({ claudeAiOauth: { accessToken: "tok", subscriptionType: "pro" } })
      }
      return null  // hashed lookup misses → legacy candidate is tried next
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPasswordForCurrentUser).toHaveBeenCalledWith(
      HASHED_CONFIG_SERVICE
    )
    expect(ctx.host.keychain.readGenericPasswordForCurrentUser).toHaveBeenCalledWith(
      "Claude Code-credentials"
    )
  })

  it("does NOT compute a hash when CLAUDE_CONFIG_DIR is unset (matches upstream)", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockReturnValue(
      JSON.stringify({ claudeAiOauth: { accessToken: "tok", subscriptionType: "pro" } })
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)
    // Only the legacy unhashed service is consulted — no hashed candidate. (The login is read
    // again before a refresh, in case Claude Code renewed it meanwhile.)
    const calls = ctx.host.keychain.readGenericPasswordForCurrentUser.mock.calls.map((c) => c[0])
    expect([...new Set(calls)]).toEqual(["Claude Code-credentials"])
  })

  it("composes the staging-oauth keychain hash correctly", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CLAUDE_CONFIG_DIR") return TEST_CONFIG_DIR
      if (name === "USER_TYPE") return "ant"
      if (name === "USE_STAGING_OAUTH") return "1"
      return null
    })
    const hashedStagingService =
      "Claude Code-staging-oauth-credentials-" + expectedHash(TEST_CONFIG_DIR)
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockImplementation((service) => {
      if (service === hashedStagingService) {
        return JSON.stringify({ claudeAiOauth: { accessToken: "tok", subscriptionType: "pro" } })
      }
      return null
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPasswordForCurrentUser).toHaveBeenCalledWith(
      hashedStagingService
    )
  })

  it("hashes CLAUDE_CONFIG_DIR verbatim (no tilde expansion, NFC-normalized)", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    // Raw, tilde-prefixed value: hashed verbatim. Upstream applies .normalize("NFC"),
    // which is a no-op for ASCII so the hash matches a plain sha256 of the string.
    const rawConfigDir = "~/some-custom-claude-home"
    ctx.host.env.get.mockImplementation((name) =>
      name === "CLAUDE_CONFIG_DIR" ? rawConfigDir : null
    )
    const hashedService = "Claude Code-credentials-" + expectedHash(rawConfigDir)
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockImplementation((service) => {
      if (service === hashedService) {
        return JSON.stringify({ claudeAiOauth: { accessToken: "tok", subscriptionType: "pro" } })
      }
      return null
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPasswordForCurrentUser).toHaveBeenCalledWith(
      hashedService
    )
  })

  it("uses env-injected OAuth tokens without hitting /api/oauth/usage", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.fs.readText = () => {
      throw new Error("unexpected file read")
    }
    ctx.host.env.get.mockImplementation((name) =>
      name === "CLAUDE_CODE_OAUTH_TOKEN" ? "env-oauth-token" : null
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })
    ctx.host.ccusage.query = vi.fn(() => ({
      status: "ok",
      data: {
        daily: [
          {
            date: "2024-01-01",
            inputTokens: 100,
            outputTokens: 50,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 150,
            totalCost: 0.25,
          },
        ],
      },
    }))

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(
      ctx.host.http.request.mock.calls.some((call) => String(call[0]?.url).includes("/api/oauth/usage"))
    ).toBe(false)
    expect(result.lines.find((line) => line.label === "Last 30 Days")?.value).toContain("150 tokens")
  })

  it("prefers a stored profile-scoped login over CLAUDE_CODE_OAUTH_TOKEN for live usage (regression for upstream #865)", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "stored-token",
          scopes: ["user:inference", "user:profile"],
          subscriptionType: "pro",
        },
      })
    ctx.host.env.get.mockImplementation((name) =>
      name === "CLAUDE_CODE_OAUTH_TOKEN" ? "env-oauth-token" : null
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    // The ambient env token must not shadow the stored login that CAN read live usage.
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer stored-token" }),
      })
    )
  })

  it("prefers a profile-scoped file login over a scope-less keychain entry when an env token is set (upstream #865)", async () => {
    const ctx = makeCtx()
    // Keychain wins normally, but this entry cannot read live usage…
    ctx.host.keychain.readGenericPassword.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: { accessToken: "keychain-token", scopes: ["user:inference"] },
      })
    )
    // …while the credentials file holds a profile-scoped login that can.
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-token",
          scopes: ["user:inference", "user:profile"],
          subscriptionType: "pro",
        },
      })
    ctx.host.env.get.mockImplementation((name) =>
      name === "CLAUDE_CODE_OAUTH_TOKEN" ? "env-oauth-token" : null
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    // Every stored candidate must be considered — not just the first (keychain) one.
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer file-token" }),
      })
    )
  })

  it("falls back to the env token when the stored login lacks user:profile scope", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "stored-token",
          scopes: ["user:inference"],
          subscriptionType: "pro",
        },
      })
    ctx.host.env.get.mockImplementation((name) =>
      name === "CLAUDE_CODE_OAUTH_TOKEN" ? "env-oauth-token" : null
    )

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    // Neither credential can read live usage — no usage call is made.
    expect(
      ctx.host.http.request.mock.calls.some((call) => String(call[0]?.url).includes("/api/oauth/usage"))
    ).toBe(false)
  })

  it("renders usage lines from response", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        seven_day: { utilization: 20, resets_at: "2099-01-01T00:00:00.000Z" },
        extra_usage: { is_enabled: true, used_credits: 500, monthly_limit: 1000 },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Pro")
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Weekly")).toBeTruthy()
  })

  it("appends max rate limit tier to the plan label when present", async () => {
    const runCase = async (rateLimitTier, expectedPlan) => {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => true
      ctx.host.fs.readText = () =>
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "token",
            subscriptionType: "max",
            rateLimitTier,
          },
        })
      ctx.host.http.request.mockReturnValue({
        status: 200,
        bodyText: JSON.stringify({
          five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        }),
      })

      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      expect(result.plan).toBe(expectedPlan)
    }

    await runCase("claude_max_subscription_20x", "Max 20x")
    await runCase("claude_max_subscription_5x", "Max 5x")
  })

  it("omits resetsAt when resets_at is missing", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 0 },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const sessionLine = result.lines.find((line) => line.label === "Session")
    expect(sessionLine).toBeTruthy()
    expect(sessionLine.resetsAt).toBeUndefined()
  })

  it("throws token expired on 401", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { accessToken: "token" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Token expired")
  })

  // A 429 throws so the app keeps the previous bars under the message; the host gates the
  // follow-up requests (plugin module state does not survive between probes).
  it.each([
    [{}, "Rate limited by Anthropic, try again later"],
    [{ "Retry-After": "0" }, "Rate limited by Anthropic, try again later"],
    [{ "Retry-After": "600" }, "Rate limited by Anthropic, retry in ~10m"],
    [{ "retry-after": "61" }, "Rate limited by Anthropic, retry in ~2m"],
  ])("throws a rate-limit error on 429 (headers %j)", async (headers, message) => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { accessToken: "token" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "", headers: headers })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(message)
    expect(usageRequestCount(ctx)).toBe(1)
    expect(ctx.host.ccusage.query).not.toHaveBeenCalled()
  })

  it("uses keychain credentials", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPassword.mockReturnValue(
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        seven_day_sonnet: { utilization: 5, resets_at: "2099-01-01T00:00:00.000Z" },
        extra_usage: { is_enabled: true, used_credits: 250 },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Sonnet")).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Extra usage spent")).toBeTruthy()
  })

  it("renders Claude Design line from seven_day_omelette with normalized resetsAt", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        seven_day_omelette: { utilization: 7, resets_at: "2099-01-01 00:00:00 UTC" },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const line = result.lines.find((l) => l.label === "Claude Design")
    expect(line).toBeTruthy()
    expect(line.used).toBe(7)
    expect(line.limit).toBe(100)
    expect(line.format).toEqual({ kind: "percent" })
    expect(line.resetsAt).toBe("2099-01-01T00:00:00.000Z")
  })

  it("omits Claude Design line when seven_day_omelette has no utilization", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        seven_day_omelette: {},
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Claude Design")).toBeUndefined()
  })

  it("omits Claude Design line when seven_day_omelette utilization is non-numeric", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        seven_day_omelette: { utilization: "5", resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Claude Design")).toBeUndefined()
  })

  it("renders Fable weekly limit from the limits array (regression for upstream #814)", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "max" } })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        seven_day: { utilization: 20, resets_at: "2099-01-01T00:00:00.000Z" },
        seven_day_sonnet: null,
        limits: [
          { kind: "session", group: "session", percent: 10, resets_at: "2099-01-01T00:00:00.000Z" },
          { kind: "weekly_all", group: "weekly", percent: 20, resets_at: "2099-01-08T00:00:00.000Z" },
          {
            kind: "weekly_scoped",
            group: "weekly",
            percent: 7,
            resets_at: "2099-01-08T00:00:00.000Z",
            scope: { model: { display_name: "Fable", id: null }, surface: null },
          },
        ],
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const fableLine = result.lines.find((l) => l.label === "Fable")
    expect(fableLine).toBeTruthy()
    expect(fableLine.used).toBe(7)
    expect(fableLine.limit).toBe(100)
    expect(fableLine.format).toEqual({ kind: "percent" })
    expect(fableLine.resetsAt).toBe("2099-01-08T00:00:00.000Z")
    expect(fableLine.periodDurationMs).toBe(7 * 24 * 60 * 60 * 1000)
    // Legacy top-level keys still render; a null seven_day_sonnet simply skips the Sonnet row.
    expect(result.lines.find((l) => l.label === "Session")).toBeTruthy()
    expect(result.lines.find((l) => l.label === "Weekly")).toBeTruthy()
    expect(result.lines.find((l) => l.label === "Sonnet")).toBeUndefined()
  })

  it("omits the Fable line when limits has no matching weekly_scoped entry", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "max" } })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        limits: [
          null,
          { kind: "weekly_all", group: "weekly", percent: 20 },
          // Different model — not the Fable bucket.
          { kind: "weekly_scoped", percent: 12, scope: { model: { display_name: "Sonnet" } } },
          // Non-numeric percent is skipped.
          { kind: "weekly_scoped", percent: "n/a", scope: { model: { display_name: "Fable" } } },
        ],
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Fable")).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Session")).toBeTruthy()
  })

  it("reads Sonnet from the limits array when the legacy key is null, versioned names included", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "max" } })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        seven_day_sonnet: null,
        limits: [
          { kind: "weekly_scoped", percent: 31, resets_at: "2099-01-08T00:00:00.000Z", scope: { model: { display_name: "Sonnet 5.5" } } },
          // "Sonnets" is another name, not a Sonnet version.
          { kind: "weekly_scoped", percent: 99, scope: { model: { display_name: "Sonnets" } } },
        ],
      }),
    })

    const plugin = await loadPlugin()
    const sonnet = plugin.probe(ctx).lines.filter((l) => l.label === "Sonnet")
    expect(sonnet).toHaveLength(1)
    expect(sonnet[0].used).toBe(31)
    expect(sonnet[0].resetsAt).toBe("2099-01-08T00:00:00.000Z")
  })

  it("prefers the legacy seven_day_sonnet over a scoped Sonnet entry", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "max" } })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        seven_day_sonnet: { utilization: 5, resets_at: "2099-01-08T00:00:00.000Z" },
        limits: [{ kind: "weekly_scoped", percent: 31, scope: { model: { display_name: "Sonnet" } } }],
      }),
    })

    const plugin = await loadPlugin()
    const sonnet = plugin.probe(ctx).lines.filter((l) => l.label === "Sonnet")
    expect(sonnet.map((l) => l.used)).toEqual([5])
  })

  it("accepts a numeric-string percent for the scoped weekly limit (upstream ProviderParse.number)", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "max" } })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        limits: [
          { kind: "weekly_scoped", percent: "7", scope: { model: { display_name: "Fable" } } },
        ],
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const fableLine = result.lines.find((l) => l.label === "Fable")
    expect(fableLine).toBeTruthy()
    expect(fableLine.used).toBe(7)
  })

  it("omits extra usage line when used credits are zero and no limit exists", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        extra_usage: { is_enabled: true, used_credits: 0, monthly_limit: null },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Extra usage spent")).toBeUndefined()
  })

  it("uses keychain credentials when value is hex-encoded JSON", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    const json = JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } }, null, 2)
    const hex = Buffer.from(json, "utf8").toString("hex")
    ctx.host.keychain.readGenericPassword.mockReturnValue(hex)
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 1, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
  })

  it("accepts 0x-prefixed hex keychain credentials", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    const json = JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } }, null, 2)
    const hex = "0x" + Buffer.from(json, "utf8").toString("hex")
    ctx.host.keychain.readGenericPassword.mockReturnValue(hex)
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 1, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
  })

  it("decodes hex-encoded UTF-8 correctly (non-ascii json)", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    const json = JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pró" } }, null, 2)
    const hex = Buffer.from(json, "utf8").toString("hex")
    ctx.host.keychain.readGenericPassword.mockReturnValue(hex)
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 1, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).not.toThrow()
  })

  it("decodes 3-byte and 4-byte UTF-8 in hex-encoded JSON", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    const json = JSON.stringify(
      { claudeAiOauth: { accessToken: "token", subscriptionType: "pro€🙂" } },
      null,
      2
    )
    const hex = Buffer.from(json, "utf8").toString("hex")
    ctx.host.keychain.readGenericPassword.mockReturnValue(hex)
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 1, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).not.toThrow()
  })

  it("uses custom UTF-8 decoder when TextDecoder is unavailable", async () => {
    const original = globalThis.TextDecoder
    // Force plugin to use its fallback decoder.
    // eslint-disable-next-line no-undef
    delete globalThis.TextDecoder
    try {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => false
      const json = JSON.stringify(
        { claudeAiOauth: { accessToken: "token", subscriptionType: "pró€🙂" } },
        null,
        2
      )
      const hex = Buffer.from(json, "utf8").toString("hex")
      ctx.host.keychain.readGenericPassword.mockReturnValue(hex)
      ctx.host.http.request.mockReturnValue({
        status: 200,
        bodyText: JSON.stringify({
          five_hour: { utilization: 1, resets_at: "2099-01-01T00:00:00.000Z" },
        }),
      })
      const plugin = await loadPlugin()
      expect(() => plugin.probe(ctx)).not.toThrow()
    } finally {
      globalThis.TextDecoder = original
    }
  })

  it("custom decoder tolerates invalid byte sequences", async () => {
    const original = globalThis.TextDecoder
    // eslint-disable-next-line no-undef
    delete globalThis.TextDecoder
    try {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => false
      // Invalid UTF-8 bytes (will produce replacement chars).
      ctx.host.keychain.readGenericPassword.mockReturnValue("c200ff")
      const plugin = await loadPlugin()
      expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    } finally {
      globalThis.TextDecoder = original
    }
  })

  it("custom decoder handles truncated 3-byte sequences in hex payloads", async () => {
    const original = globalThis.TextDecoder
    // eslint-disable-next-line no-undef
    delete globalThis.TextDecoder
    try {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => false
      ctx.host.keychain.readGenericPassword.mockReturnValue("e282")
      const plugin = await loadPlugin()
      expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    } finally {
      globalThis.TextDecoder = original
    }
  })

  it("custom decoder handles truncated 2-byte sequences in hex payloads", async () => {
    const original = globalThis.TextDecoder
    // eslint-disable-next-line no-undef
    delete globalThis.TextDecoder
    try {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => false
      ctx.host.keychain.readGenericPassword.mockReturnValue("c2")
      const plugin = await loadPlugin()
      expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    } finally {
      globalThis.TextDecoder = original
    }
  })

  it("custom decoder handles invalid 3-byte continuation sequences in hex payloads", async () => {
    const original = globalThis.TextDecoder
    // eslint-disable-next-line no-undef
    delete globalThis.TextDecoder
    try {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => false
      ctx.host.keychain.readGenericPassword.mockReturnValue("e228a1")
      const plugin = await loadPlugin()
      expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    } finally {
      globalThis.TextDecoder = original
    }
  })

  it("custom decoder handles invalid 4-byte sequences in hex payloads", async () => {
    const original = globalThis.TextDecoder
    // eslint-disable-next-line no-undef
    delete globalThis.TextDecoder
    try {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => false
      ctx.host.keychain.readGenericPassword.mockReturnValue("f0808080")
      const plugin = await loadPlugin()
      expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    } finally {
      globalThis.TextDecoder = original
    }
  })

  it("custom decoder handles truncated 4-byte sequences in hex payloads", async () => {
    const original = globalThis.TextDecoder
    // eslint-disable-next-line no-undef
    delete globalThis.TextDecoder
    try {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => false
      ctx.host.keychain.readGenericPassword.mockReturnValue("f09f98")
      const plugin = await loadPlugin()
      expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    } finally {
      globalThis.TextDecoder = original
    }
  })

  it("treats invalid hex credentials as not logged in", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPassword.mockReturnValue("0x123") // odd length
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
  })

  it("throws on http errors and parse failures", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { accessToken: "token" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockReturnValueOnce({ status: 500, bodyText: "" })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("HTTP 500")

    ctx.host.http.request.mockReturnValueOnce({ status: 200, bodyText: "not-json" })
    expect(() => plugin.probe(ctx)).toThrow("Usage response invalid")
  })

  it("throws on request errors", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { accessToken: "token" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockImplementation(() => {
      throw new Error("boom")
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed")
  })

  it("shows status badge when no usage data and ccusage is unavailable", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { accessToken: "token" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({}),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Today")).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Yesterday")).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Last 30 Days")).toBeUndefined()
    const statusLine = result.lines.find((l) => l.label === "Status")
    expect(statusLine).toBeTruthy()
    expect(statusLine.text).toBe("No usage data")
  })

  it("passes resetsAt through as ISO when present", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { accessToken: "token" } })
    ctx.host.fs.exists = () => true
    const now = new Date("2026-02-02T00:00:00.000Z").getTime()
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    const fiveHourIso = new Date(now + 30_000).toISOString()
    const sevenDayIso = new Date(now + 5 * 60_000).toISOString()
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: fiveHourIso },
        seven_day: { utilization: 20, resets_at: sevenDayIso },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")?.resetsAt).toBe(fiveHourIso)
    expect(result.lines.find((line) => line.label === "Weekly")?.resetsAt).toBe(sevenDayIso)
    nowSpy.mockRestore()
  })

  it("normalizes resets_at without timezone (microseconds) into ISO for resetsAt", async () => {
    const ctx = makeCtx()
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    ctx.host.fs.exists = () => true
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.123456" },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")?.resetsAt).toBe(
      "2099-01-01T00:00:00.123Z"
    )
  })

  it("refreshes token when expired and persists updated credentials", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "old-token",
          refreshToken: "refresh",
          expiresAt: Date.now() - 1000,
          subscriptionType: "pro",
        },
      })

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        return {
          status: 200,
          bodyText: JSON.stringify({ access_token: "new-token", expires_in: 3600, refresh_token: "refresh2" }),
        }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.fs.writeText).toHaveBeenCalled()
  })

  it("includes user:file_upload in the OAuth refresh scope", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "old-token",
          refreshToken: "refresh",
          expiresAt: Date.now() - 1000,
          subscriptionType: "pro",
        },
      })

    let refreshBody = null
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        refreshBody = JSON.parse(opts.bodyText)
        return {
          status: 200,
          bodyText: JSON.stringify({ access_token: "new-token", expires_in: 3600, refresh_token: "refresh2" }),
        }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        }),
      }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(refreshBody.scope).toContain("user:file_upload")
  })

  it("refreshes keychain credentials and writes back to keychain", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPassword.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "old-token",
          refreshToken: "refresh",
          expiresAt: Date.now() - 1000,
          subscriptionType: "pro",
        },
      })
    )

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        return {
          status: 200,
          bodyText: JSON.stringify({ access_token: "new-token", expires_in: 3600 }),
        }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        }),
      }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).not.toThrow()
    expect(ctx.host.keychain.writeGenericPassword).toHaveBeenCalled()
  })

  it("retries usage request after 401 by refreshing once", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: Date.now() + 60_000,
          subscriptionType: "pro",
        },
      })

    let usageCalls = 0
    let firstUsageHeaders = null
    ctx.host.http.request.mockImplementation((opts) => {
      if (isUsagePoll(opts.url)) {
        usageCalls += 1
        if (!firstUsageHeaders) firstUsageHeaders = opts.headers
        if (usageCalls === 1) {
          return { status: 401, bodyText: "" }
        }
        return {
          status: 200,
          bodyText: JSON.stringify({
            five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
          }),
        }
      }
      // Refresh
      return {
        status: 200,
        bodyText: JSON.stringify({ access_token: "token2", expires_in: 3600 }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(usageCalls).toBe(2)
    expect(firstUsageHeaders["User-Agent"]).toBe("claude-cli/2.1.294 (external, cli)")
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
  })

  it("throws session expired when refresh returns invalid_grant", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: Date.now() - 1,
        },
      })

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        return { status: 400, bodyText: JSON.stringify({ error: "invalid_grant" }) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Session expired")
  })

  it("throws token expired when usage remains unauthorized after refresh", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: Date.now() + 60_000,
        },
      })

    let usageCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/api/oauth/usage")) {
        usageCalls += 1
        if (usageCalls === 1) return { status: 401, bodyText: "" }
        return { status: 403, bodyText: "" }
      }
      return { status: 200, bodyText: JSON.stringify({ access_token: "token2", expires_in: 3600 }) }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Token expired")
  })

  it("throws token expired when refresh is unauthorized", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: Date.now() - 1,
        },
      })

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        return { status: 401, bodyText: JSON.stringify({ error: "nope" }) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Token expired")
  })

  it("logs when saving keychain credentials fails", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPassword.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "old-token",
          refreshToken: "refresh",
          expiresAt: Date.now() - 1000,
        },
      })
    )
    ctx.host.keychain.writeGenericPassword.mockImplementation(() => {
      throw new Error("write fail")
    })
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: "new-token", expires_in: 3600 }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        }),
      }
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).not.toThrow()
    expect(ctx.host.log.error).toHaveBeenCalled()
  })

  it("writes refreshed credentials back to the current-user keychain source", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "old-token",
          refreshToken: "refresh",
          expiresAt: Date.now() - 1000,
        },
      })
    )
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: "new-token", expires_in: 3600 }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        }),
      }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).not.toThrow()
    expect(ctx.host.keychain.writeGenericPasswordForCurrentUser).toHaveBeenCalled()
    expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
  })

  it("writes refreshed credentials back to the legacy keychain source after fallback", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockImplementation(() => {
      throw new Error("keychain item not found")
    })
    ctx.host.keychain.readGenericPassword.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "old-token",
          refreshToken: "refresh",
          expiresAt: Date.now() - 1000,
        },
      })
    )
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: "new-token", expires_in: 3600 }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        }),
      }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).not.toThrow()
    expect(ctx.host.keychain.writeGenericPassword).toHaveBeenCalled()
    expect(ctx.host.keychain.writeGenericPasswordForCurrentUser).not.toHaveBeenCalled()
  })

  it("logs when saving credentials file fails", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "old-token",
          refreshToken: "refresh",
          expiresAt: Date.now() - 1000,
        },
      })
    ctx.host.fs.writeText.mockImplementation(() => {
      throw new Error("disk full")
    })
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: "new-token", expires_in: 3600 }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        }),
      }
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).not.toThrow()
    expect(ctx.host.log.error).toHaveBeenCalled()
  })

  it("continues when refresh request throws non-string error (returns null)", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: Date.now() - 1,
        },
      })

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        throw new Error("network")
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        }),
      }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).not.toThrow()
  })

  it("falls back to keychain when file oauth exists but has no access token", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { refreshToken: "only-refresh" } })
    ctx.host.keychain.readGenericPassword.mockReturnValue(
      JSON.stringify({ claudeAiOauth: { accessToken: "keychain-token", subscriptionType: "pro" } })
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
  })

  it("treats keychain oauth without access token as not logged in", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPassword.mockReturnValue(
      JSON.stringify({ claudeAiOauth: { refreshToken: "only-refresh" } })
    )
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
  })

  it("continues with existing token when refresh cannot return a usable token", async () => {
    const baseCreds = JSON.stringify({
      claudeAiOauth: {
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() - 1,
      },
    })

    const runCase = async (refreshResp) => {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => true
      ctx.host.fs.readText = () => baseCreds
      ctx.host.http.request.mockImplementation((opts) => {
        if (String(opts.url).includes("/v1/oauth/token")) return refreshResp
        return {
          status: 200,
          bodyText: JSON.stringify({
            five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
          }),
        }
      })

      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    }

    await runCase({ status: 500, bodyText: "" })
    await runCase({ status: 200, bodyText: "not-json" })
    await runCase({ status: 200, bodyText: JSON.stringify({}) })
  })

  it("skips proactive refresh when token is not near expiry", async () => {
    const ctx = makeCtx()
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: now + 24 * 60 * 60 * 1000,
          subscriptionType: "pro",
        },
      })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)
    expect(
      ctx.host.http.request.mock.calls.some((call) => String(call[0]?.url).includes("/v1/oauth/token"))
    ).toBe(false)
  })

  // Claude Code's refresh tokens are single-use; refreshing alongside it can sign it out.
  describe("refreshing alongside Claude Code (upstream #1417)", () => {
    const CREDS = "~/.claude/.credentials.json"
    const login = (accessToken, refreshToken, expiresInMs) => JSON.stringify({
      claudeAiOauth: { accessToken, refreshToken, expiresAt: Date.now() + expiresInMs, subscriptionType: "pro" },
    })
    const usage = okUsageResponse({ five_hour: { utilization: 10, resets_at: null } })
    const refreshCalls = (ctx) =>
      ctx.host.http.request.mock.calls.filter(([opts]) => String(opts.url).includes("/v1/oauth/token"))
    const usageToken = (ctx) =>
      ctx.host.http.request.mock.calls.find(([opts]) => isUsagePoll(opts.url))[0].headers.Authorization

    it("leaves a token that is about to expire to Claude Code", async () => {
      const ctx = makeCtx()
      ctx.host.fs.writeText(CREDS, login("old", "r1", 60_000))
      ctx.host.http.request.mockReturnValue(usage)
      ;(await loadPlugin()).probe(ctx)
      expect(refreshCalls(ctx)).toHaveLength(0)
      expect(usageToken(ctx)).toBe("Bearer old")
    })

    it("takes the login Claude Code renewed meanwhile instead of refreshing an expired one", async () => {
      const ctx = makeCtx()
      ctx.host.fs.writeText(CREDS, login("old", "r1", -60_000))
      const readText = ctx.host.fs.readText
      let reads = 0
      ctx.host.fs.readText = (path) => {
        // Claude Code renews the login right after the probe's first read.
        if (path === CREDS && ++reads === 2) ctx.host.fs.writeText(CREDS, login("renewed", "r2", 3_600_000))
        return readText(path)
      }
      ctx.host.http.request.mockReturnValue(usage)
      ;(await loadPlugin()).probe(ctx)
      expect(refreshCalls(ctx)).toHaveLength(0)
      expect(usageToken(ctx)).toBe("Bearer renewed")
    })

    it("uses Claude Code's new login when it won the refresh race", async () => {
      const ctx = makeCtx()
      ctx.host.fs.writeText(CREDS, login("old", "r1", -60_000))
      ctx.host.http.request.mockImplementation((opts) => {
        if (String(opts.url).includes("/v1/oauth/token")) {
          // Claude Code used r1 a moment earlier and stored its new login.
          ctx.host.fs.writeText(CREDS, login("renewed", "r2", 3_600_000))
          return { status: 400, bodyText: JSON.stringify({ error: "invalid_grant" }) }
        }
        return usage
      })
      const result = (await loadPlugin()).probe(ctx)
      expect(result.lines.find((l) => l.label === "Session")?.used).toBe(10)
      expect(usageToken(ctx)).toBe("Bearer renewed")
    })
  })

  it("handles malformed ccusage payload shape as runner_failed", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "   " } })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })
    ctx.host.ccusage.query = vi.fn(() => ({ status: "ok", data: {} }))

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBeNull()
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Today")).toBeUndefined()
  })

  it("throws usage request failed after refresh when retry errors", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: Date.now() + 60_000,
        },
      })

    let usageCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/api/oauth/usage")) {
        usageCalls += 1
        if (usageCalls === 1) return { status: 401, bodyText: "" }
        throw new Error("boom")
      }
      return { status: 200, bodyText: JSON.stringify({ access_token: "token2", expires_in: 3600 }) }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed after refresh")
  })

  it("throws usage request failed when retryOnceOnAuth throws a non-string error", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: Date.now() + 60_000,
        },
      })

    ctx.util.retryOnceOnAuth = () => {
      throw new Error("network blew up")
    }

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed. Check your connection.")
  })

  it("throws token expired when refresh response cannot be parsed", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: Date.now() - 1,
        },
      })

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/v1/oauth/token")) {
        return { status: 400, bodyText: "not-json" }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Token expired")
  })

  describe("token usage: ccusage integration", () => {
    const CRED_JSON = JSON.stringify({ claudeAiOauth: { accessToken: "tok", subscriptionType: "pro" } })
    const USAGE_RESPONSE = JSON.stringify({
      five_hour: { utilization: 30, resets_at: "2099-01-01T00:00:00.000Z" },
      seven_day: { utilization: 50, resets_at: "2099-01-01T00:00:00.000Z" },
    })

    function makeProbeCtx({ ccusageResult = { status: "runner_failed" } } = {}) {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => true
      ctx.host.fs.readText = () => CRED_JSON
      ctx.host.http.request.mockReturnValue({ status: 200, bodyText: USAGE_RESPONSE })
      ctx.host.ccusage.query = vi.fn(() => ccusageResult)
      return ctx
    }

    function okUsage(daily) {
      return { status: "ok", data: { daily: daily } }
    }

    function localDayKey(date) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, "0")
      const day = String(date.getDate()).padStart(2, "0")
      return year + "-" + month + "-" + day
    }

    function localCompactDayKey(date) {
      const year = String(date.getFullYear())
      const month = String(date.getMonth() + 1).padStart(2, "0")
      const day = String(date.getDate()).padStart(2, "0")
      return year + month + day
    }

    it("omits token lines when ccusage reports no_runner", async () => {
      const ctx = makeProbeCtx({ ccusageResult: { status: "no_runner" } })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      expect(result.lines.find((l) => l.label === "Today")).toBeUndefined()
      expect(result.lines.find((l) => l.label === "Yesterday")).toBeUndefined()
      expect(result.lines.find((l) => l.label === "Last 30 Days")).toBeUndefined()
    })

    it("rate-limit lines still appear when ccusage reports runner_failed", async () => {
      const ctx = makeProbeCtx({ ccusageResult: { status: "runner_failed" } })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      expect(result.lines.find((l) => l.label === "Session")).toBeTruthy()
      expect(result.lines.find((l) => l.label === "Today")).toBeUndefined()
      expect(result.lines.find((l) => l.label === "Yesterday")).toBeUndefined()
    })

    it("adds Today line when ccusage returns today's data", async () => {
      const todayKey = localDayKey(new Date())
      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
            { date: todayKey, inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 150, totalCost: 0.75 },
          ]),
      })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const todayLine = result.lines.find((l) => l.label === "Today")
      expect(todayLine).toBeTruthy()
      expect(todayLine.type).toBe("text")
      expect(todayLine.value).toContain("150 tokens")
      expect(todayLine.value).toContain("$0.75")
    })

    it("adds Yesterday line when ccusage returns yesterday's data", async () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayKey = localDayKey(yesterday)
      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
            { date: yesterdayKey, inputTokens: 80, outputTokens: 40, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 120, totalCost: 0.6 },
          ]),
      })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const yesterdayLine = result.lines.find((l) => l.label === "Yesterday")
      expect(yesterdayLine).toBeTruthy()
      expect(yesterdayLine.value).toContain("120 tokens")
      expect(yesterdayLine.value).toContain("$0.60")
    })

    it("matches locale-formatted dates for today and yesterday (regression)", async () => {
      const now = new Date()
      const monthToday = now.toLocaleString("en-US", { month: "short" })
      const dayToday = String(now.getDate()).padStart(2, "0")
      const yearToday = now.getFullYear()
      const todayLabel = monthToday + " " + dayToday + ", " + yearToday

      const yesterday = new Date(now.getTime())
      yesterday.setDate(yesterday.getDate() - 1)
      const monthYesterday = yesterday.toLocaleString("en-US", { month: "short" })
      const dayYesterday = String(yesterday.getDate()).padStart(2, "0")
      const yearYesterday = yesterday.getFullYear()
      const yesterdayLabel = monthYesterday + " " + dayYesterday + ", " + yearYesterday

      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
            { date: todayLabel, inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 150, totalCost: 0.75 },
            { date: yesterdayLabel, inputTokens: 80, outputTokens: 40, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 120, totalCost: 0.6 },
          ]),
      })

      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)

      const todayLine = result.lines.find((l) => l.label === "Today")
      expect(todayLine).toBeTruthy()
      expect(todayLine.value).toContain("150 tokens")
      expect(todayLine.value).toContain("$0.75")

      const yesterdayLine = result.lines.find((l) => l.label === "Yesterday")
      expect(yesterdayLine).toBeTruthy()
      expect(yesterdayLine.value).toContain("120 tokens")
      expect(yesterdayLine.value).toContain("$0.60")
    })

    it("matches UTC timestamp day keys at month boundary (regression)", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 2, 1, 12, 0, 0))
      try {
        const ctx = makeProbeCtx({
          ccusageResult: okUsage([
              { date: "2026-03-01T12:00:00Z", inputTokens: 10, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 10, totalCost: 0.1 },
            ]),
        })
        const plugin = await loadPlugin()
        const result = plugin.probe(ctx)
        const todayLine = result.lines.find((l) => l.label === "Today")
        expect(todayLine).toBeTruthy()
        expect(todayLine.value).toContain("10 tokens")
      } finally {
        vi.useRealTimers()
      }
    })

    it("matches UTC+9 timestamp day keys at month boundary (regression)", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 2, 1, 12, 0, 0))
      try {
        const ctx = makeProbeCtx({
          ccusageResult: okUsage([
              { date: "2026-03-01T00:30:00+09:00", inputTokens: 20, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 20, totalCost: 0.2 },
            ]),
        })
        const plugin = await loadPlugin()
        const result = plugin.probe(ctx)
        const todayLine = result.lines.find((l) => l.label === "Today")
        expect(todayLine).toBeTruthy()
        expect(todayLine.value).toContain("20 tokens")
      } finally {
        vi.useRealTimers()
      }
    })

    it("matches UTC-8 timestamp day keys at day boundary (regression)", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 2, 1, 12, 0, 0))
      try {
        const ctx = makeProbeCtx({
          ccusageResult: okUsage([
              { date: "2026-03-01T23:30:00-08:00", inputTokens: 30, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 30, totalCost: 0.3 },
            ]),
        })
        const plugin = await loadPlugin()
        const result = plugin.probe(ctx)
        const todayLine = result.lines.find((l) => l.label === "Today")
        expect(todayLine).toBeTruthy()
        expect(todayLine.value).toContain("30 tokens")
      } finally {
        vi.useRealTimers()
      }
    })

    it("adds Last 30 Days line summing all daily entries", async () => {
      const todayKey = localDayKey(new Date())
      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
            { date: todayKey, inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 150, totalCost: 0.5 },
            { date: "2026-02-01", inputTokens: 200, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 300, totalCost: 1.0 },
          ]),
      })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const last30 = result.lines.find((l) => l.label === "Last 30 Days")
      expect(last30).toBeTruthy()
      expect(last30.value).toContain("450 tokens")
      expect(last30.value).toContain("$1.50")
    })

    it("shows No data for days ccusage did not report instead of fabricated zeros (regression for upstream #746)", async () => {
      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
            { date: "2026-02-01", inputTokens: 500, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 600, totalCost: 2.0 },
          ]),
      })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const todayLine = result.lines.find((l) => l.label === "Today")
      expect(todayLine).toBeTruthy()
      expect(todayLine.value).toBe("No data")
      const yesterdayLine = result.lines.find((l) => l.label === "Yesterday")
      expect(yesterdayLine).toBeTruthy()
      expect(yesterdayLine.value).toBe("No data")
      const last30 = result.lines.find((l) => l.label === "Last 30 Days")
      expect(last30).toBeTruthy()
      expect(last30.value).toContain("600 tokens")
    })

    it("shows No data for Today/Yesterday when ccusage returns ok with empty daily array", async () => {
      const ctx = makeProbeCtx({ ccusageResult: okUsage([]) })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const todayLine = result.lines.find((l) => l.label === "Today")
      expect(todayLine).toBeTruthy()
      expect(todayLine.value).toBe("No data")
      const yesterdayLine = result.lines.find((l) => l.label === "Yesterday")
      expect(yesterdayLine).toBeTruthy()
      expect(yesterdayLine.value).toBe("No data")
      expect(result.lines.find((l) => l.label === "Last 30 Days")).toBeUndefined()
    })

    it("omits cost when totalCost is null", async () => {
      const todayKey = localDayKey(new Date())
      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
            { date: todayKey, inputTokens: 500, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 600, totalCost: null },
          ]),
      })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const todayLine = result.lines.find((l) => l.label === "Today")
      expect(todayLine).toBeTruthy()
      expect(todayLine.value).not.toContain("$")
      expect(todayLine.value).toContain("600 tokens")
    })

    it("shows empty Today state when today's totals are zero (regression)", async () => {
      const todayKey = localDayKey(new Date())
      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
            { date: todayKey, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, totalCost: 0 },
          ]),
      })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const todayLine = result.lines.find((l) => l.label === "Today")
      expect(todayLine).toBeTruthy()
      expect(todayLine.value).toContain("$0.00")
      expect(todayLine.value).toContain("0 tokens")
    })

    it("shows empty Yesterday state when yesterday's totals are zero (regression)", async () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayKey = localDayKey(yesterday)
      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
            { date: yesterdayKey, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, totalCost: 0 },
          ]),
      })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const yesterdayLine = result.lines.find((l) => l.label === "Yesterday")
      expect(yesterdayLine).toBeTruthy()
      expect(yesterdayLine.value).toContain("$0.00")
      expect(yesterdayLine.value).toContain("0 tokens")
    })

    it("queries ccusage on each probe", async () => {
      const todayKey = localDayKey(new Date())
      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
            { date: todayKey, inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 150, totalCost: 0.5 },
          ]),
      })
      const plugin = await loadPlugin()
      plugin.probe(ctx)
      plugin.probe(ctx)
      expect(ctx.host.ccusage.query).toHaveBeenCalledTimes(2)
    })

    it("queries ccusage with a 31-day inclusive since window", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-02-20T16:00:00.000Z"))
      try {
        const ctx = makeProbeCtx({ ccusageResult: okUsage([]) })
        const plugin = await loadPlugin()
        plugin.probe(ctx)
        expect(ctx.host.ccusage.query).toHaveBeenCalled()

        const firstCall = ctx.host.ccusage.query.mock.calls[0][0]
        const since = new Date()
        since.setDate(since.getDate() - 30)
        expect(firstCall.since).toBe(localCompactDayKey(since))
      } finally {
        vi.useRealTimers()
      }
    })

    it("matches compact day keys and falls back from invalid totalCost to costUSD", async () => {
      const today = new Date()
      const todayKey = localCompactDayKey(today)
      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
          {
            date: todayKey,
            inputTokens: 100,
            outputTokens: 50,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 150,
            totalCost: "not-a-number",
            costUSD: 0.25,
          },
        ]),
      })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const todayLine = result.lines.find((l) => l.label === "Today")
      expect(todayLine).toBeTruthy()
      expect(todayLine.value).toContain("150 tokens")
      expect(todayLine.value).toContain("$0.25")
    })

    it("includes cache tokens in total", async () => {
      const todayKey = localDayKey(new Date())
      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
            { date: todayKey, inputTokens: 100, outputTokens: 50, cacheCreationTokens: 200, cacheReadTokens: 300, totalTokens: 650, totalCost: 1.0 },
          ]),
      })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const todayLine = result.lines.find((l) => l.label === "Today")
      expect(todayLine).toBeTruthy()
      expect(todayLine.value).toContain("650 tokens")
    })

    it("formats compact token values with decimal and rounded K suffixes", async () => {
      const todayKey = localDayKey(new Date())
      const ctx = makeProbeCtx({
        ccusageResult: okUsage([
          {
            date: todayKey,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 1500,
            totalCost: 0.5,
          },
          {
            date: "2026-02-01",
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 10500,
            totalCost: 1.5,
          },
        ]),
      })
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const todayLine = result.lines.find((l) => l.label === "Today")
      const last30 = result.lines.find((l) => l.label === "Last 30 Days")
      expect(todayLine.value).toContain("1.5K tokens")
      expect(last30.value).toContain("12K tokens")
    })
  })

  it("parses an HTTP-date Retry-After on 429", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-14T10:00:00.000Z"))
    try {
      const ctx = makeCtx()
      ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { accessToken: "token" } })
      ctx.host.fs.exists = () => true
      ctx.host.http.request.mockReturnValue({
        status: 429,
        bodyText: "",
        headers: { "Retry-After": "Tue, 14 Apr 2026 10:15:00 GMT" },
      })
      const plugin = await loadPlugin()
      expect(() => plugin.probe(ctx)).toThrow("Rate limited by Anthropic, retry in ~15m")
    } finally {
      vi.useRealTimers()
    }
  })

  it("logs loudly and still probes when credential fingerprint hashing throws", async () => {
    const ctx = makeCtx()
    ctx.host.crypto.sha256Hex.mockImplementation(() => {
      throw new Error("hash backend unavailable")
    })
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "token", subscriptionType: "pro" } })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    // The failure is surfaced (no silent catch), the probe still works, and without a hash the
    // live-plan cache is skipped so the raw token pair never reaches disk.
    expect(result.lines.find((l) => l.label === "Session")).toBeTruthy()
    expect(ctx.host.log.error).toHaveBeenCalledWith(
      expect.stringContaining("credential fingerprint hashing failed")
    )
    expect(ctx.host.fs.writeText).not.toHaveBeenCalledWith(expect.stringContaining("live-plan.json"), expect.anything())
  })

  it("declares Status badge, Fable (overview, below Weekly) and Rate Limit Resets (detail) in the manifest", () => {
    // The overview page filters runtime lines to manifest overview-scope labels, so the
    // not-logged-in / no-usage-data Status badge must be declared with scope "overview" or those
    // cards render a silent blank (regression for upstream #849). Fable is always visible directly
    // below Weekly (upstream #1141).
    const manifest = JSON.parse(readFileSync("plugins/claude/plugin.json", "utf8"))
    expect(manifest.lines).toContainEqual({ type: "badge", label: "Status", scope: "overview" })
    expect(manifest.lines).toContainEqual({ type: "progress", label: "Fable", scope: "overview" })
    expect(manifest.lines).toContainEqual({ type: "text", label: "Rate Limit Resets", scope: "detail" })
    const labels = manifest.lines.map((line) => line.label)
    expect(labels.indexOf("Fable")).toBe(labels.indexOf("Weekly") + 1)
  })

  describe("live plan from /api/oauth/profile (regression for upstream #1258)", () => {
    const STORED = JSON.stringify({
      claudeAiOauth: { accessToken: "token", subscriptionType: "max", rateLimitTier: "default_claude_max_5x" },
    })
    const profileResponse = (organization) =>
      okUsageResponse({ account: { uuid: "acc" }, organization: organization })
    const routeRequests = (ctx, profile) =>
      ctx.host.http.request.mockImplementation((opts) =>
        String(opts.url).includes("/api/oauth/profile")
          ? profile()
          : okUsageResponse({ five_hour: { utilization: 10, resets_at: null } })
      )
    const profileCalls = (ctx) =>
      ctx.host.http.request.mock.calls.filter((call) => String(call[0]?.url).includes("/api/oauth/profile"))

    it("shows the upgraded plan instead of the stale stored one", async () => {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => true
      ctx.host.fs.readText = () => STORED
      routeRequests(ctx, () =>
        profileResponse({ uuid: "org", organization_type: "claude_max", rate_limit_tier: "default_claude_max_20x" })
      )
      const result = (await loadPlugin()).probe(ctx)
      expect(result.plan).toBe("Max 20x")
      expect(profileCalls(ctx)[0][0].headers.Authorization).toBe("Bearer token")
    })

    it("falls back to stored fields the profile omits", async () => {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => true
      ctx.host.fs.readText = () => STORED
      routeRequests(ctx, () => profileResponse({ uuid: "org", rate_limit_tier: "default_claude_max_20x" }))
      expect((await loadPlugin()).probe(ctx).plan).toBe("Max 20x")
    })

    it("keeps the stored plan and the usage lines when the profile lookup fails", async () => {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => true
      ctx.host.fs.readText = () => STORED
      routeRequests(ctx, () => {
        throw new Error("network down")
      })
      const result = (await loadPlugin()).probe(ctx)
      expect(result.plan).toBe("Max 5x")
      expect(result.lines.find((l) => l.label === "Session")?.used).toBe(10)
      expect(ctx.host.log.warn).toHaveBeenCalledWith(expect.stringContaining("live plan lookup failed"))
    })

    it("looks the profile up at most once per token, even after a failure", async () => {
      const ctx = makeCtx()
      ctx.host.fs.writeText("~/.claude/.credentials.json", STORED)
      routeRequests(ctx, () => ({ status: 500, bodyText: "" }))
      ;(await loadPlugin()).probe(ctx)
      const result = (await loadPlugin()).probe(ctx) // fresh runtime: only pluginDataDir carries over
      expect(ctx.host.fs.readText("/tmp/openusage-test/plugin/live-plan.json")).toContain('"plan":null')
      expect(usageRequestCount(ctx)).toBe(2)
      expect(profileCalls(ctx)).toHaveLength(1)
      expect(result.plan).toBe("Max 5x")
    })

    it("skips the profile lookup when the usage fetch is rate limited", async () => {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => true
      ctx.host.fs.readText = () => STORED
      ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "", headers: {} })
      const plugin = await loadPlugin()
      expect(() => plugin.probe(ctx)).toThrow("Rate limited")
      expect(profileCalls(ctx)).toHaveLength(0)
    })
  })

  describe("Rate Limit Resets from cedar_ember (upstream #1290)", () => {
    const probeWith = async (body) => {
      const ctx = makeCtx()
      ctx.host.fs.exists = () => true
      ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { accessToken: "token" } })
      ctx.host.http.request.mockReturnValue(okUsageResponse(body))
      const result = (await loadPlugin()).probe(ctx)
      return { ctx, line: result.lines.find((l) => l.label === "Rate Limit Resets") }
    }

    it("polls plain usage and asks for grants with Claude Code's own request (upstream #1367)", async () => {
      const { ctx } = await probeWith({})
      const urls = ctx.host.http.request.mock.calls.map((c) => String(c[0].url)).filter((u) => u.includes("/usage"))
      expect(urls).toEqual([
        "https://api.anthropic.com/api/oauth/usage",
        "https://api.anthropic.com/api/oauth/usage?cedar_ember=1&skip_spend=1",
      ])
    })

    describe("hourly grants check", () => {
      const GRANTS = { eligible: true, grants: [{ resets_left: 1, ends_at: "2099-01-01T00:00:00Z" }] }
      const CACHE = "/tmp/openusage-test/plugin/reset-grants.json"
      const setup = (grantsResponse) => {
        const ctx = makeCtx()
        ctx.host.fs.writeText("~/.claude/.credentials.json", JSON.stringify({ claudeAiOauth: { accessToken: "token" } }))
        ctx.host.fs.writeText("~/.claude.json", JSON.stringify({ oauthAccount: { accountUuid: "acc-1" } }))
        ctx.host.http.request.mockImplementation((opts) =>
          isGrantsCheck(opts.url)
            ? grantsResponse()
            : okUsageResponse({ five_hour: { utilization: 10, resets_at: null } })
        )
        return ctx
      }
      const probe = async (ctx) => {
        const result = (await loadPlugin()).probe(ctx) // fresh runtime: only pluginDataDir carries over
        return { session: result.lines.find((l) => l.label === "Session"), resets: result.lines.find((l) => l.label === "Rate Limit Resets") }
      }
      const ageCache = (ctx, ms) => {
        const cached = JSON.parse(ctx.host.fs.readText(CACHE))
        ctx.host.fs.writeText(CACHE, JSON.stringify({ ...cached, checkedAt: cached.checkedAt - ms }))
      }

      it("asks once an hour and shows the last answer in between", async () => {
        const ctx = setup(() => okUsageResponse({ cedar_ember: GRANTS }))
        expect((await probe(ctx)).resets?.value).toBe("1 available")
        expect((await probe(ctx)).resets?.value).toBe("1 available")
        expect(usageRequestCount(ctx)).toBe(2)
        expect(grantsCheckCount(ctx)).toBe(1)

        ageCache(ctx, 60 * 60 * 1000)
        await probe(ctx)
        expect(grantsCheckCount(ctx)).toBe(2)
      })

      it("keeps the last answer and the bars when a check fails, and waits an hour to retry", async () => {
        let grantsResponse = () => okUsageResponse({ cedar_ember: GRANTS })
        const ctx = setup(() => grantsResponse())
        await probe(ctx)
        ageCache(ctx, 60 * 60 * 1000)
        grantsResponse = () => ({ status: 429, bodyText: "", headers: { "retry-after": "3000" } })

        const failed = await probe(ctx)
        expect(failed.session?.used).toBe(10)
        expect(failed.resets?.value).toBe("1 available")
        expect(ctx.host.log.warn).toHaveBeenCalledWith(expect.stringContaining("reset grants check failed (status=429)"))
        await probe(ctx)
        expect(grantsCheckCount(ctx)).toBe(2)
      })

      it("gives the grants check its own 429 gate, apart from the plain usage poll", async () => {
        const ctx = setup(() => okUsageResponse({ cedar_ember: GRANTS }))
        await probe(ctx)
        const calls = ctx.host.http.request.mock.calls.map(([opts]) => opts)
        expect(calls.find((opts) => isGrantsCheck(opts.url)).gateScope).toBe("reset-grants")
        expect(calls.find((opts) => isUsagePoll(opts.url)).gateScope).toBeUndefined()
      })

      it("keeps the bars and skips grants when the account file can't be read", async () => {
        const ctx = setup(() => okUsageResponse({ cedar_ember: GRANTS }))
        const readText = ctx.host.fs.readText
        ctx.host.fs.readText = (path) => {
          if (path === "~/.claude.json") throw new Error("permission denied")
          return readText(path)
        }
        const result = await probe(ctx)
        expect(result.session?.used).toBe(10)
        expect(result.resets).toBeUndefined()
        expect(grantsCheckCount(ctx)).toBe(0)
      })

      it("tells logins apart by their token pair when .claude.json has no account id", async () => {
        const ctx = setup(() => okUsageResponse({ cedar_ember: GRANTS }))
        ctx.host.fs.writeText("~/.claude.json", "{}")
        await probe(ctx)
        await probe(ctx)
        expect(grantsCheckCount(ctx)).toBe(1)

        ctx.host.fs.writeText("~/.claude/.credentials.json", JSON.stringify({ claudeAiOauth: { accessToken: "other" } }))
        ctx.host.http.request.mockImplementation((opts) =>
          isGrantsCheck(opts.url) ? okUsageResponse({ cedar_ember: null }) : okUsageResponse({})
        )
        expect((await probe(ctx)).resets).toBeUndefined()
        expect(grantsCheckCount(ctx)).toBe(2)
      })

      it("asks again for another account instead of showing the previous one's grants", async () => {
        const ctx = setup(() => okUsageResponse({ cedar_ember: GRANTS }))
        await probe(ctx)
        ctx.host.fs.writeText("~/.claude.json", JSON.stringify({ oauthAccount: { accountUuid: "acc-2" } }))
        ctx.host.http.request.mockImplementation((opts) =>
          isGrantsCheck(opts.url) ? okUsageResponse({ cedar_ember: null }) : okUsageResponse({})
        )
        expect((await probe(ctx)).resets).toBeUndefined()
        expect(grantsCheckCount(ctx)).toBe(2)
      })
    })

    it("counts each remaining reset, skipping spent and lapsed grants", async () => {
      const { line } = await probeWith({
        cedar_ember: {
          eligible: true,
          grants: [
            { id: "launch", resets_left: 1, ends_at: "2099-10-22T16:00:00+00:00" },
            { id: "other", resets_left: "2", ends_at: "2099-10-01T00:00:00+00:00" },
            { id: "no-deadline", resets_left: 1, ends_at: null },
            { id: "spent", resets_left: 0, ends_at: "2099-10-05T00:00:00+00:00" },
            { id: "lapsed", resets_left: 1, ends_at: "2020-09-01T00:00:00+00:00" },
          ],
        },
      })
      expect(line).toMatchObject({ type: "text", label: "Rate Limit Resets", value: "4 available" })
      expect(line.resetCredits).toHaveLength(3)
      expect(line.resetCredits[0]).toEqual({ count: 1, expiresAt: "2099-10-22T16:00:00.000Z" })
    })

    it("excludes paused and explicitly unusable grants", async () => {
      const { line } = await probeWith({ cedar_ember: { eligible: true, grants: [
        { resets_left: 2, paused: true }, { resets_left: 1, usable_now: false },
        { resets_left: 1, usable_now: true, ends_at: "2099-01-01T00:00:00Z" },
      ] } })
      expect(line.value).toBe("1 available")
      expect(line.resetCredits).toEqual([{ count: 1, expiresAt: "2099-01-01T00:00:00.000Z" }])
    })

    it("reads 0 available for an ineligible account", async () => {
      const { line } = await probeWith({
        cedar_ember: { eligible: false, ineligible_reason: "tier", grants: [{ resets_left: 1 }] },
      })
      expect(line?.value).toBe("0 available")
    })

    it("emits no row when the block is missing or null", async () => {
      expect((await probeWith({ cedar_ember: null })).line).toBeUndefined()
      expect((await probeWith({ five_hour: { utilization: 3 } })).line).toBeUndefined()
    })
  })

  it("renders Fable directly below Weekly (upstream #1141)", async () => {
    const ctx = makeCtx()
    ctx.host.fs.exists = () => true
    ctx.host.fs.readText = () => JSON.stringify({ claudeAiOauth: { accessToken: "token" } })
    ctx.host.http.request.mockReturnValue(okUsageResponse({
      five_hour: { utilization: 1, resets_at: null },
      seven_day: { utilization: 2, resets_at: null },
      seven_day_sonnet: { utilization: 3, resets_at: null },
      limits: [{ kind: "weekly_scoped", percent: 4, scope: { model: { display_name: "Fable" } } }],
    }))
    const labels = (await loadPlugin()).probe(ctx).lines.map((l) => l.label)
    expect(labels.slice(0, 4)).toEqual(["Session", "Weekly", "Fable", "Sonnet"])
  })

  describe("local spend without OAuth credentials (upstream #1138)", () => {
    const todayKey = () => {
      const d = new Date()
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")
    }

    it("shows ccusage spend under a Not logged in badge instead of an error", async () => {
      const ctx = makeCtx()
      ctx.host.ccusage.query = vi.fn(() => ({
        status: "ok",
        data: { daily: [{ date: todayKey(), totalTokens: 1500, totalCost: 0.5 }] },
      }))
      const result = (await loadPlugin()).probe(ctx)
      expect(result.plan).toBeNull()
      expect(result.lines[0]).toEqual({ type: "badge", label: "Status", text: "Not logged in", color: "#f59e0b" })
      expect(result.lines.find((l) => l.label === "Today")?.value).toBe("$0.50 · 1.5K tokens")
      expect(ctx.host.http.request).not.toHaveBeenCalled()
    })

    it("still throws Not logged in when ccusage has no recorded spend", async () => {
      const ctx = makeCtx()
      ctx.host.ccusage.query = vi.fn(() => ({
        status: "ok",
        data: { daily: [{ date: todayKey(), totalTokens: 0, totalCost: 0 }] },
      }))
      const plugin = await loadPlugin()
      expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    })
  })
})
