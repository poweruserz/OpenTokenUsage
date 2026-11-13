import { useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { ChevronRight } from "lucide-react"
import { DetailSection, useDetailSectionOpen } from "@/components/detail-section"
import { hasUsageLogs } from "@/components/usage-heatmap"
import { usePanelOpen } from "@/hooks/use-unseen-usage"
import { formatMoney } from "@/lib/currency"
import { getLocale, t } from "@/lib/i18n"
import { budgetLevel, monthEndForecast, monthKey, parseAmount, projectsCsv } from "@/lib/project-budgets"
import { loadProjectBudgets, saveProjectBudgets, type ProjectBudgets } from "@/lib/settings"
import { cn } from "@/lib/utils"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

/** `usage_projects.rs`: a month's tokens and API-price dollars by repository and git branch. */
export type ProjectBranch = { name: string; ticket: string | null; cost: number; tokens: number }
export type Project = { name: string; path: string; cost: number; tokens: number; branches: ProjectBranch[] }
export type Projects = {
  priced: boolean
  /** Unpriced because no bun or Node.js was found (else ccusage failed this time). */
  noRunner: boolean
  totalCost: number
  totalTokens: number
  unattributedCost: number
  projects: Project[]
  unreadable: number
}

export const PROJECTS_REFRESH_MS = 5 * 60_000
/** Rows before "Show more". */
const FIRST_ROWS = 6

const yyyymmdd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`

/** The local calendar month `back` months before `now`'s: its bounds, and its first and last day for ccusage. */
export function monthRange(now: Date, back: number) {
  const start = new Date(now.getFullYear(), now.getMonth() - back, 1)
  const end = new Date(now.getFullYear(), now.getMonth() - back + 1, 1)
  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    since: yyyymmdd(start),
    until: yyyymmdd(new Date(end.getTime() - 1)),
  }
}

/**
 * The weekly limit that ends at `endMs`: its bounds, its first and last day (up to today) for ccusage, and those
 * whole local days, which ccusage prices although the limit starts (and may have ended) mid-day.
 */
export function weekRange(endMs: number, periodMs: number, now: Date) {
  const startMs = endMs - periodMs
  const first = new Date(startMs)
  const last = new Date(Math.min(now.getTime(), endMs - 1))
  return {
    startMs,
    endMs,
    since: yyyymmdd(first),
    until: yyyymmdd(last),
    priceStartMs: new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime(),
    priceEndMs: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime(),
  }
}

/** A weekly line's reset time to the minute: Claude's `resets_at` moves by milliseconds on every probe. */
const minute = (resetsAt: string | undefined) => (resetsAt ? Math.round(Date.parse(resetsAt) / 60_000) * 60_000 : NaN)

/** Claude Code writes `HEAD` when it can't name the branch (detached, or not a repository). */
const branchLabel = (name: string) => (name && name !== "HEAD" ? name : t("projects.noBranch"))

// Budget saves run one after another: each reads the budgets on disk and writes them back, so two
// at once would keep only the later one's edit.
let budgetSaves: Promise<void> = Promise.resolve()

/**
 * Sets or clears one project's budget, from the budgets on disk rather than the store's copy (one
 * that never loaded must not wipe the rest); the store follows once it's saved. A failed save is
 * logged, like every other setting's.
 */
function saveBudget(pluginId: string, path: string, usd: number | null, saved: (budgets: ProjectBudgets) => void) {
  budgetSaves = budgetSaves.then(async () => {
    try {
      const next = await loadProjectBudgets()
      const card = { ...(next[pluginId] ?? {}) }
      if (usd === null) delete card[path]
      else card[path] = usd
      if (Object.keys(card).length > 0) next[pluginId] = card
      else delete next[pluginId]
      await saveProjectBudgets(next)
      saved(next)
    } catch (error) {
      console.error("Failed to save project budgets:", error)
    }
  })
  return budgetSaves
}

type Range = ReturnType<typeof monthRange> | ReturnType<typeof weekRange>

/**
 * What each project and branch cost a Claude or Codex login this month, last month or in the current weekly
 * limit (`weekly`: the card's weekly line), read every few minutes while shown.
 */
export function UsageProjects({ pluginId, weekly }: { pluginId: string; weekly?: { resetsAt?: string; periodDurationMs?: number } }) {
  const open = usePanelOpen()
  // Closed, it reads nothing (budget alerts check on their own: use-project-budget-alerts.ts).
  const shown = useDetailSectionOpen("projects")
  const currency = useAppPreferencesStore((state) => state.currency)
  const budgets = useAppPreferencesStore((state) => state.projectBudgets)
  const setProjectBudgets = useAppPreferencesStore((state) => state.setProjectBudgets)
  const [picked, setPicked] = useState<number | "week">(0)
  const weekEnd = minute(weekly?.resetsAt)
  const weekPeriod = weekly?.periodDurationMs ?? 0
  const hasWeek = Number.isFinite(weekEnd) && weekPeriod > 0
  // A card without a weekly limit (or the next card picked) falls back to this month.
  const back = picked === "week" && !hasWeek ? 0 : picked
  const week = back === "week"
  // Kept with the card, the toggle and the month it was read for: the detail page reuses this
  // component, and a month that ends while it's open keeps its own rows until the next read.
  const [read, setRead] = useState<{ key: string; range: Range; projects: Projects } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  // The card and month whose last read failed: said beside the month toggle.
  const [failed, setFailed] = useState<string | null>(null)
  // The budget being typed for the open project, in the chosen currency, and whether Save refused it.
  const [draft, setDraft] = useState("")
  const [invalid, setInvalid] = useState(false)
  const [exported, setExported] = useState<{ key: string; message: string; failed: boolean } | null>(null)
  const key = week ? `${pluginId}|week|${weekEnd}` : `${pluginId}|${back}`
  const rangeNow = (): Range => (week ? weekRange(weekEnd, weekPeriod, new Date()) : monthRange(new Date(), back as number))
  const cardBudgets = budgets[pluginId] ?? {}

  const toggle = (path: string) => {
    const opening = expanded !== path
    setExpanded(opening ? path : null)
    setInvalid(false)
    const budget = cardBudgets[path]
    if (opening) setDraft(budget ? String(Math.round(budget * currency.rate * 100) / 100) : "")
  }

  useEffect(() => {
    if (!open || !shown || !isTauri() || !hasUsageLogs(pluginId)) return
    let live = true
    const loading = key
    const load = () => {
      const range = rangeNow()
      return invoke<Projects>("usage_projects", { pluginId, ...range })
        .then((projects) => {
          if (!live) return
          setRead({ key: loading, range, projects })
          setFailed(null)
        })
        .catch((error) => {
          console.error("Failed to read the usage by project:", error)
          if (live) setFailed(loading)
        })
    }
    void load()
    const timer = setInterval(() => void load(), PROJECTS_REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
    // `key` names the range rangeNow() reads.
  }, [open, shown, pluginId, key])

  useEffect(() => {
    setExpanded(null)
    setAll(false)
  }, [key])

  const data = read?.key === key ? read.projects : null
  if (!hasUsageLogs(pluginId)) return null
  if (!shown || (!data && read === null && failed !== key)) return <DetailSection id="projects" title={t("projects.title")} />
  // No project rows can still be a priced month: logs it couldn't read, or dollars it couldn't place.
  const empty = !data || (data.projects.length === 0 && !(data.priced && data.totalCost >= 0.005))
  // The month the rows were read for (not today's: a month can end while the list is open).
  const range = read?.key === key ? read.range : rangeNow()

  const locale = getLocale()
  const tokens = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 })
  const amount = (cost: number, count: number) =>
    data?.priced ? formatMoney(cost, currency, locale) : t("projects.tokens", { tokens: tokens.format(count) })
  const share = (project: Project) =>
    data?.priced && data.totalCost > 0 ? project.cost / data.totalCost : data && data.totalTokens > 0 ? project.tokens / data.totalTokens : 0
  const rows = data ? (all ? data.projects : data.projects.slice(0, FIRST_ROWS)) : []
  // Forecasts, budgets and the CSV are per month.
  const forecast = (spent: number) => (data?.priced && !week ? monthEndForecast(spent, range.startMs, range.endMs, Date.now()) : null)
  const money = (usd: number) => formatMoney(usd, currency, locale)
  const exportCsv = () => {
    if (!data) return
    const month = monthKey(range.startMs)
    invoke<string>("export_projects_csv", { pluginId, month, csv: projectsCsv(data, month, currency, locale) })
      .then((path) => setExported({ key, message: t("projects.saved", { path }), failed: false }))
      .catch((error) => {
        console.error("Failed to export the projects:", error)
        setExported({ key, message: t("projects.exportFailed"), failed: true })
      })
  }

  return (
    <DetailSection
      id="projects"
      title={t("projects.title")}
      controls={
        <div role="group" aria-label={t("projects.title")} className="flex rounded-md bg-foreground/5 p-0.5 text-[10px]">
          {([[t("projects.thisMonth"), 0], [t("projects.lastMonth"), 1], ...(hasWeek ? [[t("projects.weeklyLimit"), "week"]] : [])] as [string, number | "week"][]).map(([label, value]) => (
            <button
              key={label}
              type="button"
              aria-pressed={back === value}
              onClick={() => setPicked(value)}
              className={cn(
                "rounded px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                back === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >

      {failed === key && (
        <p role="status" className="mb-1 text-[11px] text-destructive">{t("projects.loadFailed")}</p>
      )}
      {!data ? null : empty ? (
        <p className="text-[11px] text-muted-foreground">{t(week ? "projects.emptyWeek" : "projects.empty")}</p>
      ) : (
        <>
          <div className="mb-1 flex items-baseline justify-between text-[11px]">
            <span className="text-muted-foreground">{t("projects.total")}</span>
            <span className="font-medium tabular-nums">{amount(data.totalCost, data.totalTokens)}</span>
          </div>
          {forecast(data.totalCost) !== null && (
            <p className="-mt-0.5 mb-1 text-right text-[10px] tabular-nums text-muted-foreground">
              {t("projects.forecast", { cost: money(forecast(data.totalCost) ?? 0) })}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {rows.map((project) => {
              const isOpen = expanded === project.path
              const name = project.name || t("projects.unknown")
              const budget = data.priced && !week ? cardBudgets[project.path] : undefined
              const level = budget ? budgetLevel(project.cost, budget) : 0
              const fill = budget ? Math.min(1, project.cost / budget) : share(project)
              return (
                <li key={project.path}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggle(project.path)}
                    title={project.path || undefined}
                    className="group w-full rounded px-1 py-0.5 text-left outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center gap-1 text-[11px]">
                      <ChevronRight className={cn("h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <span className="tabular-nums text-muted-foreground">{percent.format(share(project))}</span>
                      <span className="w-16 text-right tabular-nums">{amount(project.cost, project.tokens)}</span>
                    </span>
                    <span className="ml-4 mt-0.5 block h-1 rounded-full bg-foreground/5">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          level === 100 ? "bg-destructive" : level === 80 ? "bg-yellow-500" : "bg-primary"
                        )}
                        style={{ width: `${Math.max(1, fill * 100)}%` }}
                      />
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="mb-1 ml-5 mt-0.5 flex flex-col gap-0.5">
                      {project.branches.map((branch) => (
                        <li key={branch.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="min-w-0 flex-1 truncate" title={branch.name || undefined}>{branchLabel(branch.name)}</span>
                          {branch.ticket && (
                            <span className="rounded border border-border px-1 font-mono text-[9px] text-foreground">{branch.ticket}</span>
                          )}
                          <span className="w-16 text-right tabular-nums">{amount(branch.cost, branch.tokens)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {isOpen && data.priced && !week && project.path && (
                    <div className="mb-1.5 ml-5 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                      {budget && (
                        <p className={cn("tabular-nums", level === 100 && "text-destructive")}>
                          {t("projects.budgetUsed", {
                            percent: percent.format(project.cost / budget),
                            spent: money(project.cost),
                            budget: money(budget),
                          })}
                          {back === 0 && forecast(project.cost) !== null && (
                            <> · {t("projects.forecast", { cost: money(forecast(project.cost) ?? 0) })}</>
                          )}
                        </p>
                      )}
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const value = parseAmount(draft, locale)
                          setInvalid(value === null)
                          if (value !== null) void saveBudget(pluginId, project.path, value / currency.rate, setProjectBudgets)
                        }}
                      >
                        <label htmlFor={`budget-${project.path}`}>{t("projects.budget")}</label>
                        <input
                          id={`budget-${project.path}`}
                          inputMode="decimal"
                          value={draft}
                          aria-invalid={invalid}
                          aria-describedby={invalid ? `budget-note-${project.path}` : undefined}
                          onChange={(event) => {
                            setDraft(event.target.value)
                            setInvalid(false)
                          }}
                          className="w-16 rounded border border-border bg-transparent px-1 py-0.5 text-right tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <span>{currency.code}</span>
                        <button type="submit" className="rounded px-1 text-foreground outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring">
                          {t("projects.budgetSave")}
                        </button>
                        {budget && (
                          <button
                            type="button"
                            onClick={() => {
                              void saveBudget(pluginId, project.path, null, setProjectBudgets)
                              setDraft("")
                            }}
                            className="rounded px-1 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {t("projects.budgetRemove")}
                          </button>
                        )}
                      </form>
                      {invalid && (
                        <p id={`budget-note-${project.path}`} role="alert" className="text-destructive">
                          {t("projects.budgetInvalid")}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {data.projects.length > FIRST_ROWS && (
            <button
              type="button"
              onClick={() => setAll(!all)}
              className="mt-1 rounded px-1 text-[10px] text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {all ? t("projects.less") : t("projects.more", { count: data.projects.length - FIRST_ROWS })}
            </button>
          )}
          {data.priced && data.unattributedCost >= 0.005 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("projects.unattributed", { cost: formatMoney(data.unattributedCost, currency, locale) })}
            </p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {data.priced ? t("projects.apiPrices") : data.noRunner ? t("projects.unpriced") : t(week ? "projects.unpricedFailedWeek" : "projects.unpricedFailed")}
          </p>
          {!week && <div className="mt-1 flex items-center gap-2 text-[10px]">
            <button
              type="button"
              onClick={exportCsv}
              className="rounded border border-border px-1.5 py-0.5 text-foreground outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("projects.export")}
            </button>
            {exported?.key === key && (
              <span
                role="status"
                title={exported.message}
                className={cn("min-w-0 truncate", exported.failed ? "text-destructive" : "text-muted-foreground")}
              >
                {exported.message}
              </span>
            )}
          </div>}
        </>
      )}
      {data && data.unreadable > 0 && (
        <p className="mt-1 text-[10px] text-destructive">{t("heatmap.unreadable", { count: data.unreadable })}</p>
      )}
    </DetailSection>
  )
}
