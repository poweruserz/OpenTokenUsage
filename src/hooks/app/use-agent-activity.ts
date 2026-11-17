import { useEffect, useRef, useState } from "react"
import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { t } from "@/lib/i18n"
import type { AgentActivity } from "@/lib/taskbar-strip"

export const AGENT_ACTIVITY_POLL_MS = 5_000
const NONE: Record<string, AgentActivity> = {}

export const TOKEN_RATE_POLL_MS = 30_000
const NO_RATES: Record<string, number> = {}

/** The live token rates (`token_rates`), also read by the tray tooltip outside React. */
export const useTokenRateStore = create<{ rates: Record<string, number> }>(() => ({ rates: NO_RATES }))

/** A rate as the strip, widgets and tray write it: "1.2M/min". */
export function formatTokenRate(perMinute: number, locale: string): string {
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })
  return t("rate.perMinute", { tokens: compact.format(perMinute) })
}

/** Each Claude/Codex card's tokens per minute over the last few minutes, read every 30 s while on. */
export function useTokenRates(enabled: boolean): Record<string, number> {
  const tick = useNowTicker({ enabled, intervalMs: TOKEN_RATE_POLL_MS, pauseWhenHidden: false })
  const rates = useTokenRateStore((state) => state.rates)

  useEffect(() => {
    if (!enabled) {
      useTokenRateStore.setState({ rates: NO_RATES })
      return
    }
    let cancelled = false
    invoke<Record<string, number>>("token_rates")
      .then((raw) => {
        if (cancelled) return
        const next = Object.fromEntries(
          Object.entries(raw).filter((entry) => typeof entry[1] === "number" && entry[1] > 0)
        )
        // Rounded so a redraw only follows a change the strip would show.
        const same = (a: Record<string, number>, b: Record<string, number>) =>
          Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => Math.round(a[k]!) === Math.round(b[k] ?? -1))
        const current = useTokenRateStore.getState().rates
        if (!same(current, next)) useTokenRateStore.setState({ rates: next })
      })
      .catch((error) => console.error("Failed to read token rates:", error))
    return () => {
      cancelled = true
    }
  }, [enabled, tick])

  return enabled ? rates : NO_RATES
}

function sameActivity(a: Record<string, AgentActivity>, b: Record<string, AgentActivity>) {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

/**
 * What each Claude/Codex card's live sessions do (`agent_activity`), for the dot on the strip's and
 * widgets' logos. Read every 5 s while either shows, panel hidden or not.
 */
export function useAgentActivity(enabled: boolean): Record<string, AgentActivity> {
  const [activity, setActivity] = useState(NONE)
  const tick = useNowTicker({ enabled, intervalMs: AGENT_ACTIVITY_POLL_MS, pauseWhenHidden: false })
  const failedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    invoke<Record<string, string>>("agent_activity")
      .then((raw) => {
        failedRef.current = false
        const next = Object.fromEntries(
          Object.entries(raw).filter((entry): entry is [string, AgentActivity] => entry[1] === "busy" || entry[1] === "waiting")
        )
        // Same answer: keep the object, or the strip and widgets would draw again every 5 s.
        if (!cancelled) setActivity((current) => (sameActivity(current, next) ? current : next))
      })
      .catch((error) => {
        if (!failedRef.current) console.error("Failed to read agent activity:", error)
        failedRef.current = true
      })
    return () => {
      cancelled = true
    }
  }, [enabled, tick])

  return enabled ? activity : NONE
}

/** The AI tools running now (`running_ai_tools`, base plugin ids), read every 5 s; null while off or unknown. */
export function useRunningTools(enabled: boolean): string[] | null {
  const [running, setRunning] = useState<string[] | null>(null)
  const tick = useNowTicker({ enabled, intervalMs: AGENT_ACTIVITY_POLL_MS, pauseWhenHidden: false })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    invoke<string[]>("running_ai_tools")
      .then((next) => {
        // Same answer: keep the array, or the strip would draw again every 5 s.
        if (!cancelled) setRunning((current) => (current?.join() === next.join() ? current : next))
      })
      .catch((error) => console.error("Failed to read the running AI tools:", error))
    return () => {
      cancelled = true
    }
  }, [enabled, tick])

  return enabled ? running : null
}

/**
 * Follow the active app: the base plugin id of the focused window's AI tool (`foreground.rs`), the
 * last one seen while the window in front matches none. Null while off or before any.
 */
export function useForegroundProvider(enabled: boolean): string | null {
  const [provider, setProvider] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    const follow = (on: boolean) =>
      invoke("set_follow_foreground", { enabled: on }).catch((error) =>
        console.error("Failed to switch following the active app:", error)
      )
    void follow(true)
    let cancelled = false
    let unlisten: (() => void) | undefined
    listen<unknown>("foreground:provider", (event) => {
      if (typeof event.payload === "string" && /^[a-z0-9-]+$/.test(event.payload)) setProvider(event.payload)
    })
      .then((stop) => (cancelled ? stop() : (unlisten = stop)))
      .catch((error) => console.error("Failed to listen for the active app:", error))
    return () => {
      cancelled = true
      unlisten?.()
      void follow(false)
    }
  }, [enabled])

  return enabled ? provider : null
}
