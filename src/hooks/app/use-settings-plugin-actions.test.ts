import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { savePluginSettingsMock } = vi.hoisted(() => ({
  savePluginSettingsMock: vi.fn(),
}))

vi.mock("@/lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settings")>()),
  savePluginSettings: savePluginSettingsMock,
}))

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))

import { useSettingsPluginActions } from "@/hooks/app/use-settings-plugin-actions"
import { useAppPluginStore } from "@/stores/app-plugin-store"

describe("useSettingsPluginActions", () => {
  beforeEach(() => {
    savePluginSettingsMock.mockReset()
    savePluginSettingsMock.mockResolvedValue(undefined)
  })

  it("reorders plugins and persists new order", () => {
    const setPluginSettings = vi.fn()
    const scheduleTrayIconUpdate = vi.fn()

    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: { order: ["a", "b"], disabled: [] },
        setPluginSettings,
        setLoadingForPlugins: vi.fn(),
        setErrorForPlugins: vi.fn(),
        startBatch: vi.fn(),
        scheduleTrayIconUpdate,
      })
    )

    act(() => {
      result.current.handleReorder(["b", "a"])
    })

    expect(setPluginSettings).toHaveBeenCalledWith({ order: ["b", "a"], disabled: [] })
    expect(savePluginSettingsMock).toHaveBeenCalledWith({ order: ["b", "a"], disabled: [] })
    expect(scheduleTrayIconUpdate).toHaveBeenCalledWith("settings", 2000)
  })

  it("reorder from sidebar (nav-only subset) preserves disabled plugins in order", () => {
    const setPluginSettings = vi.fn()

    // "b" is disabled so navPlugins only contains ["a", "c"]; user drags "c" before "a"
    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: { order: ["a", "b", "c"], disabled: ["b"] },
        setPluginSettings,
        setLoadingForPlugins: vi.fn(),
        setErrorForPlugins: vi.fn(),
        startBatch: vi.fn(),
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    act(() => {
      result.current.handleReorder(["c", "a"])
    })

    // "b" originally sat between "a" (idx 0) and "c" (idx 2).
    // After nav-reorder ["c", "a"], "b" should be re-inserted after "a" → ["c", "a", "b"].
    const expectedSettings = { order: ["c", "a", "b"], disabled: ["b"] }
    expect(setPluginSettings).toHaveBeenCalledWith(expectedSettings)
    expect(savePluginSettingsMock).toHaveBeenCalledWith(expectedSettings)
  })

  it("reorder from sidebar prepends disabled plugin that originally led the order", () => {
    const setPluginSettings = vi.fn()

    // "b" is disabled and was first; navPlugins only contains ["a", "c"]; user drags "c" before "a"
    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: { order: ["b", "a", "c"], disabled: ["b"] },
        setPluginSettings,
        setLoadingForPlugins: vi.fn(),
        setErrorForPlugins: vi.fn(),
        startBatch: vi.fn(),
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    act(() => {
      result.current.handleReorder(["c", "a"])
    })

    // "b" originally preceded all visible IDs → should be prepended → ["b", "c", "a"].
    const expectedSettings = { order: ["b", "c", "a"], disabled: ["b"] }
    expect(setPluginSettings).toHaveBeenCalledWith(expectedSettings)
    expect(savePluginSettingsMock).toHaveBeenCalledWith(expectedSettings)
  })

  it("reorder tolerates missing saved order metadata", () => {
    const setPluginSettings = vi.fn()

    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: { order: undefined as unknown as string[], disabled: [] },
        setPluginSettings,
        setLoadingForPlugins: vi.fn(),
        setErrorForPlugins: vi.fn(),
        startBatch: vi.fn(),
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    act(() => {
      result.current.handleReorder(["c", "a"])
    })

    expect(setPluginSettings).toHaveBeenCalledWith({ order: ["c", "a"], disabled: [] })
    expect(savePluginSettingsMock).toHaveBeenCalledWith({ order: ["c", "a"], disabled: [] })
  })

  it("reorder restores the full saved order when no visible plugins are passed", () => {
    const setPluginSettings = vi.fn()

    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: { order: ["b", "a", "c"], disabled: ["b"] },
        setPluginSettings,
        setLoadingForPlugins: vi.fn(),
        setErrorForPlugins: vi.fn(),
        startBatch: vi.fn(),
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    act(() => {
      result.current.handleReorder([])
    })

    expect(setPluginSettings).toHaveBeenCalledWith({ order: ["b", "a", "c"], disabled: ["b"] })
    expect(savePluginSettingsMock).toHaveBeenCalledWith({ order: ["b", "a", "c"], disabled: ["b"] })
  })

  it("reorder tolerates order metadata disappearing during merge", () => {
    const setPluginSettings = vi.fn()
    let orderReads = 0
    const pluginSettings = {
      disabled: [],
      get order() {
        orderReads += 1
        return orderReads === 1 ? ["b", "a"] : undefined
      },
    } as unknown as { order: string[]; disabled: string[] }

    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings,
        setPluginSettings,
        setLoadingForPlugins: vi.fn(),
        setErrorForPlugins: vi.fn(),
        startBatch: vi.fn(),
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    act(() => {
      result.current.handleReorder(["a"])
    })

    expect(setPluginSettings).toHaveBeenCalledWith({ order: ["b", "a"], disabled: [] })
    expect(savePluginSettingsMock).toHaveBeenCalledWith({ order: ["b", "a"], disabled: [] })
  })

  it("enables and disables plugins with correct side effects", () => {
    const setPluginSettings = vi.fn()
    const setLoadingForPlugins = vi.fn()
    const startBatch = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: { order: ["a", "b"], disabled: ["b"] },
        setPluginSettings,
        setLoadingForPlugins,
        setErrorForPlugins: vi.fn(),
        startBatch,
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    act(() => {
      result.current.handleToggle("b")
    })
    expect(setLoadingForPlugins).toHaveBeenCalledWith(["b"])
    expect(startBatch).toHaveBeenCalledWith(["b"])
    expect(setPluginSettings).toHaveBeenNthCalledWith(1, { order: ["a", "b"], disabled: [] })

    act(() => {
      result.current.handleToggle("a")
    })
    expect(setPluginSettings).toHaveBeenNthCalledWith(2, { order: ["a", "b"], disabled: ["b", "a"] })
  })

  it("returns early when plugin settings are missing", () => {
    const setPluginSettings = vi.fn()

    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: null,
        setPluginSettings,
        setLoadingForPlugins: vi.fn(),
        setErrorForPlugins: vi.fn(),
        startBatch: vi.fn(),
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    act(() => {
      result.current.handleReorder(["a"])
      result.current.handleToggle("a")
    })

    expect(setPluginSettings).not.toHaveBeenCalled()
    expect(savePluginSettingsMock).not.toHaveBeenCalled()
  })

  it("logs errors when enabling probe start fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const setErrorForPlugins = vi.fn()
    const startError = new Error("probe failed")
    const saveError = new Error("save failed")

    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: { order: ["a"], disabled: ["a"] },
        setPluginSettings: vi.fn(),
        setLoadingForPlugins: vi.fn(),
        setErrorForPlugins,
        startBatch: vi.fn().mockRejectedValueOnce(startError),
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    savePluginSettingsMock.mockRejectedValueOnce(saveError)

    act(() => {
      result.current.handleToggle("a")
    })

    await waitFor(() => {
      expect(setErrorForPlugins).toHaveBeenCalledWith(["a"], "Failed to start probe")
      expect(errorSpy).toHaveBeenCalledWith("Failed to start probe for enabled plugin:", startError)
      expect(errorSpy).toHaveBeenCalledWith("Failed to save plugin toggle:", saveError)
    })

    errorSpy.mockRestore()
  })

  it("puts a new account after its provider, enabled, and probes it; drops a removed one", async () => {
    const metas = ["claude", "claude-1a2b3c4d", "codex"].map((id) => ({ id, name: id }))
    invokeMock.mockResolvedValue(metas)
    const setPluginSettings = vi.fn()
    const setPluginsMeta = vi.fn()
    const startBatch = vi.fn(() => Promise.resolve(["claude-1a2b3c4d"]))
    const setLoadingForPlugins = vi.fn()
    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: { order: ["claude", "codex"], disabled: ["codex"] },
        setPluginSettings,
        setPluginsMeta,
        setLoadingForPlugins,
        setErrorForPlugins: vi.fn(),
        startBatch,
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    await act(() => result.current.handleAccountsChanged({ added: { id: "claude-1a2b3c4d", plugin: "claude" } }))

    expect(invokeMock).toHaveBeenCalledWith("list_plugins")
    expect(setPluginsMeta).toHaveBeenCalledWith(metas)
    const saved = { order: ["claude", "claude-1a2b3c4d", "codex"], disabled: ["codex"] }
    expect(setPluginSettings).toHaveBeenCalledWith(saved)
    expect(savePluginSettingsMock).toHaveBeenCalledWith(saved)
    expect(setLoadingForPlugins).toHaveBeenCalledWith(["claude-1a2b3c4d"])
    expect(startBatch).toHaveBeenCalledWith(["claude-1a2b3c4d"])
  })

  it("drops a removed account from the order", async () => {
    invokeMock.mockResolvedValue(["claude", "codex"].map((id) => ({ id, name: id })))
    const setPluginSettings = vi.fn()
    const startBatch = vi.fn()
    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: { order: ["claude", "claude-1a2b3c4d", "codex"], disabled: ["claude-1a2b3c4d"] },
        setPluginSettings,
        setPluginsMeta: vi.fn(),
        setLoadingForPlugins: vi.fn(),
        setErrorForPlugins: vi.fn(),
        startBatch,
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    await act(() => result.current.handleAccountsChanged({ removedId: "claude-1a2b3c4d" }))

    expect(setPluginSettings).toHaveBeenCalledWith({ order: ["claude", "codex"], disabled: [] })
    expect(startBatch).not.toHaveBeenCalled()
  })

  it("adds and removes WSL cards in one change", async () => {
    invokeMock.mockResolvedValue(["claude", "claude-wsl-0a1b2c3d", "codex"].map((id) => ({ id, name: id })))
    const setPluginSettings = vi.fn()
    const startBatch = vi.fn(() => Promise.resolve([]))
    const setLoadingForPlugins = vi.fn()
    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: { order: ["claude", "claude-wsl-99999999", "codex"], disabled: ["codex"] },
        setPluginSettings,
        setPluginsMeta: vi.fn(),
        setLoadingForPlugins,
        setErrorForPlugins: vi.fn(),
        startBatch,
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    await act(() =>
      result.current.handlePluginsChanged({
        added: [{ id: "claude-wsl-0a1b2c3d", plugin: "claude" }],
        removed: ["claude-wsl-99999999"],
      })
    )

    expect(setPluginSettings).toHaveBeenCalledWith({ order: ["claude", "claude-wsl-0a1b2c3d", "codex"], disabled: ["codex"] })
    expect(setLoadingForPlugins).toHaveBeenCalledWith(["claude-wsl-0a1b2c3d"])
    expect(startBatch).toHaveBeenCalledWith(["claude-wsl-0a1b2c3d"])
  })

  it("keeps a provider turned on while the plugin list was being read", async () => {
    let listed: (metas: unknown) => void = () => {}
    invokeMock.mockReturnValue(new Promise((resolve) => { listed = resolve }))
    const setPluginSettings = vi.fn()
    const { result } = renderHook(() =>
      useSettingsPluginActions({
        pluginSettings: { order: ["claude", "codex"], disabled: ["claude", "codex"] },
        setPluginSettings,
        setPluginsMeta: vi.fn(),
        setLoadingForPlugins: vi.fn(),
        setErrorForPlugins: vi.fn(),
        startBatch: vi.fn(() => Promise.resolve([])),
        scheduleTrayIconUpdate: vi.fn(),
      })
    )

    const change = result.current.handlePluginsChanged({ added: [{ id: "claude-wsl-0a1b2c3d", plugin: "claude" }], removed: [] })
    // A new install's detection turns Claude on meanwhile.
    useAppPluginStore.getState().setPluginSettings({ order: ["claude", "codex"], disabled: ["codex"] })
    listed(["claude", "claude-wsl-0a1b2c3d", "codex"].map((id) => ({ id, name: id })))
    await act(() => change)

    expect(setPluginSettings).toHaveBeenCalledWith({ order: ["claude", "claude-wsl-0a1b2c3d", "codex"], disabled: ["codex"] })
    useAppPluginStore.getState().resetState()
  })

  it("keeps a change that arrives before the settings load, and applies it once they do", async () => {
    invokeMock.mockResolvedValue(["claude", "claude-wsl-0a1b2c3d", "codex"].map((id) => ({ id, name: id })))
    const setPluginSettings = vi.fn()
    const startBatch = vi.fn(() => Promise.resolve([]))
    const { result, rerender } = renderHook(
      ({ pluginSettings }: { pluginSettings: { order: string[]; disabled: string[] } | null }) =>
        useSettingsPluginActions({
          pluginSettings,
          setPluginSettings,
          setPluginsMeta: vi.fn(),
          setLoadingForPlugins: vi.fn(),
          setErrorForPlugins: vi.fn(),
          startBatch,
          scheduleTrayIconUpdate: vi.fn(),
        }),
      { initialProps: { pluginSettings: null as { order: string[]; disabled: string[] } | null } }
    )

    await act(() => result.current.handlePluginsChanged({ added: [{ id: "claude-wsl-0a1b2c3d", plugin: "claude" }], removed: [] }))
    expect(setPluginSettings).not.toHaveBeenCalled()

    rerender({ pluginSettings: { order: ["claude", "codex"], disabled: [] } })

    await waitFor(() =>
      expect(setPluginSettings).toHaveBeenCalledWith({ order: ["claude", "claude-wsl-0a1b2c3d", "codex"], disabled: [] })
    )
    expect(startBatch).toHaveBeenCalledWith(["claude-wsl-0a1b2c3d"])
  })
})
