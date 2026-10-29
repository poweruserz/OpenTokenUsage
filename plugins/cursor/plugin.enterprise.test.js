import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

// Enterprise seats whose GetPlanInfo still says Pro (upstream #1409): the state DB's
// stripeMembershipType and usage-summary know better.
const SUMMARY = {
  membershipType: "enterprise",
  billingCycleStart: "2026-10-01T00:00:00.000Z",
  billingCycleEnd: "2026-11-01T00:00:00.000Z",
  individualUsage: { onDemand: { enabled: true, used: 1250, limit: 5000, remaining: 3750 } },
}

beforeEach(() => {
  delete globalThis.__openusage_plugin
  vi.resetModules()
})

async function probe({ membership, planName = "Pro", spendLimitUsage, summary = SUMMARY }) {
  const ctx = makeCtx()
  const payload = Buffer.from(JSON.stringify({ sub: "google-oauth2|user_abc123", exp: 9999999999 }))
    .toString("base64").replace(/=+$/g, "")
  ctx.host.sqlite.query.mockImplementation((_db, sql) => {
    if (sql.includes("cursorAuth/accessToken")) return JSON.stringify([{ value: `a.${payload}.c` }])
    if (sql.includes("cursorAuth/stripeMembershipType") && membership) return JSON.stringify([{ value: membership }])
    return "[]"
  })
  ctx.host.http.request.mockImplementation(({ url }) => {
    if (url.includes("GetCurrentPeriodUsage")) return {
      status: 200,
      bodyText: JSON.stringify({ enabled: true, planUsage: { autoPercentUsed: 4, apiPercentUsed: 9, totalPercentUsed: 6 }, spendLimitUsage }),
    }
    if (url.includes("GetPlanInfo")) return { status: 200, bodyText: JSON.stringify({ planInfo: { planName } }) }
    if (url.includes("usage-summary")) return { status: 200, bodyText: JSON.stringify(summary) }
    return { status: 200, bodyText: "{}" }
  })
  await import("./plugin.js")
  return { result: globalThis.__openusage_plugin.probe(ctx), ctx }
}

const summaryCalls = (ctx) => ctx.host.http.request.mock.calls.filter(([opts]) => opts.url.includes("usage-summary"))
const onDemand = (result) => result.lines.find((line) => line.label === "On-demand")

describe("Cursor Enterprise seats (upstream #1409)", () => {
  it("shows the Enterprise badge and adds On-demand from usage-summary to the pool meters", async () => {
    const { result } = await probe({ membership: "enterprise" })
    expect(result.plan).toBe("Enterprise")
    expect(result.lines.find((line) => line.label === "API usage")?.used).toBe(9)
    expect(onDemand(result)).toMatchObject({ used: 12.5, limit: 50, format: { kind: "dollars" } })
  })

  it("takes an org membership from usage-summary for a team-shaped seat", async () => {
    const { result } = await probe({ spendLimitUsage: { limitType: "team" }, summary: { ...SUMMARY, membershipType: "team" } })
    expect(result.plan).toBe("Team")
  })

  it("skips usage-summary for an org seat that already has its On-demand row", async () => {
    const { result, ctx } = await probe({ membership: "enterprise", spendLimitUsage: { individualLimit: 5000, individualRemaining: 4000 } })
    expect(onDemand(result)).toMatchObject({ used: 10, limit: 50 })
    expect(summaryCalls(ctx)).toHaveLength(0)
  })

  it("leaves personal seats alone: no usage-summary call, GetPlanInfo's badge", async () => {
    const { result, ctx } = await probe({ membership: "pro" })
    expect(result.plan).toBe("Pro")
    expect(onDemand(result)).toBeUndefined()
    expect(summaryCalls(ctx)).toHaveLength(0)
  })

  it("keeps a non-Pro GetPlanInfo name over the membership", async () => {
    const { result } = await probe({ membership: "team", planName: "Ultra" })
    expect(result.plan).toBe("Ultra")
  })
})
