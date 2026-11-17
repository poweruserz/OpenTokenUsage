import type { MeasureText, TaskbarStripItem } from "@/lib/taskbar-strip"
import { escapeXmlText } from "@/lib/tray-bars-icon"

/** Logical px. */
const WIDTH = 64
const PAD = 10
const INSET = 5
const RADIUS = 16
const RING = 36
const RING_STROKE = 3
const LOGO = 18
const DOT_RADIUS = 4
const ITEM_GAP = 10
const BUTTON = 28
/** The smallest a value shrinks to so it fits the rail. */
const MIN_FONT = 7

/**
 * Logical px of each button slot at the rail's end (the gap before a button and the button): the
 * refresh button in the last one, the pin in the one before it; under the rail, or right of it when
 * horizontal. `desktop.rs` (`EDGE_BUTTON`) takes a click there as a refresh or a pin toggle, not a
 * panel toggle.
 */
export const EDGE_BUTTON = 36
/** Windows' accent blue: the pin button while the rail is pinned open. */
const PINNED = "#0078D4"

// Lucide's rotate-cw, pin and zap (ISC license), on their 24 px grid.
const REFRESH_PATHS = ["M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8", "M21 3v5h-5"]
const PIN_PATHS = [
  "M12 17v5",
  "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
]
const ZAP_PATHS = [
  "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
]

export type EdgeRailArgs = {
  items: TaskbarStripItem[]
  /** The monitor's scale the image is for (devicePixelRatio). */
  scale: number
  measure: MeasureText
  fontCss: string
  plate: { color: string; opacity: number }
  /** A soft gradient along the rail in place of the plate's color: its start and end colors. */
  gradient?: [string, string] | null
  /** The plain text color: what a line not colored by its usage is drawn in. */
  text: string
  /** Each provider's brand color readable on the plate, by card id: its ring (the logo keeps its own color). */
  rings?: Record<string, string>

  /** Today's spend, already written: the rail's head. */
  today?: { label: string; tokens: string; money: string | null } | null
  /** Live tokens per minute, already written ("1.2K/min"): the rail's foot. */
  rate?: string | null
  /** Pinned open: the pin button filled in Windows blue. */
  pinned?: boolean
  /** Docked on the top edge: the sections side by side, the buttons at the right end. */
  horizontal?: boolean
}

/**
 * The screen-edge dock as one SVG in physical px: a rounded rail with today's tokens and spend on
 * top, each provider's logo in a ring filled as far as its first line, that line's value under it
 * (further lines smaller), the live token rate at the foot, and a pin and a refresh button after it.
 * Each of those sections is a `WIDTH`-wide column: stacked, or side by side when `horizontal`.
 */
