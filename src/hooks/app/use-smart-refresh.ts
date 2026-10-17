import { useEffect, useRef, useState } from "react"
import type { PluginState } from "@/hooks/app/types"
import type { PluginSettings } from "@/lib/settings"
import { completeSmartCheck, MINUTE, newSmartSchedule, type SmartSchedule } from "@/lib/smart-refresh"

type Entry = SmartSchedule & { observed?: PluginState }
const EMPTY_STATES: Record<string, PluginState> = {}

export function useSmartRefresh({
  enabled,
  pluginSettings,
  pluginStates = EMPTY_STATES,
  setLoadingForPlugins,
  setErrorForPlugins,
  startBatch,
}: {
  enabled: boolean
  pluginSettings: PluginSettings | null
  pluginStates?: Record<string, PluginState>
  setLoadingForPlugins: (ids: string[]) => void
  setErrorForPlugins: (ids: string[], error: string) => void
  startBatch: (ids?: string[], cacheLocalUsage?: boolean) => Promise<string[] | undefined>
}) {
  const entries = useRef(new Map<string, Entry>())
  const [nextAt, setNextAt] = useState<number | null>(null)
  const [wake, setWake] = useState(0)

  useEffect(() => {
    if (!enabled || !pluginSettings) {
      entries.current.clear()
      setNextAt(null)
      return
    }
    const ids = pluginSettings.order.filter((id) => !pluginSettings.disabled.includes(id))
    for (const id of entries.current.keys()) if (!ids.includes(id)) entries.current.delete(id)
    const now = Date.now()
    for (const id of ids) {
      const state = pluginStates[id]
      let entry: Entry = entries.current.get(id) ?? newSmartSchedule(now)
      if (state && state !== entry.observed) {
        entry = state.loading
          ? { ...entry, nextAt: null }
          : completeSmartCheck(entry, state.data, !!state.error, now)
      }
      entries.current.set(id, { ...entry, observed: state })
    }
    const times = [...entries.current.values()].flatMap((entry) => entry.nextAt == null ? [] : [entry.nextAt])
    const next = times.length ? Math.min(...times) : null
    setNextAt(next)
    if (next == null) return
    const timer = window.setTimeout(() => {
      const due = ids.filter((id) => {
        const entry = entries.current.get(id)
        return entry?.nextAt != null && entry.nextAt <= Date.now() && !pluginStates[id]?.loading
      })
      if (!due.length) return
      for (const id of due) entries.current.get(id)!.nextAt = null
      setLoadingForPlugins(due)
      startBatch(due, true).catch((error) => {
        console.error("Failed to start smart refresh:", error)
        setErrorForPlugins(due, "Failed to start probe")
      })
    }, Math.max(0, next - now))
    return () => window.clearTimeout(timer)
  }, [enabled, pluginSettings, pluginStates, setLoadingForPlugins, setErrorForPlugins, startBatch, wake])

  // Opening the panel refreshes old data, but never bypasses an account's error backoff.
  useEffect(() => {
    if (!enabled) return
    const refreshVisible = () => {
      if (document.visibilityState !== "visible") return
      const now = Date.now()
      let changed = false
      for (const entry of entries.current.values()) {
        if (entry.nextAt != null && !entry.failures && now - entry.completedAt >= MINUTE) {
          entry.nextAt = now
          changed = true
        }
      }
      if (changed) setWake((value) => value + 1)
    }
    window.addEventListener("focus", refreshVisible)
    document.addEventListener("visibilitychange", refreshVisible)
    return () => {
      window.removeEventListener("focus", refreshVisible)
      document.removeEventListener("visibilitychange", refreshVisible)
    }
  }, [enabled])
  return nextAt
}
