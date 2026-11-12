import { useCallback, useEffect, useRef } from "react"
import type { PluginState } from "@/hooks/app/types"
import { isNotSetUpError } from "@/lib/plugin-errors"
import { savePluginSettings, type PluginSettings } from "@/lib/settings"
import { useAppPluginStore } from "@/stores/app-plugin-store"

type UseProviderDetectionArgs = {
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState>
  setPluginSettings: (value: PluginSettings | null) => void
  setLoadingForPlugins: (ids: string[]) => void
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>
}

/** Usage, or any error but "nothing set up": an expired login or a 429 still means the user has it. */
function isFound(id: string, state: PluginState) {
  // Copilot signs in with the GitHub CLI's login, which any GitHub user has: only a Copilot plan proves Copilot.
  if (id === "copilot") return Boolean(state.data?.plan)
  return Boolean(state.data) || !isNotSetUpError(state.error ?? "")
}

/**
 * A new install starts with every provider off and probes them all once: each plugin's own login
 * lookup is the detector, and what it finds is turned on. The settings are saved once every
 * provider is decided, so a start cut short (quit, crash, probes that can't start) detects again.
 */
export function useProviderDetection({
  pluginSettings,
  pluginStates,
  setPluginSettings,
  setLoadingForPlugins,
  startBatch,
}: UseProviderDetectionArgs) {
  const pending = useRef(new Set<string>())

  const detectProviders = useCallback(
    async (ids: string[]) => {
      for (const id of ids) pending.current.add(id)
      setLoadingForPlugins(ids)
      try {
        await startBatch(ids)
      } catch (error) {
        console.error("Failed to start provider detection:", error)
        pending.current.clear()
      }
    },
    [setLoadingForPlugins, startBatch]
  )

  // Runs on new results and on settings changes. Reads the store, not the render's copy: a WSL card
  // added meanwhile (`handlePluginsChanged`) must not be written over.
  useEffect(() => {
    const current = useAppPluginStore.getState().pluginSettings
    if (!current || pending.current.size === 0) return
    const found = new Set<string>()
    for (const id of [...pending.current]) {
      const state = pluginStates[id]
      // Turned on by the user meanwhile: theirs to decide.
      if (!current.disabled.includes(id)) pending.current.delete(id)
      else if (state && !state.loading) {
        pending.current.delete(id)
        if (isFound(id, state)) found.add(id)
      }
    }
    const next = found.size > 0 ? { ...current, disabled: current.disabled.filter((id) => !found.has(id)) } : current
    if (next !== current) setPluginSettings(next)
    if (pending.current.size === 0) {
      void savePluginSettings(next).catch((error) => console.error("Failed to save detected providers:", error))
    }
  }, [pluginSettings, pluginStates, setPluginSettings])

  return { detectProviders }
}
