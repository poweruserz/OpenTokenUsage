import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const AUTH_PATH = "~/.config/muse/auth.json"
const NOW = Date.parse("2026-11-13T10:00:00.000Z")
const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function writeLogin(ctx, meta = {}) {
  ctx.host.fs.writeText(
    AUTH_PATH,
    JSON.stringify({
      schema_version: 1,
      providers: {
        meta: { mechanism: "oauth", storage: "file", access_token: "dca:login-token", api_key: "LLM|stored-key", ...meta },
      },
    })
  )
}

function answer(overrides = {}) {
  return {
    status: 200,
    headers: {},
    bodyText: JSON.stringify({
      api_key: "LLM|stored-key",
      user_email: "person@example.test",
      user_full_name: "A Person",
      payment_method: "Visa-0000",
      require_payment: false,
      is_subs_active: true,
      subs_tier_name: "Muse Code Everyday Usage",
      subs_usage: {
        window: { used_percent: 12, window_duration_mins: 300, resets_at: (NOW + 2 * HOUR) / 1000 },
        weekly: { used_percent: 24, resets_at: (NOW + 3 * 24 * HOUR) / 1000 },
      },
      ...overrides,
    }),
  }
}

function probeError(plugin, ctx) {
  try {
    plugin.probe(ctx)
  } catch (error) {
    return String(error)
  }
  return "(no error)"
}

