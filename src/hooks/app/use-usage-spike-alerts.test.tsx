import { renderHook, waitFor } from "@testing-library/react"
import { invoke } from "@tauri-apps/api/core"
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification"
import { beforeEach, expect, it, vi } from "vitest"
import { spikeAlert, useUsageSpikeAlerts } from "@/hooks/app/use-usage-spike-alerts"
import { DEFAULT_ALERT_SETTINGS } from "@/lib/settings"
import type { PluginMeta } from "@/lib/plugin-types"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }))
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}))

const META = [{ id: "claude", name: "Claude" }, { id: "cursor", name: "Cursor" }] as PluginMeta[]
const SHOP = { folder: "shop", path: "C:\\work\\shop", tokens: 12_400_000, times: 5.6 }

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  vi.mocked(sendNotification).mockReset()
  vi.mocked(isPermissionGranted).mockResolvedValue(true)
})

const spikeCalls = () => vi.mocked(invoke).mock.calls.filter(([command]) => command === "usage_spikes")

it("says which folder of which card burns tokens, and how much faster than usual", () => {
  expect(spikeAlert("Claude", SHOP, "en-US")).toEqual({
    title: "Claude: shop is using tokens fast",
    body: "12.4M tokens in a quarter hour, 6× your usual. An agent stuck in a loop?",
  })
})

it("checks the cards with local logs and notifies a folder once an hour, not on every check", async () => {
  // A session and its sub-agent in the same folder, both running hot: one notification.
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === "usage_spikes" ? [SHOP, { ...SHOP, tokens: 5_000_000, times: 3.2 }] : undefined
  )
  const { rerender } = renderHook((props: { settings: typeof DEFAULT_ALERT_SETTINGS }) =>
    useUsageSpikeAlerts({ pluginsMeta: META, enabledIds: ["claude", "cursor"], enabled: true, settings: props.settings }),
    { initialProps: { settings: DEFAULT_ALERT_SETTINGS } }
  )
  await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1))
  expect(sendNotification).toHaveBeenCalledWith({
    title: "Claude: shop is using tokens fast",
    body: expect.stringContaining("12.4M tokens"),
  })
  expect(spikeCalls()).toEqual([["usage_spikes", { pluginId: "claude" }]]) // Cursor keeps no logs here

  // Another setting changes: the hook checks again at once, and the same spike stays quiet.
  rerender({ settings: { ...DEFAULT_ALERT_SETTINGS, sound: "chime" } })
  await waitFor(() => expect(spikeCalls()).toHaveLength(2))
  expect(sendNotification).toHaveBeenCalledTimes(1)
})

it("tells apart two folders of the same name", async () => {
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === "usage_spikes" ? [SHOP, { ...SHOP, path: "D:\\personal\\shop" }] : undefined
  )
  renderHook(() => useUsageSpikeAlerts({ pluginsMeta: META, enabledIds: ["claude"], enabled: true, settings: DEFAULT_ALERT_SETTINGS }))
  await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(2))
})

it("reads nothing with notifications or spike alerts off", () => {
  renderHook(() => useUsageSpikeAlerts({ pluginsMeta: META, enabledIds: ["claude"], enabled: false, settings: DEFAULT_ALERT_SETTINGS }))
  renderHook(() =>
    useUsageSpikeAlerts({ pluginsMeta: META, enabledIds: ["claude"], enabled: true, settings: { ...DEFAULT_ALERT_SETTINGS, spikes: false } })
  )
  expect(spikeCalls()).toHaveLength(0)
})

it.each([
  ["weren't allowed", () => vi.mocked(isPermissionGranted).mockResolvedValue(false)],
  ["failed", () => vi.mocked(isPermissionGranted).mockRejectedValue(new Error("no notification service"))],
])("notifies again later when notifications %s the first time", async (_, firstTime) => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  firstTime()
  vi.mocked(invoke).mockImplementation(async (command) => (command === "usage_spikes" ? [SHOP] : undefined))
  const { rerender } = renderHook((props: { sound: "windows" | "chime" }) =>
    useUsageSpikeAlerts({
      pluginsMeta: META,
      enabledIds: ["claude"],
      enabled: true,
      settings: { ...DEFAULT_ALERT_SETTINGS, sound: props.sound },
    }),
    { initialProps: { sound: "windows" } }
  )
  await waitFor(() => expect(spikeCalls()).toHaveLength(1))
  expect(sendNotification).not.toHaveBeenCalled()

  vi.mocked(isPermissionGranted).mockResolvedValue(true)
  rerender({ sound: "chime" })
  await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1))
})
