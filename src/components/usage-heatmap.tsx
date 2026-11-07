import { Fragment, useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { usePanelOpen } from "@/hooks/use-unseen-usage"
import { getLocale, t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** `[UTC hour (Unix seconds / 3600), tokens]` pairs from `usage_heatmap.rs`. */
export type HourlyTokens = readonly (readonly [number, number])[]

export const HEATMAP_REFRESH_MS = 5 * 60_000

/** Cards whose CLI keeps its session logs on this PC: Claude and Codex, and their extra accounts. */
export const hasUsageLogs = (pluginId: string) => /^(claude|codex)(-[0-9a-f]{8})?$/.test(pluginId)

/** Tokens per weekday (Monday first) and hour of the day, in local time. */
export function heatmapGrid(hours: HourlyTokens): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  for (const [hour, tokens] of hours) {
    // A half-hour time zone puts a UTC hour in the local hour it starts in.
    const at = new Date(hour * 3_600_000)
    grid[(at.getDay() + 6) % 7][at.getHours()] += tokens
  }
  return grid
}

/** When in the week a login's CLI was used over the last four weeks, read every few minutes while shown. */
export function UsageHeatmap({ pluginId }: { pluginId: string }) {
  const open = usePanelOpen()
  // Kept with the card it belongs to: the detail page reuses this component when another card is picked.
  const [read, setRead] = useState<{ pluginId: string; hours: HourlyTokens } | null>(null)

  useEffect(() => {
    if (!open || !isTauri() || !hasUsageLogs(pluginId)) return
    let live = true
    const load = () =>
      invoke<[number, number][]>("usage_heatmap", { pluginId })
        .then((hours) => {
          if (live) setRead({ pluginId, hours })
        })
        .catch((error) => console.error("Failed to read the usage heatmap:", error))
    void load()
    const timer = setInterval(() => void load(), HEATMAP_REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [open, pluginId])

  const hours = read?.pluginId === pluginId ? read.hours : []
  if (hours.length === 0) return null
  const grid = heatmapGrid(hours)
  const max = Math.max(...grid.flat())
  const locale = getLocale()
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" })
  // 2024-01-01 was a Monday.
  const days = grid.map((_, day) => weekday.format(new Date(2024, 0, 1 + day)))
  const hourLabel = (hour: number) => new Intl.DateTimeFormat(locale, { hour: "numeric" }).format(new Date(2024, 0, 1, hour))
  const tokens = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })
  let peak = { day: 0, hour: 0, value: -1 }
  grid.forEach((row, day) =>
    row.forEach((value, hour) => {
      if (value > peak.value) peak = { day, hour, value }
    })
  )

  return (
    <section className="pb-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("heatmap.title")}</span>
        <span className="text-[10px] text-muted-foreground">
          {t("heatmap.peak", { day: days[peak.day], hour: hourLabel(peak.hour) })}
        </span>
      </div>
      <div aria-hidden className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] items-center gap-px">
        {grid.map((row, day) => (
          <Fragment key={day}>
            <span className="pr-1.5 text-[10px] leading-none text-muted-foreground">{days[day]}</span>
            {row.map((value, hour) => (
              <span
                key={hour}
                title={t("heatmap.cell", { day: days[day], hour: hourLabel(hour), tokens: tokens.format(value) })}
                className={cn("h-2.5 rounded-[2px]", value > 0 ? "bg-primary" : "bg-foreground/5")}
                style={value > 0 ? { opacity: 0.2 + 0.8 * (value / max) } : undefined}
              />
            ))}
          </Fragment>
        ))}
        <span />
        {grid[0].map((_, hour) => (
          <span key={hour} className="text-[9px] leading-none tabular-nums text-muted-foreground">
            {hour % 6 === 0 ? hour : ""}
          </span>
        ))}
      </div>
    </section>
  )
}
