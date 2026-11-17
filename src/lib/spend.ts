import { detailLines } from "@/lib/detail-sections"
import type { PluginDisplayState } from "@/lib/plugin-types"

export type SpendAmount = { usd: number | null; tokens: number }
export type SpendPeriod = "today" | "yesterday" | "month"
export type SpendSource = {
  id: string
  name: string
  periods: Record<SpendPeriod, SpendAmount | null>
  /** Each model's tokens over the 30 days: the card's share of them times its 30-day tokens. */
  models: { name: string; tokens: number }[]
}

// The ccusage rows Claude and Codex cards show before their usage chart.
const PERIOD_LABELS: Record<SpendPeriod, string> = { today: "Today", yesterday: "Yesterday", month: "Last 30 Days" }
const UNITS: Record<string, number> = { "": 1, K: 1e3, M: 1e6, B: 1e9 }

/** "$12.34 · 1.2M tokens" back to numbers; tokens only as finely as the card rounds them. */
export function parseSpend(text: string): SpendAmount | null {
  const usd = /\$(\d[\d,]*(?:\.\d+)?)/.exec(text)
  const tokens = /(\d+(?:\.\d+)?)([KMB]?) tokens/.exec(text)
  if (!usd && !tokens) return null
  return {
    usd: usd ? Number(usd[1].replace(/,/g, "")) : null,
    tokens: tokens ? Number(tokens[1]) * UNITS[tokens[2]] : 0,
  }
}

/** The cards with ccusage spend (Claude, Codex, their extra accounts and WSL copies), in panel order. */
export function spendSources(plugins: PluginDisplayState[]): SpendSource[] {
  const sources: SpendSource[] = []
  for (const plugin of plugins) {
    const { cost, models } = detailLines(plugin.data?.lines ?? [])
    const row = (label: string) => {
      const line = cost.find((line) => line.type === "text" && line.label === label)
      return line?.type === "text" ? parseSpend(line.value) : null
    }
    const periods = { today: row(PERIOD_LABELS.today), yesterday: row(PERIOD_LABELS.yesterday), month: row(PERIOD_LABELS.month) }
    if (!periods.month) continue
    const month = periods.month.tokens
    sources.push({
      id: plugin.meta.id,
      name: plugin.meta.name,
      periods,
      models: models.flatMap((line) => {
        const share = line.type === "text" ? /^<?(\d+(?:\.\d+)?)%$/.exec(line.value) : null
        return share ? [{ name: line.label, tokens: (month * Number(share[1])) / 100 }] : []
      }),
    })
  }
  return sources
}

/**
 * What `local_spend` (other CLIs' own records: OpenCode, Z.ai, Grok, Cline) takes: local midnights of
 * today, yesterday and the first of the 30 days, as the card rows count them.
 */
export function localSpendBounds(now: Date): { todayMs: number; yesterdayMs: number; sinceMs: number } {
  const day = (back: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back).getTime()
  return { todayMs: day(0), yesterdayMs: day(1), sinceMs: day(29) }
}

/** Other tools (`local_spend`, tokscale) named apart from the card that holds their plan. */
const LOCAL_CARDS: Record<string, string> = { droid: "factory", qwen: "qwen-code", "devin-cli": "devin", junie: "jetbrains-ai-assistant" }

/** The card whose plan price (Settings → Subscriptions) a spend source is set against. */
export function spendCardId(sourceId: string): string {
  if (!sourceId.startsWith("local:")) return sourceId
  const tool = sourceId.slice("local:".length)
  return LOCAL_CARDS[tool] ?? tool
}

/** `local_spend`'s sources, ids kept apart from card ids. */
export function localSpendSources(raw: unknown): SpendSource[] {
  if (!Array.isArray(raw)) return []
  const amount = (value: unknown): SpendAmount | null => {
    const { usd, tokens } = (value ?? {}) as { usd?: unknown; tokens?: unknown }
    if (typeof tokens !== "number" || !Number.isFinite(tokens)) return null
    return { usd: typeof usd === "number" && Number.isFinite(usd) ? usd : null, tokens }
  }
  return raw.flatMap((source) => {
    const { id, name, periods, models } = (source ?? {}) as Record<string, unknown>
    const p = (periods ?? {}) as Record<string, unknown>
    const month = amount(p.month)
    if (typeof id !== "string" || typeof name !== "string" || !month) return []
    return [
      {
        id: `local:${id}`,
        name,
        periods: { today: amount(p.today), yesterday: amount(p.yesterday), month },
        models: (Array.isArray(models) ? models : []).flatMap((model) => {
          const { name, tokens } = (model ?? {}) as { name?: unknown; tokens?: unknown }
          return typeof name === "string" && typeof tokens === "number" ? [{ name, tokens }] : []
        }),
      },
    ]
  })
}

/** A period's total over the cards; dollars only when some card priced it. Null when no card has the period ("No data"). */
export function spendTotal(sources: SpendSource[], period: SpendPeriod): SpendAmount | null {
  let total: SpendAmount | null = null
  for (const source of sources) {
    const amount = source.periods[period]
    if (!amount) continue
    total ??= { usd: null, tokens: 0 }
    total.tokens += amount.tokens
    if (amount.usd !== null) total.usd = (total.usd ?? 0) + amount.usd
  }
  return total
}

/** Models across the cards by their 30-day tokens, largest first (a model two logins share adds up). */
export function spendModels(sources: SpendSource[]): { name: string; tokens: number }[] {
  const byName = new Map<string, number>()
  for (const source of sources) for (const model of source.models) byName.set(model.name, (byName.get(model.name) ?? 0) + model.tokens)
  return [...byName].map(([name, tokens]) => ({ name, tokens })).sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))
}
