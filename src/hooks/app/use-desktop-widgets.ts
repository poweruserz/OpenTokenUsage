import { useEffect, useMemo, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { availableMonitors } from "@tauri-apps/api/window"
import type { PluginState } from "@/hooks/app/types"
import { useTaskbarIsLight } from "@/hooks/app/use-provider-tray-icons"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { formatTokenRate } from "@/hooks/app/use-agent-activity"
import { convertUsdText, formatMoney } from "@/lib/currency"
import { findRises, liveRise, plateIsLight, widgetItems, widgetTooltip } from "@/lib/desktop-widgets"
import { makeEdgeRailSvg } from "@/lib/edge-rail"
import { t, useLocaleStore } from "@/lib/i18n"
import type { PluginMeta } from "@/lib/plugin-types"
import { saveDesktopWidgets, type DesktopWidgets, type DisplayMode, type PluginSettings, type TaskbarStripStyle } from "@/lib/settings"
import type { SpendAmount } from "@/lib/spend"
import {
  buildTaskbarStripItems,
  fontCssOf,
  makeTaskbarStripSvg,
  measureTextWithCanvas,
  readableOnTaskbar,
  stripPluginSettings,
  type AgentActivity,
  type TaskbarStripItem,
} from "@/lib/taskbar-strip"
import { rasterizeSvgToRgba } from "@/lib/tray-bars-icon"
import { getTrayPrimaryBars } from "@/lib/tray-primary-progress"
import { bytesToBase64 } from "@/lib/tray-provider-icons"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const UPDATE_DEBOUNCE_MS = 400
/** The hover text counts down to resets and pace goes on: draw again every minute. */
const REFRESH_MS = 60_000
/** The joined widget's id; provider widgets use the card id. */
const JOINED_ID = "joined"

/** The Windows accent color (`use-windows-appearance.ts` sets it), for values that went up. */
function accentColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--accent-base").trim()
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#0078d4"
}

/** One image per distinct monitor scale, as `set_desktop_widgets` takes them (50 % to 500 %, at most 8). */
async function monitorDpis(): Promise<number[]> {
  const monitors = await availableMonitors().catch(() => [])
  const dpis = [window.devicePixelRatio || 1, ...monitors.map((monitor) => monitor.scaleFactor)]
    .map((scale) => Math.round(scale * 96))
    .filter((dpi) => dpi >= 48 && dpi <= 480)
  return [...new Set(dpis)].slice(0, 8)
}

/**
 * The taskbar strip's providers as floating desktop widgets (`taskbar_strip/desktop.rs`): joined in
 * one (a row or a column) or one per provider, on a plate, or the screen-edge rail (`edge-rail.ts`). A value that went up comes with
 * highlighted images too; the host blinks between them, then holds the highlight. Each widget's
 * hover text says when its limits reset and run out.
 */
