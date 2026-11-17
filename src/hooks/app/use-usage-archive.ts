import { useEffect } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { hasUsageLogs } from "@/components/usage-heatmap"
import { utcOffsetMinutes } from "@/components/year-heatmap"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

/** Claude Code deletes transcripts after 30 days by default: a few runs a day keep every day seen. */
export const ARCHIVE_EVERY_MS = 6 * 3_600_000
/** After the start's probes, which read the same logs' neighbours. */
export const ARCHIVE_FIRST_MS = 2 * 60_000

export const EXPORT_EVERY_MS = 24 * 3_600_000
const EXPORT_FIRST_MS = 3 * 60_000

/** Settings → App → Usage export, "Every day": written quietly (not shown in Explorer). */
export function useDailyUsageExport() {
  const features = useAppPreferencesStore((state) => state.cardFeatures)
  const on = features.autoExport
  const keep = features.keepUsage
  useEffect(() => {
    if (!on || !isTauri()) return
    const run = () =>
      invoke("export_usage", { utcOffsetMinutes: utcOffsetMinutes(), keep, reveal: false }).catch((error) =>
        console.error("Failed to write the daily usage export:", error)
      )
    const first = window.setTimeout(() => void run(), EXPORT_FIRST_MS)
    const timer = window.setInterval(() => void run(), EXPORT_EVERY_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [on, keep])
}

/**
 * "Keep deleted usage": brings `usage-archive.json` up to date for each enabled Claude/Codex card,
 * panel open or not, so a day is kept before its logs are deleted.
 */
export function useUsageArchive(enabledIds: string[]) {
  const keep = useAppPreferencesStore((state) => state.cardFeatures.keepUsage)
  const ids = enabledIds.filter(hasUsageLogs).join(",")

  useEffect(() => {
    if (!keep || ids === "" || !isTauri()) return
    const run = async () => {
      // One card at a time: each reads its logs on the host's blocking pool.
      for (const pluginId of ids.split(",")) {
        await invoke("usage_year", { pluginId, utcOffsetMinutes: utcOffsetMinutes(), keep: true }).catch((error) =>
          console.error("Failed to keep the usage archive:", error)
        )
      }
    }
    const first = window.setTimeout(() => void run(), ARCHIVE_FIRST_MS)
    const timer = window.setInterval(() => void run(), ARCHIVE_EVERY_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [keep, ids])
}
