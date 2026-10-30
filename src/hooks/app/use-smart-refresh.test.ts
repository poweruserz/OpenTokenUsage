import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { PluginState } from "@/hooks/app/types"
import { useSmartRefresh } from "@/hooks/app/use-smart-refresh"
import { MINUTE } from "@/lib/smart-refresh"

const settings = { order: ["cursor", "codex-work"], disabled: [] as string[] }
const state = (id: string, used = 20, loading = false, error: string | null = null): PluginState => ({
  data: { providerId: id, displayName: id, iconUrl: "", lines: [
    { type: "progress", label: "Session", used, limit: 100, format: { kind: "percent" } },
  ] }, loading, error, lastUpdatedAt: Date.now(), lastManualRefreshAt: null,
})

function setup(initial: Record<string, PluginState> = {}, order = settings.order) {
  let states = initial
  let enabled = true
  let pluginSettings = { ...settings, order }
  const startBatch = vi.fn().mockResolvedValue(order)
  const setLoadingForPlugins = vi.fn((ids: string[]) => {
    for (const id of ids) states = { ...states, [id]: state(id, states[id]?.data?.lines[0]?.type === "progress" ? states[id].data.lines[0].used : 20, true) }
    rerender()
  })
  const setErrorForPlugins = vi.fn((ids: string[], error: string) => {
    for (const id of ids) states = { ...states, [id]: state(id, 20, false, error) }
    rerender()
  })
  const { result, rerender, unmount } = renderHook(() => useSmartRefresh({
    enabled, pluginSettings, pluginStates: states, startBatch, setLoadingForPlugins, setErrorForPlugins,
  }))
  return {
    result, startBatch, unmount,
    async tick(minutes: number) { await act(() => vi.advanceTimersByTimeAsync(minutes * MINUTE)) },
    complete(id: string, used = 20, error: string | null = null) {
      act(() => { states = { ...states, [id]: state(id, used, false, error) }; rerender() })
    },
    configure(nextEnabled: boolean, disabled: string[] = []) {
      act(() => { enabled = nextEnabled; pluginSettings = { ...pluginSettings, disabled }; rerender() })
    },
  }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000) })
afterEach(() => { vi.useRealTimers() })

it("schedules from completion, keeps slow accounts independent, and never overlaps a probe", async () => {
  const app = setup()
  await app.tick(2)
  expect(app.startBatch).toHaveBeenLastCalledWith(["cursor", "codex-work"], true)
  await app.tick(3)
  expect(app.startBatch).toHaveBeenCalledTimes(1)
  app.complete("cursor")
  expect(app.result.current).toBe(Date.now() + 2 * MINUTE)
  await app.tick(2)
  expect(app.startBatch).toHaveBeenLastCalledWith(["cursor"], true)
  expect(app.startBatch).toHaveBeenCalledTimes(2)
})

it("backs off an idle account independently of another account's usage changes", async () => {
  const app = setup({ cursor: state("cursor"), "codex-work": state("codex-work") })
  // Checks at 2, 4, 6 and 8 minutes: Cursor keeps changing, Codex doesn't.
  for (let check = 1; check <= 4; check++) {
    await app.tick(2)
    app.complete("cursor", 20 + check)
    app.complete("codex-work", 20)
  }
  app.startBatch.mockClear()
  // Minute 10: Cursor stays at 2 minutes, Codex has backed off to 5 (due at 13).
  await app.tick(2)
  expect(app.startBatch).toHaveBeenCalledWith(["cursor"], true)
  app.complete("cursor", 30)
  await app.tick(2)
  expect(app.startBatch).toHaveBeenLastCalledWith(["cursor"], true)
  await app.tick(1)
  expect(app.startBatch).toHaveBeenLastCalledWith(["codex-work"], true)
})

it("backs off failed starts and cancels timers when disabled or unmounted", async () => {
  const app = setup()
  app.startBatch.mockRejectedValueOnce(new Error("offline"))
  await app.tick(2)
  expect(app.result.current).toBe(Date.now() + 2 * MINUTE)
  app.configure(true, ["codex-work"])
  await app.tick(2)
  expect(app.startBatch).toHaveBeenLastCalledWith(["cursor"], true)
  app.configure(false)
  expect(app.result.current).toBeNull()
  await app.tick(30)
  expect(app.startBatch).toHaveBeenCalledTimes(2)
  app.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it("refreshes stale data on panel focus without bypassing error backoff", async () => {
  const app = setup({ cursor: state("cursor"), "codex-work": state("codex-work", 20, false, "offline") })
  act(() => {
    vi.setSystemTime(Date.now() + MINUTE)
    window.dispatchEvent(new Event("focus"))
  })
  await app.tick(0)
  expect(app.startBatch).toHaveBeenCalledWith(["cursor"], true)
  app.complete("cursor")
  app.startBatch.mockClear()
  act(() => window.dispatchEvent(new Event("focus")))
  await app.tick(0)
  expect(app.startBatch).not.toHaveBeenCalled()
})

// Anthropic allows about 30 usage reads an hour per login, shared with Claude Code.
it("asks Claude at most every 5 minutes, panel focus included", async () => {
  const app = setup({ claude: state("claude") }, ["claude"])
  await app.tick(4)
  act(() => window.dispatchEvent(new Event("focus")))
  await app.tick(0)
  expect(app.startBatch).not.toHaveBeenCalled()
  await app.tick(1)
  expect(app.startBatch).toHaveBeenCalledWith(["claude"], true)
  app.complete("claude", 30)
  expect(app.result.current).toBe(Date.now() + 5 * MINUTE)
})

// setTimeout runs on a monotonic clock, Date.now() on the wall clock: after an NTP slew, a clock
// set back, or Chromium's periodic resync, the timer can fire a few ms "early" by Date.now().
it("starts the due checks when the wall clock trails the timer that woke them", async () => {
  const app = setup()
  const timerNow = Date.now
  vi.spyOn(Date, "now").mockImplementation(() => timerNow.call(Date) - 50)
  await app.tick(2)
  expect(app.startBatch).toHaveBeenCalledWith(["cursor", "codex-work"], true)
})

// Switching to Smart must not count a result from ten minutes ago as just checked.
it("keeps the age of results that were already there when Smart starts", async () => {
  const old = { ...state("cursor"), lastUpdatedAt: Date.now() - 10 * MINUTE }
  const app = setup({ cursor: old, "codex-work": state("codex-work") })
  await app.tick(0)
  expect(app.startBatch).toHaveBeenCalledTimes(1)
  expect(app.startBatch).toHaveBeenCalledWith(["cursor"], true)
})