export function useDesktopWidgets(args: {
  settings: DesktopWidgets
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState>
  displayMode: DisplayMode
  style: TaskbarStripStyle
  themeMode: string
  /** Cards whose agent sessions work or wait: a dot on their logo. */
  activity: Record<string, AgentActivity>
  /** Follow the active app: the focused tool's base plugin id. */
  focus: string | null
  /** Live tokens per minute by card (`token_rates`). */
  rates: Record<string, number>
  /** The screen-edge rail's head: today's spend (`useTodaySpend`). */
  today: SpendAmount | null
  /** The rail's refresh button was clicked. */
  onRefresh: () => void
}) {
  const { settings, pluginsMeta, pluginSettings, pluginStates, displayMode, style, themeMode, activity, focus, rates, today } = args
  const edge = settings.layout === "edge"
  const taskbarIsLight = useTaskbarIsLight(themeMode)
  const currency = useAppPreferencesStore((state) => state.currency)
  const workdays = useAppPreferencesStore((state) => state.paceWorkdays)
  const locale = useLocaleStore((state) => state.locale)
  // The panel is hidden most of the time: tick anyway (once a minute survives the page's throttling).
  const now = useNowTicker({ enabled: settings.enabled, intervalMs: REFRESH_MS, pauseWhenHidden: false })
  const showingRef = useRef(false)
  const seenRef = useRef(new Map<string, number>())
  const risingRef = useRef(new Map<string, number>())
  // Every update bumps it; a render that finishes after a newer one started is dropped.
  const generationRef = useRef(0)
  // Bumped when the host reports a scale or monitor change: draw every monitor's scale again.
  const [redraw, setRedraw] = useState(0)
  const plateLight = plateIsLight(settings.logo, taskbarIsLight)

  const items = useMemo(() => {
    const ordered = settings.enabled && pluginSettings ? stripPluginSettings(style.providers, pluginSettings, focus) : null
    if (!ordered) return []
    const barArgs = {
      pluginsMeta,
      pluginSettings: ordered,
      pluginStates,
      maxBars: ordered.order.length,
      displayMode,
      nowMs: now,
      workdays,
    }
    return buildTaskbarStripItems({
      order: ordered.order,
      primaryBars: getTrayPrimaryBars(barArgs),
      weeklyBars: getTrayPrimaryBars({ ...barArgs, preferWeekly: true }),
      pluginsMeta,
      pluginStates,
      onLightTaskbar: plateLight,
      logoColors: settings.logo === "brand",
      displayMode,
      style,
      moneyText: (text) => convertUsdText(text, currency, locale),
      activity,
      // The rail writes each value bare and the rate once, at its foot.
      focusId: edge ? null : ordered.focusId,
      nowMs: now,
      rates: edge ? undefined : Object.fromEntries(Object.entries(rates).map(([id, rate]) => [id, formatTokenRate(rate, locale)])),
    })
  }, [
    activity,
    edge,
    focus,
    rates,
    settings.enabled,
    settings.logo,
    pluginSettings,
    pluginsMeta,
    pluginStates,
    displayMode,
    style,
    plateLight,
    currency,
    locale,
    now,
    workdays,
  ])

  useEffect(() => {
    const now = Date.now()
    for (const key of findRises(items, seenRef.current)) risingRef.current.set(key, now)
  }, [items])

  useEffect(() => {
    if (!settings.enabled) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    listen("desktop-widgets:redraw", () => setRedraw((value) => value + 1))
      .then((stop) => (cancelled ? stop() : (unlisten = stop)))
      .catch((error) => console.error("Failed to listen for desktop widget redraws:", error))
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [settings.enabled])

  // The rail's refresh button (`desktop.rs`); a ref, so a new callback doesn't listen afresh.
  const refreshRef = useRef(args.onRefresh)
  useEffect(() => {
    refreshRef.current = args.onRefresh
  }, [args.onRefresh])
  useEffect(() => {
    if (!settings.enabled || !edge) return
    let cancelled = false
    const stops: (() => void)[] = []
    const on = (event: string, handler: () => void) =>
      listen(event, handler)
        .then((stop) => (cancelled ? stop() : stops.push(stop)))
        .catch((error) => console.error(`Failed to listen for ${event}:`, error))
    void on("desktop-widgets:refresh", () => refreshRef.current())
    // The pin button: kept open (or not) like the Settings switch, saved at once.
    void on("desktop-widgets:pin", () => {
      const { desktopWidgets, setDesktopWidgets } = useAppPreferencesStore.getState()
      const next = { ...desktopWidgets, edgePinned: !desktopWidgets.edgePinned }
      setDesktopWidgets(next)
      saveDesktopWidgets(next).catch((error) => console.error("Failed to save desktop widgets:", error))
    })
    return () => {
      cancelled = true
      stops.forEach((stop) => stop())
    }
  }, [settings.enabled, edge])

  // The rail's head and foot, written; strings, so an equal value doesn't draw again.
  const todayTokens = today ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(today.tokens) : null
  const todayMoney = today?.usd != null ? formatMoney(today.usd, currency, locale) : null
  const totalRate = Object.values(rates).reduce((sum, rate) => sum + rate, 0)
  const rateText = edge && totalRate > 0 ? formatTokenRate(totalRate, locale) : null

  useEffect(() => {
    // Bumped first: turning the widgets off drops a first render still under way, shown or not.
    const generation = ++generationRef.current
    if (!settings.enabled && !showingRef.current) return
    const timer = window.setTimeout(() => {
      // `dark`: the hover text in Windows' dark tooltips, like the plate.
      const options = {
        onTop: settings.onTop,
        snap: settings.snap,
        locked: settings.locked,
        dark: !plateLight,
        clickThrough: settings.clickThrough,
        clickThroughKey: settings.clickThroughKey,
        edge,
        slideMs: settings.slide ? settings.slideMs : 0,
        pinned: edge && settings.edgePinned,
        side: settings.edgeSide,
      }
      const render = async () => {
        if (!settings.enabled || items.length === 0) return []
        const at = Date.now()
        const highlight = readableOnTaskbar(accentColor(), plateLight)
        const plate = { color: plateLight ? "#ffffff" : "#000000", opacity: settings.plateOpacity / 100 }
        const dpis = await monitorDpis()
        const head = todayTokens ? { label: t("spend.today").toLocaleUpperCase(locale), tokens: todayTokens, money: todayMoney } : null
        // Darkened or lightened just enough to read on the plate, keeping the hue (Claude's orange).
        const rings = Object.fromEntries(
          pluginsMeta.flatMap((meta) =>
            meta.brandColor && /^#[0-9a-f]{6}$/i.test(meta.brandColor) ? [[meta.id, readableOnTaskbar(meta.brandColor, plateLight)]] : []
          )
        )
        const images = (shown: TaskbarStripItem[]) =>
          Promise.all(
            dpis.map(async (dpi) => {
              const drawing = edge
                ? makeEdgeRailSvg({
                    items: shown,
                    scale: dpi / 96,
                    measure: measureTextWithCanvas,
                    fontCss: fontCssOf(style),
                    plate,
                    // Windows blues: navy into a deep blue (white text) or white into a pale blue (black text).
                    gradient: settings.gradient ? (plateLight ? ["#ffffff", "#cce4f7"] : ["#002642", "#0063b1"]) : null,
                    text: style.textColor ?? (plateLight ? "#000000" : "#ffffff"),
                    rings,
                    today: head,
                    rate: rateText,
                    pinned: settings.edgePinned,
                    horizontal: settings.edgeSide === "top",
                  })
                : makeTaskbarStripSvg({
                    items: shown,
                    style,
                    scale: dpi / 96,
                    measure: measureTextWithCanvas,
                    plate,
                    column: settings.layout === "column",
                    bars: settings.bars,
                  })
              return {
                rgba: bytesToBase64(await rasterizeSvgToRgba(drawing.svg, drawing.width, drawing.height)),
                width: drawing.width,
                height: drawing.height,
                dpi,
              }
            })
          )
        const look = { highlight, logo: settings.logo }
        // The rail shows its values itself: no hover text over it (empty registers none).
        const tooltip = (shown: TaskbarStripItem[]) =>
          edge ? "" : widgetTooltip(shown, { pluginsMeta, pluginStates, nowMs: at, workdays })
        if (settings.layout === "cycle") {
          // One widget; the host turns to the next provider's images every 8 s (a hidden page's timers lag).
          const [first, ...rest] = await Promise.all(
            items.map((item) => images(widgetItems([item], { ...look, rising: new Set() })))
          )
          return [{ id: JOINED_ID, tooltip: tooltip(items), images: first, frames: rest }]
        }
        const groups =
          settings.layout === "separate" ? items.map((item) => ({ id: item.id, items: [item] })) : [{ id: JOINED_ID, items }]
        return Promise.all(
          groups.map(async (group) => {
            const rise = liveRise(group.items, risingRef.current, at)
            return {
              id: group.id,
              tooltip: tooltip(group.items),
              images: await images(widgetItems(group.items, { ...look, rising: new Set() })),
              highlight: rise
                ? {
                    images: await images(widgetItems(group.items, { ...look, rising: rise.keys })),
                    blinkMs: rise.blinkMs,
                    holdMs: rise.holdMs,
                  }
                : undefined,
            }
          })
        )
      }
      render()
        .then((widgets) => {
          // A newer update (turning the widgets off, say) started while this one drew: it wins.
          if (generation !== generationRef.current) return
          // Counted as shown from the call on: an update that turns them off meanwhile still sends the hide.
          if (widgets.length > 0) showingRef.current = true
          return invoke("set_desktop_widgets", { widgets, options }).then(() => {
            if (generation === generationRef.current) showingRef.current = widgets.length > 0
          })
        })
        .catch((error) => console.error("Failed to update the desktop widgets:", error))
    }, UPDATE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [settings, edge, items, style, plateLight, redraw, pluginsMeta, pluginStates, workdays, todayTokens, todayMoney, rateText, locale])
}
