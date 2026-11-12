import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function makeJwt(payload) {
  const jwtPayload = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
  return `a.${jwtPayload}.c`
}

function cursorAuthMock(decrypt) {
  return {
    decrypt: vi.fn(decrypt),
    protect: (plain) => "protected:" + plain,
    unprotect: (stored) => {
      const text = String(stored)
      if (text.indexOf("protected:") !== 0) throw new Error("bad cache")
      return text.slice("protected:".length)
    },
  }
}

describe("cursor plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no token", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([]))
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
  })

  it("loads tokens from keychain when sqlite has none", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([]))
    ctx.host.keychain.readGenericPassword.mockImplementation((service) => {
      if (service === "cursor-access-token") return "keychain-access-token"
      if (service === "cursor-refresh-token") return "keychain-refresh-token"
      return null
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        enabled: true,
        planUsage: { totalSpend: 1200, limit: 2400 },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPassword).toHaveBeenCalledWith("cursor-access-token")
    expect(ctx.host.keychain.readGenericPassword).toHaveBeenCalledWith("cursor-refresh-token")
  })

  it("refreshes keychain access token and persists to keychain source", async () => {
    const ctx = makeCtx()
    const expiredPayload = Buffer.from(JSON.stringify({ exp: 1 }), "utf8")
      .toString("base64")
      .replace(/=+$/g, "")
    const expiredAccessToken = `a.${expiredPayload}.c`
    const freshPayload = Buffer.from(JSON.stringify({ exp: 9999999999 }), "utf8")
      .toString("base64")
      .replace(/=+$/g, "")
    const refreshedAccessToken = `a.${freshPayload}.c`

    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([]))
    ctx.host.keychain.readGenericPassword.mockImplementation((service) => {
      if (service === "cursor-access-token") return expiredAccessToken
      if (service === "cursor-refresh-token") return "keychain-refresh-token"
      return null
    })
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        return {
          status: 200,
          bodyText: JSON.stringify({ access_token: refreshedAccessToken }),
        }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          enabled: true,
          planUsage: { totalSpend: 1200, limit: 2400 },
        }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
    expect(ctx.host.keychain.writeGenericPassword).toHaveBeenCalledWith(
      "cursor-access-token",
      refreshedAccessToken
    )
    expect(ctx.host.sqlite.exec).not.toHaveBeenCalled()
  })

  it("prefers sqlite tokens when sqlite and keychain both have tokens", async () => {
    const ctx = makeCtx()
    const sqlitePayload = Buffer.from(JSON.stringify({ exp: 9999999999 }), "utf8")
      .toString("base64")
      .replace(/=+$/g, "")
    const sqliteToken = `a.${sqlitePayload}.c`
    const keychainPayload = Buffer.from(JSON.stringify({ exp: 9999999999, sub: "keychain" }), "utf8")
      .toString("base64")
      .replace(/=+$/g, "")
    const keychainToken = `a.${keychainPayload}.c`

    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([{ value: sqliteToken }])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "sqlite-refresh-token" }])
      }
      return JSON.stringify([])
    })
    ctx.host.keychain.readGenericPassword.mockImplementation((service) => {
      if (service === "cursor-access-token") return keychainToken
      if (service === "cursor-refresh-token") return "keychain-refresh-token"
      return null
    })
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        expect(opts.headers.Authorization).toBe("Bearer " + sqliteToken)
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          enabled: true,
          planUsage: { totalSpend: 1200, limit: 2400 },
        }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPassword).toHaveBeenCalledWith("cursor-access-token")
    expect(ctx.host.keychain.readGenericPassword).toHaveBeenCalledWith("cursor-refresh-token")
  })

  it("prefers keychain when sqlite looks free and token subjects differ", async () => {
    const ctx = makeCtx()
    const sqlitePayload = Buffer.from(
      JSON.stringify({ exp: 9999999999, sub: "google-oauth2|sqlite-user" }),
      "utf8"
    )
      .toString("base64")
      .replace(/=+$/g, "")
    const sqliteToken = `a.${sqlitePayload}.c`

    const keychainPayload = Buffer.from(
      JSON.stringify({ exp: 9999999999, sub: "auth0|keychain-user" }),
      "utf8"
    )
      .toString("base64")
      .replace(/=+$/g, "")
    const keychainToken = `a.${keychainPayload}.c`

    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([{ value: sqliteToken }])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "sqlite-refresh-token" }])
      }
      if (String(sql).includes("cursorAuth/stripeMembershipType")) {
        return JSON.stringify([{ value: "free" }])
      }
      return JSON.stringify([])
    })
    ctx.host.keychain.readGenericPassword.mockImplementation((service) => {
      if (service === "cursor-access-token") return keychainToken
      if (service === "cursor-refresh-token") return "keychain-refresh-token"
      return null
    })
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        expect(opts.headers.Authorization).toBe("Bearer " + keychainToken)
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          enabled: true,
          planUsage: { totalSpend: 1200, limit: 2400 },
        }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
  })

  it("throws on sqlite errors when reading token", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockImplementation(() => {
      throw new Error("boom")
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    expect(ctx.host.log.warn).toHaveBeenCalled()
  })

  it("throws on disabled usage", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ enabled: false }),
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("No active Cursor subscription.")
  })

  it("throws on missing plan usage data", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ enabled: true }),
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("No active Cursor subscription.")
  })

  it("accepts team usage when enabled flag is missing", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1770064133000",
            billingCycleEnd: "1772483333000",
            planUsage: { totalSpend: 8474, limit: 2000, bonusSpend: 6474 },
            spendLimitUsage: {
              pooledLimit: 60000,
              pooledRemaining: 19216,
            },
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({ planInfo: { planName: "Team" } }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Team")
    const totalLine = result.lines.find((line) => line.label === "Total usage")
    expect(totalLine).toBeTruthy()
    expect(totalLine.format).toEqual({ kind: "dollars" })
    expect(totalLine.used).toBe(84.74)
    expect(totalLine.limit).toBe(20)
    expect(result.lines.find((line) => line.label === "Bonus spend")).toBeTruthy()
  })

  it("throws on missing total usage limit", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        enabled: true,
        planUsage: { totalSpend: 1200 }, // missing limit
      }),
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Total usage limit missing")
  })

  it("uses percent-only usage when totalPercentUsed exists but limit is missing", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            billingCycleStart: "1772556293029",
            billingCycleEnd: "1775234693029",
            planUsage: {
              autoPercentUsed: 0,
              apiPercentUsed: 0,
              totalPercentUsed: 0,
            },
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            planInfo: { planName: "Free" },
          }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        throw new Error("unexpected REST usage fallback")
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Free")
    const totalLine = result.lines.find((line) => line.label === "Total usage")
    expect(totalLine).toBeTruthy()
    expect(totalLine.format).toEqual({ kind: "percent" })
    expect(totalLine.used).toBe(0)
    expect(totalLine.limit).toBe(100)
  })

  it("uses percent-only free usage when pooledLimit is zero", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            billingCycleStart: "1772556293029",
            billingCycleEnd: "1775234693029",
            planUsage: {
              autoPercentUsed: 0,
              apiPercentUsed: 0,
              totalPercentUsed: 0,
            },
            spendLimitUsage: { pooledLimit: 0, pooledRemaining: 0 },
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            planInfo: { planName: "Free" },
          }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        throw new Error("unexpected REST usage fallback")
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Free")
    const totalLine = result.lines.find((line) => line.label === "Total usage")
    expect(totalLine).toBeTruthy()
    expect(totalLine.format).toEqual({ kind: "percent" })
    expect(totalLine.used).toBe(0)
    expect(totalLine.limit).toBe(100)
  })

  it("renders percent-only usage when plan info is unavailable", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            billingCycleStart: "1772556293029",
            billingCycleEnd: "1775234693029",
            planUsage: {
              totalPercentUsed: 42,
            },
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return { status: 503, bodyText: "" }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        throw new Error("unexpected REST usage fallback")
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBeNull()
    const totalLine = result.lines.find((line) => line.label === "Total usage")
    expect(totalLine).toBeTruthy()
    expect(totalLine.format).toEqual({ kind: "percent" })
    expect(totalLine.used).toBe(42)
    expect(totalLine.limit).toBe(100)
  })

  it("falls back to computed percent when totalSpend missing and no totalPercentUsed", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        enabled: true,
        planUsage: { limit: 2400, remaining: 1200 },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const planLine = result.lines.find((l) => l.label === "Total usage")
    expect(planLine).toBeTruthy()
    expect(planLine.format).toEqual({ kind: "percent" })
    // computed = (2400 - 1200) / 2400 * 100 = 50
    expect(planLine.used).toBe(50)
  })

  it("renders usage + plan info", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 1200, limit: 2400, bonusSpend: 100 },
            spendLimitUsage: { individualLimit: 5000, individualRemaining: 1000 },
            billingCycleEnd: Date.now(),
          }),
        }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ planInfo: { planName: "pro plan" } }),
      }
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
  })

  it("omits plan badge for blank plan names", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 1200, limit: 2400 },
          }),
        }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ planInfo: { planName: "   " } }),
      }
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBeFalsy()
  })

  it("uses pooled spend limits when individual values missing", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 1200, limit: 2400 },
            spendLimitUsage: { pooledLimit: 2000, pooledRemaining: 500 },
          }),
        }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ planInfo: { planName: "pro plan" } }),
      }
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "On-demand")).toBeTruthy()
  })

  it("prefers explicit positive spend over zero used and limit minus remaining for On-demand", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { limit: 40000, totalPercentUsed: 20 },
            spendLimitUsage: {
              individualLimit: 5000,
              individualRemaining: 4500,
              individualUsed: 0,
              totalSpend: 1200,
            },
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const onDemandLine = result.lines.find((line) => line.label === "On-demand")
    expect(onDemandLine).toBeTruthy()
    expect(onDemandLine.type).toBe("progress")
    expect(onDemandLine.used).toBe(12)
    expect(onDemandLine.limit).toBe(50)
  })

  it("uses explicit used field for On-demand when remaining is missing", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 1200, limit: 2400 },
            spendLimitUsage: { individualLimit: 5000, individualUsed: 1000 },
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const onDemandLine = result.lines.find((line) => line.label === "On-demand")
    expect(onDemandLine).toBeTruthy()
    // Missing remaining must not display the full limit ($50) as spent.
    expect(onDemandLine.used).toBe(10)
    expect(onDemandLine.limit).toBe(50)
  })

  it("renders zero-limit On-demand spend as a text row", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { limit: 40000, totalPercentUsed: 26.346, totalSpend: 52692 },
            spendLimitUsage: {
              individualUsed: 16474,
              limitType: "user",
              totalSpend: 16474,
            },
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const onDemandLine = result.lines.find((line) => line.label === "On-demand")
    expect(onDemandLine).toBeTruthy()
    expect(onDemandLine.type).toBe("text")
    expect(onDemandLine.value).toBe("$164.74 spent")
  })

  it("throws on token expired", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Token expired")
  })

  it("throws on http errors", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockReturnValue({ status: 500, bodyText: "" })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("HTTP 500")
  })

  it("throws on usage request errors", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation(() => {
      throw new Error("boom")
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed")
  })

  it("throws on parse errors", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: "not-json",
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage response invalid")
  })

  it("handles enterprise account with request-based usage", async () => {
    const ctx = makeCtx()

    // Build a JWT with a sub claim containing a user ID
    const jwtPayload = Buffer.from(
      JSON.stringify({ sub: "google-oauth2|user_abc123", exp: 9999999999 }),
      "utf8"
    )
      .toString("base64")
      .replace(/=+$/g, "")
    const accessToken = `a.${jwtPayload}.c`

    ctx.host.sqlite.query.mockReturnValue(
      JSON.stringify([{ value: accessToken }])
    )
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        // Enterprise returns no enabled/planUsage
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1770539602363",
            billingCycleEnd: "1770539602363",
            displayThreshold: 100,
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            planInfo: { planName: "Enterprise", price: "Custom" },
          }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            "gpt-4": {
              numRequests: 422,
              numRequestsTotal: 422,
              numTokens: 171664819,
              maxRequestUsage: 500,
              maxTokenUsage: null,
            },
            startOfMonth: "2026-02-01T06:12:57.000Z",
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Enterprise")
    const reqLine = result.lines.find((l) => l.label === "Requests")
    expect(reqLine).toBeTruthy()
    expect(reqLine.used).toBe(422)
    expect(reqLine.limit).toBe(500)
    expect(reqLine.format).toEqual({ kind: "count", suffix: "requests" })
  })

  it("falls back to enterprise request-based usage when planUsage.limit is missing", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })

    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            billingCycleStart: "1770539602363",
            billingCycleEnd: "1770539602363",
            planUsage: {
              totalSpend: 1234,
              totalPercentUsed: 12,
            },
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            planInfo: { planName: "Enterprise" },
          }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            "gpt-4": {
              numRequests: 211,
              maxRequestUsage: 500,
            },
            startOfMonth: "2026-02-01T06:12:57.000Z",
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Enterprise")
    const reqLine = result.lines.find((line) => line.label === "Requests")
    expect(reqLine).toBeTruthy()
    expect(reqLine.used).toBe(211)
    expect(reqLine.limit).toBe(500)
  })

  it("falls back to REST usage for team-inferred account with percent-only and unavailable plan info", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })

    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            billingCycleStart: "1772556293029",
            billingCycleEnd: "1775234693029",
            planUsage: {
              totalPercentUsed: 35,
            },
            spendLimitUsage: {
              limitType: "team",
              pooledLimit: 5000,
            },
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return { status: 503, bodyText: "" }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            "gpt-4": {
              numRequests: 150,
              maxRequestUsage: 500,
            },
            startOfMonth: "2026-02-01T06:12:57.000Z",
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const reqLine = result.lines.find((l) => l.label === "Requests")
    expect(reqLine).toBeTruthy()
    expect(reqLine.used).toBe(150)
    expect(reqLine.limit).toBe(500)
    expect(reqLine.format).toEqual({ kind: "count", suffix: "requests" })
  })

  it("handles team account with request-based usage", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })

    ctx.host.sqlite.query.mockReturnValue(
      JSON.stringify([{ value: accessToken }])
    )
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1772124774973",
            billingCycleEnd: "1772124774973",
            displayThreshold: 100,
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            planInfo: {
              planName: "Team",
              includedAmountCents: 2000,
              price: "$40/mo",
              billingCycleEnd: "1773077797000",
            },
          }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            "gpt-4": {
              numRequests: 39,
              numRequestsTotal: 39,
              numTokens: 12345,
              maxRequestUsage: 500,
              maxTokenUsage: null,
            },
            startOfMonth: "2026-02-09T17:36:37.000Z",
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Team")
    const reqLine = result.lines.find((l) => l.label === "Requests")
    expect(reqLine).toBeTruthy()
    expect(reqLine.used).toBe(39)
    expect(reqLine.limit).toBe(500)
    expect(reqLine.format).toEqual({ kind: "count", suffix: "requests" })
  })

  it("throws when enterprise REST usage API fails", async () => {
    const ctx = makeCtx()

    const jwtPayload = Buffer.from(
      JSON.stringify({ sub: "google-oauth2|user_abc123", exp: 9999999999 }),
      "utf8"
    )
      .toString("base64")
      .replace(/=+$/g, "")
    const accessToken = `a.${jwtPayload}.c`

    ctx.host.sqlite.query.mockReturnValue(
      JSON.stringify([{ value: accessToken }])
    )
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1770539602363",
            billingCycleEnd: "1770539602363",
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            planInfo: { planName: "Enterprise" },
          }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return { status: 500, bodyText: "" }
      }
      return { status: 200, bodyText: "{}" }
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Enterprise usage data unavailable")
  })

  it("throws team request-based unavailable when REST usage API fails", async () => {
    const ctx = makeCtx()

    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })

    ctx.host.sqlite.query.mockReturnValue(
      JSON.stringify([{ value: accessToken }])
    )
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1772124774973",
            billingCycleEnd: "1772124774973",
            displayThreshold: 100,
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            planInfo: { planName: "Team" },
          }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return { status: 500, bodyText: "" }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Team request-based usage data unavailable")
  })

  it("throws team request-based unavailable when REST usage request throws", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })

    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1772124774973",
            billingCycleEnd: "1772124774973",
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({ planInfo: { planName: "Team" } }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        throw new Error("rest usage boom")
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Team request-based usage data unavailable")
  })

  it("falls back to REST request usage when plan info is unavailable", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })

    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1772124774973",
            billingCycleEnd: "1772124774973",
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return { status: 503, bodyText: "" }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            "gpt-4": {
              numRequests: 31,
              maxRequestUsage: 500,
            },
            startOfMonth: "2026-02-09T17:36:37.000Z",
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBeNull()
    const reqLine = result.lines.find((l) => l.label === "Requests")
    expect(reqLine).toBeTruthy()
    expect(reqLine.used).toBe(31)
    expect(reqLine.limit).toBe(500)
  })

  it("surfaces request-based unavailable when plan info is unavailable and REST fallback fails", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })

    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1772124774973",
            billingCycleEnd: "1772124774973",
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        throw new Error("plan info timeout")
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return { status: 500, bodyText: "" }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Cursor request-based usage data unavailable")
  })

  it("does not use request-based fallback for disabled team accounts", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })
    let restUsageCalled = false

    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: false,
            billingCycleStart: "1772124774973",
            billingCycleEnd: "1772124774973",
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({ planInfo: { planName: "Team" } }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        restUsageCalled = true
        return {
          status: 200,
          bodyText: JSON.stringify({
            "gpt-4": { numRequests: 1, maxRequestUsage: 500 },
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("No active Cursor subscription.")
    expect(restUsageCalled).toBe(false)
  })

  it("still throws no subscription for non-enterprise accounts without planUsage", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({ enabled: false }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({ planInfo: { planName: "Pro" } }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("No active Cursor subscription.")
  })

  it("handles plan fetch failure gracefully", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 0, limit: 100 },
          }),
        }
      }
      // Plan fetch fails
      throw new Error("plan fail")
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
  })

  it("outputs Credits first when available", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 1200, limit: 2400 },
            spendLimitUsage: { individualLimit: 5000, individualRemaining: 1000 },
          }),
        }
      }
      if (String(opts.url).includes("GetCreditGrantsBalance")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            hasCreditGrants: true,
            totalCents: 10000,
            usedCents: 500,
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    
    // Credits should be first in the lines array
    expect(result.lines[0].label).toBe("Credits")
    expect(result.lines[1].label).toBe("Total usage")
    // On-demand should come after
    const onDemandIndex = result.lines.findIndex((l) => l.label === "On-demand")
    expect(onDemandIndex).toBeGreaterThan(1)
  })

  it("combines credit grants with Stripe customer balance for Credits line", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 1200, limit: 2400 },
          }),
        }
      }
      if (url.includes("GetCreditGrantsBalance")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            hasCreditGrants: true,
            totalCents: "1000000",
            usedCents: "264729",
          }),
        }
      }
      if (url.includes("/api/auth/stripe")) {
        expect(opts.headers.Cookie).toBe(
          "WorkosCursorSessionToken=user_abc123%3A%3A" + accessToken
        )
        return {
          status: 200,
          bodyText: JSON.stringify({
            customerBalance: -991544,
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const creditsLine = result.lines.find((line) => line.label === "Credits")

    expect(creditsLine).toBeTruthy()
    expect(creditsLine.type).toBe("text")
    // grants 10000 - used 2647.29 + stripe 9915.44 = 17268.15 left
    expect(creditsLine.value).toBe("$17268.15 left")
  })

  it("shows Credits line from Stripe balance when grants are unavailable", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 1200, limit: 2400 },
          }),
        }
      }
      if (url.includes("GetCreditGrantsBalance")) {
        return {
          status: 200,
          bodyText: JSON.stringify({ hasCreditGrants: false }),
        }
      }
      if (url.includes("/api/auth/stripe")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            customerBalance: -50000,
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const creditsLine = result.lines.find((line) => line.label === "Credits")

    expect(result.lines[0].label).toBe("Credits")
    expect(creditsLine).toBeTruthy()
    expect(creditsLine.type).toBe("text")
    expect(creditsLine.value).toBe("$500 left")
  })

  it("accepts Stripe customer balance when returned as numeric string", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 1200, limit: 2400 },
          }),
        }
      }
      if (url.includes("GetCreditGrantsBalance")) {
        return {
          status: 200,
          bodyText: JSON.stringify({ hasCreditGrants: false }),
        }
      }
      if (url.includes("/api/auth/stripe")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            customerBalance: "-50000",
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const creditsLine = result.lines.find((line) => line.label === "Credits")

    expect(result.lines[0].label).toBe("Credits")
    expect(creditsLine).toBeTruthy()
    expect(creditsLine.type).toBe("text")
    expect(creditsLine.value).toBe("$500 left")
  })

  it("outputs Total usage first when Credits not available", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 1200, limit: 2400 },
          }),
        }
      }
      if (String(opts.url).includes("GetCreditGrantsBalance")) {
        return {
          status: 200,
          bodyText: JSON.stringify({ hasCreditGrants: false }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    
    // Total usage should be first when Credits not available
    expect(result.lines[0].label).toBe("Total usage")
  })

  it("emits Auto usage and API usage percent lines when available", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            billingCycleEnd: Date.now(),
            planUsage: {
              limit: 40000,
              remaining: 32000,
              totalPercentUsed: 20,
              autoPercentUsed: 12.5,
              apiPercentUsed: 7.5,
            },
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const totalLine = result.lines.find((line) => line.label === "Total usage")
    const autoLine = result.lines.find((line) => line.label === "Auto usage")
    const apiLine = result.lines.find((line) => line.label === "API usage")

    expect(totalLine).toBeTruthy()
    expect(totalLine.used).toBe(20)
    expect(totalLine.format).toEqual({ kind: "percent" })
    expect(autoLine).toBeTruthy()
    expect(autoLine.used).toBe(12.5)
    expect(autoLine.format).toEqual({ kind: "percent" })
    expect(apiLine).toBeTruthy()
    expect(apiLine.used).toBe(7.5)
    expect(apiLine.format).toEqual({ kind: "percent" })
  })

  it("falls back to computed percent when totalPercentUsed is not finite", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        enabled: true,
        planUsage: { limit: 2400, remaining: 1200, totalPercentUsed: Number.POSITIVE_INFINITY },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const totalLine = result.lines.find((l) => l.label === "Total usage")
    expect(totalLine).toBeTruthy()
    expect(totalLine.used).toBe(50)
  })

  it("omits Auto usage and API usage when percent fields missing", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        enabled: true,
        planUsage: { limit: 40000, remaining: 32000, totalPercentUsed: 20 },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Auto usage")).toBeUndefined()
    expect(result.lines.find((line) => line.label === "API usage")).toBeUndefined()
  })

  it("team account uses dollars format for Total usage", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 1200, limit: 2400 },
            spendLimitUsage: { limitType: "team", pooledLimit: 5000, pooledRemaining: 3000 },
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const totalLine = result.lines.find((line) => line.label === "Total usage")
    expect(totalLine).toBeTruthy()
    expect(totalLine.format).toEqual({ kind: "dollars" })
    expect(totalLine.used).toBe(12)
  })

  it("refreshes token when expired and persists new access token", async () => {
    const ctx = makeCtx()

    const expiredPayload = Buffer.from(JSON.stringify({ exp: 1 }), "utf8")
      .toString("base64")
      .replace(/=+$/g, "")
    const accessToken = `a.${expiredPayload}.c`

    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([{ value: accessToken }])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "refresh" }])
      }
      return JSON.stringify([])
    })

    const newPayload = Buffer.from(JSON.stringify({ exp: 9999999999 }), "utf8")
      .toString("base64")
      .replace(/=+$/g, "")
    const newToken = `a.${newPayload}.c`

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: newToken }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
    expect(ctx.host.sqlite.exec).toHaveBeenCalled()
  })

  it("throws session expired when refresh requires logout and no access token exists", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({ shouldLogout: true }) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Session expired")
  })

  it("continues with existing access token when refresh fails", async () => {
    const ctx = makeCtx()

    const payload = Buffer.from(JSON.stringify({ exp: 1 }), "utf8")
      .toString("base64")
      .replace(/=+$/g, "")
    const accessToken = `a.${payload}.c`

    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([{ value: accessToken }])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "refresh" }])
      }
      return JSON.stringify([])
    })

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        // Force refresh to throw string error.
        return { status: 401, bodyText: JSON.stringify({ shouldLogout: true }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).not.toThrow()
  })

  it("handles invalid sqlite JSON for access token when refresh token is available", async () => {
    const ctx = makeCtx()
    const refreshedToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })

    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) return "{}"
      if (String(sql).includes("cursorAuth/refreshToken")) return JSON.stringify([{ value: "refresh" }])
      return JSON.stringify([])
    })
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: refreshedToken }) }
      }
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return { status: 200, bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }) }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
  })

  it("throws not logged in when only refresh token exists but refresh returns no access token", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) return JSON.stringify([])
      if (String(sql).includes("cursorAuth/refreshToken")) return JSON.stringify([{ value: "refresh" }])
      return JSON.stringify([])
    })
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({}) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    // A refresh token is a login the user has: not "Not logged in", which means nothing is set up.
    expect(() => plugin.probe(ctx)).toThrow("Session expired. Sign in via Cursor app or run `agent login`.")
  })

  it("throws token expired when usage remains unauthorized after refresh retry", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([{ value: makeJwt({ sub: "google-oauth2|u", exp: 9999999999 }) }])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) return JSON.stringify([{ value: "refresh" }])
      return JSON.stringify([])
    })

    let usageCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        usageCalls += 1
        if (usageCalls === 1) return { status: 401, bodyText: "" }
        return { status: 403, bodyText: "" }
      }
      if (String(opts.url).includes("/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: makeJwt({ sub: "google-oauth2|u", exp: 9999999999 }) }) }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Token expired")
  })

  it("throws usage request failed after refresh when retried usage request errors", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([{ value: makeJwt({ sub: "google-oauth2|u", exp: 9999999999 }) }])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) return JSON.stringify([{ value: "refresh" }])
      return JSON.stringify([])
    })

    let usageCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        usageCalls += 1
        if (usageCalls === 1) return { status: 401, bodyText: "" }
        throw new Error("boom")
      }
      if (String(opts.url).includes("/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: makeJwt({ sub: "google-oauth2|u", exp: 9999999999 }) }) }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed after refresh")
  })

  it("throws enterprise unavailable when token payload has no sub", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ exp: 9999999999 })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return { status: 200, bodyText: JSON.stringify({ billingCycleStart: "1770539602363" }) }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return { status: 200, bodyText: JSON.stringify({ planInfo: { planName: "Enterprise" } }) }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Enterprise usage data unavailable")
  })

  it("supports enterprise JWT sub values without provider prefix", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "user_abc123", exp: 9999999999 })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1770539602363",
            billingCycleEnd: "1770539602363",
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            planInfo: { planName: "Enterprise" },
          }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            "gpt-4": {
              numRequests: 3,
              maxRequestUsage: 10,
            },
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Enterprise")
    const reqLine = result.lines.find((l) => l.label === "Requests")
    expect(reqLine).toBeTruthy()
    expect(reqLine.used).toBe(3)
    expect(reqLine.limit).toBe(10)
  })

  it("uses zero default for missing remaining and omits zero on-demand limits", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { limit: 2400 },
            spendLimitUsage: {},
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const planLine = result.lines.find((line) => line.label === "Total usage")
    expect(planLine).toBeTruthy()
    expect(planLine.used).toBe(100)
    expect(result.lines.find((line) => line.label === "On-demand")).toBeUndefined()
  })

  it("rethrows string errors from retry wrapper", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.util.retryOnceOnAuth = vi.fn(() => {
      throw "retry failed"
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("retry failed")
  })

  it("skips malformed credit grants payload and still returns total usage", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 1200, limit: 2400 },
          }),
        }
      }
      if (String(opts.url).includes("GetCreditGrantsBalance")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            hasCreditGrants: true,
            totalCents: "oops",
            usedCents: "10",
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Credits")).toBeUndefined()
    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
  })

  it("uses expired access token when refresh token is missing", async () => {
    const ctx = makeCtx()
    const expiredToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 1 })
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([{ value: expiredToken }])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) return JSON.stringify([])
      return JSON.stringify([])
    })
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { totalSpend: 0, limit: 100 },
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).not.toThrow()
  })

  it("throws enterprise unavailable when sub resolves to empty user id", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|", exp: 9999999999 })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return { status: 200, bodyText: JSON.stringify({ billingCycleStart: "1770539602363" }) }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return { status: 200, bodyText: JSON.stringify({ planInfo: { planName: "Enterprise" } }) }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Enterprise usage data unavailable")
  })

  it("uses zero included requests when enterprise usage omits numRequests", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1770539602363",
            billingCycleEnd: "1770539602363",
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            planInfo: { planName: "Enterprise" },
          }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            "gpt-4": {
              maxRequestUsage: 10,
            },
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const reqLine = result.lines.find((line) => line.label === "Requests")
    expect(reqLine).toBeTruthy()
    expect(reqLine.used).toBe(0)
    expect(reqLine.limit).toBe(10)
  })

  it("throws enterprise unavailable when gpt-4 request limit is not positive", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1770539602363",
            billingCycleEnd: "1770539602363",
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            planInfo: { planName: "Enterprise" },
          }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            "gpt-4": {
              numRequests: 42,
              maxRequestUsage: 0,
            },
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Enterprise usage data unavailable")
  })

  it("omits enterprise plan label when formatter returns null", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.fmt.planLabel = vi.fn(() => null)
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            billingCycleStart: "1770539602363",
            billingCycleEnd: "1770539602363",
          }),
        }
      }
      if (String(opts.url).includes("GetPlanInfo")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            planInfo: { planName: "Enterprise" },
          }),
        }
      }
      if (String(opts.url).includes("cursor.com/api/usage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            "gpt-4": {
              numRequests: 3,
              maxRequestUsage: 10,
            },
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBeNull()
    expect(result.lines.find((line) => line.label === "Requests")).toBeTruthy()
  })

  it("wraps non-string retry wrapper errors as usage request failure", async () => {
    const ctx = makeCtx()
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: "token" }]))
    ctx.util.retryOnceOnAuth = vi.fn(() => {
      throw new Error("wrapper blew up")
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed. Check your connection.")
  })

  // Upstream 022286fc: Enterprise fallback combines /api/usage with /api/usage-summary.
  function mockEnterpriseFallback(ctx, { requestUsage = {}, summary = {}, grokBot = {} } = {}) {
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      const json = (body) => ({ status: 200, bodyText: JSON.stringify(body) })
      if (url.includes("GetCurrentPeriodUsage")) return json({ billingCycleStart: "1770539602363", billingCycleEnd: "1770539602363" })
      if (url.includes("GetPlanInfo")) return json({ planInfo: { planName: "Enterprise" } })
      if (url.includes("cursor.com/api/usage-summary")) return json(summary)
      if (url.includes("cursor.com/api/usage")) return json(requestUsage)
      if (url.includes("GetSandUsageStatus")) return json(grokBot)
      return json({})
    })
  }

  it("combines enterprise included requests with usage-summary percentages and user on-demand", async () => {
    const ctx = makeCtx()
    mockEnterpriseFallback(ctx, {
      requestUsage: { "gpt-4": { numRequests: 120, maxRequestUsage: 500 }, startOfMonth: "2026-07-01T00:00:00.000Z" },
      summary: {
        billingCycleStart: "2026-07-01T00:00:00.000Z",
        billingCycleEnd: "2026-08-01T00:00:00.000Z",
        membershipType: "enterprise",
        limitType: "team",
        individualUsage: {
          plan: { autoPercentUsed: 12.5, apiPercentUsed: 7.5 },
          onDemand: { enabled: true, used: 2500, limit: 10000 },
        },
        teamUsage: { onDemand: { enabled: true, used: 900000, limit: 5000000 } },
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Enterprise")
    expect(result.lines.map((line) => line.label)).toEqual(["Requests", "Auto usage", "API usage", "On-demand"])
    const requests = result.lines[0]
    expect(requests).toMatchObject({ used: 120, limit: 500, format: { kind: "count", suffix: "requests" } })
    expect(requests.resetsAt).toBe("2026-08-01T00:00:00.000Z")
    expect(requests.periodDurationMs).toBe(31 * 24 * 60 * 60 * 1000)
    expect(result.lines[1].used).toBe(12.5)
    expect(result.lines[2].used).toBe(7.5)
    // User-scoped cap wins over the team aggregate.
    expect(result.lines[3]).toMatchObject({ used: 25, limit: 100, format: { kind: "dollars" } })
  })

  it("maps enterprise usage-summary total when no request allowance exists", async () => {
    const ctx = makeCtx()
    mockEnterpriseFallback(ctx, {
      summary: { limitType: "team", teamUsage: { pooled: { enabled: true, used: 150000, limit: 600000 } } },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Total usage")).toMatchObject({
      used: 1500,
      limit: 6000,
      format: { kind: "dollars" },
    })
    expect(result.lines.find((line) => line.label === "Requests")).toBeUndefined()
  })

  it("falls back to team on-demand when the individual bucket is a disabled placeholder", async () => {
    const ctx = makeCtx()
    mockEnterpriseFallback(ctx, {
      summary: {
        individualUsage: { plan: { totalPercentUsed: 40 }, onDemand: { enabled: false, used: 0, limit: 0 } },
        teamUsage: { onDemand: { enabled: true, used: 12345 } },
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Total usage")).toMatchObject({ used: 40, limit: 100 })
    expect(result.lines.find((line) => line.label === "On-demand")).toEqual({
      type: "text",
      label: "On-demand",
      value: "$123.45 spent",
    })
  })

  it("throws enterprise unavailable instead of a blank card when only detail lines exist", async () => {
    const ctx = makeCtx()
    mockEnterpriseFallback(ctx, {
      summary: {
        individualUsage: {
          plan: { autoPercentUsed: 12.5 },
          onDemand: { enabled: true, used: 2500, limit: 10000 },
        },
      },
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Enterprise usage data unavailable")
  })

  // Upstream 65324c6c + 0b7653c5: Grok Bot weekly allowance from GetSandUsageStatus,
  // ordered after Auto/API usage.
  it("adds Grok Bot usage after Auto/API usage", async () => {
    const ctx = makeCtx()
    const accessToken = makeJwt({ sub: "google-oauth2|user_abc123", exp: 9999999999 })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ value: accessToken }]))
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetCurrentPeriodUsage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            enabled: true,
            planUsage: { limit: 40000, remaining: 32000, totalPercentUsed: 20, autoPercentUsed: 12.5, apiPercentUsed: 7.5 },
            spendLimitUsage: { individualLimit: 5000, individualUsed: 2000 },
          }),
        }
      }
      if (url.includes("GetSandUsageStatus")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            usagePercent: 37.5,
            currentPeriodStart: "2026-08-20T00:00:00Z",
            nextResetTimestampUtc: "2026-08-27T00:00:00Z",
            hasNonZeroIncludedLimit: true,
          }),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.map((line) => line.label)).toEqual([
      "Total usage", "Auto usage", "API usage", "Grok Bot usage", "On-demand",
    ])
    expect(result.lines[3]).toEqual({
      type: "progress",
      label: "Grok Bot usage",
      used: 37.5,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: "2026-08-27T00:00:00.000Z",
      periodDurationMs: 7 * 24 * 60 * 60 * 1000,
    })
    const grokRequest = ctx.host.http.request.mock.calls.find((call) => String(call[0].url).includes("GetSandUsageStatus"))[0]
    expect(grokRequest.method).toBe("POST")
    expect(grokRequest.headers.Authorization).toBe("Bearer " + accessToken)
  })

  it.each([
    [{ usagePercent: 42, usesPooledEnterpriseAllowance: true }, false],
    [{ usagePercent: 0, hasNonZeroIncludedLimit: false }, false],
    [{ includedLimitZero: true }, false],
    [{}, false],
    [{ usagePercent: true, hasNonZeroIncludedLimit: true }, true],
    [{ usagePercent: -1 }, true],
  ])("hides Grok Bot usage for ineligible or invalid payload %j (warns=%s)", async (grokBot, warns) => {
    const ctx = makeCtx()
    mockEnterpriseFallback(ctx, { requestUsage: { "gpt-4": { numRequests: 1, maxRequestUsage: 10 } }, grokBot })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Grok Bot usage")).toBeUndefined()
    expect(result.lines.find((line) => line.label === "Requests")).toBeTruthy()
    const warned = ctx.host.log.warn.mock.calls.some((call) => String(call[0]).includes("Grok Bot usage response contained invalid usage metadata"))
    expect(warned).toBe(warns)
  })

  it("clamps Grok Bot overage and keeps primary usage when Grok Bot request fails", async () => {
    const ctx = makeCtx()
    mockEnterpriseFallback(ctx, { requestUsage: { "gpt-4": { numRequests: 1, maxRequestUsage: 10 } }, grokBot: { usagePercent: 125 } })
    const plugin = await loadPlugin()
    expect(plugin.probe(ctx).lines.find((line) => line.label === "Grok Bot usage").used).toBe(100)

    const failing = makeCtx()
    mockEnterpriseFallback(failing, { requestUsage: { "gpt-4": { numRequests: 1, maxRequestUsage: 10 } } })
    const baseImpl = failing.host.http.request.getMockImplementation()
    failing.host.http.request.mockImplementation((opts) =>
      String(opts.url).includes("GetSandUsageStatus") ? { status: 503, bodyText: "" } : baseImpl(opts)
    )
    const result = plugin.probe(failing)
    expect(result.lines.find((line) => line.label === "Requests")).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Grok Bot usage")).toBeUndefined()
    expect(failing.host.log.warn).toHaveBeenCalledWith("Grok Bot usage returned status=503")
  })

  it("decrypts safe-storage tokens and does not write them back to sqlite", async () => {
    const ctx = makeCtx()
    const storedAccess = "cursor-safe-storage:v1:access"
    const storedRefresh = "cursor-safe-storage:v1:refresh"
    const expired = makeJwt({ exp: 1, sub: "user-1" })
    const fresh = makeJwt({ exp: 9999999999, sub: "user-1" })
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([{ value: storedAccess }])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: storedRefresh }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => {
      if (raw === storedAccess) return expired
      if (raw === storedRefresh) return "refresh-plain"
      throw new Error("unexpected decrypt")
    })
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        const body = JSON.parse(opts.bodyText)
        expect(body.refresh_token).toBe("refresh-plain")
        return { status: 200, bodyText: JSON.stringify({ access_token: fresh }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
    expect(ctx.host.cursorAuth.decrypt).toHaveBeenCalledWith(storedAccess)
    expect(ctx.host.cursorAuth.decrypt).toHaveBeenCalledWith(storedRefresh)
    expect(ctx.host.sqlite.exec).not.toHaveBeenCalled()
  })

  it("reuses the safe-storage access token from pluginDataDir on a fresh probe", async () => {
    const ctx = makeCtx()
    const storedAccess = "cursor-safe-storage:v1:access"
    const expired = makeJwt({ exp: 1, sub: "user-1" })
    const fresh = makeJwt({ exp: 9999999999, sub: "user-1" })
    let refreshCalls = 0
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([{ value: storedAccess }])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "cursor-safe-storage:v1:refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => (String(raw).endsWith("access") ? expired : "refresh-plain"))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        refreshCalls += 1
        return { status: 200, bodyText: JSON.stringify({ access_token: fresh }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    ;(await loadPlugin()).probe(ctx)
    vi.resetModules()
    delete globalThis.__openusage_plugin
    ;(await loadPlugin()).probe(ctx)

    expect(refreshCalls).toBe(1)
    expect(ctx.host.sqlite.exec).not.toHaveBeenCalled()
    const saved = JSON.parse(ctx.host.fs.readText(ctx.app.pluginDataDir + "/access-token.json"))
    expect(saved.accessToken).toBeUndefined()
    expect(ctx.host.cursorAuth.unprotect(saved.protected)).toBe(fresh)
    expect(saved.refreshFingerprint).toBe(ctx.host.crypto.sha256Hex("refresh-plain"))
  })

  it("drops the cached Cursor token when the loaded account changes", async () => {
    const ctx = makeCtx()
    const storedAccess = "cursor-safe-storage:v1:access"
    const expiredOne = makeJwt({ exp: 1, sub: "user-1" })
    const freshOne = makeJwt({ exp: 9999999999, sub: "user-1" })
    const expiredTwo = makeJwt({ exp: 1, sub: "user-2" })
    const freshTwo = makeJwt({ exp: 9999999999, sub: "user-2" })
    let account = "user-1"
    let refreshCalls = 0
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([{ value: storedAccess }])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "cursor-safe-storage:v1:refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => {
      if (String(raw).endsWith("access")) return account === "user-1" ? expiredOne : expiredTwo
      return "refresh-plain"
    })
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        refreshCalls += 1
        const access_token = account === "user-1" ? freshOne : freshTwo
        return { status: 200, bodyText: JSON.stringify({ access_token }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    ;(await loadPlugin()).probe(ctx)
    account = "user-2"
    vi.resetModules()
    delete globalThis.__openusage_plugin
    ;(await loadPlugin()).probe(ctx)

    expect(refreshCalls).toBe(2)
    expect(ctx.host.sqlite.exec).not.toHaveBeenCalled()
    const saved = JSON.parse(ctx.host.fs.readText(ctx.app.pluginDataDir + "/access-token.json"))
    expect(ctx.host.cursorAuth.unprotect(saved.protected)).toBe(freshTwo)
  })

  it("forgets the cached Cursor token when refresh demands logout", async () => {
    const ctx = makeCtx()
    const storedAccess = "cursor-safe-storage:v1:access"
    const expired = makeJwt({ exp: 1, sub: "user-1" })
    const fresh = makeJwt({ exp: 9999999999, sub: "user-1" })
    let usageCalls = 0
    let refreshCalls = 0
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) {
        return JSON.stringify([{ value: storedAccess }])
      }
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "cursor-safe-storage:v1:refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => (String(raw).endsWith("access") ? expired : "refresh-plain"))
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("/oauth/token")) {
        refreshCalls += 1
        if (refreshCalls > 1) return { status: 200, bodyText: JSON.stringify({ shouldLogout: true }) }
        return { status: 200, bodyText: JSON.stringify({ access_token: fresh }) }
      }
      if (url.includes("GetCurrentPeriodUsage")) {
        usageCalls += 1
        if (usageCalls === 1) {
          return {
            status: 200,
            bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
          }
        }
        return { status: 401, bodyText: "" }
      }
      return { status: 200, bodyText: "{}" }
    })

    ;(await loadPlugin()).probe(ctx)
    vi.resetModules()
    delete globalThis.__openusage_plugin
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Session expired")
    expect(ctx.host.fs.readText(ctx.app.pluginDataDir + "/access-token.json")).toBe("{}")
  })

  it("does not write sqlite when only the refresh token is safe-storage", async () => {
    const ctx = makeCtx()
    const fresh = makeJwt({ exp: 9999999999, sub: "user-1" })
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) return JSON.stringify([])
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "cursor-safe-storage:v1:refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => (String(raw).endsWith("refresh") ? "refresh-plain" : raw))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: fresh }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.sqlite.exec).not.toHaveBeenCalled()
  })

  it("drops the cached token when no login is found", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(ctx.app.pluginDataDir + "/access-token.json", JSON.stringify({
      protected: "protected:old",
      refreshFingerprint: "abc",
    }))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([]))
    ctx.host.cursorAuth = cursorAuthMock(() => null)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    expect(ctx.host.fs.readText(ctx.app.pluginDataDir + "/access-token.json")).toBe("{}")
  })

  it("refreshes again when the loaded token has no subject", async () => {
    const ctx = makeCtx()
    const storedAccess = "cursor-safe-storage:v1:access"
    const expired = makeJwt({ exp: 1, sub: "user-1" })
    const noSubject = makeJwt({ exp: 1 })
    const fresh = makeJwt({ exp: 9999999999, sub: "user-1" })
    let loaded = expired
    let refreshCalls = 0
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) return JSON.stringify([{ value: storedAccess }])
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "cursor-safe-storage:v1:refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => (String(raw).endsWith("access") ? loaded : "refresh-plain"))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        refreshCalls += 1
        return { status: 200, bodyText: JSON.stringify({ access_token: fresh }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    ;(await loadPlugin()).probe(ctx)
    loaded = noSubject
    vi.resetModules()
    delete globalThis.__openusage_plugin
    ;(await loadPlugin()).probe(ctx)

    expect(refreshCalls).toBe(2)
    expect(ctx.host.sqlite.exec).not.toHaveBeenCalled()
  })

  it("refreshes again when the refresh token changes", async () => {
    const ctx = makeCtx()
    const storedAccess = "cursor-safe-storage:v1:access"
    const expired = makeJwt({ exp: 1, sub: "user-1" })
    const fresh = makeJwt({ exp: 9999999999, sub: "user-1" })
    let refreshPlain = "refresh-plain"
    let refreshCalls = 0
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) return JSON.stringify([{ value: storedAccess }])
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "cursor-safe-storage:v1:refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => (String(raw).endsWith("access") ? expired : refreshPlain))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        refreshCalls += 1
        return { status: 200, bodyText: JSON.stringify({ access_token: fresh }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    ;(await loadPlugin()).probe(ctx)
    refreshPlain = "refresh-other"
    vi.resetModules()
    delete globalThis.__openusage_plugin
    ;(await loadPlugin()).probe(ctx)

    expect(refreshCalls).toBe(2)
    expect(ctx.host.sqlite.exec).not.toHaveBeenCalled()
  })

  it("keeps a fresh database token ahead of the cache", async () => {
    const ctx = makeCtx()
    const storedAccess = "cursor-safe-storage:v1:access"
    const expired = makeJwt({ exp: 1, sub: "user-1" })
    const cachedFresh = makeJwt({ exp: 9999999999, sub: "user-1" })
    const databaseFresh = makeJwt({ exp: 9999999998, sub: "user-1" })
    let loaded = expired
    let refreshCalls = 0
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) return JSON.stringify([{ value: storedAccess }])
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "cursor-safe-storage:v1:refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => (String(raw).endsWith("access") ? loaded : "refresh-plain"))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        refreshCalls += 1
        return { status: 200, bodyText: JSON.stringify({ access_token: cachedFresh }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    ;(await loadPlugin()).probe(ctx)
    loaded = databaseFresh
    vi.resetModules()
    delete globalThis.__openusage_plugin
    ;(await loadPlugin()).probe(ctx)

    expect(refreshCalls).toBe(1)
    const usageAuth = ctx.host.http.request.mock.calls
      .filter((call) => String(call[0].url).includes("GetCurrentPeriodUsage"))
      .map((call) => call[0].headers.Authorization)
    expect(usageAuth[usageAuth.length - 1]).toBe("Bearer " + databaseFresh)
  })

  it("drops the cached token when usage returns 401 and refresh fails", async () => {
    const ctx = makeCtx()
    const storedAccess = "cursor-safe-storage:v1:access"
    const expired = makeJwt({ exp: 1, sub: "user-1" })
    const fresh = makeJwt({ exp: 9999999999, sub: "user-1" })
    let phase = "first"
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) return JSON.stringify([{ value: storedAccess }])
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "cursor-safe-storage:v1:refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => (String(raw).endsWith("access") ? expired : "refresh-plain"))
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("/oauth/token")) {
        if (phase === "second") return { status: 500, bodyText: "" }
        return { status: 200, bodyText: JSON.stringify({ access_token: fresh }) }
      }
      if (url.includes("GetCurrentPeriodUsage") && phase === "second") return { status: 401, bodyText: "" }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    ;(await loadPlugin()).probe(ctx)
    phase = "second"
    vi.resetModules()
    delete globalThis.__openusage_plugin
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Token expired")
    expect(ctx.host.fs.readText(ctx.app.pluginDataDir + "/access-token.json")).toBe("{}")
  })

  it("falls back to a database token inside the refresh buffer when the cached token is refused", async () => {
    const ctx = makeCtx()
    const expired = makeJwt({ exp: 1, sub: "user-1" })
    const cachedFresh = makeJwt({ exp: 9999999999, sub: "user-1" })
    const fourMinutesLeft = makeJwt({ exp: Math.floor(Date.now() / 1000) + 240, sub: "user-1" })
    let loaded = expired
    let phase = "first"
    let refreshCalls = 0
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) return JSON.stringify([{ value: "cursor-safe-storage:v1:access" }])
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "cursor-safe-storage:v1:refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => (String(raw).endsWith("access") ? loaded : "refresh-plain"))
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("/oauth/token")) {
        refreshCalls += 1
        return { status: 200, bodyText: JSON.stringify({ access_token: cachedFresh }) }
      }
      if (url.includes("GetCurrentPeriodUsage") && phase === "second" && opts.headers.Authorization === "Bearer " + cachedFresh) {
        return { status: 401, bodyText: "" }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    ;(await loadPlugin()).probe(ctx)
    loaded = fourMinutesLeft
    phase = "second"
    vi.resetModules()
    delete globalThis.__openusage_plugin
    ;(await loadPlugin()).probe(ctx)

    expect(refreshCalls).toBe(1)
    const usageAuth = ctx.host.http.request.mock.calls
      .filter((call) => String(call[0].url).includes("GetCurrentPeriodUsage"))
      .map((call) => call[0].headers.Authorization)
    expect(usageAuth[usageAuth.length - 1]).toBe("Bearer " + fourMinutesLeft)
  })

  it("keeps using a cached token inside the refresh buffer when the refresh fails", async () => {
    const ctx = makeCtx()
    const expired = makeJwt({ exp: 1, sub: "user-1" })
    const fourMinutesLeft = makeJwt({ exp: Math.floor(Date.now() / 1000) + 240, sub: "user-1" })
    let refreshWorks = true
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) return JSON.stringify([{ value: "cursor-safe-storage:v1:access" }])
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "cursor-safe-storage:v1:refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => (String(raw).endsWith("access") ? expired : "refresh-plain"))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        if (!refreshWorks) return { status: 503, bodyText: "" }
        return { status: 200, bodyText: JSON.stringify({ access_token: fourMinutesLeft }) }
      }
      if (opts.headers.Authorization === "Bearer " + expired) return { status: 401, bodyText: "" }
      return {
        status: 200,
        bodyText: JSON.stringify({ enabled: true, planUsage: { totalSpend: 0, limit: 100 } }),
      }
    })

    ;(await loadPlugin()).probe(ctx)
    refreshWorks = false
    vi.resetModules()
    delete globalThis.__openusage_plugin
    ;(await loadPlugin()).probe(ctx)

    const usageAuth = ctx.host.http.request.mock.calls
      .filter((call) => String(call[0].url).includes("GetCurrentPeriodUsage"))
      .map((call) => call[0].headers.Authorization)
    expect(usageAuth[usageAuth.length - 1]).toBe("Bearer " + fourMinutesLeft)
  })

  it("drops the cached token when the refreshed token is refused too", async () => {
    const ctx = makeCtx()
    const expired = makeJwt({ exp: 1, sub: "user-1" })
    const fresh = makeJwt({ exp: 9999999999, sub: "user-1" })
    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      if (String(sql).includes("cursorAuth/accessToken")) return JSON.stringify([{ value: "cursor-safe-storage:v1:access" }])
      if (String(sql).includes("cursorAuth/refreshToken")) {
        return JSON.stringify([{ value: "cursor-safe-storage:v1:refresh" }])
      }
      return JSON.stringify([])
    })
    ctx.host.cursorAuth = cursorAuthMock((raw) => (String(raw).endsWith("access") ? expired : "refresh-plain"))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/oauth/token")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: fresh }) }
      }
      return { status: 401, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Token expired")
    expect(ctx.host.fs.readText(ctx.app.pluginDataDir + "/access-token.json")).toBe("{}")
  })
})
