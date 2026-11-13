import { useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { DetailSection, useDetailSectionOpen } from "@/components/detail-section"
import { hasUsageLogs } from "@/components/usage-heatmap"
import { resetMinute } from "@/components/usage-projects"
import { usePanelOpen } from "@/hooks/use-unseen-usage"
import { getLocale, t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export const WEEK_DAYS_REFRESH_MS = 5 * 60_000
/** Longest window shown: its local days stay within what `usage_by_day` takes (10 bounds, 9 days). */
const MAX_PERIOD_MS = 8 * 86_400_000

/** A weekly limit from `startMs` up to `nowMs` by local day: its start, each midnight in between, and now. */
export function dayBounds(startMs: number, nowMs: number): number[] {
  const bounds = [startMs]
  const first = new Date(startMs)
  // At most 8 local days: a week that starts and ends mid-day.
  for (let day = 1; day <= 8; day++) {
    const midnight = new Date(first.getFullYear(), first.getMonth(), first.getDate() + day).getTime()
    if (midnight >= nowMs) break
    bounds.push(midnight)
  }
  bounds.push(nowMs)
  return bounds
}

type Weekly = { used: number; limit: number; resetsAt?: string; periodDurationMs?: number }
/** `usage_by_day`: price-weighted tokens per day, and the logs it couldn't read. */
type Days = { days: number[]; unreadable: number }

/**
 * What each local day of the current weekly limit used of it, on a Claude or Codex detail page: the limit used so
 * far, shared out by each day's price-weighted tokens from the CLI's own logs (`usage_by_day`). Read every few
 * minutes while shown; closed, it reads nothing.
 */
export function WeekDays({ pluginId, weekly }: { pluginId: string; weekly?: Weekly }) {
  const open = usePanelOpen()
  const shown = useDetailSectionOpen("week")
  const endMs = resetMinute(weekly?.resetsAt)
  const periodMs = weekly?.periodDurationMs ?? 0
  const startMs = endMs - periodMs
  // A weekly limit only: Codex can label a longer window "Weekly", and its days wouldn't fit `usage_by_day`.
  const has =
    hasUsageLogs(pluginId) && Number.isFinite(endMs) && periodMs > 0 && periodMs <= MAX_PERIOD_MS && (weekly?.limit ?? 0) > 0
  // Kept with the card and the limit it was read for: the detail page reuses this component.
  const key = `${pluginId}|${endMs}`
  const [read, setRead] = useState<{ key: string; bounds: number[]; days: number[]; unreadable: number } | null>(null)
  // The card and limit whose last read failed: said in the section, over any rows read before.
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !shown || !isTauri() || !has) return
    let live = true
    const load = () => {
      const now = Math.min(Date.now(), endMs)
      if (now <= startMs) return
      const bounds = dayBounds(startMs, now)
      invoke<Days>("usage_by_day", { pluginId, bounds })
        .then(({ days, unreadable }) => {
          if (!live) return
          setRead({ key, bounds, days, unreadable })
          setFailed(null)
        })
        .catch((error) => {
          console.error("Failed to read the weekly limit by day:", error)
          if (live) setFailed(key)
        })
    }
    load()
    const timer = setInterval(load, WEEK_DAYS_REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [open, shown, has, pluginId, key, startMs, endMs])

  if (!has || !weekly) return null
  const title = t("weekDays.title")
  const data = read?.key === key ? read : null
  const failure = failed === key && (
    <p role="status" className="mb-1 text-[10px] text-destructive">{t("weekDays.loadFailed")}</p>
  )
  if (!shown || (!data && !failure)) return <DetailSection id="week" title={title} />
  if (!data) return <DetailSection id="week" title={title}>{failure}</DetailSection>
  const total = data.days.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0 && !failure && data.unreadable === 0) return null

  const used = Math.max(0, Math.min(1, weekly.used / weekly.limit))
  const locale = getLocale()
  const dayName = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" })
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 })
  const max = Math.max(...data.days)
  return (
    <DetailSection id="week" title={title}>
      {failure}
      {total > 0 && <ul className="flex flex-col gap-0.5">
        {data.days.map((weight, index) => {
          const share = used * (weight / total)
          const day = dayName.format(new Date(data.bounds[index]))
          const label = share > 0 && share < 0.005 ? `<${percent.format(0.01)}` : percent.format(share)
          return (
            <li key={data.bounds[index]} className="grid grid-cols-[3rem_minmax(0,1fr)_2.5rem] items-center gap-1 text-[10px]">
              {/* Read as one sentence: screen readers in browse mode skip an aria-label on a list item. */}
              <span className="sr-only">{t("weekDays.day", { day, percent: label })}</span>
              <span aria-hidden className="truncate text-muted-foreground">{day}</span>
              <span aria-hidden className="h-1.5 rounded-full bg-foreground/5">
                <span
                  className={cn("block h-full rounded-full bg-primary", weight < max && "opacity-50")}
                  style={{ width: `${(weight / max) * 100}%` }}
                />
              </span>
              <span aria-hidden className="text-right tabular-nums">{label}</span>
            </li>
          )
        })}
      </ul>}
      {total > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">{t("weekDays.note", { percent: percent.format(used) })}</p>
      )}
      {data.unreadable > 0 && (
        <p className="mt-1 text-[10px] text-destructive">{t("heatmap.unreadable", { count: data.unreadable })}</p>
      )}
    </DetailSection>
  )
}
