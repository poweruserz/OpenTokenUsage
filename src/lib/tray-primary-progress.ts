import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"
import { DEFAULT_DISPLAY_MODE, type DisplayMode } from "@/lib/settings"
import { getDisplayedUsage } from "@/lib/usage-display"

type PluginState = {
  data: PluginOutput | null
  loading: boolean
  error: string | null
}

export type TrayPrimaryBar = {
  id: string
  fraction?: number
  /** Label of the metric line that produced this bar (when data is available). */
  label?: string
  /** True when the value came from the provider's declared weekly line. */
  weekly?: boolean
}

type ProgressLine = Extract<
  PluginOutput["lines"][number],
  { type: "progress"; label: string; used: number; limit: number }
>

function isProgressLine(line: PluginOutput["lines"][number]): line is ProgressLine {
  return line.type === "progress"
}

export function getTrayPrimaryBars(args: {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState | undefined>
  maxBars?: number
  displayMode?: DisplayMode
  pluginId?: string
  preferredMetric?: string
  preferWeekly?: boolean
}): TrayPrimaryBar[] {
  const {
    pluginsMeta,
    pluginSettings,
    pluginStates,
    maxBars = 4,
    displayMode = DEFAULT_DISPLAY_MODE,
    pluginId,
    preferredMetric,
    preferWeekly = false,
  } = args
  if (!pluginSettings) return []

  const metaById = new Map(pluginsMeta.map((p) => [p.id, p]))
  const disabled = new Set(pluginSettings.disabled)
  const orderedIds = pluginId
    ? [pluginId]
    : pluginSettings.order

  const out: TrayPrimaryBar[] = []
  for (const id of orderedIds) {
    if (disabled.has(id)) continue
    const meta = metaById.get(id)
    if (!meta) continue
    
    // Skip plugins with no primary metric. Weekly mode is an override of the
    // primary (see preferWeekly below), not a standalone mode — so a provider
    // must define primaryCandidates to appear in the menubar; a weekly-only
    // provider is intentionally skipped.
    if (!meta.primaryCandidates || meta.primaryCandidates.length === 0) continue

    const state = pluginStates[id]
    const data = state?.data ?? null

    let fraction: number | undefined
    let label: string | undefined
    let weekly: true | undefined
    if (data) {
      // Prefer an explicitly chosen metric, then the declared weekly line when
      // requested, otherwise fall back to the first primary candidate in data.
      const hasPreferred =
        preferredMetric !== undefined &&
        preferredMetric.length > 0 &&
        data.lines.some(
          (line) => isProgressLine(line) && line.label === preferredMetric
        )
      const weeklyLabel = !hasPreferred && preferWeekly ? meta.weeklyCandidate : undefined
      const usesWeekly =
        weeklyLabel !== undefined &&
        data.lines.some((line) => isProgressLine(line) && line.label === weeklyLabel)

      const metricLabel = hasPreferred
        ? preferredMetric
        : usesWeekly
          ? weeklyLabel
          : meta.primaryCandidates.find((candidate) =>
              data.lines.some((line) => isProgressLine(line) && line.label === candidate)
            )

      if (metricLabel) {
        label = metricLabel
        weekly = usesWeekly || undefined
        const metricLine = data.lines.find(
          (line): line is ProgressLine =>
            isProgressLine(line) && line.label === metricLabel
        )
        if (metricLine && metricLine.limit > 0) {
          fraction = getDisplayedUsage(metricLine.used, metricLine.limit, displayMode).fraction
        }
      }
    }

    out.push({ id, fraction, label, weekly })
    if (out.length >= maxBars) break
  }

  return out
}

/**
 * Tray provider "Most used": the enabled provider and progress line with the highest used share,
 * so one glance shows the limit you'll hit first. `metric` restricts it to one line label.
 */
export function findTightestLimit(args: {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings
  pluginStates: Record<string, PluginState | undefined>
  metric?: string
}): { pluginId: string; label: string } | null {
  const { pluginsMeta, pluginSettings, pluginStates, metric } = args
  const known = new Set(pluginsMeta.map((plugin) => plugin.id))
  const disabled = new Set(pluginSettings.disabled)
  let best: { pluginId: string; label: string } | null = null
  let bestFraction = -1
  for (const id of pluginSettings.order) {
    if (disabled.has(id) || !known.has(id)) continue
    for (const line of pluginStates[id]?.data?.lines ?? []) {
      if (!isProgressLine(line) || line.limit <= 0) continue
      if (metric && line.label !== metric) continue
      const fraction = line.used / line.limit
      if (fraction > bestFraction) {
        bestFraction = fraction
        best = { pluginId: id, label: line.label }
      }
    }
  }
  return best
}
