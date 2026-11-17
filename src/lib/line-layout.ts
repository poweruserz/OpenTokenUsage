import type { MetricLine } from "@/lib/plugin-types"

/**
 * How a card shows its overview rows (the card's Customize mode): the labels in the order the user
 * dragged them, and the ones hidden. Rows the layout doesn't know (a new plugin line) keep their
 * plugin order after the known ones, shown.
 */
export type LineLayout = { order: string[]; hidden: string[] }
/** Per card id (`lineLayouts`, in the settings backup; account cards stay this PC's). */
export type LineLayouts = Record<string, LineLayout>

const MAX_LABELS = 64
const MAX_LABEL = 128

const labelList = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.filter((label): label is string => typeof label === "string" && label.length <= MAX_LABEL))].slice(0, MAX_LABELS)
    : []

/** A stored value with every broken entry dropped. */
export function normalizeLineLayouts(value: unknown): LineLayouts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const layouts: LineLayouts = {}
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const { order, hidden } = raw as Record<string, unknown>
    const layout = { order: labelList(order), hidden: labelList(hidden) }
    if (layout.order.length > 0 || layout.hidden.length > 0) layouts[id] = layout
  }
  return layouts
}

/** Every row label in layout order, hidden ones included (what the Customize list shows). */
export function orderedLabels(labels: string[], layout: LineLayout | undefined): string[] {
  if (!layout) return labels
  const known = layout.order.filter((label) => labels.includes(label))
  return [...known, ...labels.filter((label) => !known.includes(label))]
}

/** The rows a card shows: in layout order, hidden ones left out. */
export function applyLineLayout(lines: MetricLine[], layout: LineLayout | undefined): MetricLine[] {
  if (!layout) return lines
  const byLabel = new Map(lines.map((line) => [line.label, line]))
  return orderedLabels(
    lines.map((line) => line.label),
    layout
  )
    .filter((label) => !layout.hidden.includes(label))
    .map((label) => byLabel.get(label)!)
}
