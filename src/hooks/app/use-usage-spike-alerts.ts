import { useEffect, useRef } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { hasUsageLogs } from "@/components/usage-heatmap"
import { showNotifications } from "@/hooks/app/use-usage-alerts"
import { getLocale, t } from "@/lib/i18n"
import type { PluginMeta } from "@/lib/plugin-types"
import type { AlertSettings } from "@/lib/settings"

/** `usage_spikes.rs`: a session using tokens far faster than usual right now. */
export type Spike = { folder: string; tokens: number; times: number }

/** How often the logs are checked; a spike is measured over the last 15 minutes. */
export const SPIKE_CHECK_MS = 5 * 60_000
/** A card's folder that is still running hot notifies again after this. */
export const SPIKE_REPEAT_MS = 60 * 60_000

export function spikeAlert(provider: string, spike: Spike, locale: string) {
  const tokens = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(spike.tokens)
  return {
    title: t("alert.spike.title", { provider, folder: spike.folder || t("projects.unknown") }),
    body: t("alert.spike.body", { tokens, times: Math.round(spike.times) }),
  }
}

/**
 * Notifies when a Claude or Codex session uses tokens far faster than usual (mostly an agent in a loop), checked
 * every 5 minutes while the app runs, panel open or not: for enabled cards with local logs, with notifications
 * and the spike setting on.
 */
export function useUsageSpikeAlerts({
  pluginsMeta,
  enabledIds,
  enabled,
  settings,
}: {
  pluginsMeta: PluginMeta[]
  enabledIds: string[]
  enabled: boolean
  settings: AlertSettings
}) {
  // When each card's folder last notified, kept across effect restarts (an app restart may notify once more).
  const lastRef = useRef(new Map<string, number>())

  useEffect(() => {
    const ids = enabledIds.filter(hasUsageLogs)
    if (!enabled || settings.spikes === false || !isTauri() || ids.length === 0) return
    let live = true
    let running = false
    const check = async () => {
      if (running) return
      running = true
      try {
        const names = new Map(pluginsMeta.map((plugin) => [plugin.id, plugin.name]))
        const alerts: { title: string; body: string }[] = []
        const keys: string[] = []
        for (const id of ids) {
          for (const spike of await invoke<Spike[]>("usage_spikes", { pluginId: id })) {
            const key = `${id}|${spike.folder}`
            const last = lastRef.current.get(key)
            if (last !== undefined && Date.now() - last < SPIKE_REPEAT_MS) continue
            alerts.push(spikeAlert(names.get(id) ?? id, spike, getLocale()))
            keys.push(key)
          }
        }
        if (!live || alerts.length === 0) return
        // Marked before showing, so a check of a restarted effect doesn't notify the same spike twice.
        const at = Date.now()
        keys.forEach((key) => lastRef.current.set(key, at))
        if (!(await showNotifications(alerts, settings))) keys.forEach((key) => lastRef.current.delete(key))
      } catch (error) {
        console.error("Failed to check usage spikes:", error)
      } finally {
        running = false
      }
    }
    void check()
    const timer = setInterval(() => void check(), SPIKE_CHECK_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [enabled, enabledIds, pluginsMeta, settings])
}
