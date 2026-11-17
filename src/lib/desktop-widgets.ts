import { t, tLabel } from "@/lib/i18n"
import { calculatePaceStatus } from "@/lib/pace-status"
import { formatCompactDuration, formatRunsOutText } from "@/lib/pace-tooltip"
import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import type { DesktopWidgetLogo } from "@/lib/settings"
import { stripTextLabel, type TaskbarStripItem, type TaskbarStripLine } from "@/lib/taskbar-strip"

/**
 * A value that went up blinks this long, then keeps the highlight until RISE_MS. The host runs the
 * blink (`taskbar_strip/desktop.rs`): a hidden page's timers fire only once a second.
 */
export const RISE_BLINK_MS = 6_000
export const RISE_MS = 60_000

/** Black logos sit on a light plate; white ones on a dark plate; brand colors follow the taskbar theme. */
export const plateIsLight = (logo: DesktopWidgetLogo, taskbarIsLight: boolean) =>
  logo === "black" || (logo === "brand" && taskbarIsLight)

/** A line by its provider and label, so switching which lines a provider shows isn't a rise. */
const lineKey = (item: TaskbarStripItem, line: TaskbarStripLine) => `${item.id}:${line.label}`

/**
 * The lines whose used share went up by a whole shown percent since the last call. `seen` keeps each
 * shown line's last rounded percent and is replaced in place, so a line that comes back (or widgets
 * turned back on) starts afresh: a first value is not a rise.
 */
export function findRises(items: TaskbarStripItem[], seen: Map<string, number>): string[] {
  const rises: string[] = []
  const next = new Map<string, number>()
  for (const item of items) {
    for (const line of item.lines) {
      if (typeof line.used !== "number") continue
      const key = lineKey(item, line)
      const percent = Math.round(line.used * 100)
      const before = seen.get(key)
      if (before !== undefined && percent > before) rises.push(key)
      next.set(key, percent)
    }
  }
  seen.clear()
  for (const [key, percent] of next) seen.set(key, percent)
  return rises
}

/** The rises among `items` still showing at `now`, and how long their blink and highlight have left. */
export function liveRise(
  items: TaskbarStripItem[],
  risingSince: Map<string, number>,
  now: number
): { keys: Set<string>; blinkMs: number; holdMs: number } | null {
  const keys = new Set<string>()
  let blinkMs = 0
  let holdMs = 0
  for (const item of items) {
    for (const line of item.lines) {
      const key = lineKey(item, line)
      const since = risingSince.get(key)
      if (since === undefined || now - since >= RISE_MS || now < since) continue
      keys.add(key)
      blinkMs = Math.max(blinkMs, since + RISE_BLINK_MS - now)
      holdMs = Math.max(holdMs, since + RISE_MS - now)
    }
  }
  return keys.size > 0 ? { keys, blinkMs: Math.max(0, blinkMs), holdMs } : null
}

/**
 * A widget's hover text: each provider's name, then a row per line it shows with the value, when the
 * limit resets and, when behind pace, how soon it runs out at this rate.
 */
export function widgetTooltip(
  items: TaskbarStripItem[],
  args: {
    pluginsMeta: PluginMeta[]
    pluginStates: Record<string, { data: PluginOutput | null } | undefined>
    nowMs: number
    workdays: boolean
  }
): string {
  const { pluginsMeta, pluginStates, nowMs, workdays } = args
  const metaById = new Map(pluginsMeta.map((meta) => [meta.id, meta]))
  return items
    .map((item) => {
      const meta = metaById.get(item.id)
      const data = pluginStates[item.id]?.data
      const rows = item.lines.map((line) => {
        const label = line.label ?? (meta && stripTextLabel(meta))
        // A followed card's line already reads "Weekly 41% · 3d 4h": the hover text takes the number alone.
        const value = line.value ?? line.text
        const parts = [label ? `${tLabel(label)}: ${value}` : value]
        const progress = data?.lines.find((entry) => entry.type === "progress" && entry.label === label)
        const resetsAtMs = progress?.type === "progress" && progress.resetsAt ? Date.parse(progress.resetsAt) : NaN
        if (progress?.type !== "progress" || !Number.isFinite(resetsAtMs)) return parts.join(" · ")
        const left = formatCompactDuration(resetsAtMs - nowMs)
        parts.push(left ? t("reset.in", { time: left }) : t("reset.soon"))
        const period = progress.periodDurationMs
        if (period) {
          const paceResult = calculatePaceStatus(progress.used, progress.limit, resetsAtMs, period, nowMs, workdays)
          const runsOut = formatRunsOutText({
            paceResult,
            used: progress.used,
            limit: progress.limit,
            periodDurationMs: period,
            resetsAtMs,
            nowMs,
            workdays,
          })
          if (runsOut) parts.push(runsOut)
        }
        return parts.join(" · ")
      })
      return [meta?.name ?? item.id, ...rows].join("\n")
    })
    .join("\n\n")
}

/** The items as the widgets draw them: logos in the chosen color, the `rising` lines in `highlight`. */
export function widgetItems(
  items: TaskbarStripItem[],
  args: { rising: Set<string>; highlight: string; logo: DesktopWidgetLogo }
): TaskbarStripItem[] {
  const { rising, highlight, logo } = args
  return items.map((item) => ({
    ...item,
    logoColor: logo === "white" ? "#ffffff" : logo === "black" ? "#000000" : item.logoColor,
    lines: item.lines.map((line) => (rising.has(lineKey(item, line)) ? { ...line, color: highlight } : line)),
  }))
}
