import { useEffect, useRef, useState } from "react"
import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import type { PluginState } from "@/hooks/app/types"
import { useTaskbarIsLight } from "@/hooks/app/use-provider-tray-icons"
import type { PluginMeta } from "@/lib/plugin-types"
import { stripMonitorsArg, type DisplayMode, type PluginSettings, type TaskbarStripStyle } from "@/lib/settings"
import {
  buildTaskbarStripItems,
  makeTaskbarStripSvg,
  measureTextWithCanvas,
  stripPluginSettings,
} from "@/lib/taskbar-strip"
import { rasterizeSvgToRgba } from "@/lib/tray-bars-icon"
import { getTrayPrimaryBars } from "@/lib/tray-primary-progress"
import { bytesToBase64 } from "@/lib/tray-provider-icons"

const UPDATE_DEBOUNCE_MS = 400
/** Matches `taskbar_strip.rs`: 50 % to 500 %, at most one image per distinct scale. */
const MIN_DPI = 48
const MAX_DPI = 480
const MAX_IMAGES = 8

/** Latest strip drawing, shown as a live preview in Settings. */
export const useTaskbarStripPreview = create<{
  preview: { svg: string; width: number; height: number; scale: number; onLightTaskbar: boolean } | null
}>(() => ({ preview: null }))

/** The DPIs `taskbar_strip.rs` asks for, cleaned up and sorted; null when there's nothing usable. */
export function normalizeStripDpis(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const dpis = [...new Set(value.filter((dpi): dpi is number => Number.isInteger(dpi) && dpi >= MIN_DPI && dpi <= MAX_DPI))]
    .sort((a, b) => a - b)
    .slice(0, MAX_IMAGES)
  return dpis.length > 0 ? dpis : null
}

/**
 * Experimental taskbar strip (`taskbar_strip.rs`): draws logos + session/weekly for the host, one
 * image per scale of the monitors whose taskbar shows it (the host says which it's missing).
 */
export function useTaskbarStrip(args: {
  enabled: boolean
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState>
  displayMode: DisplayMode
  logoColors: boolean
  style: TaskbarStripStyle
  themeMode: string
}) {
  const { enabled, pluginsMeta, pluginSettings, pluginStates, displayMode, logoColors, style, themeMode } = args
  const taskbarIsLight = useTaskbarIsLight(themeMode)
  const showingRef = useRef(false)
  // Start with this window's scale; the host asks for the taskbars' own ones.
  const [dpis, setDpis] = useState<number[]>(() => [Math.round((window.devicePixelRatio || 1) * 96)])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    listen<unknown>("taskbar-strip:dpis", (event) => {
      const next = normalizeStripDpis(event.payload)
      if (next) setDpis((current) => (current.join() === next.join() ? current : next))
    })
      .then((stop) => (cancelled ? stop() : (unlisten = stop)))
      .catch((error) => console.error("Failed to listen for taskbar strip scales:", error))
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled && !showingRef.current) return
    const timer = window.setTimeout(() => {
      const settings = enabled && pluginSettings ? stripPluginSettings(style.providers, pluginSettings) : null
      const barArgs = { pluginsMeta, pluginSettings: settings, pluginStates, maxBars: settings?.order.length ?? 0, displayMode }
      const items = settings
        ? buildTaskbarStripItems({
            primaryBars: getTrayPrimaryBars(barArgs),
            weeklyBars: getTrayPrimaryBars({ ...barArgs, preferWeekly: true }),
            pluginsMeta,
            onLightTaskbar: taskbarIsLight,
            logoColors,
            displayMode,
            style,
          })
        : []
      const draw = (scale: number) => makeTaskbarStripSvg({ items, style, scale, measure: measureTextWithCanvas })
      const previewScale = window.devicePixelRatio || 1
      const preview = items.length > 0 ? draw(previewScale) : null
      useTaskbarStripPreview.setState({ preview: preview && { ...preview, scale: previewScale, onLightTaskbar: taskbarIsLight } })
      const render = async () =>
        items.length === 0
          ? null
          : Promise.all(
              dpis.map(async (dpi) => {
                const drawing = draw(dpi / 96)
                return {
                  rgba: bytesToBase64(await rasterizeSvgToRgba(drawing.svg, drawing.width, drawing.height)),
                  width: drawing.width,
                  height: drawing.height,
                  dpi,
                }
              })
            )
      render()
        .then((images) =>
          invoke("set_taskbar_strip", {
            images,
            monitors: stripMonitorsArg(style.monitors),
            placement: { side: style.position, offset: style.offset },
          }).then(
            () => (showingRef.current = images !== null)
          )
        )
        .catch((error) => console.error("Failed to update the taskbar strip:", error))
    }, UPDATE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [enabled, pluginsMeta, pluginSettings, pluginStates, displayMode, logoColors, style, taskbarIsLight, dpis])
}
