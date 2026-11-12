import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PluginState } from "@/hooks/app/types"
import type { PluginOutput } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"
import { useAppPluginStore } from "@/stores/app-plugin-store"

const { savePluginSettingsMock } = vi.hoisted(() => ({ savePluginSettingsMock: vi.fn() }))

vi.mock("@/lib/settings", () => ({ savePluginSettings: savePluginSettingsMock }))

import { useProviderDetection } from "@/hooks/app/use-provider-detection"

const IDS = ["claude", "codex", "cursor", "zai"]

const done = (patch: Partial<PluginState>): PluginState => ({
  data: null,
  loading: false,
  error: null,
  lastManualRefreshAt: null,
  lastUpdatedAt: null,
  ...patch,
})
const usage = (id: string, plan?: string): PluginOutput => ({ providerId: id, displayName: id, plan, lines: [], iconUrl: "" })
const notSetUp = "Not logged in. Run `x` to authenticate."

// As in App: the setter is the store's, and the hook reads the store.
const settings = () => useAppPluginStore.getState().pluginSettings
const setSettings = (value: PluginSettings | null) => useAppPluginStore.getState().setPluginSettings(value)

function setup(ids = IDS, startBatch = vi.fn().mockResolvedValue(undefined)) {
  setSettings({ order: ids, disabled: [...ids] })
  const setPluginSettings = vi.fn(setSettings)
  const hook = renderHook(
    ({ pluginStates }: { pluginStates: Record<string, PluginState> }) =>
      useProviderDetection({
        pluginSettings: useAppPluginStore((state) => state.pluginSettings),
        pluginStates,
        setPluginSettings,
        setLoadingForPlugins: vi.fn(),
        startBatch,
      }),
    { initialProps: { pluginStates: {} as Record<string, PluginState> } }
  )
  return { hook, setPluginSettings, startBatch, detect: () => act(() => hook.result.current.detectProviders(ids)) }
}

describe("useProviderDetection", () => {
  beforeEach(() => {
    useAppPluginStore.getState().resetState()
    savePluginSettingsMock.mockReset()
    savePluginSettingsMock.mockResolvedValue(undefined)
  })

  it("turns on what a probe found, and saves once every provider is decided", async () => {
    const { hook, startBatch, detect } = setup()
    await detect()
    expect(startBatch).toHaveBeenCalledWith(IDS)

    const states = {
      claude: done({ data: usage("claude") }),
      codex: done({ error: notSetUp }),
      // An expired login is still the user's: the card shows with its fix.
      cursor: done({ error: "Token expired. Sign in via Cursor app or run `agent login`." }),
      zai: done({ loading: true }),
    }
    hook.rerender({ pluginStates: states })
    expect(settings()).toEqual({ order: IDS, disabled: ["codex", "zai"] })
    // Not saved while zai is still probing: a start cut short detects again.
    expect(savePluginSettingsMock).not.toHaveBeenCalled()

    hook.rerender({ pluginStates: { ...states, zai: done({ error: "No ZAI_API_KEY found. Set up environment variable first." }) } })
    expect(savePluginSettingsMock).toHaveBeenCalledTimes(1)
    expect(savePluginSettingsMock).toHaveBeenCalledWith({ order: IDS, disabled: ["codex", "zai"] })
  })

  it("saves the all-off settings when nothing is found", async () => {
    const { hook, setPluginSettings, detect } = setup(["codex"])
    await detect()
    hook.rerender({ pluginStates: { codex: done({ error: notSetUp }) } })
    expect(setPluginSettings).not.toHaveBeenCalled()
    expect(savePluginSettingsMock).toHaveBeenCalledWith({ order: ["codex"], disabled: ["codex"] })
  })

  it("takes Copilot only with a Copilot plan: its login is the GitHub CLI's", async () => {
    const { hook, detect } = setup(["copilot"])
    await detect()
    hook.rerender({ pluginStates: { copilot: done({ error: "Token invalid. Run `gh auth login` to re-authenticate." }) } })
    expect(settings()?.disabled).toEqual(["copilot"])

    const found = setup(["copilot"])
    await found.detect()
    found.hook.rerender({ pluginStates: { copilot: done({ data: usage("copilot", "Individual Pro") }) } })
    expect(settings()?.disabled).toEqual([])
  })

  it("decides each provider once, so turning one off later sticks", async () => {
    const { hook, detect } = setup(["claude"])
    await detect()
    const states = { claude: done({ data: usage("claude") }) }
    hook.rerender({ pluginStates: states })
    act(() => setSettings({ order: ["claude"], disabled: ["claude"] }))
    hook.rerender({ pluginStates: { ...states } })
    expect(settings()?.disabled).toEqual(["claude"])
  })

  it("leaves a provider the user turned on and off while it probed to the user", async () => {
    const { hook, detect } = setup(["claude"])
    await detect()
    act(() => setSettings({ order: ["claude"], disabled: [] }))
    act(() => setSettings({ order: ["claude"], disabled: ["claude"] }))
    hook.rerender({ pluginStates: { claude: done({ data: usage("claude") }) } })
    expect(settings()?.disabled).toEqual(["claude"])
  })

  it("keeps a card added while it was detecting", async () => {
    const { hook, detect } = setup(["claude"])
    await detect()
    // A WSL card arrives (handlePluginsChanged) before the result.
    act(() => setSettings({ order: ["claude", "claude-wsl-1a2b3c4d"], disabled: ["claude"] }))
    hook.rerender({ pluginStates: { claude: done({ data: usage("claude") }) } })
    expect(settings()).toEqual({ order: ["claude", "claude-wsl-1a2b3c4d"], disabled: [] })
  })

  it("turns nothing on and saves nothing when the probes can't start", async () => {
    const { hook, setPluginSettings, detect } = setup(["claude"], vi.fn().mockRejectedValue(new Error("no host")))
    await detect()
    hook.rerender({ pluginStates: { claude: done({ error: "Failed to start probe" }) } })
    expect(setPluginSettings).not.toHaveBeenCalled()
    expect(savePluginSettingsMock).not.toHaveBeenCalled()
  })
})
