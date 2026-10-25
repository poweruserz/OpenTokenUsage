import { beforeEach, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"
beforeEach(() => {
  vi.resetModules()
  delete globalThis.__openusage_plugin
})
async function probe(details) {
  const ctx = makeCtx()
  ctx.host.fs.writeText(
    "~/.codex/auth.json",
    JSON.stringify({
      tokens: { access_token: "token", account_id: "selected-account" },
      last_refresh: new Date().toISOString()
    })
  )
  ctx.host.http.request.mockImplementation((opts) => {
    expect(opts.method).toBe("GET")
    expect(opts.headers["ChatGPT-Account-Id"]).toBe("selected-account")
    if (opts.url.endsWith("rate-limit-reset-credits")) return details
    return { status: 200, headers: {}, bodyText: JSON.stringify({ rate_limit_reset_credits: { available_count: 3 } }) }
  })
  await import("./plugin.js")
  const output = globalThis.__openusage_plugin.probe(ctx)
  return output.lines.find((l) => l.label === "Rate Limit Resets")
}
it("reads individual credit expiries with the same account, ignores spent credits", async () => {
  const line = await probe({
    status: 200,
    headers: {},
    bodyText: JSON.stringify({
      available_count: 3,
      credits: [
        { status: "available", expires_at: 4070908800 },
        { status: "available", expires_at: "2099-02-01T00:00:00Z" },
        { status: "redeemed", expires_at: 4070908800 }
      ]
    })
  })
  expect(line.resetCredits).toEqual([
    { count: 1, expiresAt: "2099-01-01T00:00:00.000Z" },
    { count: 1, expiresAt: "2099-02-01T00:00:00.000Z" },
    { count: 1 }
  ])
})
it("retains summary count with unknown expiry when details fail", async () => {
  const line = await probe({ status: 503, headers: {}, bodyText: "" })
  expect(line.resetCredits).toEqual([{ count: 3 }])
})
it("uses a fresh empty inventory after credits were redeemed elsewhere", async () => {
  const line = await probe({ status: 200, headers: {}, bodyText: JSON.stringify({ available_count: 0, credits: [] }) })
  expect(line.resetCredits).toEqual([])
  expect(line.value).toBe("0 available")
})
