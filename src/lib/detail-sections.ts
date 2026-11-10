import type { MetricLine } from "@/lib/plugin-types"

/** A detail page's lines by section. `top` is shown as on the overview: bars, badges, a provider's few text rows. */
export type DetailLines = { top: MetricLine[]; resets: MetricLine[]; cost: MetricLine[]; models: MetricLine[] }

/**
 * Splits a provider's lines into the detail page's sections. Banked resets are a section of their own.
 * A provider with a usage chart (Claude, Codex) lists its spend rows before the chart and each model's
 * share after it: the cost and the models sections. Without a chart nothing else leaves the top.
 */
export function detailLines(lines: MetricLine[]): DetailLines {
  const chart = lines.findIndex((line) => line.type === "barChart")
  const sections: DetailLines = { top: [], resets: [], cost: [], models: [] }
  lines.forEach((line, index) => {
    if (line.type === "text" && line.resetCredits) sections.resets.push(line)
    else if (line.type === "barChart") sections.cost.push(line)
    else if (line.type === "text" && chart >= 0) (index < chart ? sections.cost : sections.models).push(line)
    else sections.top.push(line)
  })
  return sections
}
