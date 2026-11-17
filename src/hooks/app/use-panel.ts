import { useCallback, useEffect, useRef, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow, PhysicalSize, currentMonitor } from "@tauri-apps/api/window"
import type { ActiveView } from "@/components/side-nav"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import {
  loadPanelWidth,
  normalizePanelWidth,
  PANEL_MIN_WIDTH,
  savePanelWidth,
  SETTINGS_PANEL_WIDTH,
} from "@/lib/settings"

const MAX_HEIGHT_FALLBACK_PX = 600
const MAX_HEIGHT_FRACTION_OF_MONITOR = 0.8

type UsePanelArgs = {
  activeView: ActiveView
  setActiveView: (view: ActiveView) => void
  showAbout: boolean
  setShowAbout: (value: boolean) => void
  displayPlugins: DisplayPluginState[]
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  if (target.isContentEditable) return true
  if (target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")) {
    return true
  }

  return false
}

export function usePanel({
  activeView,
  setActiveView,
  showAbout,
  setShowAbout,
  displayPlugins,
}: UsePanelArgs) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [maxPanelHeightPx, setMaxPanelHeightPx] = useState<number | null>(null)
  const maxPanelHeightPxRef = useRef<number | null>(null)
  // The width (logical px) the panel keeps: read from settings before the first resize, changed by an edge drag.
  const widthRef = useRef(PANEL_MIN_WIDTH)
  // The width (logical px) the window was last given: the kept width, or the settings view's.
  const shownWidthRef = useRef<number | null>(null)
  const [widthReady, setWidthReady] = useState(false)
  const focusContainer = useCallback(() => {
    window.requestAnimationFrame(() => {
      containerRef.current?.focus({ preventScroll: true })
    })
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        focusContainer()
      }
    }

    window.addEventListener("focus", focusContainer)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", focusContainer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [focusContainer])

  useEffect(() => {
    if (!isTauri()) return
    invoke("init_panel").catch(console.error)
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    loadPanelWidth()
      .then((width) => {
        widthRef.current = width
      })
      .catch((e) => console.error("Failed to load the panel width:", e))
      .finally(() => setWidthReady(true))
  }, [])

  /**
   * An edge drag: the panel at `width` (clamped), resized by the host in one move, its right edge kept for the
   * left edge. Not Windows' own sizing loop: in it this transparent window's webview lags behind its frame.
   */
  const resizePanel = useCallback(async (width: number, side: "West" | "East") => {
    const next = normalizePanelWidth(width)
    const previous = widthRef.current
    if (next === previous) return
    widthRef.current = next
    shownWidthRef.current = next
    try {
      await invoke("resize_panel", { fromWidth: previous, width: next, keepRight: side === "West" })
    } catch (error) {
      widthRef.current = previous
      shownWidthRef.current = previous
      throw error
    }
  }, [])
  const panelWidth = useCallback(() => widthRef.current, [])
  const keepPanelWidth = useCallback(() => {
    savePanelWidth(widthRef.current).catch((e) => console.error("Failed to save the panel width:", e))
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    if (showAbout) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // An open panel dialog (Help, Support) takes Escape for itself; this listener runs before
      // theirs, so their preventDefault() comes too late.
      if (e.key === "Escape" && !document.querySelector("[data-panel-dialog]")) {
        invoke("hide_panel")
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [showAbout])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const unlisteners: (() => void)[] = []

    async function setup() {
      const u1 = await listen<string>("tray:navigate", (event) => {
        setActiveView(event.payload as ActiveView)
        focusContainer()
      })
      if (cancelled) {
        u1()
        return
      }
      unlisteners.push(u1)

      const u2 = await listen("tray:show-about", () => {
        setShowAbout(true)
        focusContainer()
      })
      if (cancelled) {
        u2()
        return
      }
      unlisteners.push(u2)
    }

    void setup()

    return () => {
      cancelled = true
      for (const fn of unlisteners) fn()
    }
  }, [focusContainer, setActiveView, setShowAbout])

  useEffect(() => {
    if (showAbout) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      // Ctrl+Up/Down (the Win key combos are taken by Windows window snapping)
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
      if (isEditableTarget(event.target)) return

      const views: ActiveView[] = ["home", ...displayPlugins.map((plugin) => plugin.meta.id)]
      if (views.length === 0) return

      let nextView: ActiveView | undefined

      if (activeView === "settings") {
        nextView = event.key === "ArrowUp" ? views[views.length - 1] : views[0]
      } else {
        const currentIndex = views.indexOf(activeView)
        if (currentIndex === -1) return
        const offset = event.key === "ArrowUp" ? -1 : 1
        nextView = views[(currentIndex + offset + views.length) % views.length]
      }

      if (!nextView || nextView === activeView) return

      event.preventDefault()
      setActiveView(nextView)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeView, displayPlugins, setActiveView, showAbout])

  useEffect(() => {
    if (!isTauri() || !widthReady) return
    const container = containerRef.current
    if (!container) return

    let disposed = false
    const resizeWindow = async () => {
      const factor = window.devicePixelRatio
      const desiredHeightLogical = Math.max(1, container.scrollHeight)

      let maxHeightPhysical: number | null = null
      let maxHeightLogical: number | null = null
      // The settings view's width, narrower on a work area that can't hold it (a portrait screen at a high scale).
      let settingsWidth = SETTINGS_PANEL_WIDTH

      try {
        const monitor = await currentMonitor()
        if (monitor) {
          maxHeightPhysical = Math.floor(monitor.size.height * MAX_HEIGHT_FRACTION_OF_MONITOR)
          maxHeightLogical = Math.floor(maxHeightPhysical / factor)
          const workAreaWidth = Math.floor(monitor.workArea.size.width / factor)
          settingsWidth = Math.max(PANEL_MIN_WIDTH, Math.min(SETTINGS_PANEL_WIDTH, workAreaWidth))
        }
      } catch {
        // fall through to fallback
      }
      if (disposed) return // a run from before a view change; the new view's runs size the panel

      if (maxHeightLogical === null) {
        const screenAvailHeight = Number(window.screen?.availHeight) || MAX_HEIGHT_FALLBACK_PX
        maxHeightLogical = Math.floor(screenAvailHeight * MAX_HEIGHT_FRACTION_OF_MONITOR)
        maxHeightPhysical = Math.floor(maxHeightLogical * factor)
      }

      if (maxPanelHeightPxRef.current !== maxHeightLogical) {
        maxPanelHeightPxRef.current = maxHeightLogical
        setMaxPanelHeightPx(maxHeightLogical)
      }

      const desiredHeightPhysical = Math.ceil(desiredHeightLogical * factor)
      const height = Math.ceil(Math.min(desiredHeightPhysical, maxHeightPhysical!))

      try {
        const win = getCurrentWindow()
        // Read after the await above: an edge drag may have changed the width meanwhile.
        const logicalWidth = activeView === "settings" ? settingsWidth : widthRef.current
        const shown = shownWidthRef.current
        shownWidthRef.current = logicalWidth
        if (shown !== null && shown !== logicalWidth) {
          // Into or out of settings: the host moves the edge the panel's spot needs; setSize then sets the height.
          await invoke("resize_panel", { fromWidth: shown, width: logicalWidth })
        }
        await win.setSize(new PhysicalSize(Math.ceil(logicalWidth * factor), height))

        // Re-anchor the window so its bottom edge stays near the taskbar after every resize.
        await invoke("reanchor_window")
      } catch (e) {
        console.error("Failed to resize window:", e)
      }
    }

    // Auto-resize window to fit content (capped at 80% of screen).
    resizeWindow()
    const observer = new ResizeObserver(() => resizeWindow())
    observer.observe(container)
    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [activeView, displayPlugins, widthReady])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const check = () => {
      setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 1)
    }

    check()
    el.addEventListener("scroll", check, { passive: true })

    const ro = new ResizeObserver(check)
    ro.observe(el)

    const mo = new MutationObserver(check)
    mo.observe(el, { childList: true, subtree: true })

    return () => {
      el.removeEventListener("scroll", check)
      ro.disconnect()
      mo.disconnect()
    }
  }, [activeView])

  return {
    containerRef,
    scrollRef,
    canScrollDown,
    maxPanelHeightPx,
    panelWidth,
    resizePanel,
    keepPanelWidth,
  }
}
