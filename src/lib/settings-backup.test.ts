import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildSettingsBackup, restoreSettingsBackup } from "@/lib/settings-backup"
import { loadAlertSettings, loadThemeMode } from "@/lib/settings"

const storeState = new Map<string, unknown>()

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    async get<T>(key: string): Promise<T | undefined> {
      return storeState.get(key) as T | undefined
    }
    async set(key: string, value: unknown): Promise<void> {
      storeState.set(key, value)
    }
    async delete(key: string): Promise<void> {
      storeState.delete(key)
    }
    async save(): Promise<void> {}
  },
}))

const backup = (settings: Record<string, unknown>) => JSON.stringify({ app: "OpenTokenUsage", version: 1, settings })

describe("settings backup", () => {
  beforeEach(() => storeState.clear())

  it("carries the preferences and leaves out what belongs to one machine", async () => {
    storeState.set("themeMode", "light")
    storeState.set("plugins", { order: ["claude"], disabled: [] })
    storeState.set("panelPosition", { x: 10, y: 20 })
    storeState.set("sentUsageAlerts", ["claude|Session|t80"])
    const saved = JSON.parse(await buildSettingsBackup())
    expect(saved.app).toBe("OpenTokenUsage")
    expect(saved.settings).toEqual({ themeMode: "light", plugins: { order: ["claude"], disabled: [] } })
  })

  it("refuses anything that isn't a backup and changes nothing", async () => {
    storeState.set("themeMode", "light")
    for (const bad of ["not json", "[]", JSON.stringify({ app: "Other", settings: {} }), JSON.stringify({ app: "OpenTokenUsage", settings: [] })]) {
      expect(await restoreSettingsBackup(bad)).toEqual({ ok: false, reason: "notBackup" })
    }
    expect(storeState.get("themeMode")).toBe("light")
  })

  it("puts a preference the backup left at its default back to the default", async () => {
    storeState.set("plugins", { order: ["claude"], disabled: [] })
    const text = await buildSettingsBackup()
    storeState.set("themeMode", "light")
    storeState.set("panelPosition", { x: 1, y: 2 })
    expect(await restoreSettingsBackup(text)).toEqual({ ok: true })
    expect(await loadThemeMode()).toBe("dark")
    // Not a backed-up preference: this PC keeps it.
    expect(storeState.get("panelPosition")).toEqual({ x: 1, y: 2 })
  })

  it("keeps this PC's sound when the backup's is a custom file it doesn't carry", async () => {
    await restoreSettingsBackup(backup({ alertSettings: { levels: [80], sound: "custom", customSoundName: "ding.mp3" } }))
    expect(await loadAlertSettings()).toMatchObject({ levels: [80], sound: "windows", customSoundName: null })

    storeState.set("alertSettings", { levels: [95], sound: "custom", customSoundName: "mine.wav" })
    await restoreSettingsBackup(backup({ alertSettings: { levels: [80], sound: "custom", customSoundName: "ding.mp3" } }))
    expect(await loadAlertSettings()).toMatchObject({ levels: [80], sound: "custom", customSoundName: "mine.wav" })
  })

  it("keeps this PC's account and WSL cards, on or off, in the imported order", async () => {
    storeState.set("plugins", {
      order: ["codex", "claude", "claude-1a2b3c4d", "claude-wsl-0011aabb"],
      disabled: ["claude-wsl-0011aabb"],
    })
    // The other PC's own account doesn't exist here.
    await restoreSettingsBackup(backup({ plugins: { order: ["claude", "claude-99999999", "codex"], disabled: ["codex"] } }))
    expect(storeState.get("plugins")).toEqual({
      order: ["claude", "claude-1a2b3c4d", "claude-wsl-0011aabb", "codex"],
      disabled: ["codex", "claude-wsl-0011aabb"],
    })
  })
})
