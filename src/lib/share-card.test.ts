import { describe, expect, it } from "vitest"
import type { MetricLine } from "@/lib/plugin-types"
import { makeShareCardSvg, shareRows } from "@/lib/share-card"

const now = Date.parse("2026-11-14T12:00:00Z")
const lines: MetricLine[] = [
  {
    type: "progress",
    label: "Session",
    used: 40,
    limit: 100,
    format: { kind: "percent" },
    resetsAt: new Date(now + 2 * 3_600_000 + 14 * 60_000).toISOString(),
  },
  { type: "progress", label: "Credits", used: 12.5, limit: 50, format: { kind: "dollars" } },
  { type: "text", label: "Today", value: "$3.20" },
  { type: "barChart", label: "Usage", points: [] } as unknown as MetricLine,
]
const args = { now, money: (usd: number) => `$${usd.toFixed(2)}`, moneyText: (text: string) => text }

describe("shareRows", () => {
  it("words the card's bars and text rows as the card does, without its charts", () => {
    expect(shareRows(lines, { ...args, displayMode: "used" })).toEqual([
      { kind: "bar", label: "Session", value: "40%", detail: "Resets in 2h 14m", fraction: 0.4, color: undefined },
      { kind: "bar", label: "Credits", value: "$12.50", detail: undefined, fraction: 0.25, color: undefined },
      { kind: "text", label: "Today", value: "$3.20" },
    ])
  })

  it("shows what's left in 'left' mode, the bar filled to match", () => {
    const [session] = shareRows(lines, { ...args, displayMode: "left" })
    expect(session).toMatchObject({ value: "60% left", fraction: 0.6 })
  })
})

describe("makeShareCardSvg", () => {
  it("draws an opaque card with every row, sized for the scale, and escapes the text", () => {
    const rows = shareRows(lines, { ...args, displayMode: "used" })
    const card = makeShareCardSvg({
      title: "Claude <work>",
      plan: "Max",
      rows,
      theme: "dark",
      accent: "#0078d4",
      footer: "OpenTokenUsage",
      scale: 2,
    })
    expect(card.width).toBe(720)
    expect(card.svg).toContain('fill="#1c1c1c"')
    expect(card.svg).toContain("Claude &lt;work&gt;")
    for (const text of ["Max", "Session", "40%", "Resets in 2h 14m", "$12.50", "Today", "$3.20", "OpenTokenUsage"]) {
      expect(card.svg).toContain(text)
    }
    expect(new DOMParser().parseFromString(card.svg, "image/svg+xml").querySelector("parsererror")).toBeNull()
    // More rows, a taller picture.
    const one = makeShareCardSvg({ title: "x", rows: rows.slice(0, 1), theme: "light", accent: "#0078d4", footer: "", scale: 1 })
    expect(one.height).toBeLessThan(card.height / 2)
  })
})
