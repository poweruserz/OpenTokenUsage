import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import {
  MAX_TASKBAR_STRIP_PROVIDERS,
  TASKBAR_STRIP_COLOR_SCALES,
  TASKBAR_STRIP_FONTS,
  type DisplayMode,
  type PluginSettings,
  type TaskbarStripStyle,
} from "@/lib/settings"
import type { TrayPrimaryBar } from "@/lib/tray-primary-progress"
import { formatTrayPercentText } from "@/lib/tray-tooltip"
import { readableBrandColor } from "@/lib/tray-provider-icons"

export type TaskbarStripLine = { text: string; color: string }

export type TaskbarStripItem = {
  iconUrl: string
  logoColor: string
  /** Primary (session-like) value first, then weekly when the provider has a separate one. */
  lines: TaskbarStripLine[]
}

/** Logical px; the Windows 11 taskbar is 48 px tall. */
const HEIGHT = 40
const LOGO = 22
const LOGO_GAP = 5
const ITEM_GAP = 12

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
export function stripPluginSettings(selected: string[] | null, settings: PluginSettings): PluginSettings {
  const enabled = settings.order.filter((id) => !settings.disabled.includes(id))
  const ids = (selected ?? enabled).filter((id) => enabled.includes(id))
  return { order: ids.slice(0, MAX_TASKBAR_STRIP_PROVIDERS), disabled: [] }
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
  if (style.colorMode === "thresholds") {
    if (usedPercent >= style.criticalAt) return readable(style.criticalColor)
    if (usedPercent >= style.warnAt) return readable(style.warnColor)
    return base
  }
  const color = colorOnScale(TASKBAR_STRIP_COLOR_SCALES[style.colorMode], usedPercent, base)
  // The text color itself stays as the user set it.
  return color === base.toLowerCase() ? base : readable(color)
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
}): TaskbarStripItem[] {
  const { order, primaryBars, weeklyBars, pluginsMeta, pluginStates, onLightTaskbar, logoColors, displayMode, style } = args
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
  const percentLines = (primary: TrayPrimaryBar) => {
    const weekly = weeklyById.get(primary.id)
    const hasWeekly = weekly?.weekly === true && weekly.label !== primary.label
    const mode = style.lineModes[primary.id] ?? "both"
    // A provider with one line shows it whatever the mode (e.g. a weekly-only plan).
    const bars = !hasWeekly ? [primary] : mode === "session" ? [primary] : mode === "weekly" ? [weekly] : [primary, weekly]
    return bars.map((bar) => ({ text: text(bar), color: lineColor(bar, base, style, displayMode, onLightTaskbar) }))
  }
  // No share used to color by: a text value keeps the text color.
  const textLines = (meta: PluginMeta) => {
    const label = stripTextLabel(meta)
    if (!label) return null
    const line = pluginStates[meta.id]?.data?.lines.find((entry) => entry.type === "text" && entry.label === label)
    return [{ text: line?.type === "text" ? moneyText(line.value) : "--", color: base }]
  }
  return order.flatMap((id) => {
    const meta = metaById.get(id)
    if (!meta) return []
    const primary = primaryById.get(id)
    const lines = primary ? percentLines(primary) : textLines(meta)
    if (!lines) return []
    return [
      {
        iconUrl: meta.iconUrl,
        logoColor: (logoColors && readableBrandColor(meta.brandColor, onLightTaskbar)) || taskbarColor,
        lines,
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
}): { svg: string; width: number; height: number } {
  const { items, style, scale, measure = estimateTextWidth } = args
  const px = (value: number) => Math.round(value * scale)
  const height = px(HEIGHT)
  const fontSize = style.fontSize * scale
  const fontCss = fontCssOf(style)
  const weight = style.bold ? 600 : 400
  const logo = px(LOGO)
  const parts: string[] = []
  let x = 0
  items.forEach((item, index) => {
    if (index > 0) x += px(ITEM_GAP)
    const logoY = Math.round((height - logo) / 2)
    parts.push(
      `<mask id="logo${index}" style="mask-type:alpha"><image href="${item.iconUrl}" x="${x}" y="${logoY}" width="${logo}" height="${logo}"/></mask>`,
      `<rect x="${x}" y="${logoY}" width="${logo}" height="${logo}" fill="${item.logoColor}" mask="url(#logo${index})"/>`
    )
    x += logo + px(LOGO_GAP)
    const lineHeight = fontSize * 1.2
    const firstCenter = height / 2 - ((item.lines.length - 1) * lineHeight) / 2
    item.lines.forEach((line, i) => {
      parts.push(
        `<text x="${x}" y="${firstCenter + i * lineHeight}" dominant-baseline="central" fill="${line.color}" font-family='${fontCss}' font-size="${fontSize}" font-weight="${weight}" style="font-variant-numeric:tabular-nums">${line.text}</text>`
      )
    })
    // Digits are drawn tabular (all as wide as "0"), which the canvas can't measure: measure zeros.
    const textWidth = Math.max(0, ...item.lines.map((line) => measure(line.text.replace(/\d/g, "0"), fontSize, fontCss, weight)))
    x += Math.ceil(textWidth) + px(1)
  })
  const width = Math.max(1, x)
  // Alpha 1/255 everywhere: invisible, but makes the whole strip clickable (Windows lets clicks
  // through fully transparent pixels of a layered window).
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="black" fill-opacity="0.004"/>`,
    ...parts,
    `</svg>`,
  ].join("")
  return { svg, width, height }
}
