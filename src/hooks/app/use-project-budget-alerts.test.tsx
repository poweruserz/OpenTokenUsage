import { renderHook, waitFor } from "@testing-library/react"
import { invoke } from "@tauri-apps/api/core"
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification"
import { beforeEach, expect, it, vi } from "vitest"
import { useProjectBudgetAlerts } from "@/hooks/app/use-project-budget-alerts"
import { DEFAULT_ALERT_SETTINGS, loadProjectBudgets, loadSentProjectAlerts, saveSentProjectAlerts } from "@/lib/settings"
import type { PluginMeta } from "@/lib/plugin-types"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }))
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}))
vi.mock("@/lib/settings", async (original) => ({
  ...(await original<typeof import("@/lib/settings")>()),
  loadProjectBudgets: vi.fn(),
  loadSentProjectAlerts: vi.fn(),
  saveSentProjectAlerts: vi.fn(),
}))

const META = [{ id: "claude", name: "Claude" }] as PluginMeta[]
const SHOP = "C:/work/shop"
const projects = (cost: number) => ({
  priced: true, noRunner: false, totalCost: cost, totalTokens: 10, unattributedCost: 0, unreadable: 0,
  projects: [{ name: "shop", path: SHOP, cost, tokens: 10, branches: [] }],
})

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  vi.mocked(sendNotification).mockReset()
  vi.mocked(isPermissionGranted).mockResolvedValue(true)
  vi.mocked(loadProjectBudgets).mockResolvedValue({ claude: { [SHOP]: 50 } })
  vi.mocked(loadSentProjectAlerts).mockResolvedValue([])
  vi.mocked(saveSentProjectAlerts).mockResolvedValue()
  useAppPreferencesStore.setState({ projectBudgets: {}, currency: { code: "USD", rate: 1 } })
})

const run = (enabledIds: string[], enabled = true) =>
  renderHook(() => useProjectBudgetAlerts({ pluginsMeta: META, enabledIds, enabled, settings: DEFAULT_ALERT_SETTINGS }))

it("loads the budgets, checks this month's projects and notifies once a budget is 80% spent", async () => {
  vi.mocked(invoke).mockImplementation(async (command) => (command === "usage_projects" ? projects(41) : undefined))
  run(["claude"])
  await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1))
  expect(useAppPreferencesStore.getState().projectBudgets).toEqual({ claude: { [SHOP]: 50 } })
  expect(invoke).toHaveBeenCalledWith("usage_projects", expect.objectContaining({ pluginId: "claude" }))
  expect(sendNotification).toHaveBeenCalledWith({ title: "shop budget (Claude)", body: expect.stringMatching(/^82%/) })
  await waitFor(() => expect(saveSentProjectAlerts).toHaveBeenCalledWith([expect.stringMatching(/^project:claude:\d{4}-\d{2}:C:\/work\/shop:5000:80$/)]))
})

it("stays quiet for a disabled card, with notifications off, or once the alert was sent", async () => {
  vi.mocked(invoke).mockResolvedValue(projects(41))
  const off = run([])
  await waitFor(() => expect(useAppPreferencesStore.getState().projectBudgets).not.toEqual({}))
  off.unmount()
  run(["claude"], false).unmount()
  expect(invoke).not.toHaveBeenCalledWith("usage_projects", expect.anything())

  const month = new Date()
  const key = `project:claude:${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}:${SHOP}:5000:80`
  vi.mocked(loadSentProjectAlerts).mockResolvedValue([key])
  run(["claude"])
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("usage_projects", expect.anything()))
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(sendNotification).not.toHaveBeenCalled()
})
