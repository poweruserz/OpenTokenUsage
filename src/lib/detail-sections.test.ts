import { describe, expect, it } from "vitest"
import { detailLines } from "@/lib/detail-sections"
import type { MetricLine } from "@/lib/plugin-types"

const bar = (label: string): MetricLine => ({ type: "progress", label, used: 1, limit: 100, format: { kind: "percent" } })
const text = (label: string): MetricLine => ({ type: "text", label, value: "1" })
const resets: MetricLine = { type: "text", label: "Rate Limit Resets", value: "1 available", resetCredits: [{ count: 1 }] }
const chart: MetricLine = { type: "barChart", label: "Usage Trend", points: [] }
const labels = (lines: MetricLine[]) => lines.map((line) => line.label)

describe("detail page sections", () => {
  it("puts spend rows and the chart under cost, the rows after the chart under models", () => {
    const sections = detailLines([
      bar("Weekly"),
      resets,
      text("Today"),
      text("Last 30 Days"),
      chart,
      text("claude-opus-5-5"),
      text("claude-fable-5-2"),
    ])
    expect(labels(sections.top)).toEqual(["Weekly"])
    expect(labels(sections.resets)).toEqual(["Rate Limit Resets"])
    expect(labels(sections.cost)).toEqual(["Today", "Last 30 Days", "Usage Trend"])
    expect(labels(sections.models)).toEqual(["claude-opus-5-5", "claude-fable-5-2"])
  })

  it("leaves a provider without a chart as it is, but for its resets", () => {
    const sections = detailLines([bar("Session"), text("Credits"), resets, text("Bonus")])
    expect(labels(sections.top)).toEqual(["Session", "Credits", "Bonus"])
    expect(labels(sections.resets)).toEqual(["Rate Limit Resets"])
    expect(sections.cost).toEqual([])
    expect(sections.models).toEqual([])
  })
})
