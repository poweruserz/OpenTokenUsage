import { useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { DetailSection, useDetailSectionOpen } from "@/components/detail-section"
import { hasUsageLogs } from "@/components/usage-heatmap"
import { usePanelOpen } from "@/hooks/use-unseen-usage"
import { getLocale, t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

/** `usage_archive.rs`: `[local day (days since 1970-01-01), tokens]`, days without use left out. */
export type YearUsage = { days: [number, number][]; unreadable: number }

export const YEAR_REFRESH_MS = 30 * 60_000
const DAY_MS = 86_400_000
/** 53 weeks, as `usage_archive.rs` reads. */
const YEAR_DAYS = 371

/** The local zone's offset from UTC now, in minutes (east positive). */
export const utcOffsetMinutes = () => -new Date().getTimezoneOffset()

/** Today's local day number (days since 1970-01-01 in local time). */
export function localDay(nowMs: number, offsetMinutes: number): number {
  return Math.floor((nowMs + offsetMinutes * 60_000) / DAY_MS)
}

/** Monday 0 … Sunday 6: 1970-01-01 was a Thursday. */
export const weekdayOf = (day: number) => (((day + 3) % 7) + 7) % 7

/**
 * Days in a row with use: the run that ends today (or yesterday, while today has none yet), the
 * longest in the year, and how many days had any use.
 */
export function streaks(days: Map<number, number>, today: number): { current: number; longest: number; active: number } {
  const used = (day: number) => (days.get(day) ?? 0) > 0
  let current = 0
  for (let day = used(today) ? today : today - 1; used(day); day -= 1) current += 1
  let longest = 0
  let run = 0
  let active = 0
  for (let day = today - YEAR_DAYS + 1; day <= today; day += 1) {
    run = used(day) ? run + 1 : 0
    longest = Math.max(longest, run)
    if (used(day)) active += 1
  }
  return { current, longest, active }
}

/** 0 for no use, else 1-4 by where the day sits among the year's days with use (quartiles). */
export function levelOf(tokens: number, sortedUsed: number[]): number {
  if (tokens <= 0 || sortedUsed.length === 0) return 0
  const at = (q: number) => sortedUsed[Math.min(sortedUsed.length - 1, Math.floor(q * sortedUsed.length))]!
  if (tokens <= at(0.25)) return 1
  if (tokens <= at(0.5)) return 2
  if (tokens <= at(0.75)) return 3
  return 4
}

const LEVEL = ["bg-foreground/10", "bg-primary/30", "bg-primary/55", "bg-primary/80", "bg-primary"]

/**
 * A year of a Claude or Codex login's use, one square a day (weeks as columns, Monday on top), with
 * the current and longest streaks. With "Keep deleted usage" on, days whose logs are gone still count.
 */
export function YearHeatmap({ pluginId }: { pluginId: string }) {
  const open = usePanelOpen()
  const shown = useDetailSectionOpen("year")
  const features = useAppPreferencesStore((state) => state.cardFeatures)
  const enabled = features.yearHeatmap && hasUsageLogs(pluginId)
  // Kept with the card it belongs to: the detail page reuses this component for another card.
  const [read, setRead] = useState<{ pluginId: string; year: YearUsage } | null>(null)

  useEffect(() => {
    if (!open || !shown || !enabled || !isTauri()) return
    let live = true
    const load = () =>
      invoke<YearUsage>("usage_year", { pluginId, utcOffsetMinutes: utcOffsetMinutes(), keep: features.keepUsage })
        .then((year) => {
          if (live) setRead({ pluginId, year })
        })
        .catch((error) => console.error("Failed to read the year of usage:", error))
    void load()
    const timer = setInterval(() => void load(), YEAR_REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [open, shown, enabled, pluginId, features.keepUsage])

  if (!enabled) return null
  const title = t("year.title")
  const year = read?.pluginId === pluginId ? read.year : null
  if (!shown || !year) return <DetailSection id="year" title={title} />
  if (year.days.length === 0 && year.unreadable === 0) return null

  const today = localDay(Date.now(), utcOffsetMinutes())
  const days = new Map(year.days)
  const sortedUsed = [...days.values()].filter((tokens) => tokens > 0).sort((a, b) => a - b)
  const { current, longest, active } = streaks(days, today)
  const total = sortedUsed.reduce((sum, tokens) => sum + tokens, 0)
  const locale = getLocale()
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })
  const date = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
  // From the Monday of the week 53 weeks back, through today.
  const first = today - YEAR_DAYS + 1
  const start = first - weekdayOf(first)
  const cells = Array.from({ length: today - start + 1 }, (_, i) => start + i)

  return (
    <DetailSection
      id="year"
      title={title}
      aside={<span className="tabular-nums text-muted-foreground">{t("year.streak", { days: current })}</span>}
    >
      <div
        role="img"
        aria-label={t("year.summary", { active, longest, tokens: compact.format(total) })}
        className="grid auto-cols-fr grid-flow-col grid-rows-7 gap-[2px] overflow-hidden"
      >
        {cells.map((day) => {
          const tokens = days.get(day) ?? 0
          const before = day < first
          return (
            <span
              key={day}
              title={before ? undefined : t("year.cell", { date: date.format(new Date(day * DAY_MS)), tokens: compact.format(tokens) })}
              className={cn("aspect-square w-full rounded-[2px]", before ? "bg-transparent" : LEVEL[levelOf(tokens, sortedUsed)])}
            />
          )
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {t("year.summary", { active, longest, tokens: compact.format(total) })}
      </p>
      {year.unreadable > 0 && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("heatmap.unreadable", { count: year.unreadable })}</p>
      )}
    </DetailSection>
  )
}
