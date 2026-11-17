import { t, tLabel } from "@/lib/i18n"
import type { MetricLine } from "@/lib/plugin-types"
import { formatResetRelativeLabel } from "@/lib/reset-tooltip"
import type { DisplayMode } from "@/lib/settings"
import { estimateTextWidth, type MeasureText } from "@/lib/taskbar-strip"
import { escapeXmlText } from "@/lib/tray-bars-icon"
import { getDisplayedUsage } from "@/lib/usage-display"
import { formatCountNumber } from "@/lib/utils"

/**
 * A provider card as a picture for the clipboard (the card's copy button): drawn from the card's
 * own lines, not captured from the screen, so a long or scrolled card comes out whole and the
 * panel's capture privacy doesn't blank it.
 */
export type ShareRow =
  | { kind: "bar"; label: string; value: string; detail?: string; fraction: number; color?: string }
  | { kind: "text"; label: string; value: string }

/** The card's lines as share rows, worded as the card words them; charts and reset credits are left out. */
export function shareRows(
  lines: MetricLine[],
  args: { displayMode: DisplayMode; now: number; money: (usd: number) => string; moneyText: (text: string) => string }
): ShareRow[] {
  const { displayMode, now, money, moneyText } = args
  return lines.flatMap((line): ShareRow[] => {
    if (line.type === "progress") {
      const { amount, fraction } = getDisplayedUsage(line.used, line.limit, displayMode)
      const amountText =
        line.format.kind === "percent"
          ? `${Math.round(amount)}%`
          : line.format.kind === "dollars"
            ? money(amount)
            : `${formatCountNumber(amount)} ${line.format.suffix}`
      return [
        {
          kind: "bar",
          label: tLabel(line.label),
          value: displayMode === "left" ? t("card.valueLeft", { value: amountText }) : amountText,
          detail: (line.resetsAt && formatResetRelativeLabel(now, line.resetsAt)) || undefined,
          fraction,
          color: line.color,
        },
      ]
    }
    if (line.type === "text" && !line.resetCredits) return [{ kind: "text", label: tLabel(line.label), value: moneyText(line.value) }]
    if (line.type === "badge") return [{ kind: "text", label: tLabel(line.label), value: moneyText(line.text) }]
    return []
  })
}

const THEMES = {
  dark: { background: "#1c1c1c", text: "#ffffff", muted: "#a3a3a3", track: "#3d3d3d", plan: "#2d2d2d" },
  light: { background: "#f5f5f5", text: "#1a1a1a", muted: "#5c5c5c", track: "#d9d9d9", plan: "#e6e6e6" },
} as const

const WIDTH = 360
const PAD = 20
const FONT = "'Segoe UI Variable Text', 'Segoe UI', sans-serif"

/** Text cut with "…" to fit `max` px. */
function fit(text: string, max: number, size: number, weight: number, measure: MeasureText): string {
  if (measure(text, size, FONT, weight) <= max) return text
  let cut = text
  while (cut.length > 1 && measure(`${cut}…`, size, FONT, weight) > max) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

export function makeShareCardSvg(args: {
  title: string
  plan?: string
  rows: ShareRow[]
  theme: keyof typeof THEMES
  accent: string
  /** Under the card: the app's name and when it was copied. */
  footer: string
  scale: number
  measure?: MeasureText
}): { svg: string; width: number; height: number } {
  const { title, plan, rows, theme, accent, footer, scale, measure = estimateTextWidth } = args
  const c = THEMES[theme]
  const inner = WIDTH - 2 * PAD
  const parts: string[] = []
  const text = (x: number, y: number, value: string, size: number, fill: string, weight = 400, anchor = "start") =>
    parts.push(
      `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" style="font-variant-numeric:tabular-nums">${escapeXmlText(value)}</text>`
    )

  let y = PAD + 16
  const planWidth = plan ? Math.min(140, Math.ceil(measure(plan, 12, FONT, 500)) + 16) : 0
  text(PAD, y, fit(title, inner - planWidth - 12, 17, 600, measure), 17, c.text, 600)
  if (plan) {
    const x = WIDTH - PAD - planWidth
    parts.push(`<rect x="${x}" y="${y - 15}" width="${planWidth}" height="20" rx="10" fill="${c.plan}"/>`)
    text(x + planWidth / 2, y - 1, fit(plan, planWidth - 12, 12, 500, measure), 12, c.text, 500, "middle")
  }
  y += 18

  for (const row of rows) {
    if (row.kind === "bar") {
      y += 18
      text(PAD, y, fit(row.label, inner, 13, 600, measure), 13, c.text, 600)
      y += 9
      const fill = Math.round(inner * Math.min(1, Math.max(0, row.fraction)))
      parts.push(`<rect x="${PAD}" y="${y}" width="${inner}" height="6" rx="3" fill="${c.track}"/>`)
      if (fill > 0) parts.push(`<rect x="${PAD}" y="${y}" width="${fill}" height="6" rx="3" fill="${row.color ?? accent}"/>`)
      y += 22
      const detailWidth = row.detail ? Math.min(inner / 2, measure(row.detail, 12, FONT, 400)) : 0
      text(PAD, y, fit(row.value, inner - detailWidth - 12, 12, 400, measure), 12, c.muted)
      if (row.detail) text(WIDTH - PAD, y, fit(row.detail, inner / 2, 12, 400, measure), 12, c.muted, 400, "end")
      y += 6
    } else {
      y += 22
      const valueWidth = Math.min(inner * 0.55, measure(row.value, 12, FONT, 500))
      text(PAD, y, fit(row.label, inner - valueWidth - 12, 12, 400, measure), 12, c.muted)
      text(WIDTH - PAD, y, fit(row.value, inner * 0.55, 12, 500, measure), 12, c.text, 500, "end")
    }
  }

  y += 28
  parts.push(`<circle cx="${PAD + 4}" cy="${y - 4}" r="4" fill="${accent}"/>`)
  text(PAD + 14, y, fit(footer, inner - 14, 11, 400, measure), 11, c.muted)
  const height = y + PAD - 4

  const width = Math.round(WIDTH * scale)
  const scaledHeight = Math.round(height * scale)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${scaledHeight}" viewBox="0 0 ${WIDTH} ${height}">`,
    // Opaque: apps that paste without alpha would show transparent corners as black.
    `<rect width="${WIDTH}" height="${height}" fill="${c.background}"/>`,
    ...parts,
    `</svg>`,
  ].join("")
  return { svg, width, height: scaledHeight }
}
