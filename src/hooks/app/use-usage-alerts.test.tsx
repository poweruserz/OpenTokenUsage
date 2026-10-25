import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { useUsageAlerts } from "@/hooks/app/use-usage-alerts"
import type { PluginState } from "@/hooks/app/types"
import { DEFAULT_ALERT_SETTINGS, loadSentUsageAlerts, saveSentUsageAlerts } from "@/lib/settings"
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification"
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn()
}))
vi.mock("@/lib/settings", async (original) => ({
  ...(await original<typeof import("@/lib/settings")>()),
  loadSentUsageAlerts: vi.fn(),
  saveSentUsageAlerts: vi.fn()
}))
const NOW = Date.parse("2026-10-24T12:00:00Z")
const HOUR = 3600000
function state(hours: number): PluginState {
  return {
    data: {
      providerId: "codex",
      displayName: "Codex",
      iconUrl: "",
      lines: [
        {
          type: "text",
          label: "Rate Limit Resets",
          value: "1 available",
          resetCredits: [{ count: 1, expiresAt: new Date(NOW + hours * HOUR).toISOString() }]
        }
      ]
    },
    error: null,
    loading: false,
    lastUpdatedAt: NOW,
    lastManualRefreshAt: null
  }
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
  vi.setSystemTime(NOW)
  vi.mocked(loadSentUsageAlerts).mockResolvedValue([])
  vi.mocked(saveSentUsageAlerts).mockResolvedValue(undefined)
  vi.mocked(isPermissionGranted).mockResolvedValue(true)
  vi.mocked(invoke).mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())
const CODEX_ONLY = { order: ["codex"], disabled: [] as string[] }
it("evaluates loaded inventory and persists deduplication across remounts", async () => {
  const props = {
    pluginStates: { codex: state(48) },
    pluginsMeta: [],
    pluginSettings: CODEX_ONLY,
    enabled: true,
    settings: DEFAULT_ALERT_SETTINGS,
    displayMode: "used" as const
  }
  const first = renderHook(() => useUsageAlerts(props))
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(saveSentUsageAlerts).toHaveBeenCalled())
  const keys = vi.mocked(saveSentUsageAlerts).mock.calls[0][0]
  first.unmount()
  vi.mocked(loadSentUsageAlerts).mockResolvedValue(keys)
  renderHook(() => useUsageAlerts(props))
  await act(async () => {
    await Promise.resolve()
  })
  expect(sendNotification).toHaveBeenCalledTimes(1)
})
it("warns when the 24-hour boundary passes without a new probe, including while hidden", async () => {
  const props = {
    pluginStates: { codex: state(24 + 1 / 60) },
    pluginsMeta: [],
    pluginSettings: CODEX_ONLY,
    enabled: true,
    settings: DEFAULT_ALERT_SETTINGS,
    displayMode: "used" as const
  }
  renderHook(() => useUsageAlerts(props))
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1))
  Object.defineProperty(document, "hidden", { configurable: true, value: true })
  await act(async () => {
    vi.advanceTimersByTime(60_000)
    await Promise.resolve()
  })
  await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(2))
  Object.defineProperty(document, "hidden", { configurable: true, value: false })
})
it("stays quiet when disabled, stale or errored", async () => {
  const stale = state(12)
  stale.data!.staleSince = NOW - HOUR
  renderHook(() =>
    useUsageAlerts({
      pluginStates: { stale, failed: { ...state(12), error: "offline" } },
      pluginsMeta: [],
      pluginSettings: { order: ["stale", "failed"], disabled: [] },
      enabled: true,
      settings: DEFAULT_ALERT_SETTINGS,
      displayMode: "used" as const
    })
  )
  renderHook(() =>
    useUsageAlerts({
      pluginStates: { codex: state(12) },
      pluginsMeta: [],
      pluginSettings: CODEX_ONLY,
      enabled: false,
      settings: DEFAULT_ALERT_SETTINGS,
      displayMode: "used" as const
    })
  )
  await act(async () => {
    await Promise.resolve()
  })
  expect(sendNotification).not.toHaveBeenCalled()
})
// A disabled or removed account keeps its cached data but is no longer refreshed: crossing a
// reminder boundary on that stale inventory must not notify (its credits may be spent elsewhere).
it("never reminds for an account disabled or removed after its data loaded", async () => {
  const props = {
    pluginStates: { codex: state(24 * 7 + 1 / 60) },
    pluginsMeta: [],
    pluginSettings: CODEX_ONLY,
    enabled: true,
    settings: DEFAULT_ALERT_SETTINGS,
    displayMode: "used" as const
  }
  const { rerender } = renderHook((p: typeof props) => useUsageAlerts(p), { initialProps: props })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(sendNotification).not.toHaveBeenCalled()
  for (const pluginSettings of [{ order: ["codex"], disabled: ["codex"] }, { order: [], disabled: [] }]) {
    rerender({ ...props, pluginSettings })
    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
  }
  expect(sendNotification).not.toHaveBeenCalled()
})
