import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { PluginState } from "@/hooks/app/types"
import { useSmartRefresh } from "@/hooks/app/use-smart-refresh"
import { MINUTE } from "@/lib/smart-refresh"

const settings = { order: ["claude", "codex-work"], disabled: [] as string[] }
const state = (id: string, used = 20, loading = false, error: string | null = null): PluginState => ({
  data: { providerId: id, displayName: id, iconUrl: "", lines: [
    { type: "progress", label: "Session", used, limit: 100, format: { kind: "percent" } },
  ] }, loading, error, lastUpdatedAt: Date.now(), lastManualRefreshAt: null,
})

function setup(initial: Record<string, PluginState> = {}) {
  let states = initial
  let enabled = true
  let pluginSettings = settings
  const startBatch = vi.fn().mockResolvedValue(settings.order)
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
      act(() => { enabled = nextEnabled; pluginSettings = { ...settings, disabled }; rerender() })
    },
  }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000) })
afterEach(() => { vi.useRealTimers() })

it("schedules from completion, keeps slow accounts independent, and never overlaps a probe", async () => {
  const app = setup()
  await app.tick(2)
  expect(app.startBatch).toHaveBeenLastCalledWith(["claude", "codex-work"], true)
  await app.tick(3)
  expect(app.startBatch).toHaveBeenCalledTimes(1)
  app.complete("claude")
  expect(app.result.current).toBe(Date.now() + 2 * MINUTE)
  await app.tick(2)
  expect(app.startBatch).toHaveBeenLastCalledWith(["claude"], true)
  expect(app.startBatch).toHaveBeenCalledTimes(2)
})

it("backs off an idle account independently of another account's usage changes", async () => {
  const app = setup({ claude: state("claude"), "codex-work": state("codex-work") })
  // Checks at 2, 4, 6 and 8 minutes: Claude keeps changing, Codex doesn't.
  for (let check = 1; check <= 4; check++) {
    await app.tick(2)
    app.complete("claude", 20 + check)
    app.complete("codex-work", 20)
  }
  app.startBatch.mockClear()
  // Minute 10: Claude stays at 2 minutes, Codex has backed off to 5 (due at 13).
  await app.tick(2)
  expect(app.startBatch).toHaveBeenCalledWith(["claude"], true)
  app.complete("claude", 30)
  await app.tick(2)
  expect(app.startBatch).toHaveBeenLastCalledWith(["claude"], true)
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
  expect(app.startBatch).toHaveBeenLastCalledWith(["claude"], true)
  app.configure(false)
  expect(app.result.current).toBeNull()
  await app.tick(30)
  expect(app.startBatch).toHaveBeenCalledTimes(2)
  app.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it("refreshes stale data on panel focus without bypassing error backoff", async () => {
  const app = setup({ claude: state("claude"), "codex-work": state("codex-work", 20, false, "offline") })
  act(() => {
    vi.setSystemTime(Date.now() + MINUTE)
    window.dispatchEvent(new Event("focus"))
  })
  await app.tick(0)
  expect(app.startBatch).toHaveBeenCalledWith(["claude"], true)
  app.complete("claude")
  app.startBatch.mockClear()
  act(() => window.dispatchEvent(new Event("focus")))
  await app.tick(0)
  expect(app.startBatch).not.toHaveBeenCalled()
})
