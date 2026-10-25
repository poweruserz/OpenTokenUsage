import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-07T08:00:00Z"))
})
afterEach(() => vi.useRealTimers())

async function session(reset, headers = {}, percent = 0) {
  const ctx = makeCtx()
  ctx.host.fs.writeText("~/.local/share/opencode/auth.json", JSON.stringify({ "opencode-go": { key: "key" } }))
  ctx.host.http.request.mockReturnValue({ status: 200, headers, bodyText: JSON.stringify({ usage: {
    rolling: { percent, resetsAt: reset },
    weekly: { percent: 0, resetsAt: "2026-10-14T08:00:00Z" },
    monthly: { percent: 0, resetsAt: "2026-11-06T08:00:00Z" },
  } }) })
  await import("./plugin.js")
  return globalThis.__openusage_plugin.probe(ctx).lines
}

it("keeps the reset of an active session rounded below 1%", async () => {
  expect((await session("2026-10-07T12:30:00Z"))[0].resetsAt).toBe("2026-10-07T12:30:00.000Z")
})
it.each([0, -2000, 2000])("drops only a zero-usage rolling placeholder at tolerance %i", async (delta) => {
  const lines = await session(new Date(Date.parse("2026-10-07T13:00:00Z") + delta).toISOString())
  expect(lines[0].resetsAt).toBeUndefined()
  expect(lines[1].resetsAt).toBeTruthy()
  expect(lines[2].resetsAt).toBeTruthy()
})
it("keeps real resets outside the two second tolerance", async () => {
  expect((await session("2026-10-07T12:59:57Z"))[0].resetsAt).toBeTruthy()
})
it("uses the HTTP Date clock when the local clock is skewed", async () => {
  expect((await session("2026-10-07T14:00:00Z", { Date: "Wed, 07 Oct 2026 09:00:00 GMT" }))[0].resetsAt).toBeUndefined()
})
it("falls back to capture time for an invalid Date header", async () => {
  expect((await session("2026-10-07T13:00:00Z", { date: "invalid" }))[0].resetsAt).toBeUndefined()
})
it("keeps a full-period reset with positive usage", async () => {
  expect((await session("2026-10-07T13:00:00Z", {}, 0.1))[0].resetsAt).toBeTruthy()
})
