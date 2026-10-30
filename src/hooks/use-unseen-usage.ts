import { useEffect, useReducer, useState, useSyncExternalStore } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"

export const UNSEEN_BLINK_MS = 3_500
export const UNSEEN_SETTLE_MS = 700

/** Usage a bar gained while nobody looked: `from` is the used percent last seen in the open panel. */
export type UnseenUsage = { from: number; settling: boolean }

// Used percent each bar last showed in the open panel, by plugin + line. Page switches keep it; a
// restart starts over from the first data.
const seenUsed = new Map<string, number>()
// The last usage each bar got, seen or not: dropping below it is a reset, even when it stays above
// what was seen.
const latestUsed = new Map<string, number>()

// Asked from the OS: before its first show the hidden panel's webview reports itself visible.
let panelOpen = false
const listeners = new Set<() => void>()

function checkPanel() {
  getCurrentWindow()
    .isVisible()
    .then((open) => {
      if (open === panelOpen) return
      panelOpen = open
      for (const listener of listeners) listener()
    })
    .catch((error) => console.error("Failed to read the panel's visibility:", error))
}

const PANEL_EVENTS = ["focus", "blur"] as const

function subscribePanel(listener: () => void) {
  if (listeners.size === 0 && isTauri()) {
    for (const event of PANEL_EVENTS) window.addEventListener(event, checkPanel)
    document.addEventListener("visibilitychange", checkPanel)
    checkPanel()
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    for (const event of PANEL_EVENTS) window.removeEventListener(event, checkPanel)
    document.removeEventListener("visibilitychange", checkPanel)
  }
}

/**
 * The usage `key`'s bar gained since the open panel last showed it. It is drawn while the panel is
 * hidden too, so opening the panel doesn't first show the new fill and then take it back; once the
 * panel is open it blinks, then the fill grows over it and it counts as seen.
 */
export function useUnseenUsage(key: string | null, used: number): UnseenUsage | null {
  const open = useSyncExternalStore(subscribePanel, () => panelOpen)
  const [settling, setSettling] = useState(false)
  // `seenUsed` lives outside React: re-render when it changes, even if `settling` ends where it began.
  const [, markSeen] = useReducer((count: number) => count + 1, 0)
  const seen = key === null ? undefined : seenUsed.get(key)
  const latest = key === null ? undefined : latestUsed.get(key)
  const isReset = latest !== undefined && used < latest
  const from = seen !== undefined && used > seen && !isReset ? seen : null

  useEffect(() => {
    if (key === null) return
    latestUsed.set(key, used)
    if (from === null) {
      // First data, or a reset: nothing was spent unseen, so it starts from here.
      seenUsed.set(key, used)
      return
    }
    setSettling(false)
    if (!open) return
    const settle = window.setTimeout(() => setSettling(true), UNSEEN_BLINK_MS)
    const done = window.setTimeout(() => {
      seenUsed.set(key, used)
      setSettling(false)
      markSeen()
    }, UNSEEN_BLINK_MS + UNSEEN_SETTLE_MS)
    return () => {
      window.clearTimeout(settle)
      window.clearTimeout(done)
    }
  }, [key, used, from, open])

  return from === null ? null : { from, settling }
}
