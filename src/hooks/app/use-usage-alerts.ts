import { useNowTicker } from "@/hooks/use-now-ticker"
import { useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import type { PluginState } from "@/hooks/app/types"
import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import {
  getEnabledPluginIds,
  loadSentUsageAlerts,
  saveSentUsageAlerts,
  type AlertSettings,
  type DisplayMode,
  type PluginSettings
} from "@/lib/settings"
import { collectResetCreditAlerts, collectUsageAlerts, type UsageAlert } from "@/lib/usage-alerts"

// The toasts stay silent (an unpackaged app can't give them its own sound); one sound per batch
// is played by the host, which also keeps quiet during Do Not Disturb.
async function showNotifications(alerts: UsageAlert[], settings: AlertSettings) {
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === "granted"
  if (!granted) return false
  for (const alert of alerts) sendNotification({ title: alert.title, body: alert.body })
  await invoke("play_alert_sound", { sound: settings.sound, preview: false }).catch((error) =>
    console.error("Failed to play usage notification sound:", error)
  )
  return true
}

/** Usage alerts on fresh probes; expiry reminders also run each minute while the panel is hidden. */
export function useUsageAlerts({
  pluginStates,
  pluginsMeta,
  pluginSettings,
  enabled,
  settings,
  displayMode
}: {
  pluginStates: Record<string, PluginState | undefined>
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  enabled: boolean
  settings: AlertSettings
  displayMode: DisplayMode
}) {
  // Keys of alerts already shown; persisted so a restart doesn't repeat them. null = still loading.
  const now = useNowTicker({ enabled, intervalMs: 60_000, pauseWhenHidden: false })
  const [loaded, setLoaded] = useState(false)
  const sentRef = useRef<Set<string> | null>(null)
  const pendingRef = useRef(new Set<string>())
  const previousRef = useRef<Record<string, PluginOutput>>({})

  useEffect(() => {
    loadSentUsageAlerts()
      .then((keys) => {
        sentRef.current = new Set(keys)
        setLoaded(true)
      })
      .catch((error) => {
        console.error("Failed to load sent usage alerts:", error)
        sentRef.current = new Set()
        setLoaded(true)
      })
  }, [])

  useEffect(() => {
    const sent = sentRef.current
    const names = new Map(pluginsMeta.map((plugin) => [plugin.id, plugin.name]))
    // A disabled or removed account keeps its cached state but is no longer refreshed: the minute
    // ticker would otherwise remind about credits that may have been spent elsewhere since.
    const enabledIds = new Set(pluginSettings ? getEnabledPluginIds(pluginSettings) : [])
    const alerts: UsageAlert[] = []
    for (const [id, state] of Object.entries(pluginStates)) {
      const data = state?.data
      const previous = previousRef.current[id]
      if (!data || data.staleSince || state?.error || !enabled || !sent || !enabledIds.has(id)) continue
      alerts.push(
        ...collectResetCreditAlerts({
          pluginId: id,
          providerName: names.get(id) ?? data.displayName,
          lines: data.lines,
          sent,
          nowMs: now
        })
      )
      if (data === previous) continue
      previousRef.current[id] = data
      alerts.push(
        ...collectUsageAlerts({
          pluginId: id,
          providerName: names.get(id) ?? data.displayName,
          lines: data.lines,
          previousLines: previous?.lines,
          sent,
          nowMs: Date.now(),
          levels: settings.levels,
          displayMode
        })
      )
    }
    const ready = alerts.filter((alert) => !alert.keys.some((key) => pendingRef.current.has(key)))
    if (!sent || ready.length === 0) return
    ready.forEach((alert) => alert.keys.forEach((key) => pendingRef.current.add(key)))
    void showNotifications(ready, settings)
      .then(async (shown) => {
        if (!shown) return
        for (const alert of ready) alert.keys.forEach((key) => sent.add(key))
        await saveSentUsageAlerts([...sent])
      })
      .catch((error) => console.error("Failed to show or save usage notification:", error))
      .finally(() => ready.forEach((alert) => alert.keys.forEach((key) => pendingRef.current.delete(key))))
  }, [pluginStates, pluginsMeta, pluginSettings, enabled, settings, displayMode, now, loaded])
}
