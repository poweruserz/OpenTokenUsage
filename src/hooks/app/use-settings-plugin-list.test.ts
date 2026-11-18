import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useSettingsPluginList } from "@/hooks/app/use-settings-plugin-list"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"

function createPluginMeta(id: string, name: string): PluginMeta {
  return {
    id,
    name,
    iconUrl: `/${id}.svg`,
    brandColor: "#000000",
    lines: [],
    primaryCandidates: [],
  }
}

describe("useSettingsPluginList", () => {
  it("returns ordered settings plugins with enabled state", () => {
    const pluginSettings: PluginSettings = {
      order: ["codex", "missing", "cursor"],
      disabled: ["cursor"],
    }

    const state = (error: string | null) => ({ data: null, loading: false, error, lastManualRefreshAt: null, lastUpdatedAt: null })
    const { result } = renderHook(() =>
      useSettingsPluginList({
        pluginSettings,
        pluginsMeta: [
          createPluginMeta("cursor", "Cursor"),
          createPluginMeta("codex", "Codex"),
        ],
        pluginStates: {
          codex: state("Token expired. Run `codex` to log in again."),
          // Not a lost login: the app isn't running.
          cursor: state("Start Cursor or run `agent` and try again."),
        },
      })
    )

    expect(result.current).toEqual([
      { id: "codex", name: "Codex", enabled: true, signInError: "Token expired. Run `codex` to log in again." },
      { id: "cursor", name: "Cursor", enabled: false, signInError: null },
    ])
  })

  it("returns empty list when settings are not loaded", () => {
    const { result } = renderHook(() =>
      useSettingsPluginList({
        pluginSettings: null,
        pluginsMeta: [createPluginMeta("codex", "Codex")],
      })
    )

    expect(result.current).toEqual([])
  })
})
