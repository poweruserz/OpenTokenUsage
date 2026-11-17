import { describe, expect, it } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const reply = (status, body) => ({ status, headers: {}, bodyText: typeof body === "string" ? body : JSON.stringify(body) })
const USAGE = "https://www.codebuff.com/api/v1/usage"
const SUBSCRIPTION = "https://www.codebuff.com/api/user/subscription"

const setup = (answers, { key = null, credentials = null } = {}) => {
  const ctx = makeCtx()
  ctx.host.env.get.mockImplementation((name) => (name === "CODEBUFF_API_KEY" ? key : null))
  if (credentials) ctx.host.fs.writeText("~/.config/manicode/credentials.json", JSON.stringify(credentials))
  ctx.host.http.request.mockImplementation((request) => {
    const answer = answers[request.url]
    if (answer instanceof Error) throw answer
    return answer ?? reply(404, "")
  })
  return ctx
}

describe("codebuff plugin", () => {
  it("asks for `codebuff login` without a request when there's no token", async () => {
    const plugin = await loadPlugin()
    const ctx = setup({})
    expect(() => plugin.probe(ctx)).toThrow("Codebuff not logged in. Run `codebuff login`.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("shows the credits and the weekly limit with the CLI's token, named by the plan", async () => {
    const plugin = await loadPlugin()
    const ctx = setup(
      {
        [USAGE]: reply(200, { usage: 250, quota: 1000, next_quota_reset: "2026-02-10T00:00:00Z" }),
        [SUBSCRIPTION]: reply(200, {
          subscription: { displayName: "pro" },
          rateLimit: { weeklyUsed: 30, weeklyLimit: 120, weeklyResetsAt: "2026-02-09T00:00:00Z" },
        }),
      },
      { credentials: { default: { authToken: "cb-token" } } }
    )
    expect(plugin.probe(ctx)).toEqual({
      plan: "Pro",
      lines: [
        {
          type: "progress",
          label: "Credits",
          used: 250,
          limit: 1000,
          format: { kind: "count", suffix: "credits" },
          resetsAt: "2026-02-10T00:00:00.000Z",
        },
        {
          type: "progress",
          label: "Weekly",
          used: 25,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: "2026-02-09T00:00:00.000Z",
          periodDurationMs: 7 * 24 * 3600 * 1000,
        },
      ],
    })
    const usageCall = ctx.host.http.request.mock.calls[0][0]
    expect(usageCall.method).toBe("POST")
    expect(usageCall.headers.Authorization).toBe("Bearer cb-token")
  })

  it("prefers the API key, works out the total from what's left, and keeps going without a plan", async () => {
    const plugin = await loadPlugin()
    const ctx = setup({ [USAGE]: reply(200, { used: 40, remainingBalance: 60 }), [SUBSCRIPTION]: reply(500, "") }, { key: "cb-key" })
    const result = plugin.probe(ctx)
    expect(result.plan).toBeUndefined()
    expect(result.lines).toEqual([{ type: "progress", label: "Credits", used: 40, limit: 100, format: { kind: "count", suffix: "credits" } }])
    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer cb-key")
  })

  it("sends back to `codebuff login` when the token is refused, and reports other failures", async () => {
    const plugin = await loadPlugin()
    const opts = { key: "cb-key" }
    const login = { credentials: { default: { authToken: "cb-token" } } }
    expect(() => plugin.probe(setup({ [USAGE]: reply(401, {}) }, login))).toThrow("Codebuff auth expired. Run `codebuff login` again.")
    // A refused API key: logging in again wouldn't help, the key wins over the login.
    expect(() => plugin.probe(setup({ [USAGE]: reply(401, {}) }, { ...opts, ...login }))).toThrow(
      "API key invalid. Check your Codebuff API key."
    )
    expect(() => plugin.probe(setup({ [USAGE]: new Error("dns") }, opts))).toThrow("Usage request failed. Check your connection.")
    expect(() => plugin.probe(setup({ [USAGE]: reply(502, "") }, opts))).toThrow("Usage request failed (HTTP 502). Try again later.")
    expect(() => plugin.probe(setup({ [USAGE]: reply(200, {}) }, opts))).toThrow("Usage response invalid. Try again later.")
  })
})
