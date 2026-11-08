import { useEffect } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { showNotifications } from "@/hooks/app/use-usage-alerts"
import { hasUsageLogs } from "@/components/usage-heatmap"
import { monthRange, type Projects } from "@/components/usage-projects"
import { getLocale } from "@/lib/i18n"
import type { PluginMeta } from "@/lib/plugin-types"
import { collectBudgetAlerts, monthKey, type BudgetAlert } from "@/lib/project-budgets"
import { loadProjectBudgets, loadSentProjectAlerts, saveSentProjectAlerts, type AlertSettings } from "@/lib/settings"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

/** As often as ccusage's report for the month is reused (`ccusage_cache.rs`). */
export const BUDGET_CHECK_MS = 15 * 60_000

/**
 * Project budget notifications, checked every 15 minutes while the app runs, panel open or not:
 * only for enabled Claude and Codex cards that have a budget, and only with notifications on.
 */
export function useProjectBudgetAlerts({
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
  const budgets = useAppPreferencesStore((state) => state.projectBudgets)
  const currency = useAppPreferencesStore((state) => state.currency)

  // The budgets live in settings; the projects list edits them through the store.
  useEffect(() => {
    loadProjectBudgets()
      .then((loaded) => useAppPreferencesStore.getState().setProjectBudgets(loaded))
      .catch((error) => console.error("Failed to load project budgets:", error))
  }, [])

  useEffect(() => {
    const ids = Object.keys(budgets).filter((id) => enabledIds.includes(id) && hasUsageLogs(id))
    if (!enabled || !isTauri() || ids.length === 0) return
    let live = true
    let running = false
    const check = async () => {
      if (running) return
      running = true
      try {
        const sent = new Set(await loadSentProjectAlerts())
        const range = monthRange(new Date(), 0)
        const month = monthKey(range.startMs)
        const names = new Map(pluginsMeta.map((plugin) => [plugin.id, plugin.name]))
        const alerts: BudgetAlert[] = []
        for (const id of ids) {
          const projects = await invoke<Projects>("usage_projects", { pluginId: id, ...range })
          alerts.push(
            ...collectBudgetAlerts({
              pluginId: id,
              providerName: names.get(id) ?? id,
              month,
              projects,
              budgets: budgets[id],
              sent,
              currency,
              locale: getLocale(),
            })
          )
        }
        if (!live || alerts.length === 0) return
        if (!(await showNotifications(alerts, settings))) return
        for (const alert of alerts) alert.keys.forEach((key) => sent.add(key))
        await saveSentProjectAlerts([...sent])
      } catch (error) {
        console.error("Failed to check project budgets:", error)
      } finally {
        running = false
      }
    }
    void check()
    const timer = setInterval(() => void check(), BUDGET_CHECK_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [budgets, currency, enabled, enabledIds, pluginsMeta, settings])
}
