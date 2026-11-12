import { useCallback, useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { insertAccount, type AccountsChange, type PluginsChange } from "@/lib/accounts"
import type { PluginMeta } from "@/lib/plugin-types"
import { normalizePluginSettings, savePluginSettings, type PluginSettings } from "@/lib/settings"
import { useAppPluginStore } from "@/stores/app-plugin-store"

const TRAY_SETTINGS_DEBOUNCE_MS = 2000

type ScheduleTrayIconUpdate = (reason: "probe" | "settings" | "init", delayMs?: number) => void

type UseSettingsPluginActionsArgs = {
  pluginSettings: PluginSettings | null
  setPluginSettings: (value: PluginSettings | null) => void
  setPluginsMeta: (value: PluginMeta[]) => void
  setLoadingForPlugins: (ids: string[]) => void
  setErrorForPlugins: (ids: string[], error: string) => void
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>
  scheduleTrayIconUpdate: ScheduleTrayIconUpdate
}

export function useSettingsPluginActions({
  pluginSettings,
  setPluginSettings,
  setPluginsMeta,
  setLoadingForPlugins,
  setErrorForPlugins,
  startBatch,
  scheduleTrayIconUpdate,
}: UseSettingsPluginActionsArgs) {
  const handleReorder = useCallback((orderedIds: string[]) => {
    if (!pluginSettings) return
    // orderedIds may be a subset (e.g. nav-only, excluding disabled plugins).
    // Re-insert any missing IDs from the previous order at their original
    // relative positions so disabled plugins are not dropped.
    const orderedSet = new Set(orderedIds)
    const missing = (pluginSettings.order ?? []).filter((id) => !orderedSet.has(id))
    const merged = [...orderedIds]
    for (const id of missing) {
      const prevIdx = (pluginSettings.order ?? []).indexOf(id)
      // Insert after the last merged entry whose original index < prevIdx
      let insertAt = 0 // default: prepend if id originally preceded all visible entries
      for (let i = merged.length - 1; i >= 0; i--) {
        const mergedPrevIdx = (pluginSettings.order ?? []).indexOf(merged[i])
        if (mergedPrevIdx < prevIdx) {
          insertAt = i + 1
          break
        }
      }
      merged.splice(insertAt, 0, id)
    }
    const nextSettings: PluginSettings = {
      ...pluginSettings,
      order: merged,
    }
    setPluginSettings(nextSettings)
    scheduleTrayIconUpdate("settings", TRAY_SETTINGS_DEBOUNCE_MS)
    void savePluginSettings(nextSettings).catch((error) => {
      console.error("Failed to save plugin order:", error)
    })
  }, [pluginSettings, scheduleTrayIconUpdate, setPluginSettings])

  const handleToggle = useCallback((id: string) => {
    if (!pluginSettings) return
    const wasDisabled = pluginSettings.disabled.includes(id)
    const disabled = new Set(pluginSettings.disabled)

    if (wasDisabled) {
      disabled.delete(id)
      setLoadingForPlugins([id])
      startBatch([id]).catch((error) => {
        console.error("Failed to start probe for enabled plugin:", error)
        setErrorForPlugins([id], "Failed to start probe")
      })
    } else {
      disabled.add(id)
    }

    const nextSettings: PluginSettings = {
      ...pluginSettings,
      disabled: Array.from(disabled),
    }
    setPluginSettings(nextSettings)
    scheduleTrayIconUpdate("settings", TRAY_SETTINGS_DEBOUNCE_MS)
    void savePluginSettings(nextSettings).catch((error) => {
      console.error("Failed to save plugin toggle:", error)
    })
  }, [
    pluginSettings,
    scheduleTrayIconUpdate,
    setErrorForPlugins,
    setLoadingForPlugins,
    setPluginSettings,
    startBatch,
  ])

  /**
   * After the plugin list changed in the host (an account added or removed in `accounts.rs`, WSL
   * cards found or gone in `wsl.rs`): reload the list, put each new card right after its provider,
   * turned on, and probe it; drop the removed ones.
   */
  // A change that arrives before the settings load (the host can rescan during bootstrap) waits here.
  const pendingChanges = useRef<PluginsChange[]>([])

  const handlePluginsChanged = useCallback(
    async (change: PluginsChange) => {
      if (!pluginSettings) {
        pendingChanges.current.push(change)
        return
      }
      try {
        const metas = await invoke<PluginMeta[]>("list_plugins")
        setPluginsMeta(metas)
        // Read after the await: a provider a new install's detection turned on meanwhile must stay on.
        const current = useAppPluginStore.getState().pluginSettings ?? pluginSettings
        const removed = new Set(change.removed)
        let order = current.order.filter((id) => !removed.has(id))
        let disabled = current.disabled.filter((id) => !removed.has(id))
        for (const added of change.added) {
          order = insertAccount(order, added.id, added.plugin)
          disabled = disabled.filter((id) => id !== added.id)
        }
        const nextSettings = normalizePluginSettings({ order, disabled }, metas)
        setPluginSettings(nextSettings)
        scheduleTrayIconUpdate("settings", TRAY_SETTINGS_DEBOUNCE_MS)
        await savePluginSettings(nextSettings)
        const addedIds = change.added.map((added) => added.id)
        if (addedIds.length > 0) {
          setLoadingForPlugins(addedIds)
          startBatch(addedIds).catch((error) => {
            console.error("Failed to start a probe for new cards:", error)
            setErrorForPlugins(addedIds, "Failed to start probe")
          })
        }
      } catch (error) {
        console.error("Failed to update the plugin list after it changed:", error)
      }
    },
    [pluginSettings, scheduleTrayIconUpdate, setErrorForPlugins, setLoadingForPlugins, setPluginSettings, setPluginsMeta, startBatch]
  )

  useEffect(() => {
    if (!pluginSettings || pendingChanges.current.length === 0) return
    // Net effect of the waiting changes, in order: a card added and later removed ends up removed.
    const net = new Map<string, { id: string; plugin: string } | null>()
    for (const change of pendingChanges.current.splice(0)) {
      for (const added of change.added) net.set(added.id, added)
      for (const id of change.removed) net.set(id, null)
    }
    void handlePluginsChanged({
      added: [...net.values()].filter((added): added is { id: string; plugin: string } => added !== null),
      removed: [...net.entries()].filter(([, added]) => added === null).map(([id]) => id),
    })
  }, [pluginSettings, handlePluginsChanged])

  const handleAccountsChanged = useCallback(
    (change: AccountsChange) =>
      handlePluginsChanged({
        added: change.added ? [change.added] : [],
        removed: change.removedId ? [change.removedId] : [],
      }),
    [handlePluginsChanged]
  )

  return {
    handleReorder,
    handleToggle,
    handleAccountsChanged,
    handlePluginsChanged,
  }
}
