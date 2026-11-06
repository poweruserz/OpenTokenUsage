import { useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import type { PluginState } from "@/hooks/app/types"
import { t } from "@/lib/i18n"
import { getPluginErrorAction } from "@/lib/plugin-errors"
import type { PluginMeta } from "@/lib/plugin-types"
import type { AlertSettings } from "@/lib/settings"

export const LOGIN_CHECK_MS = 5_000

/** A card whose error asks for a sign-in: its one-click fix runs a login command. */
export function needsSignIn(state: PluginState | undefined) {
  return !!state?.error && getPluginErrorAction(state.error)?.kind === "run"
}

async function notifySignIn(provider: string, settings: AlertSettings) {
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === "granted"
  if (!granted) return
  sendNotification({ title: t("alert.signIn.title", { provider }), body: t("alert.signIn.body") })
  await invoke("play_alert_sound", { sound: settings.sound, preview: false })
}

/**
 * While an enabled card asks for a sign-in, checks every few seconds when its CLI last wrote the
 * login file (`login_stamp.rs`) and probes it again the moment a sign-in lands, instead of at the
 * next refresh. A card that loses its sign-in after working in this run says so once with a toast.
 */
export function useLoginRecovery({
  pluginStates,
  pluginsMeta,
  enabledIds,
  notify,
  alertSettings,
  setLoadingForPlugins,
  setErrorForPlugins,
  startBatch,
}: {
  pluginStates: Record<string, PluginState | undefined>
  pluginsMeta: PluginMeta[]
  enabledIds: string[]
  notify: boolean
  alertSettings: AlertSettings
  setLoadingForPlugins: (ids: string[]) => void
  setErrorForPlugins: (ids: string[], error: string) => void
  startBatch: (ids?: string[]) => Promise<string[] | undefined>
}) {
  const waitingKey = enabledIds
    .filter((id) => needsSignIn(pluginStates[id]))
    .sort()
    .join(",")
  // The login file's time when the card started waiting; a later write is a new sign-in. Kept while
  // the probe it started runs: a sign-in that lands meanwhile still differs once the card waits again.
  const stampsRef = useRef(new Map<string, number | null>())
  const failedRef = useRef(new Set<string>())
  const probeRef = useRef<(id: string) => void>(() => {})
  useEffect(() => {
    probeRef.current = (id: string) => {
      setLoadingForPlugins([id])
      startBatch([id]).catch((error) => {
        console.error("Failed to probe after sign-in:", error)
        setErrorForPlugins([id], "Failed to start probe")
      })
    }
  }, [setLoadingForPlugins, setErrorForPlugins, startBatch])

  useEffect(() => {
    for (const id of stampsRef.current.keys()) {
      const state = pluginStates[id]
      if (!enabledIds.includes(id) || (!state?.loading && !needsSignIn(state))) stampsRef.current.delete(id)
    }
  }, [pluginStates, enabledIds])

  useEffect(() => {
    const ids = waitingKey ? waitingKey.split(",") : []
    if (ids.length === 0) return
    let cancelled = false
    const check = async () => {
      for (const id of ids) {
        let stamp: number | null = null
        try {
          stamp = await invoke<number | null>("login_file_stamp", { pluginId: id })
          failedRef.current.delete(id)
        } catch (error) {
          // Once per failure, not every 5 seconds; the card keeps its sign-in error meanwhile.
          if (!failedRef.current.has(id)) console.error(`Failed to check ${id}'s login file:`, error)
          failedRef.current.add(id)
          continue
        }
        if (cancelled) return
        const stamps = stampsRef.current
        if (!stamps.has(id)) {
          stamps.set(id, stamp)
        } else if (stamp != null && stamp !== stamps.get(id)) {
          stamps.set(id, stamp)
          probeRef.current(id)
        }
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), LOGIN_CHECK_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [waitingKey])

  // Cards seen working in this run (cached data from an earlier run doesn't count), and those
  // already toasted for the sign-in they lost.
  const workedRef = useRef(new Set<string>())
  const toastedRef = useRef(new Set<string>())
  useEffect(() => {
    const names = new Map(pluginsMeta.map((plugin) => [plugin.id, plugin.name]))
    for (const [id, state] of Object.entries(pluginStates)) {
      if (!state || state.loading) continue
      if (!state.error) {
        if (state.data && state.data.staleSince == null) workedRef.current.add(id)
        toastedRef.current.delete(id)
        continue
      }
      if (!needsSignIn(state) || !workedRef.current.has(id) || toastedRef.current.has(id)) continue
      if (!enabledIds.includes(id)) continue
      toastedRef.current.add(id)
      if (notify) {
        notifySignIn(names.get(id) ?? state.data?.displayName ?? id, alertSettings).catch((error) =>
          console.error("Failed to show the sign-in notification:", error)
        )
      }
    }
  }, [pluginStates, pluginsMeta, enabledIds, notify, alertSettings])
}
