import { describe, expect, it } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const reply = (status, body) => ({ status, headers: {}, bodyText: typeof body === "string" ? body : JSON.stringify(body) })
const balance = (currency, total) => ({ currency, total_balance: total, granted_balance: "0.00", topped_up_balance: total })

const setup = (response, key = "ds-key") => {
  const ctx = makeCtx()
  ctx.host.env.get.mockImplementation((name) => (name === "DEEPSEEK_API_KEY" ? key : null))
  ctx.host.http.request.mockImplementation(() => {
    if (response instanceof Error) throw response
    return response
  })
  return ctx
}

describe("deepseek plugin", () => {
  it("asks for the environment variable when no key is set", async () => {
    const plugin = await loadPlugin()
    const ctx = setup(reply(200, {}), "")
    expect(() => plugin.probe(ctx)).toThrow("No DEEPSEEK_API_KEY found. Set up environment variable first.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("shows the balance and sends the key as a bearer token", async () => {
    const plugin = await loadPlugin()
    const ctx = setup(reply(200, { is_available: true, balance_infos: [balance("USD", "12.5")] }))
    expect(plugin.probe(ctx)).toEqual({ lines: [{ type: "text", label: "Balance", value: "$12.50" }] })
    const call = ctx.host.http.request.mock.calls[0][0]
    expect(call.url).toBe("https://api.deepseek.com/user/balance")
    expect(call.headers.Authorization).toBe("Bearer ds-key")
  })

  it("shows yuan with its own sign and prefers the currency that has money", async () => {
    const plugin = await loadPlugin()
    expect(plugin.probe(setup(reply(200, { is_available: true, balance_infos: [balance("CNY", "110.00")] }))).lines[0].value).toBe("¥110.00")
    const both = [balance("CNY", "110.00"), balance("USD", "0.00")]
    expect(plugin.probe(setup(reply(200, { is_available: true, balance_infos: both }))).lines[0].value).toBe("¥110.00")
    const funded = [balance("CNY", "110.00"), balance("USD", "3.00")]
    expect(plugin.probe(setup(reply(200, { is_available: true, balance_infos: funded }))).lines[0].value).toBe("$3.00")
  })

  it("marks the balance red once DeepSeek stops taking calls", async () => {
    const plugin = await loadPlugin()
    const result = plugin.probe(setup(reply(200, { is_available: false, balance_infos: [balance("USD", "0.00")] })))
    expect(result.lines[0]).toEqual({ type: "text", label: "Balance", value: "$0.00", color: "#ef4444" })
  })

  it("names the key as the problem when DeepSeek rejects it", async () => {
    const plugin = await loadPlugin()
    expect(() => plugin.probe(setup(reply(401, { error: { message: "Authentication Fails" } })))).toThrow(
      "API key invalid. Check your DeepSeek API key."
    )
  })

  it("shows an account without any balance as an empty one", async () => {
    const plugin = await loadPlugin()
    const result = plugin.probe(setup(reply(200, { is_available: false, balance_infos: [] })))
    expect(result.lines).toEqual([{ type: "text", label: "Balance", value: "0.00", color: "#ef4444" }])
  })

  it("reports a failed or unreadable answer", async () => {
    const plugin = await loadPlugin()
    expect(() => plugin.probe(setup(new Error("dns")))).toThrow("Usage request failed. Check your connection.")
    expect(() => plugin.probe(setup(reply(503, "busy")))).toThrow("Usage request failed (HTTP 503). Try again later.")
    expect(() => plugin.probe(setup(reply(200, "not json")))).toThrow("Usage response invalid. Try again later.")
    const garbled = [{ currency: "USD", total_balance: "n/a" }]
    expect(() => plugin.probe(setup(reply(200, { is_available: true, balance_infos: garbled })))).toThrow(
      "Usage response invalid. Try again later."
    )
  })
})
