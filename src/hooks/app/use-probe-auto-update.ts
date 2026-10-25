import { useCallback, useEffect, useState } from "react"
import type { PluginState } from "@/hooks/app/types"
import { useSmartRefresh } from "@/hooks/app/use-smart-refresh"
import {
  getEnabledPluginIds,
  type AutoUpdateInterval,
  type PluginSettings,
} from "@/lib/settings"

type UseProbeAutoUpdateArgs = {
  pluginSettings: PluginSettings | null
  autoUpdateInterval: AutoUpdateInterval
  pluginStates?: Record<string, PluginState>
  setLoadingForPlugins: (ids: string[]) => void
  setErrorForPlugins: (ids: string[], error: string) => void
  isPluginLoading: (id: string) => boolean
  startBatch: (pluginIds?: string[], cacheLocalUsage?: boolean) => Promise<string[] | undefined>
}

export function useProbeAutoUpdate({
  pluginSettings,
  autoUpdateInterval,
  pluginStates,
  setLoadingForPlugins,
  setErrorForPlugins,
  isPluginLoading,
  startBatch,
}: UseProbeAutoUpdateArgs) {
  const [autoUpdateNextAt, setAutoUpdateNextAt] = useState<number | null>(null)
  const [autoUpdateResetToken, setAutoUpdateResetToken] = useState(0)
  const smartNextAt = useSmartRefresh({
    enabled: autoUpdateInterval === "smart",
    pluginSettings,
    pluginStates,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
  })

  useEffect(() => {
    if (!pluginSettings || autoUpdateInterval === "smart") {
      setAutoUpdateNextAt(null)
      return
    }

    const enabledIds = getEnabledPluginIds(pluginSettings)
    if (enabledIds.length === 0) {
      setAutoUpdateNextAt(null)
      return
    }

    const intervalMs = autoUpdateInterval * 60_000
    const scheduleNext = () => setAutoUpdateNextAt(Date.now() + intervalMs)
    scheduleNext()

    const interval = setInterval(() => {
      const idleIds = enabledIds.filter((id) => !isPluginLoading(id))
      if (idleIds.length === 0) {
        scheduleNext()
        return
      }

      setLoadingForPlugins(idleIds)
      startBatch(idleIds).catch((error) => {
        console.error("Failed to start auto-update batch:", error)
        setErrorForPlugins(idleIds, "Failed to start probe")
      })
      scheduleNext()
    }, intervalMs)

    return () => clearInterval(interval)
  }, [
    autoUpdateInterval,
    autoUpdateResetToken,
    pluginSettings,
    isPluginLoading,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
  ])

  const resetAutoUpdateSchedule = useCallback(() => {
    // Smart schedules advance per account when its result arrives, including manual refreshes.
    if (autoUpdateInterval === "smart") return
    if (!pluginSettings) return
    const enabledIds = getEnabledPluginIds(pluginSettings)
    /* v8 ignore start */
    if (enabledIds.length === 0) {
      setAutoUpdateNextAt(null)
      return
    }
    /* v8 ignore stop */

    setAutoUpdateNextAt(Date.now() + autoUpdateInterval * 60_000)
    setAutoUpdateResetToken((value) => value + 1)
  }, [autoUpdateInterval, pluginSettings])

  return {
    autoUpdateNextAt: autoUpdateInterval === "smart" ? smartNextAt : autoUpdateNextAt,
    setAutoUpdateNextAt,
    resetAutoUpdateSchedule,
  }
}
