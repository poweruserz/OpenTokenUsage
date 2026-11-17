import { describe, expect, it } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const reply = (status, body) => ({ status, headers: {}, bodyText: typeof body === "string" ? body : JSON.stringify(body) })
const GLOBAL = "https://api.moonshot.ai/v1/users/me/balance"
const CHINA = "https://api.moonshot.cn/v1/users/me/balance"

const setup = (answers, keys = { MOONSHOT_API_KEY: "sk-moon" }) => {
  const ctx = makeCtx()
  ctx.host.env.get.mockImplementation((name) => keys[name] ?? null)
  ctx.host.http.request.mockImplementation((request) => {
    const answer = answers[request.url]
    if (answer instanceof Error) throw answer
    return answer ?? reply(404, "")
  })
  return ctx
}

const wallet = (available, voucher, cash) => ({
  code: 0,
  data: { available_balance: available, voucher_balance: voucher, cash_balance: cash },
})

describe("kimi-api plugin", () => {
  it("asks for MOONSHOT_API_KEY without a request, and leaves the Kimi CLI's KIMI_API_KEY alone", async () => {
    const plugin = await loadPlugin()
    const ctx = setup({}, { KIMI_API_KEY: "sk-kimi-code" })
    expect(() => plugin.probe(ctx)).toThrow("No MOONSHOT_API_KEY found. Set up environment variable first.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("shows the global wallet in dollars, vouchers and cash with it", async () => {
    const plugin = await loadPlugin()
    const ctx = setup({ [GLOBAL]: reply(200, wallet(12.5, 10, 2.5)) })
    expect(plugin.probe(ctx)).toEqual({
      lines: [
        { type: "text", label: "Balance", value: "$12.50" },
        { type: "text", label: "Vouchers", value: "$10.00" },
        { type: "text", label: "Cash", value: "$2.50" },
      ],
    })
    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer sk-moon")
  })

  it("tries the China platform when the global one rejects the key, in yuan", async () => {
    const plugin = await loadPlugin()
    const ctx = setup({ [GLOBAL]: reply(401, {}), [CHINA]: reply(200, wallet(88, 0, 88)) }, { MOONSHOT_API_KEY: "sk-cn" })
    expect(plugin.probe(ctx).lines).toEqual([
      { type: "text", label: "Balance", value: "¥88.00" },
      { type: "text", label: "Cash", value: "¥88.00" },
    ])
  })

  it("marks an empty wallet red", async () => {
    const plugin = await loadPlugin()
    expect(plugin.probe(setup({ [GLOBAL]: reply(200, wallet(0, 0, 0)) })).lines[0]).toEqual({
      type: "text",
      label: "Balance",
      value: "$0.00",
      color: "#ef4444",
    })
  })

  it("names the key when both platforms reject it, and other failures as they are", async () => {
    const plugin = await loadPlugin()
    expect(() => plugin.probe(setup({ [GLOBAL]: reply(401, {}), [CHINA]: reply(401, {}) }))).toThrow(
      "API key invalid. Check your Kimi API key."
    )
    expect(() => plugin.probe(setup({ [GLOBAL]: new Error("dns"), [CHINA]: new Error("dns") }))).toThrow(
      "Usage request failed. Check your connection."
    )
    expect(() => plugin.probe(setup({ [GLOBAL]: reply(200, { data: {} }), [CHINA]: reply(503, "") }))).toThrow(
      "Usage request failed (HTTP 503). Try again later."
    )
  })

  it("doesn't call a key invalid when its own platform didn't answer", async () => {
    const plugin = await loadPlugin()
    expect(() => plugin.probe(setup({ [GLOBAL]: new Error("timeout"), [CHINA]: reply(401, {}) }))).toThrow(
      "Usage request failed. Check your connection."
    )
    expect(() => plugin.probe(setup({ [GLOBAL]: reply(502, ""), [CHINA]: reply(401, {}) }))).toThrow(
      "Usage request failed (HTTP 502). Try again later."
    )
  })
})
