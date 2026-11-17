import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import {
  MAX_TASKBAR_STRIP_PROVIDERS,
  TASKBAR_STRIP_COLOR_SCALES,
  TASKBAR_STRIP_FONTS,
  type DisplayMode,
  type PluginSettings,
  type TaskbarStripStyle,
} from "@/lib/settings"
import { PACE_COLORS, type TrayPrimaryBar } from "@/lib/tray-primary-progress"
import { tLabel } from "@/lib/i18n"
import { formatCompactDuration } from "@/lib/pace-tooltip"
import { formatTrayPercentText } from "@/lib/tray-tooltip"
import { escapeXmlText } from "@/lib/tray-bars-icon"
import { readableBrandColor } from "@/lib/tray-provider-icons"
import { isWslId } from "@/lib/accounts"

/**
 * `used`: the share of the limit used (0-1), whichever way the text shows it; `fill`: the share the
 * text shows (used, or left); `label`: the line it comes from ("Session", "Weekly"). All absent for
 * a text value.
 */
export type TaskbarStripLine = {
  text: string
  color: string
  used?: number
  fill?: number
  label?: string
  /** The number alone, when `text` also names the line and its reset (the followed card). */
  value?: string
}

export type TaskbarStripItem = {
  /** The provider (card) id. */
  id: string
  iconUrl: string
  logoColor: string
  /** Primary (session-like) value first, then weekly when the provider has a separate one. */
  lines: TaskbarStripLine[]
  /** A dot on the logo's corner while its agent sessions work or wait for the user. */
  dot?: string
}

/** What a card's live sessions do (`agent_activity`): one waits for the user, or one works. */
export type AgentActivity = "busy" | "waiting"

/** Windows' own blue and caution yellow, each as it reads on a light or a dark taskbar. */
const ACTIVITY_COLORS: Record<AgentActivity, { light: string; dark: string }> = {
  busy: { light: "#0078D4", dark: "#4CC2FF" },
  waiting: { light: "#9D5D00", dark: "#FCE100" },
}

/**
 * The card a focused tool's provider (`foreground:provider`, a base plugin id) stands for: the one
 * the strip already shows, else the first enabled one (the usual login before an extra account).
 */
export function followedCard(baseId: string | null, shown: string[], enabled: string[]): string | null {
  if (!baseId) return null
  // An extra account is `<id>-<8 hex>`; another provider can share the prefix (kimi, kimi-api).
  const isCard = (id: string) => id === baseId || (id.startsWith(`${baseId}-`) && /^-[0-9a-f]{8}$/.test(id.slice(baseId.length)))
  return shown.find(isCard) ?? enabled.find(isCard) ?? null
}

/**
 * Whether an AI tool (`running_ai_tools`: base plugin ids) runs behind one of the strip's cards. A WSL
 * card always counts: its CLI runs inside WSL, out of sight of Windows' process list.
 */
export function stripToolRunning(running: string[], shown: string[]): boolean {
  return shown.some(isWslId) || running.some((baseId) => followedCard(baseId, shown, []) !== null)
}

/** Logical px; the Windows 11 taskbar is 48 px tall. */
const HEIGHT = 40
const LOGO = 22
const LOGO_GAP = 5
const ITEM_GAP = 12
const PLATE_PAD = 10
const PLATE_RADIUS = 8
/** Desktop widgets' bar under a percent, and its gap to the digits. */
const BAR = 2
const BAR_GAP = 1
/** The agent activity dot on a logo's lower right corner. */
const DOT_RADIUS = 3.5

export type MeasureText = (text: string, fontSizePx: number, fontCss: string, weight: number) => number

/** Rough text width for tests; the app measures with a canvas. */
export const estimateTextWidth: MeasureText = (text, fontSizePx) => text.length * fontSizePx * 0.58

export const measureTextWithCanvas: MeasureText = (text, fontSizePx, fontCss, weight) => {
  const context = document.createElement("canvas").getContext("2d")
  if (!context) return estimateTextWidth(text, fontSizePx, fontCss, weight)
  context.font = `${weight} ${fontSizePx}px ${fontCss}`
  return context.measureText(text).width
}

export function fontCssOf(style: TaskbarStripStyle): string {
  return (TASKBAR_STRIP_FONTS.find((font) => font.id === style.font) ?? TASKBAR_STRIP_FONTS[0]).css
}

/**
 * The providers the strip shows, as plugin settings for `getTrayPrimaryBars`: the user's own strip
 * list (independent of the nav order) or the first enabled providers, never a disabled one.
 */
