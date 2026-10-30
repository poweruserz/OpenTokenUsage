import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  arePluginSettingsEqualMock,
  disableAutostartMock,
  enableAutostartMock,
  getEnabledPluginIdsMock,
  invokeMock,
  isAutostartEnabledMock,
  isTauriMock,
  loadAutoUpdateIntervalMock,
  loadDisplayModeMock,
  loadGlobalShortcutMock,
  loadMenubarIconStyleMock,
  loadTrayMetricMock,
  loadTrayPercentColorMock,
  loadTrayHiddenPluginsMock,
  loadTrayProviderMock,
  loadPluginSettingsMock,
  loadResetTimerDisplayModeMock,
  loadStartOnLoginMock,
  loadThemeModeMock,
  loadTimeFormatModeMock,
  migrateLegacyTraySettingsMock,
  migrateWindsurfToDevinMock,
  normalizePluginSettingsMock,
  savePluginSettingsMock,
  initStarPromptMock,
} = vi.hoisted(() => ({
  initStarPromptMock: vi.fn(async () => ({ showAfter: 0, shown: false })),
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
  isAutostartEnabledMock: vi.fn(),
  enableAutostartMock: vi.fn(),
  disableAutostartMock: vi.fn(),
  arePluginSettingsEqualMock: vi.fn(),
  getEnabledPluginIdsMock: vi.fn(),
  loadAutoUpdateIntervalMock: vi.fn(),
  loadDisplayModeMock: vi.fn(),
  loadGlobalShortcutMock: vi.fn(),
  loadMenubarIconStyleMock: vi.fn(),
  loadTrayMetricMock: vi.fn(),
  loadTrayPercentColorMock: vi.fn(),
  loadTrayHiddenPluginsMock: vi.fn(async () => [] as string[]),
  loadTrayProviderMock: vi.fn(),
  loadPluginSettingsMock: vi.fn(),
  loadResetTimerDisplayModeMock: vi.fn(),
  loadStartOnLoginMock: vi.fn(),
  loadThemeModeMock: vi.fn(),
  loadTimeFormatModeMock: vi.fn(),
  migrateLegacyTraySettingsMock: vi.fn(),
  migrateWindsurfToDevinMock: vi.fn(),
  normalizePluginSettingsMock: vi.fn(),
  savePluginSettingsMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}))

vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: disableAutostartMock,
  enable: enableAutostartMock,
  isEnabled: isAutostartEnabledMock,
}))

vi.mock("@/lib/settings", () => ({
  arePluginSettingsEqual: arePluginSettingsEqualMock,
  DEFAULT_AUTO_UPDATE_INTERVAL: 15,
  DEFAULT_DISPLAY_MODE: "left",
  DEFAULT_GLOBAL_SHORTCUT: null,
  DEFAULT_MENUBAR_ICON_STYLE: "icon",
  DEFAULT_MENUBAR_METRIC: "default",
  DEFAULT_RESET_TIMER_DISPLAY_MODE: "relative",
  DEFAULT_START_ON_LOGIN: false,
  DEFAULT_THEME_MODE: "dark",
  DEFAULT_TIME_FORMAT_MODE: "auto",
  getEnabledPluginIds: getEnabledPluginIdsMock,
  initStarPrompt: initStarPromptMock,
  loadAutoUpdateInterval: loadAutoUpdateIntervalMock,
  loadDisplayMode: loadDisplayModeMock,
  loadGlobalShortcut: loadGlobalShortcutMock,
  loadMenubarIconStyle: loadMenubarIconStyleMock,
  loadTrayMetric: loadTrayMetricMock,
  loadTrayPercentColor: loadTrayPercentColorMock,
  loadTrayHiddenPlugins: loadTrayHiddenPluginsMock,
  loadUsageAlerts: vi.fn(async () => true),
  loadTrayLogoColors: vi.fn(async () => true),
  loadTaskbarStrip: vi.fn(async () => false),
  loadTaskbarStripStyle: vi.fn(async () => ({})),
  loadTrayProvider: loadTrayProviderMock,
  loadPluginSettings: loadPluginSettingsMock,
  loadResetTimerDisplayMode: loadResetTimerDisplayModeMock,
  loadStartOnLogin: loadStartOnLoginMock,
  loadThemeMode: loadThemeModeMock,
  loadTimeFormatMode: loadTimeFormatModeMock,
  migrateLegacyTraySettings: migrateLegacyTraySettingsMock,
  migrateWindsurfToDevin: migrateWindsurfToDevinMock,
  normalizePluginSettings: normalizePluginSettingsMock,
  savePluginSettings: savePluginSettingsMock,
}))

