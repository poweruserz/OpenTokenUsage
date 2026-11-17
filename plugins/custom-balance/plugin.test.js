import { describe, expect, it } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const reply = (status, body) => ({ status, headers: {}, bodyText: typeof body === "string" ? body : JSON.stringify(body) })

const setup = (balances, answers, env = { RELAY_TOKEN: "tok" }) => {
  const ctx = makeCtx()
  if (balances) ctx.host.fs.writeText("~/.openusage/config.json", JSON.stringify({ proxy: null, balances }))
  ctx.host.env.get.mockImplementation((name) => env[name] ?? null)
  ctx.host.http.request.mockImplementation((request) => {
    const answer = answers[request.url]
    if (typeof answer === "function") return answer(request)
    return answer ?? reply(404, "")
  })
  return ctx
}

const newapi = { name: "Relay", preset: "newapi", baseUrl: "https://relay.example.com/v1/", tokenEnv: "RELAY_TOKEN", userId: "7" }

describe("custom-balance plugin", () => {
  it("says it's not set up without a request when no balance is saved", async () => {
    const plugin = await loadPlugin()
    const ctx = setup(null, {})
    expect(() => plugin.probe(ctx)).toThrow("No custom balance set up. Add one in Settings.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("asks for the one account's key variable when it isn't set", async () => {
    const plugin = await loadPlugin()
    const ctx = setup([newapi], {}, {})
    expect(() => plugin.probe(ctx)).toThrow("No RELAY_TOKEN found. Set up environment variable first.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("reads a New API account in the panel's own quota unit, with its user id", async () => {
    const plugin = await loadPlugin()
    let headers
    const ctx = setup([newapi], {
      "https://relay.example.com/api/user/self": (request) => {
        headers = request.headers
        return reply(200, { success: true, data: { quota: 1_000_000, used_quota: 250_000 } })
      },
      "https://relay.example.com/api/status": reply(200, { data: { quota_per_unit: 100_000 } }),
    })
    expect(plugin.probe(ctx).lines).toEqual([{ type: "text", label: "Balance", value: "Relay: $10.00 / $12.50" }])
    expect(headers).toMatchObject({ Authorization: "Bearer tok", "New-Api-User": "7" })
  })

  it("maps a custom endpoint's numbers by dot paths and shows each account on its own line", async () => {
    const plugin = await loadPlugin()
    const custom = {
      name: "Shop",
      preset: "custom",
      baseUrl: "https://api.shop.test",
      tokenEnv: "SHOP_KEY",
      path: "/user/balance",
      remaining: "data.left",
      total: "data.total",
      divisor: 100,
      currency: "EUR",
      auth: "x-api-key",
    }
    const ctx = setup(
      [custom, { ...newapi, name: "Down" }],
      {
        "https://api.shop.test/user/balance": (request) =>
          request.headers["x-api-key"] === "shop" ? reply(200, { data: { left: "1250", total: 5000 } }) : reply(401, ""),
        "https://relay.example.com/api/user/self": reply(401, ""),
      },
      { SHOP_KEY: "shop", RELAY_TOKEN: "tok" }
    )
    expect(plugin.probe(ctx).lines).toEqual([
      { type: "text", label: "Balance", value: "Shop: 12.50 EUR / 50.00 EUR" },
      { type: "text", label: "Balance 2", value: "Down: HTTP 401", color: "#ef4444" },
    ])
  })

  it("reads a Sub2API balance and calls an unlimited New API key unlimited", async () => {
    const plugin = await loadPlugin()
    const ctx = setup(
      [
        { ...newapi, name: "Sub", preset: "sub2api", baseUrl: "https://sub.test" },
        { ...newapi, name: "Key", preset: "newapi-token" },
      ],
      {
        "https://sub.test/api/v1/auth/me": reply(200, { code: 0, data: { id: 1, balance: 3.5 } }),
        "https://relay.example.com/api/usage/token/": reply(200, { data: { unlimited_quota: true } }),
      }
    )
    expect(plugin.probe(ctx).lines.map((line) => line.value)).toEqual(["Sub: $3.50", "Key: ∞"])
  })
})
