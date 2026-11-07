import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { usePanelOpen } from "@/hooks/use-unseen-usage"
import { getLocale, t } from "@/lib/i18n"
import { getTimeFormatter } from "@/lib/reset-tooltip"
import type { TimeFormatMode } from "@/lib/settings"
import { cn } from "@/lib/utils"

/** `usage_heatmap.rs`: tokens per UTC quarter hour (Unix seconds / 900), and the logs it couldn't read. */
export type Heatmap = { slots: [number, number][]; unreadable: number }

export const HEATMAP_REFRESH_MS = 5 * 60_000

/** Cards whose CLI keeps its session logs on this PC: Claude and Codex, and their extra accounts. */
export const hasUsageLogs = (pluginId: string) => /^(claude|codex)(-[0-9a-f]{8})?$/.test(pluginId)

/** Tokens per weekday (Monday first) and hour of the day, in local time. */
export function heatmapGrid(slots: Heatmap["slots"]): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  for (const [slot, tokens] of slots) {
    const at = new Date(slot * 900_000)
    grid[(at.getDay() + 6) % 7][at.getHours()] += tokens
  }
  return grid
}

type Cell = { day: number; hour: number }

const MOVES: Record<string, (cell: Cell) => Cell> = {
  ArrowLeft: ({ day, hour }) => ({ day, hour: Math.max(0, hour - 1) }),
  ArrowRight: ({ day, hour }) => ({ day, hour: Math.min(23, hour + 1) }),
  ArrowUp: ({ day, hour }) => ({ day: Math.max(0, day - 1), hour }),
  ArrowDown: ({ day, hour }) => ({ day: Math.min(6, day + 1), hour }),
  Home: ({ day }) => ({ day, hour: 0 }),
  End: ({ day }) => ({ day, hour: 23 }),
}

const ROW = "grid grid-cols-[2rem_repeat(24,minmax(0,1fr))] items-center gap-px"

/** When in the week a login's CLI was used over the last four weeks, read every few minutes while shown. */
export function UsageHeatmap({ pluginId, timeFormatMode = "auto" }: { pluginId: string; timeFormatMode?: TimeFormatMode }) {
  const open = usePanelOpen()
  // Kept with the card it belongs to: the detail page reuses this component when another card is picked.
  const [read, setRead] = useState<{ pluginId: string; heatmap: Heatmap } | null>(null)
  // The cell with keyboard focus: the readout shows it instead of the busiest hour.
  const [active, setActive] = useState<Cell | null>(null)
  const cells = useRef<(HTMLSpanElement | null)[]>([])
  const titleId = useId()

  useEffect(() => {
    if (!open || !isTauri() || !hasUsageLogs(pluginId)) return
    let live = true
    const load = () =>
      invoke<Heatmap>("usage_heatmap", { pluginId })
        .then((heatmap) => {
          if (live) setRead({ pluginId, heatmap })
        })
        .catch((error) => console.error("Failed to read the usage heatmap:", error))
    void load()
    const timer = setInterval(() => void load(), HEATMAP_REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [open, pluginId])

  const heatmap = read?.pluginId === pluginId ? read.heatmap : null
  const showsGrid = (heatmap?.slots.length ?? 0) > 0
  // A focused cell that leaves the page (another card, no usage left) never gets its blur.
  useEffect(() => {
    if (!showsGrid) setActive(null)
  }, [showsGrid])

  if (!heatmap || (!showsGrid && heatmap.unreadable === 0)) return null

  const grid = heatmapGrid(heatmap.slots)
  const max = Math.max(1, ...grid.flat())
  const locale = getLocale()
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" })
  // 2024-01-01 was a Monday.
  const days = grid.map((_, day) => weekday.format(new Date(2024, 0, 1 + day)))
  const time = getTimeFormatter(timeFormatMode)
  const hourLabel = (hour: number) => time.format(new Date(2024, 0, 1, hour))
  const tokens = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })
  const cellLabel = ({ day, hour }: Cell) =>
    t("heatmap.cell", { day: days[day], hour: hourLabel(hour), tokens: tokens.format(grid[day][hour]) })
  let peak = { day: 0, hour: 0, value: -1 }
  grid.forEach((row, day) =>
    row.forEach((value, hour) => {
      if (value > peak.value) peak = { day, hour, value }
    })
  )
  // One tab stop for the whole grid; arrow keys move between its cells.
  const tabStop = active ?? peak
  const move = (event: KeyboardEvent, cell: Cell) => {
    // Ctrl+Up/Down switches the provider (use-panel.ts), which skips a key already handled.
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const next = MOVES[event.key]?.(cell)
    if (!next) return
    event.preventDefault()
    cells.current[next.day * 24 + next.hour]?.focus()
  }

  return (
    <section className="pb-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span id={titleId} className="text-xs font-medium text-muted-foreground">
          {t("heatmap.title")}
        </span>
        {showsGrid && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {active ? cellLabel(active) : t("heatmap.peak", { day: days[peak.day], hour: hourLabel(peak.hour) })}
          </span>
        )}
      </div>
      {showsGrid && (
        <div role="grid" aria-labelledby={titleId} className="flex flex-col gap-px">
          {grid.map((row, day) => (
            <div key={day} role="row" className={ROW}>
              <span role="rowheader" className="truncate pr-1 text-[10px] leading-none text-muted-foreground">
                {days[day]}
              </span>
              {row.map((value, hour) => (
                <span
                  key={hour}
                  role="gridcell"
                  ref={(cell) => {
                    cells.current[day * 24 + hour] = cell
                  }}
                  tabIndex={tabStop.day === day && tabStop.hour === hour ? 0 : -1}
                  aria-label={cellLabel({ day, hour })}
                  title={cellLabel({ day, hour })}
                  onFocus={() => setActive({ day, hour })}
                  onBlur={(event) => {
                    if (!event.currentTarget.closest('[role="grid"]')?.contains(event.relatedTarget)) setActive(null)
                  }}
                  onKeyDown={(event) => move(event, { day, hour })}
                  className="flex h-2.5 rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn("size-full rounded-[2px]", value > 0 ? "bg-primary" : "bg-foreground/5")}
                    style={value > 0 ? { opacity: 0.2 + 0.8 * (value / max) } : undefined}
                  />
                </span>
              ))}
            </div>
          ))}
          <div aria-hidden className={ROW}>
            <span />
            {grid[0].map((_, hour) => (
              <span key={hour} className="text-[9px] leading-none tabular-nums text-muted-foreground">
                {hour % 6 === 0 ? hour : ""}
              </span>
            ))}
          </div>
        </div>
      )}
      {heatmap.unreadable > 0 && (
        <p className="mt-1.5 text-[10px] text-destructive">{t("heatmap.unreadable", { count: heatmap.unreadable })}</p>
      )}
    </section>
  )
}