import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap"

function createArgs() {
  return {
    setPluginSettings: vi.fn(),
    setPluginsMeta: vi.fn(),
    setAutoUpdateInterval: vi.fn(),
    setThemeMode: vi.fn(),
    setDisplayMode: vi.fn(),
    setResetTimerDisplayMode: vi.fn(),
    setTimeFormatMode: vi.fn(),
    setGlobalShortcut: vi.fn(),
    setStartOnLogin: vi.fn(),
    setMenubarIconStyle: vi.fn(),
    setTrayProvider: vi.fn(),
    setTrayMetric: vi.fn(),
    setTrayPercentColor: vi.fn(),
    setTrayHiddenPlugins: vi.fn(),
    setUsageAlerts: vi.fn(),
    setTrayLogoColors: vi.fn(),
    setTaskbarStrip: vi.fn(),
    setTaskbarStripStyle: vi.fn(),
    setLoadingForPlugins: vi.fn(),
    setErrorForPlugins: vi.fn(),
    startBatch: vi.fn().mockResolvedValue(undefined),
  }
}

describe("useSettingsBootstrap", () => {
  beforeEach(() => {
    invokeMock.mockReset()
    isTauriMock.mockReset()
    isAutostartEnabledMock.mockReset()
    enableAutostartMock.mockReset()
    disableAutostartMock.mockReset()
    arePluginSettingsEqualMock.mockReset()
    getEnabledPluginIdsMock.mockReset()
    loadAutoUpdateIntervalMock.mockReset()
    loadDisplayModeMock.mockReset()
    loadGlobalShortcutMock.mockReset()
    loadMenubarIconStyleMock.mockReset()
    loadTrayMetricMock.mockReset()
    loadTrayPercentColorMock.mockReset()
    loadTrayProviderMock.mockReset()
    loadPluginSettingsMock.mockReset()
    loadResetTimerDisplayModeMock.mockReset()
    loadStartOnLoginMock.mockReset()
    loadThemeModeMock.mockReset()
    loadTimeFormatModeMock.mockReset()
    migrateLegacyTraySettingsMock.mockReset()
    migrateWindsurfToDevinMock.mockReset()
    normalizePluginSettingsMock.mockReset()
    savePluginSettingsMock.mockReset()

    isTauriMock.mockReturnValue(true)
    isAutostartEnabledMock.mockResolvedValue(true)
    invokeMock.mockResolvedValue([
      {
        id: "codex",
        name: "Codex",
        iconUrl: "/codex.svg",
        brandColor: "#000000",
        lines: [],
        primaryCandidates: [],
      },
    ])
    loadPluginSettingsMock.mockResolvedValue({ order: ["codex"], disabled: [] })
    normalizePluginSettingsMock.mockImplementation((stored) => stored)
    arePluginSettingsEqualMock.mockReturnValue(true)
    loadAutoUpdateIntervalMock.mockResolvedValue(15)
    loadThemeModeMock.mockResolvedValue("dark")
    loadDisplayModeMock.mockResolvedValue("used")
    loadResetTimerDisplayModeMock.mockResolvedValue("relative")
    loadTimeFormatModeMock.mockResolvedValue("auto")
    loadGlobalShortcutMock.mockResolvedValue("CommandOrControl+Shift+O")
    loadMenubarIconStyleMock.mockResolvedValue("icon")
    loadTrayProviderMock.mockResolvedValue("auto")
    loadTrayMetricMock.mockResolvedValue("auto")
    loadTrayPercentColorMock.mockResolvedValue("#ffffff")
    loadStartOnLoginMock.mockResolvedValue(true)
    migrateLegacyTraySettingsMock.mockResolvedValue(undefined)
    migrateWindsurfToDevinMock.mockImplementation((settings) => settings)
    savePluginSettingsMock.mockResolvedValue(undefined)
    getEnabledPluginIdsMock.mockReturnValue(["codex"])
  })

  it("disables autostart when applyStartOnLogin receives false", async () => {
    const args = createArgs()
    const { result } = renderHook(() => useSettingsBootstrap(args))

    await result.current.applyStartOnLogin(false)

    expect(disableAutostartMock).toHaveBeenCalledTimes(1)
    expect(enableAutostartMock).not.toHaveBeenCalled()
  })

  it("rewrites a stale autostart entry (the exe moved from the MSI to the per-user install)", async () => {
    invokeMock.mockImplementation(async (cmd: string) => cmd === "autostart_stale")
    const args = createArgs()
    const { result } = renderHook(() => useSettingsBootstrap(args))

    await result.current.applyStartOnLogin(true)

    expect(invokeMock).toHaveBeenCalledWith("autostart_stale")
    expect(enableAutostartMock).toHaveBeenCalledTimes(1)
    expect(disableAutostartMock).not.toHaveBeenCalled()
  })

  it("leaves a working autostart entry alone, so a dev or test build never takes it over", async () => {
    invokeMock.mockImplementation(async (cmd: string) => (cmd === "autostart_stale" ? false : []))
    const args = createArgs()
    const { result } = renderHook(() => useSettingsBootstrap(args))

    await result.current.applyStartOnLogin(true)

    expect(enableAutostartMock).not.toHaveBeenCalled()
  })

  it("leaves autostart alone when off and already disabled", async () => {
    isAutostartEnabledMock.mockResolvedValue(false)
    const args = createArgs()
    const { result } = renderHook(() => useSettingsBootstrap(args))

    await result.current.applyStartOnLogin(false)

    expect(disableAutostartMock).not.toHaveBeenCalled()
    expect(enableAutostartMock).not.toHaveBeenCalled()
  })

  it("falls back to default reset timer mode when loading fails", async () => {
    const resetModeError = new Error("reset timer mode unavailable")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    loadResetTimerDisplayModeMock.mockRejectedValueOnce(resetModeError)
    const args = createArgs()

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to load reset timer display mode:",
        resetModeError
      )
      expect(args.setResetTimerDisplayMode).toHaveBeenCalledWith("relative")
    })

    errorSpy.mockRestore()
  })

  it("migrates windsurf settings before normalizing and saves the first-launch result", async () => {
    const args = createArgs()
    const storedSettings = { order: ["windsurf"], disabled: [] }
    const migratedSettings = { order: ["devin"], disabled: [] }
    const availablePlugins = [
      {
        id: "devin",
        name: "Devin",
        iconUrl: "/devin.svg",
        brandColor: "#000000",
        lines: [],
        primaryCandidates: [],
      },
    ]

    invokeMock.mockResolvedValueOnce(availablePlugins)
    loadPluginSettingsMock.mockResolvedValueOnce(storedSettings)
    migrateWindsurfToDevinMock.mockReturnValueOnce(migratedSettings)
    normalizePluginSettingsMock.mockReturnValueOnce(migratedSettings)
    arePluginSettingsEqualMock.mockReturnValueOnce(false)
    getEnabledPluginIdsMock.mockReturnValueOnce(["devin"])
    // The star card tells a new install from an update by whether plugin settings exist yet, so the
    // first save must wait until its state is created, not just started.
    let finishStarPrompt: () => void = () => {}
    initStarPromptMock.mockImplementationOnce(
      () => new Promise((resolve) => { finishStarPrompt = () => resolve({ showAfter: 0, shown: false }) })
    )

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => expect(initStarPromptMock).toHaveBeenCalled())
    await act(() => Promise.resolve())
    expect(savePluginSettingsMock).not.toHaveBeenCalled()

    finishStarPrompt()
    await waitFor(() => {
      expect(normalizePluginSettingsMock).toHaveBeenCalledWith(
        migratedSettings,
        availablePlugins
      )
      expect(savePluginSettingsMock).toHaveBeenCalledWith(migratedSettings)
      expect(args.setPluginSettings).toHaveBeenCalledWith(migratedSettings)
      expect(args.startBatch).toHaveBeenCalledWith(["devin"])
    })
  })
})
