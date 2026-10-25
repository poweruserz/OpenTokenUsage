import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

// What the request-based REST fallback answers: 211 of 500 requests used.
const REST_USAGE = {
  "gpt-4": { numRequests: 211, numRequestsTotal: 211, maxRequestUsage: 500 },
  startOfMonth: "2026-10-01T00:00:00.000Z",
}

beforeEach(() => {
  delete globalThis.__openusage_plugin
  vi.resetModules()
})

async function probe(planUsage, planName = "Team", spendLimitUsage = { limitType: "team" }) {
  const ctx = makeCtx()
  // A JWT with a sub claim: the request-based fallback builds its session from it.
  const payload = Buffer.from(JSON.stringify({ sub: "google-oauth2|user_abc123", exp: 9999999999 }))
    .toString("base64").replace(/=+$/g, "")
  ctx.host.keychain.readGenericPassword.mockImplementation((service) =>
    service === "cursor-access-token" ? `a.${payload}.c` : null)
  ctx.host.http.request.mockImplementation(({ url }) => {
    if (url.includes("GetCurrentPeriodUsage")) return {
      status: 200, bodyText: JSON.stringify({ enabled: true, planUsage, spendLimitUsage }),
    }
    if (url.includes("GetPlanInfo")) return {
      status: 200, bodyText: JSON.stringify({ planInfo: { planName } }),
    }
    if (url.includes("cursor.com/api/usage")) return { status: 200, bodyText: JSON.stringify(REST_USAGE) }
    return { status: 200, bodyText: "{}" }
  })
  await import("./plugin.js")
  return { result: globalThis.__openusage_plugin.probe(ctx), ctx }
}

const total = (result) => result.lines.find((line) => line.label === "Total usage")

describe("Cursor structured team pools", () => {
  it("prefers reported total percent over the old $20 allowance", async () => {
    const { result } = await probe({ limit: 2000, totalSpend: 1022,
      autoPercentUsed: 2.6476, apiPercentUsed: 11.65, totalPercentUsed: 4.088 })
    expect(total(result)).toMatchObject({ used: 4.088, limit: 100, format: { kind: "percent" } })
    expect(result.lines.find((line) => line.label === "API usage").used).toBe(11.65)
  })

  it("does not invent a total from legacy dollars when pools have no total", async () => {
    const { result } = await probe({ limit: 2000, totalSpend: 666,
      autoPercentUsed: 0.37, apiPercentUsed: 2.025 })
    expect(total(result)).toBeUndefined()
    expect(result.lines.find((line) => line.label === "Auto usage").used).toBe(0.37)
  })

  it.each(["Team", "Enterprise", "", " Team "])("keeps pools without a limit for %s", async (name) => {
    const { result, ctx } = await probe({ autoPercentUsed: 0, apiPercentUsed: 0 }, name)
    expect(total(result)).toBeUndefined()
    expect(result.lines.filter((line) => ["Auto usage", "API usage"].includes(line.label))).toHaveLength(2)
    expect(ctx.host.http.request.mock.calls.some(([opts]) => opts.url.endsWith("/api/usage"))).toBe(false)
  })

  it.each([
    { autoPercentUsed: 0, apiPercentUsed: 0, totalPercentUsed: 0 },
    { autoPercentUsed: 1 },
    { autoPercentUsed: -1, apiPercentUsed: 2 },
    { autoPercentUsed: true, apiPercentUsed: 2 },
  ])("preserves legacy dollar meters for placeholder or invalid pools %j", async (pools) => {
    const { result } = await probe({ limit: 500000, totalSpend: 234500, ...pools })
    expect(total(result)).toMatchObject({ used: 2345, limit: 5000, format: { kind: "dollars" } })
  })

  it("keeps credits and on-demand usage with structured pools", async () => {
    const { result } = await probe({ autoPercentUsed: 0, apiPercentUsed: 12 }, "Team", {
      individualLimit: 5000, individualRemaining: 4000,
    })
    expect(result.lines.find((line) => line.label === "On-demand")).toMatchObject({ used: 10, limit: 50 })
  })

  // Only team seats get the structured-pool treatment: elsewhere a missing limit and total would
  // have read as "Total usage 0%" whatever the real usage.
  it("leaves a non-team account with pools but no limit on the request-based fallback", async () => {
    const { result } = await probe({ autoPercentUsed: 12.5, apiPercentUsed: 7.5 }, "Enterprise", {})
    expect(total(result)).toBeUndefined()
    expect(result.lines.find((line) => line.label === "Requests")).toMatchObject({ used: 211, limit: 500 })
  })

  // A team seat without a reported total shows no Total usage, so the pools are its overview meters.
  it("shows the Auto and API pools on the overview card", () => {
    const manifest = JSON.parse(readFileSync("plugins/cursor/plugin.json", "utf8"))
    for (const label of ["Auto usage", "API usage"]) {
      expect(manifest.lines).toContainEqual(expect.objectContaining({ type: "progress", label, scope: "overview" }))
    }
  })
})