export function stripPluginSettings(
  selected: string[] | null,
  settings: PluginSettings,
  /** Follow the active app: the focused tool's base plugin id, put first. */
  focus: string | null = null
): PluginSettings & { focusId: string | null } {
  const enabled = settings.order.filter((id) => !settings.disabled.includes(id))
  const ids = (selected ?? enabled).filter((id) => enabled.includes(id))
  const focusId = followedCard(focus, ids, enabled)
  const order = focusId ? [focusId, ...ids.filter((id) => id !== focusId)] : ids
  return { order: order.slice(0, MAX_TASKBAR_STRIP_PROVIDERS), disabled: [], focusId }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function mix(from: string, to: string, t: number): string {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  return `#${a.map((channel, i) => Math.round(channel + (b[i]! - channel) * t).toString(16).padStart(2, "0")).join("")}`
}

/** Color for a share used (0-100 %) on a scale of [percent, color] stops; "base" = text color. */
export function colorOnScale(scale: readonly (readonly [number, string])[], usedPercent: number, base: string): string {
  const stops = scale.map(([at, color]) => [at, (color === "base" ? base : color).toLowerCase()] as const)
  if (usedPercent <= stops[0]![0]) return stops[0]![1]
  for (let i = 1; i < stops.length; i += 1) {
    const [at, color] = stops[i]!
    const [prevAt, prevColor] = stops[i - 1]!
    if (usedPercent <= at) return mix(prevColor, color, (usedPercent - prevAt) / (at - prevAt))
  }
  return stops[stops.length - 1]![1]
}

/**
 * A usage color darkened (light taskbar) or lightened (dark taskbar) just enough to read (3:1):
 * the scales' yellow is made for a dark taskbar and vanishes on a white one.
 */
export function readableOnTaskbar(color: string, onLightTaskbar: boolean): string {
  const toward = onLightTaskbar ? "#000000" : "#ffffff"
  for (let step = 0; step <= 10; step += 1) {
    const candidate = step === 0 ? color : mix(color, toward, step / 10)
    if (readableBrandColor(candidate, onLightTaskbar)) return candidate
  }
  return toward
}

function lineColor(
  bar: TrayPrimaryBar | undefined,
  base: string,
  style: TaskbarStripStyle,
  displayMode: DisplayMode,
  onLightTaskbar: boolean
) {
  const fraction = bar?.fraction
  if (style.colorMode === "off" || typeof fraction !== "number") return base
  const usedPercent = (displayMode === "left" ? 1 - fraction : fraction) * 100
  const readable = (color: string) => readableOnTaskbar(color, onLightTaskbar)
  if (style.colorMode === "pace") {
    return bar?.pace ? readable(PACE_COLORS[onLightTaskbar ? "light" : "dark"][bar.pace]) : base
  }
  if (style.colorMode === "thresholds") {
    if (usedPercent >= style.criticalAt) return readable(style.criticalColor)
    if (usedPercent >= style.warnAt) return readable(style.warnColor)
    return base
  }
  const color = colorOnScale(TASKBAR_STRIP_COLOR_SCALES[style.colorMode], usedPercent, base)
  // The text color itself stays as the user set it.
  return color === base.toLowerCase() ? base : readable(color)
}

/** A balance, not a sentence: a long value would push every provider off the strip. */
const MAX_STRIP_TEXT = 16

/** Plugin text as the strip draws it: one short line without control characters. */
function stripText(value: string): string {
  const clean = value.replace(/\p{Cc}/gu, "").trim()
  return clean.length > MAX_STRIP_TEXT ? `${clean.slice(0, MAX_STRIP_TEXT - 1)}…` : clean
}

/** The overview text line a provider without a percent line shows on the strip (DeepSeek: Balance). */
export function stripTextLabel(meta: PluginMeta): string | undefined {
  if (meta.primaryCandidates.length > 0) return undefined
  return meta.lines.find((line) => line.type === "text" && line.scope === "overview")?.label
}

export function buildTaskbarStripItems(args: {
  /** The strip's providers, in its order. */
  order: string[]
  primaryBars: TrayPrimaryBar[]
  weeklyBars: TrayPrimaryBar[]
  pluginsMeta: PluginMeta[]
  pluginStates: Record<string, { data: PluginOutput | null } | undefined>
  onLightTaskbar: boolean
  logoColors: boolean
  displayMode: DisplayMode
  style: TaskbarStripStyle
  /** Plugin text as the card shows it (dollars in the chosen currency). */
  moneyText?: (text: string) => string
  /** Cards whose agent sessions work or wait (`agent_activity`). */
  activity?: Record<string, AgentActivity>
  /** The followed card: both its lines, whatever its line mode, each with its name and time to reset. */
  focusId?: string | null
  nowMs?: number
  /** Live token rates, already written ("1.2M/min"), added after a card's first number. */
  rates?: Record<string, string>
}): TaskbarStripItem[] {
  const { order, primaryBars, weeklyBars, pluginsMeta, pluginStates, onLightTaskbar, logoColors, displayMode, style } = args
  const activity = args.activity ?? {}
  const moneyText = args.moneyText ?? ((value: string) => value)
  const taskbarColor = onLightTaskbar ? "black" : "white"
  const base = style.textColor ?? (onLightTaskbar ? "#000000" : "#ffffff")
  const metaById = new Map(pluginsMeta.map((meta) => [meta.id, meta]))
  const primaryById = new Map(primaryBars.map((bar) => [bar.id, bar]))
  const weeklyById = new Map(weeklyBars.map((bar) => [bar.id, bar]))
  const text = (bar: TrayPrimaryBar | undefined) => {
    const percent = formatTrayPercentText(bar?.fraction)
    if (percent === "--%") return "--"
    return style.showPercentSign ? percent : percent.replace(/%$/, "")
  }
  const nowMs = args.nowMs ?? Date.now()
  // The followed card in detail: "Weekly 41% · 3d 4h", as TaskbarQuota's active tile reads.
  const detailText = (id: string, bar: TrayPrimaryBar | undefined) => {
    const line = pluginStates[id]?.data?.lines.find((entry) => entry.type === "progress" && entry.label === bar?.label)
    const resetsAtMs = line?.type === "progress" && line.resetsAt ? Date.parse(line.resetsAt) : Number.NaN
    const left = Number.isFinite(resetsAtMs) ? formatCompactDuration(resetsAtMs - nowMs) : null
    const shown = bar?.label ? `${tLabel(bar.label)} ${text(bar)}` : text(bar)
    return left ? `${shown} · ${left}` : shown
  }
  const percentLines = (primary: TrayPrimaryBar) => {
    const weekly = weeklyById.get(primary.id)
    const hasWeekly = weekly?.weekly === true && weekly.label !== primary.label
    // Followed, and Settings wants it in detail (else it only goes first).
    const focused = primary.id === args.focusId && style.followDetail
    const mode = focused ? "both" : (style.lineModes[primary.id] ?? "both")
    // A provider with one line shows it whatever the mode (e.g. a weekly-only plan).
    const bars = !hasWeekly ? [primary] : mode === "session" ? [primary] : mode === "weekly" ? [weekly] : [primary, weekly]
    return bars.map((bar) => ({
      text: focused ? detailText(primary.id, bar) : text(bar),
      ...(focused ? { value: text(bar) } : {}),
      color: lineColor(bar, base, style, displayMode, onLightTaskbar),
      used: typeof bar?.fraction === "number" ? (displayMode === "left" ? 1 - bar.fraction : bar.fraction) : undefined,
      fill: bar?.fraction,
      label: bar?.label,
    }))
  }
  // No share used to color by: a text value keeps the text color.
  const textLines = (meta: PluginMeta) => {
    const label = stripTextLabel(meta)
    if (!label) return null
    const line = pluginStates[meta.id]?.data?.lines.find((entry) => entry.type === "text" && entry.label === label)
    return [{ text: (line?.type === "text" && stripText(moneyText(line.value))) || "--", color: base }]
  }
  return order.flatMap((id) => {
    const meta = metaById.get(id)
    if (!meta) return []
    const primary = primaryById.get(id)
    const shown = primary ? percentLines(primary) : textLines(meta)
    if (!shown) return []
    const rate = args.rates?.[id]
    const lines = rate ? shown.map((line, i) => (i === 0 ? { ...line, text: `${line.text} · ${rate}` } : line)) : shown
    const state = activity[id]
    return [
      {
        id,
        iconUrl: meta.iconUrl,
        logoColor: (logoColors && readableBrandColor(meta.brandColor, onLightTaskbar)) || taskbarColor,
        lines,
        ...(state ? { dot: ACTIVITY_COLORS[state][onLightTaskbar ? "light" : "dark"] } : {}),
      },
    ]
  })
}

/** The strip as one SVG, sized in physical px (`scale` = devicePixelRatio). */
export function makeTaskbarStripSvg(args: {
  items: TaskbarStripItem[]
  style: TaskbarStripStyle
  scale: number
  measure?: MeasureText
  /** Desktop widgets: a rounded plate behind the items, `opacity` 0-1. */
  plate?: { color: string; opacity: number }
  /** Desktop widgets: the items stacked in a column instead of side by side. */
  column?: boolean
  /** Desktop widgets: a thin bar under each percent, filled as far as the number says. */
  bars?: boolean
}): { svg: string; width: number; height: number } {
  const { items, style, scale, measure = estimateTextWidth, plate, column = false, bars = false } = args
  const px = (value: number) => Math.round(value * scale)
  const fontSize = style.fontSize * scale
  const fontCss = fontCssOf(style)
  const weight = style.bold ? 600 : 400
  const logo = px(LOGO)
  const bar = bars ? px(BAR) : 0
  const barGap = bars ? px(BAR_GAP) : 0
  const lineHeight = fontSize * 1.2 + bar + barGap
  const mostLines = Math.max(1, ...items.map((item) => item.lines.length))
  // The taskbar's height; widgets grow when their bars need the room.
  const rowHeight = bars ? Math.max(px(HEIGHT), Math.ceil(mostLines * lineHeight) + px(4)) : px(HEIGHT)
  const parts: string[] = []
  const pad = plate ? px(PLATE_PAD) : 0
  let x = pad
  let widest = 0
  items.forEach((item, index) => {
    if (index > 0 && !column) x += px(ITEM_GAP)
    const left = column ? pad : x
    const top = column ? index * rowHeight : 0
    const logoY = top + Math.round((rowHeight - logo) / 2)
    parts.push(
      `<mask id="logo${index}" style="mask-type:alpha"><image href="${item.iconUrl}" x="${left}" y="${logoY}" width="${logo}" height="${logo}"/></mask>`,
      `<rect x="${left}" y="${logoY}" width="${logo}" height="${logo}" fill="${item.logoColor}" mask="url(#logo${index})"/>`
    )
    if (item.dot) {
      const r = Math.max(2, px(DOT_RADIUS))
      parts.push(`<circle cx="${left + logo - r}" cy="${logoY + logo - r}" r="${r}" fill="${item.dot}"/>`)
    }
    const textX = left + logo + px(LOGO_GAP)
    // Digits are drawn tabular (all as wide as "0"), which the canvas can't measure: measure zeros.
    const textWidth = Math.ceil(
      Math.max(0, ...item.lines.map((line) => measure(line.text.replace(/\d/g, "0"), fontSize, fontCss, weight)))
    )
    // Centered with its bar, if any, below it.
    const firstCenter = top + rowHeight / 2 - ((item.lines.length - 1) * lineHeight) / 2 - (bar + barGap) / 2
    item.lines.forEach((line, i) => {
      const center = firstCenter + i * lineHeight
      parts.push(
        `<text x="${textX}" y="${center}" dominant-baseline="central" fill="${line.color}" font-family='${fontCss}' font-size="${fontSize}" font-weight="${weight}" style="font-variant-numeric:tabular-nums">${escapeXmlText(line.text)}</text>`
      )
      if (bars && typeof line.fill === "number" && textWidth > 0) {
        const barY = Math.round(center + fontSize * 0.55 + barGap)
        const filled = Math.round(textWidth * Math.min(1, Math.max(0, line.fill)))
        const rect = (w: number, opacity: string) =>
          `<rect x="${textX}" y="${barY}" width="${w}" height="${bar}" rx="${bar / 2}" fill="${line.color}"${opacity}/>`
        parts.push(rect(textWidth, ` fill-opacity="0.25"`))
        if (filled > 0) parts.push(rect(filled, ""))
      }
    })
    const right = textX + textWidth + px(1)
    if (column) widest = Math.max(widest, right)
    else x = right
  })
  const width = Math.max(1, (column ? widest : x) + pad)
  const height = column ? Math.max(1, items.length) * rowHeight : rowHeight
  // Alpha 1/255 at least: invisible, but makes the whole strip clickable (Windows lets clicks
  // through fully transparent pixels of a layered window).
  const background = plate
    ? `<rect width="${width}" height="${height}" rx="${px(PLATE_RADIUS)}" fill="${plate.color}" fill-opacity="${Math.max(0.004, plate.opacity)}"/>`
    : `<rect width="${width}" height="${height}" fill="black" fill-opacity="0.004"/>`
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    background,
    ...parts,
    `</svg>`,
  ].join("")
  return { svg, width, height }
}
