import { useMemo } from "react"
import type { PluginState } from "@/hooks/app/types"
import { needsSignIn } from "@/hooks/app/use-login-recovery"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"

export type SettingsPluginState = {
  id: string
  name: string
  enabled: boolean
  /** The card's error while it asks for a sign-in (Settings offers it there too), else null. */
  signInError: string | null
}

type UseSettingsPluginListArgs = {
  pluginSettings: PluginSettings | null
  pluginsMeta: PluginMeta[]
  pluginStates?: Record<string, PluginState | undefined>
}

export function useSettingsPluginList({ pluginSettings, pluginsMeta, pluginStates }: UseSettingsPluginListArgs) {
  return useMemo<SettingsPluginState[]>(() => {
    if (!pluginSettings) return []
    const pluginMap = new Map(pluginsMeta.map((plugin) => [plugin.id, plugin]))

    return pluginSettings.order
      .map((id) => {
        const meta = pluginMap.get(id)
        if (!meta) return null
        const state = pluginStates?.[id]
        return {
          id,
          name: meta.name,
          enabled: !pluginSettings.disabled.includes(id),
          signInError: needsSignIn(state) ? (state?.error ?? null) : null,
        }
      })
      .filter((plugin): plugin is SettingsPluginState => Boolean(plugin))
  }, [pluginSettings, pluginsMeta, pluginStates])
}