describe("muse plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("says not logged in, without a request, when there is no Muse login", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    expect(probeError(plugin, ctx)).toBe("Not logged in. Run `muse login` to authenticate.")
    ctx.host.fs.writeText(AUTH_PATH, JSON.stringify({ schema_version: 1, providers: {} }))
    expect(probeError(plugin, ctx)).toBe("Not logged in. Run `muse login` to authenticate.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("can't read a broken auth.json or a login kept in the keychain", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    ctx.host.fs.writeText(AUTH_PATH, "{not json")
    expect(probeError(plugin, ctx)).toBe(
      "Couldn't read Muse Code's auth.json. Check its file permissions or log into Muse Code again."
    )
    writeLogin(ctx, { storage: "keychain", access_token: undefined })
    expect(probeError(plugin, ctx)).toContain("Couldn't read Muse Code's auth.json")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("says the session expired, without a request, once the login's expiry has passed", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    writeLogin(ctx, { expires_at: (NOW - MIN) / 1000 })
    expect(probeError(plugin, ctx)).toBe("Session expired. Run `muse login` to log in again.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("asks the key endpoint as the Muse CLI does and shows the session and weekly windows", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    writeLogin(ctx, { expires_at: (NOW + HOUR) / 1000 })
    ctx.host.http.request.mockReturnValue(answer())

    const out = plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
    const req = ctx.host.http.request.mock.calls[0][0]
    expect(req.method).toBe("POST")
    expect(req.url).toBe("https://api.meta.ai/muse-code/key")
    expect(req.headers.Authorization).toBe("Bearer dca:login-token")
    expect(req.headers["x-api-version"]).toBe("1.0.0")
    expect(JSON.parse(req.bodyText)).toEqual({ onboard: false })
    expect(out.plan).toBe("Everyday Usage")
    expect(out.staleSince).toBeUndefined()
    expect(out.lines).toEqual([
      expect.objectContaining({
        label: "Session",
        used: 12,
        limit: 100,
        periodDurationMs: 300 * MIN,
        resetsAt: new Date(NOW + 2 * HOUR).toISOString(),
      }),
      expect.objectContaining({
        label: "Weekly",
        used: 24,
        periodDurationMs: 7 * 24 * HOUR,
        resetsAt: new Date(NOW + 3 * 24 * HOUR).toISOString(),
      }),
    ])
  })

  it("never writes the token, the returned key or the account's details to disk", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    writeLogin(ctx)
    ctx.host.http.request.mockReturnValue(answer())
    plugin.probe(ctx)
    const saved = ctx.host.fs.writeText.mock.calls
      .filter(([path]) => path !== AUTH_PATH)
      .map(([, text]) => text)
      .join("\n")
    expect(saved).not.toBe("")
    for (const secret of ["dca:login-token", "LLM|stored-key", "person@example.test", "A Person", "Visa"]) {
      expect(saved).not.toContain(secret)
    }
  })

  it("asks at most once per 5 minutes, whatever asks, and shows the kept read in between", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    writeLogin(ctx)
    ctx.host.http.request.mockReturnValue(answer())
    plugin.probe(ctx)

    vi.setSystemTime(NOW + 4 * MIN)
    const kept = plugin.probe(ctx)
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
    expect(kept.staleSince).toBe(NOW)
    expect(kept.lines[1]).toEqual(expect.objectContaining({ label: "Weekly", used: 24 }))

    vi.setSystemTime(NOW + 5 * MIN)
    expect(plugin.probe(ctx).staleSince).toBeUndefined()
    expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
  })

  it("counts a failed read too: the same error until 5 minutes have passed", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    writeLogin(ctx)
    ctx.host.http.request.mockReturnValue({ status: 500, headers: {}, bodyText: "" })
    expect(probeError(plugin, ctx)).toBe("Usage request failed (HTTP 500). Try again later.")
    vi.setSystemTime(NOW + 2 * MIN)
    expect(probeError(plugin, ctx)).toBe("Usage request failed (HTTP 500). Try again later.")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
  })

  it("doesn't ask when it can't note the request: the 5-minute limit would be lost", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    writeLogin(ctx)
    const write = ctx.host.fs.writeText.getMockImplementation()
    ctx.host.fs.writeText.mockImplementation((path, text) => {
      if (String(path).endsWith("/last-read.json")) throw new Error("disk full")
      return write(path, text)
    })
    ctx.host.http.request.mockReturnValue(answer())
    expect(probeError(plugin, ctx)).toBe("Muse Code quota data unavailable. Try again later.")
    expect(probeError(plugin, ctx)).toBe("Muse Code quota data unavailable. Try again later.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("shows a window that reset since the kept read as reset, without asking", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    writeLogin(ctx)
    ctx.host.http.request.mockReturnValue(
      answer({
        subs_usage: {
          window: { used_percent: 100, window_duration_mins: 300, resets_at: (NOW + 2 * MIN) / 1000 },
          weekly: { used_percent: 60, resets_at: (NOW + 2 * MIN) / 1000 },
        },
      })
    )
    plugin.probe(ctx)
    vi.setSystemTime(NOW + 3 * MIN)
    const out = plugin.probe(ctx)
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
    expect(out.staleSince).toBe(NOW)
    expect(out.lines).toEqual([expect.objectContaining({ label: "Session", used: 0 })])
  })

  it("a new login asks at once instead of showing the previous login's read", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    writeLogin(ctx)
    ctx.host.http.request.mockReturnValue(answer())
    plugin.probe(ctx)
    writeLogin(ctx, { access_token: "dca:another-login" })
    vi.setSystemTime(NOW + MIN)
    expect(plugin.probe(ctx).staleSince).toBeUndefined()
    expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
  })

  it("maps a refused login, a rate limit and a network error", async () => {
    const plugin = await loadPlugin()
    const cases = [
      [{ status: 401, headers: {}, bodyText: "" }, "Session expired. Run `muse login` to log in again."],
      [{ status: 403, headers: {}, bodyText: "" }, "Session expired. Run `muse login` to log in again."],
      [{ status: 429, headers: { "retry-after": "600" }, bodyText: "" }, "Rate limited by Muse Code, retry in ~10m"],
      [{ status: 429, headers: {}, bodyText: "" }, "Rate limited by Muse Code, try again later"],
      [{ status: 200, headers: {}, bodyText: "<html>" }, "Usage response invalid. Try again later."],
    ]
    for (const [resp, message] of cases) {
      const ctx = makeCtx()
      writeLogin(ctx)
      ctx.host.http.request.mockReturnValue(resp)
      expect(probeError(plugin, ctx)).toBe(message)
    }
    const ctx = makeCtx()
    writeLogin(ctx)
    ctx.host.http.request.mockImplementation(() => {
      throw new Error("dns error")
    })
    expect(probeError(plugin, ctx)).toBe("Usage request failed. Check your connection.")
  })

  it("says there is no subscription when billing is unfinished or the plan isn't active", async () => {
    const plugin = await loadPlugin()
    for (const overrides of [{ require_payment: true }, { is_subs_active: false }, { is_subs_active: undefined }]) {
      const ctx = makeCtx()
      writeLogin(ctx)
      ctx.host.http.request.mockReturnValue(answer(overrides))
      expect(probeError(plugin, ctx)).toBe("No active Muse Code subscription.")
    }
  })

  it("keeps the last windows while Meta leaves them out, until each one resets", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    writeLogin(ctx)
    ctx.host.http.request.mockReturnValue(answer())
    plugin.probe(ctx)

    // Within the session window: both readings stay.
    ctx.host.http.request.mockReturnValue(answer({ subs_usage: undefined }))
    vi.setSystemTime(NOW + HOUR)
    expect(plugin.probe(ctx).lines.map((line) => line.used)).toEqual([12, 24])

    // Past the session's reset: an unused new window, while the week goes on.
    ctx.host.http.request.mockReturnValue(answer({ subs_usage: null }))
    vi.setSystemTime(NOW + 3 * HOUR)
    const idle = plugin.probe(ctx)
    expect(idle.lines[0]).toEqual(expect.objectContaining({ label: "Session", used: 0, periodDurationMs: 300 * MIN }))
    expect(idle.lines[0].resetsAt).toBeUndefined()
    expect(idle.lines[1]).toEqual(expect.objectContaining({ label: "Weekly", used: 24 }))

    // Still idle on later reads, after the week has reset too.
    vi.setSystemTime(NOW + 4 * 24 * HOUR)
    expect(plugin.probe(ctx).lines).toEqual([expect.objectContaining({ label: "Session", used: 0 })])
  })

  it("says quota data is unavailable when Meta has never sent a window, not 0%", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    writeLogin(ctx)
    ctx.host.http.request.mockReturnValue(answer({ subs_usage: undefined }))
    expect(probeError(plugin, ctx)).toBe("Muse Code quota data unavailable. Try again later.")
  })

  it("caps a bar at 100% when the window is overspent", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    writeLogin(ctx)
    ctx.host.http.request.mockReturnValue(
      answer({ subs_usage: { weekly: { used_percent: 104, resets_at: (NOW + HOUR) / 1000 } } })
    )
    expect(plugin.probe(ctx).lines).toEqual([expect.objectContaining({ label: "Weekly", used: 100 })])
  })
})
