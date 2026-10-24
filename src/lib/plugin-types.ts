export type ProgressFormat = { kind: "percent" } | { kind: "dollars" } | { kind: "count"; suffix: string }

export type BarChartPoint = {
  label: string
  value: number
  valueLabel?: string
}

export type ResetCredit = { count: number; expiresAt?: string }

export type MetricLine =
  | { type: "text"; label: string; value: string; color?: string; subtitle?: string; resetCredits?: ResetCredit[] }
  | {
      type: "progress"
      label: string
      used: number
      limit: number
      format: ProgressFormat
      resetsAt?: string
      periodDurationMs?: number
      color?: string
    }
  | { type: "badge"; label: string; text: string; color?: string; subtitle?: string }
  | { type: "barChart"; label: string; points: BarChartPoint[]; note?: string; color?: string }

export type ManifestLine = {
  type: "text" | "progress" | "badge" | "barChart"
  label: string
  scope: "overview" | "detail"
}

export type PluginLink = {
  label: string
  url: string
}

export type PluginOutput = {
  providerId: string
  displayName: string
  plan?: string
  lines: MetricLine[]
  iconUrl: string
  /** Cached data shown again (a stopped WSL distro): when it was fetched, in epoch ms. */
  staleSince?: number
}

export type PluginMeta = {
  id: string
  name: string
  iconUrl: string
  brandColor?: string
  lines: ManifestLine[]
  links?: PluginLink[]
  /** Ordered list of primary metric candidates. Frontend picks first available. */
  primaryCandidates: string[]
  /** Label of the line marked `"period": "weekly"`, if the provider has one. */
  weeklyCandidate?: string
  /** Statuspage base URL; the card shows an incident badge from `<url>/api/v2/status.json`. */
  statusPageUrl?: string | null
}

export type PluginDisplayState = {
  meta: PluginMeta
  data: PluginOutput | null
  loading: boolean
  error: string | null
  lastManualRefreshAt: number | null
  lastUpdatedAt: number | null
}
