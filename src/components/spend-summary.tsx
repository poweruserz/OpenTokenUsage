import { useEffect, useMemo, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { DetailSection } from "@/components/detail-section"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { formatMoney } from "@/lib/currency"
import { getLocale, t } from "@/lib/i18n"
import type { PluginDisplayState } from "@/lib/plugin-types"
import { SPEND_TOOLS, type CardFeatures } from "@/lib/settings"
import {
  localSpendBounds,
  localSpendSources,
  spendCardId,
  spendModels,
  spendSources,
  spendTotal,
  type SpendAmount,
  type SpendPeriod,
  type SpendSource,
} from "@/lib/spend"
import { cn } from "@/lib/utils"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const PERIODS: [SpendPeriod, "spend.today" | "spend.yesterday" | "spend.month"][] = [
  ["today", "spend.today"],
  ["yesterday", "spend.yesterday"],
  ["month", "spend.month"],
]
const FIRST_MODELS = 5
const color = (index: number) => `var(--chart-${(index % 5) + 1})`

const LOCAL_SPEND_MS = 5 * 60_000

/**
 * Other CLIs' spend from their own records (`local_spend.rs`), read every 5 minutes while shown;
 * only the tools Settings leaves on (`tools`, a joined id list), and none when it lists none.
 */
function useLocalSpend(tools: string, pauseWhenHidden = true): SpendSource[] {
  const [sources, setSources] = useState<SpendSource[]>([])
  const enabled = isTauri() && tools !== ""
  const tick = useNowTicker({ enabled, intervalMs: LOCAL_SPEND_MS, pauseWhenHidden })
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    invoke<unknown>("local_spend", { ...localSpendBounds(new Date()), tools: tools.split(",") })
      .then((raw) => !cancelled && setSources(localSpendSources(raw)))
      .catch((error) => console.error("Failed to read other tools' spend:", error))
    return () => {
      cancelled = true
    }
  }, [enabled, tick, tools])
  return enabled ? sources : []
}

/**
 * Some 30 more tools through tokscale (`tokscale.rs`), only when Settings turns it on. Asked every 5
 * minutes like the rest; the host runs tokscale at most every 30.
 */
function useTokscaleSpend(on: boolean, pauseWhenHidden = true): SpendSource[] {
  const [sources, setSources] = useState<SpendSource[]>([])
  const enabled = isTauri() && on
  const tick = useNowTicker({ enabled, intervalMs: LOCAL_SPEND_MS, pauseWhenHidden })
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    invoke<unknown>("tokscale_spend", { ...localSpendBounds(new Date()), utcOffsetMinutes: -new Date().getTimezoneOffset() })
      .then((raw) => !cancelled && setSources(localSpendSources(raw)))
      .catch((error) => console.error("tokscale spend unavailable:", error))
    return () => {
      cancelled = true
    }
  }, [enabled, tick])
  return enabled ? sources : []
}

/** The other tools Settings leaves on, as `useLocalSpend` takes them; none while the summary is off. */
const spendTools = (features: CardFeatures) =>
  features.spend ? SPEND_TOOLS.filter((tool) => !features.spendToolsOff.includes(tool.id)).map((tool) => tool.id).join(",") : ""

/**
 * Today's spend over the same sources the summary adds up, for the screen-edge rail: read while `on`
 * with the panel hidden too. Null while off, with the summary off, or before any source has today.
 */
export function useTodaySpend(plugins: PluginDisplayState[], on: boolean): SpendAmount | null {
  const features = useAppPreferencesStore((state) => state.cardFeatures)
  const shown = on && features.spend
  const local = useLocalSpend(shown ? spendTools(features) : "", false)
  const tokscale = useTokscaleSpend(shown && features.tokscale, false)
  return useMemo(
    () => (shown ? spendTotal([...spendSources(plugins), ...local, ...tokscale], "today") : null),
    [shown, plugins, local, tokscale]
  )
}

/**
 * Claude and Codex spend added up across their cards (ccusage, priced from its live model catalog),
 * with other CLIs' own records (OpenCode, Z.ai, Grok, Cline): today, yesterday and 30 days, the 30
 * days by source as a ring, and the models by their tokens.
 */
