import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const KEY = {
  label: "sk-or-v1-abc...xyz",
  limit: 20,
  limit_remaining: 15,
  limit_reset: "monthly",
  usage: 42.5,
  usage_daily: 0.4567,
  usage_weekly: 3,
  usage_monthly: 5,
  is_free_tier: false,
}
const CREDITS = { total_credits: 100, total_usage: 25.75 }

const reply = (status, body) => ({ status, headers: {}, bodyText: typeof body === "string" ? body : JSON.stringify(body) })

// routes: { "/key": reply | Error, "/credits": reply | Error }
const setup = (routes, key = "or-key") => {
  const ctx = makeCtx()
  ctx.host.env.get.mockImplementation((name) => (name === "OPENROUTER_API_KEY" ? key : null))
  ctx.host.http.request.mockImplementation((opts) => {
    const route = routes[opts.url.replace("https://openrouter.ai/api/v1", "")]
    if (route instanceof Error) throw route
    return route ?? reply(404, {})
  })
  return ctx
}

const lineByLabel = (result, label) => result.lines.find((line) => line.label === label)

describe("openrouter plugin", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Wednesday 2026-02-04, 10:00 UTC
    vi.setSystemTime(new Date("2026-02-04T10:00:00.000Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("asks for the environment variable when no key is set", async () => {
    const plugin = await loadPlugin()
    const ctx = setup({}, "  ")
    expect(() => plugin.probe(ctx)).toThrow("No OPENROUTER_API_KEY found. Set up environment variable first.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("sends the trimmed key as a bearer token", async () => {
    const plugin = await loadPlugin()
    const ctx = setup({ "/key": reply(200, { data: KEY }), "/credits": reply(200, { data: CREDITS }) }, " or-key ")
    plugin.probe(ctx)
    const call = ctx.host.http.request.mock.calls[0][0]
    expect(call.url).toBe("https://openrouter.ai/api/v1/key")
    expect(call.headers.Authorization).toBe("Bearer or-key")
  })

  it("shows the credit balance, the key's cap and its spend", async () => {
    const plugin = await loadPlugin()
    const result = plugin.probe(setup({ "/key": reply(200, { data: KEY }), "/credits": reply(200, { data: CREDITS }) }))
    expect(lineByLabel(result, "Credits")).toEqual({
      type: "progress",
      label: "Credits",
      used: 25.75,
      limit: 100,
      format: { kind: "dollars" },
    })
    expect(lineByLabel(result, "API usage")).toEqual({
      type: "progress",
      label: "API usage",
      used: 5,
      limit: 20,
      format: { kind: "dollars" },
      resetsAt: "2026-03-01T00:00:00.000Z",
      periodDurationMs: 28 * 24 * 60 * 60 * 1000,
    })
    expect(lineByLabel(result, "Today")).toEqual({ type: "text", label: "Today", value: "$0.46" })
    expect(lineByLabel(result, "Monthly")).toEqual({ type: "text", label: "Monthly", value: "$5.00" })
  })

  it("still shows the key's spend when the balance is for management keys only", async () => {
    const plugin = await loadPlugin()
    for (const credits of [reply(403, { error: { code: 403, message: "Only management keys can perform this operation" } }), new Error("offline")]) {
      const result = plugin.probe(setup({ "/key": reply(200, { data: KEY }), "/credits": credits }))
      expect(lineByLabel(result, "Credits")).toBeUndefined()
      expect(lineByLabel(result, "API usage")).toMatchObject({ used: 5, limit: 20 })
      expect(lineByLabel(result, "Today")).toMatchObject({ value: "$0.46" })
    }
  })

  it("leaves the balance out for an account that never bought credits", async () => {
    const plugin = await loadPlugin()
    const result = plugin.probe(setup({ "/key": reply(200, { data: KEY }), "/credits": reply(200, { data: { total_credits: 0, total_usage: 0 } }) }))
    expect(lineByLabel(result, "Credits")).toBeUndefined()
  })

  it("counts the cap's own window when the key doesn't say what's left", async () => {
    const plugin = await loadPlugin()
    const key = { ...KEY, limit_remaining: null, limit_reset: "weekly" }
    const result = plugin.probe(setup({ "/key": reply(200, { data: key }), "/credits": reply(403, {}) }))
    // Wednesday → next Monday 00:00 UTC
    expect(lineByLabel(result, "API usage")).toMatchObject({ used: 3, resetsAt: "2026-02-09T00:00:00.000Z", periodDurationMs: 7 * 24 * 60 * 60 * 1000 })

    const daily = plugin.probe(setup({ "/key": reply(200, { data: { ...key, limit_reset: "daily" } }) }))
    expect(lineByLabel(daily, "API usage")).toMatchObject({ used: 0.4567, resetsAt: "2026-02-05T00:00:00.000Z" })

    // A cap that never resets counts everything the key spent.
    const lifetime = plugin.probe(setup({ "/key": reply(200, { data: { ...key, limit_reset: null } }) }))
    expect(lineByLabel(lifetime, "API usage")).toMatchObject({ used: 42.5, limit: 20 })
    expect(lineByLabel(lifetime, "API usage").resetsAt).toBeUndefined()
  })

  it("shows an overspent cap as full and a key without a cap without the line", async () => {
    const plugin = await loadPlugin()
    const over = plugin.probe(setup({ "/key": reply(200, { data: { ...KEY, limit_remaining: -3 } }) }))
    expect(lineByLabel(over, "API usage")).toMatchObject({ used: 20, limit: 20 })
    const uncapped = plugin.probe(setup({ "/key": reply(200, { data: { ...KEY, limit: null, limit_remaining: null } }) }))
    expect(lineByLabel(uncapped, "API usage")).toBeUndefined()
  })

  it("names the key as the problem when OpenRouter rejects it", async () => {
    const plugin = await loadPlugin()
    for (const status of [401, 403]) {
      expect(() => plugin.probe(setup({ "/key": reply(status, { error: { code: status } }) }))).toThrow(
        "API key invalid. Check your OpenRouter API key."
      )
    }
  })

  it("reports a failed or unreadable key request", async () => {
    const plugin = await loadPlugin()
    expect(() => plugin.probe(setup({ "/key": new Error("dns") }))).toThrow("Usage request failed. Check your connection.")
    expect(() => plugin.probe(setup({ "/key": reply(500, "oops") }))).toThrow("Usage request failed (HTTP 500). Try again later.")
    expect(() => plugin.probe(setup({ "/key": reply(200, "not json") }))).toThrow("Usage response invalid. Try again later.")
    expect(() => plugin.probe(setup({ "/key": reply(200, { data: null }) }))).toThrow("Usage response invalid. Try again later.")
  })
})