export function makeEdgeRailSvg(args: EdgeRailArgs): { svg: string; width: number; height: number } {
  const { items, scale, measure, fontCss, plate, gradient, text, rings = {}, today, rate, pinned = false, horizontal = false } = args
  const px = (value: number) => Math.round(value * scale)
  const column = px(WIDTH)
  const center = column / 2
  const room = column - 2 * px(INSET)
  const hairline = Math.max(1, px(1))
  // Each section draws into `parts` from y = 0; `rule`: a hairline before it; `middle`: centred
  // across a horizontal rail (a provider keeps to the top, so the rings line up).
  const sections: { parts: string[]; height: number; rule: boolean; middle: boolean }[] = []
  let parts: string[] = []
  let y = 0
  const section = (rule: boolean, middle: boolean, draw: () => void) => {
    parts = []
    y = 0
    draw()
    sections.push({ parts, height: y, rule, middle })
  }

  /** A centered line `height` logical px tall, shrunk to fit; digits measured as zeros (drawn tabular). */
  const line = (value: string, size: number, weight: number, color: string, height: number, extra = "") => {
    let fontSize = size * scale
    const wide = measure(value.replace(/\d/g, "0"), fontSize, fontCss, weight)
    if (wide > room) fontSize = Math.max(MIN_FONT * scale, (fontSize * room) / wide)
    parts.push(
      `<text x="${center}" y="${y + px(height) / 2}" text-anchor="middle" dominant-baseline="central" fill="${color}" font-family='${fontCss}' font-size="${fontSize}" font-weight="${weight}" style="font-variant-numeric:tabular-nums"${extra}>${escapeXmlText(value)}</text>`
    )
    y += px(height)
  }
  const icon = (paths: string[], size: number, color: string, cx: number, cy: number, opacity = 1) => {
    const s = (size * scale) / 24
    return `<g transform="translate(${cx - 12 * s} ${cy - 12 * s}) scale(${s})" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${paths.map((d) => `<path d="${d}"/>`).join("")}</g>`
  }

  if (today) {
    section(false, true, () => {
      line(today.label, 9, 600, text, 13, ` fill-opacity="0.65" letter-spacing="${0.5 * scale}"`)
      line(today.tokens, 15, 700, text, 19)
      if (today.money) line(today.money, 11, 400, text, 15, ` fill-opacity="0.75"`)
    })
  }

  items.forEach((item, index) =>
    section(index === 0 && Boolean(today), false, () => {
      const [first, ...rest] = item.lines
      const ring = px(RING)
      const stroke = Math.max(2, px(RING_STROKE))
      const r = (ring - stroke) / 2
      const cy = ring / 2
      // A usage color (thresholds, pace, a scale) rings the logo; else the brand's, else the logo's.
      const color = first && first.color.toLowerCase() !== text.toLowerCase() ? first.color : (rings[item.id] ?? item.logoColor)
      parts.push(`<circle cx="${center}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-opacity="0.22" stroke-width="${stroke}"/>`)
      const fill = typeof first?.fill === "number" ? Math.min(1, Math.max(0, first.fill)) : 0
      if (fill > 0) {
        const length = 2 * Math.PI * r
        parts.push(
          `<circle cx="${center}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${length * fill} ${length}" transform="rotate(-90 ${center} ${cy})"/>`
        )
      }
      const logo = px(LOGO)
      const left = center - logo / 2
      const top = cy - logo / 2
      parts.push(
        `<mask id="rail${index}" style="mask-type:alpha"><image href="${item.iconUrl}" x="${left}" y="${top}" width="${logo}" height="${logo}"/></mask>`,
        `<rect x="${left}" y="${top}" width="${logo}" height="${logo}" fill="${item.logoColor}" mask="url(#rail${index})"/>`
      )
      if (item.dot) {
        const at = r * Math.SQRT1_2
        parts.push(
          `<circle cx="${center + at}" cy="${cy + at}" r="${Math.max(2, px(DOT_RADIUS))}" fill="${item.dot}" stroke="${plate.color}" stroke-width="${hairline * 1.5}"/>`
        )
      }
      y = ring + px(3)
      if (first) line(first.value ?? first.text, 13, 700, first.color, 16)
      for (const next of rest) line(next.value ?? next.text, 10, 600, next.color, 13, ` fill-opacity="0.8"`)
    })
  )

  if (rate) {
    section(true, true, () => {
      parts.push(icon(ZAP_PATHS, 12, text, center, px(7), 0.7))
      y = px(15)
      line(rate, 11, 700, text, 15)
    })
  }

  // Lay the sections out along the rail: `at` runs down it, or across it when horizontal.
  const thick = Math.max(0, ...sections.map((s) => s.height))
  const across = 2 * px(PAD) + thick
  const body: string[] = []
  let at = horizontal ? 0 : px(PAD)
  sections.forEach((s, index) => {
    if (s.rule) {
      at += px(6)
      body.push(
        horizontal
          ? `<rect x="${at}" y="${px(12)}" width="${hairline}" height="${across - 2 * px(12)}" fill="${text}" fill-opacity="0.15"/>`
          : `<rect x="${px(12)}" y="${at}" width="${column - 2 * px(12)}" height="${hairline}" fill="${text}" fill-opacity="0.15"/>`
      )
      at += hairline + px(6)
    } else if (index > 0) {
      at += px(ITEM_GAP)
    }
    const [dx, dy] = horizontal ? [at, px(PAD) + (s.middle ? Math.round((thick - s.height) / 2) : 0)] : [0, at]
    body.push(`<g transform="translate(${dx} ${dy})">${s.parts.join("")}</g>`)
    at += horizontal ? column : s.height
  })
  if (!horizontal) at += px(PAD)

  const [railWidth, railHeight] = horizontal ? [at, across] : [column, at]
  const slots = 2 * px(EDGE_BUTTON)
  const width = railWidth + (horizontal ? slots : 0)
  const height = railHeight + (horizontal ? 0 : slots)
  const button = px(BUTTON)
  // The refresh button in the last slot, the pin `back` px before it.
  const end = (horizontal ? width : height) - button / 2
  const spot = (back: number) => (horizontal ? [end - back, railHeight / 2] : [center, end - back])
  const [refreshX, refreshY] = spot(0)
  const [pinX, pinY] = spot(px(EDGE_BUTTON))
  // The buttons take the gradient too, each over its own size.
  const surface = `fill="${gradient ? "url(#railFill)" : plate.color}" fill-opacity="${Math.max(0.004, plate.opacity)}" stroke="${text}" stroke-opacity="0.12" stroke-width="${hairline}"`
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    gradient
      ? `<defs><linearGradient id="railFill" x1="0" y1="0" x2="${horizontal ? 1 : 0}" y2="${horizontal ? 0 : 1}"><stop offset="0" stop-color="${gradient[0]}"/><stop offset="1" stop-color="${gradient[1]}"/></linearGradient></defs>`
      : "",
    // Alpha 1/255: invisible, but the gap between rail and button keeps the pointer (Windows lets
    // the pointer through fully transparent pixels, and the dock would tuck away under it).
    `<rect width="${width}" height="${height}" fill="black" fill-opacity="0.004"/>`,
    `<rect x="${hairline / 2}" y="${hairline / 2}" width="${railWidth - hairline}" height="${railHeight - hairline}" rx="${px(RADIUS)}" ${surface}/>`,
    `<circle cx="${refreshX}" cy="${refreshY}" r="${(button - hairline) / 2}" ${surface}/>`,
    pinned
      ? `<circle cx="${pinX}" cy="${pinY}" r="${button / 2}" fill="${PINNED}"/>`
      : `<circle cx="${pinX}" cy="${pinY}" r="${(button - hairline) / 2}" ${surface}/>`,
    ...body,
    icon(REFRESH_PATHS, 14, text, refreshX, refreshY, 0.85),
    icon(PIN_PATHS, 14, pinned ? "#ffffff" : text, pinX, pinY, pinned ? 1 : 0.85),
    `</svg>`,
  ].join("")
  return { svg, width, height }
}
