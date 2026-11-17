import { describe, expect, it } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const reply = (status, body) => ({ status, headers: {}, bodyText: typeof body === "string" ? body : JSON.stringify(body) })
const batch = (blocks, pass) => [{ result: { data: { json: blocks } } }, { result: { data: { json: pass } } }]

const setup = (answer, { key = null, auth = null } = {}) => {
  const ctx = makeCtx()
  ctx.host.env.get.mockImplementation((name) => (name === "KILO_API_KEY" ? key : null))
  if (auth) ctx.host.fs.writeText("~/.local/share/kilo/auth.json", JSON.stringify(auth))
  ctx.host.http.request.mockImplementation(() => {
    if (answer instanceof Error) throw answer
    return answer
  })
  return ctx
}

describe("kilo plugin", () => {
  it("asks for the key without a request when neither it nor the CLI login is there", async () => {
    const plugin = await loadPlugin()
    const ctx = setup(reply(200, []))
    expect(() => plugin.probe(ctx)).toThrow("No KILO_API_KEY found. Set up environment variable first.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("shows the credit blocks and the Kilo Pass month with the CLI's login", async () => {
    const plugin = await loadPlugin()
    const blocks = { creditBlocks: [{ amount_mUsd: 20_000_000, balance_mUsd: 15_000_000 }, { amount_mUsd: 5_000_000, balance_mUsd: 5_000_000 }] }
    const pass = {
      subscription: {
        tier: "tier_49",
        currentPeriodUsageUsd: 12,
        currentPeriodBaseCreditsUsd: 49,
        currentPeriodBonusCreditsUsd: 11,
        nextBillingAt: "2026-02-28T00:00:00Z",
      },
    }
    const ctx = setup(reply(200, batch(blocks, pass)), { auth: { kilo: { access: "kilo-token" } } })
    expect(plugin.probe(ctx)).toEqual({
      plan: "Pro",
      lines: [
        { type: "progress", label: "Credits", used: 5, limit: 25, format: { kind: "dollars" } },
        {
          type: "progress",
          label: "Kilo Pass",
          used: 12,
          limit: 60,
          format: { kind: "dollars" },
          resetsAt: "2026-02-28T00:00:00.000Z",
          periodDurationMs: 30 * 24 * 3600 * 1000,
        },
      ],
    })
    const call = ctx.host.http.request.mock.calls[0][0]
    expect(call.url).toContain("user.getCreditBlocks,kiloPass.getState?batch=1&input=")
    expect(call.headers.Authorization).toBe("Bearer kilo-token")
  })

  it("leaves a cancelled Pass off the card", async () => {
    const plugin = await loadPlugin()
    const blocks = { creditBlocks: [{ amount_mUsd: 10_000_000, balance_mUsd: 4_000_000 }] }
    const pass = { subscription: { status: "canceled", tier: "tier_49", currentPeriodUsageUsd: 12, currentPeriodBaseCreditsUsd: 49 } }
    expect(plugin.probe(setup(reply(200, batch(blocks, pass)), { key: "k" }))).toEqual({
      plan: undefined,
      lines: [{ type: "progress", label: "Credits", used: 6, limit: 10, format: { kind: "dollars" } }],
    })
  })

  it("shows a fresh account's balance rather than an error", async () => {
    const plugin = await loadPlugin()
    const result = plugin.probe(setup(reply(200, batch({ creditBlocks: [], totalBalance_mUsd: 0 }, { subscription: null })), { key: "k" }))
    expect(result).toEqual({ plan: undefined, lines: [{ type: "text", label: "Credits", value: "$0.00" }] })
  })

  it("names the key when Kilo refuses it, and reports other failures", async () => {
    const plugin = await loadPlugin()
    const opts = { key: "k" }
    expect(() => plugin.probe(setup(reply(401, {}), opts))).toThrow("API key invalid or expired. Check your Kilo API key.")
    expect(() => plugin.probe(setup(new Error("dns"), opts))).toThrow("Usage request failed. Check your connection.")
    expect(() => plugin.probe(setup(reply(500, ""), opts))).toThrow("Usage request failed (HTTP 500). Try again later.")
    expect(() => plugin.probe(setup(reply(200, { error: "x" }), opts))).toThrow("Usage response invalid. Try again later.")
  })
})
