import { beforeEach, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

beforeEach(() => vi.resetModules())

async function setup(home, accountId = "work-account") {
  const ctx = makeCtx()
  ctx.host.env.get.mockImplementation((name) => name === "CODEX_HOME" ? home : null)
  const path = (home || "~/.config/codex") + "/auth.json"
  ctx.host.fs.writeText(path, JSON.stringify({ tokens: {
    access_token: "old-token", refresh_token: "old-refresh", account_id: accountId,
  }, last_refresh: "2000-01-01T00:00:00Z", extra: "preserve" }))
  ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "personal-token" } }))
  const personal = ctx.host.fs.readText("~/.codex/auth.json")
  ctx.host.http.request.mockImplementation(({ url, headers }) => {
    if (url.includes("oauth/token")) return { status: 200, bodyText: JSON.stringify({
      access_token: "fresh-token", refresh_token: "fresh-refresh", id_token: "fresh-id",
    }) }
    expect(headers.Authorization).toBe("Bearer fresh-token")
    expect(headers["ChatGPT-Account-Id"]).toBe(accountId)
    return { status: 200, headers: {}, bodyText: JSON.stringify({ plan_type: "promax", rate_limit: {
      primary_window: { used_percent: 15, limit_window_seconds: 18000 },
    } }) }
  })
  ctx.host.ccusage.query.mockReturnValue({ status: "pending" })
  await import("./plugin.js")
  const result = globalThis.__openusage_plugin.probe(ctx)
  return { ctx, path, personal, result }
}

it.each(["C:/Users/test/extra-codex", null])("refreshes and scans the selected auth home %s", async (home) => {
  const { ctx, path, personal, result } = await setup(home)
  expect(JSON.parse(ctx.host.fs.readText(path))).toMatchObject({ extra: "preserve", tokens: {
    access_token: "fresh-token", refresh_token: "fresh-refresh", account_id: "work-account",
  } })
  expect(ctx.host.fs.readText("~/.codex/auth.json")).toBe(personal)
  expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  expect(ctx.host.ccusage.query).toHaveBeenCalledWith(expect.objectContaining({
    homePath: home || "~/.config/codex", accountId: "work-account", provider: "codex",
  }))
  expect(result.lines.find((line) => line.label === "Session").used).toBe(15)
  expect(result.lines.some((line) => line.label === "Today")).toBe(false)
  expect(result.plan).toBe("Pro 500")
})

it.each([
  ["prolite", "Pro 100"], [" PRO ", "Pro 200"], [" ProMax ", "Pro 500"],
  ["self_serve_business_prolite", "Business Premium"], ["plus", "Plus"],
  ["future_plan", "Future_plan"], ["", null], [500, null],
])("maps upstream plan %s to %s", async (raw, expected) => {
  const ctx = makeCtx()
  ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" } }))
  ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: JSON.stringify({ plan_type: raw }) })
  ctx.host.ccusage.query.mockReturnValue({ status: "pending" })
  await import("./plugin.js")
  expect(globalThis.__openusage_plugin.probe(ctx).plan).toBe(expected)
})