export function SpendSummary({ plugins }: { plugins: PluginDisplayState[] }) {
  const [unit, setUnit] = useState<"usd" | "tokens">("usd")
  const currency = useAppPreferencesStore((state) => state.currency)
  const features = useAppPreferencesStore((state) => state.cardFeatures)
  const planPrices = useAppPreferencesStore((state) => state.planPrices)
  const local = useLocalSpend(spendTools(features))
  const tokscale = useTokscaleSpend(features.spend && features.tokscale)
  const sources = [...spendSources(plugins), ...local, ...tokscale]
  if (!features.spend || sources.length === 0) return null

  const locale = getLocale()
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 })
  // Without bun or Node.js ccusage has no prices: tokens only.
  const priced = sources.some((source) => source.periods.month?.usd != null)
  const shown = priced ? unit : "tokens"
  const value = (amount: SpendAmount | null) => (shown === "usd" ? (amount?.usd ?? 0) : (amount?.tokens ?? 0))
  const format = (n: number) => (shown === "usd" ? formatMoney(n, currency, locale) : t("projects.tokens", { tokens: compact.format(n) }))

  // A period no card has read yet is unknown, not a measured zero.
  const total = (period: SpendPeriod) => {
    const amount = spendTotal(sources, period)
    return amount ? format(value(amount)) : "—"
  }
  const month = value(spendTotal(sources, "month"))
  let start = 0
  const ring = sources.map((source, index) => {
    const share = month > 0 ? value(source.periods.month) / month : 0
    const arc = { id: source.id, name: source.name, share, start, color: color(index), amount: value(source.periods.month) }
    start += share
    return arc
  })
  const models = spendModels(sources)
  const modelTokens = models.reduce((sum, model) => sum + model.tokens, 0)
  // Each card with a plan price: its 30 days at API prices as a multiple of what the plan costs a month.
  const times = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const multiples = features.planMultiple
    ? sources.flatMap((source) => {
        const price = planPrices[spendCardId(source.id)]
        const usd = source.periods.month?.usd
        return price && usd != null ? [{ id: source.id, name: source.name, price, usd, times: times.format(usd / price) }] : []
      })
    : []

  return (
    <DetailSection
      id="spend"
      title={t("spend.title")}
      controls={
        priced ? (
          <div role="group" aria-label={t("spend.title")} className="flex rounded-md bg-foreground/5 p-0.5 text-[10px]">
            {(["usd", "tokens"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={unit === option}
                onClick={() => setUnit(option)}
                className={cn(
                  "rounded px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  unit === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                {t(option === "usd" ? "spend.cost" : "spend.tokens")}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      <dl className="grid grid-cols-3 gap-1 text-center">
        {PERIODS.map(([period, key]) => (
          <div key={period} className="rounded-md bg-foreground/5 px-1 py-1.5">
            <dt className="text-[10px] text-muted-foreground">{t(key)}</dt>
            <dd className="truncate text-xs font-medium tabular-nums">{total(period)}</dd>
          </div>
        ))}
      </dl>

      {multiples.length > 0 && (
        <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          {multiples.map((multiple) => (
            <span
              key={multiple.id}
              title={t("spend.planMultipleHint", {
                cost: formatMoney(multiple.usd, currency, locale),
                price: formatMoney(multiple.price, currency, locale),
                times: multiple.times,
              })}
            >
              {t("spend.planMultiple", { name: multiple.name, times: multiple.times })}
            </span>
          ))}
        </p>
      )}

      {sources.length > 1 && month > 0 && (
        <div className="mt-2 flex items-center gap-3">
          {/* A ring of circumference 100: each card's arc is its share of the 30 days. */}
          <svg viewBox="0 0 36 36" className="size-14 shrink-0 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="4" className="stroke-foreground/10" />
            {ring.map((arc) =>
              arc.share > 0 ? (
                <circle
                  key={arc.id}
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="none"
                  strokeWidth="4"
                  stroke={arc.color}
                  strokeDasharray={`${arc.share * 100} ${100 - arc.share * 100}`}
                  strokeDashoffset={-arc.start * 100}
                />
              ) : null
            )}
          </svg>
          <ul className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px]">
            {ring.map((arc) => (
              <li key={arc.id} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: arc.color }} />
                <span className="min-w-0 flex-1 truncate">{arc.name}</span>
                <span className="tabular-nums text-muted-foreground">{percent.format(arc.share)}</span>
                <span className="w-16 text-right tabular-nums">{format(arc.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {models.length > 0 && modelTokens > 0 && (
        <>
          <p className="mb-0.5 mt-2 text-[10px] text-muted-foreground">{t("spend.models")}</p>
          <ul className="flex flex-col gap-0.5 text-[11px]">
            {models.slice(0, FIRST_MODELS).map((model) => (
              <li key={model.name} className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate" title={model.name}>{model.name}</span>
                <span className="tabular-nums text-muted-foreground">{percent.format(model.tokens / modelTokens)}</span>
                <span className="w-16 text-right tabular-nums">{compact.format(model.tokens)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </DetailSection>
  )
}
