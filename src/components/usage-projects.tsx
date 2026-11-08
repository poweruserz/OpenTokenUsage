import { useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { ChevronRight } from "lucide-react"
import { hasUsageLogs } from "@/components/usage-heatmap"
import { usePanelOpen } from "@/hooks/use-unseen-usage"
import { formatMoney } from "@/lib/currency"
import { getLocale, t } from "@/lib/i18n"
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

/** Claude Code writes `HEAD` when it can't name the branch (detached, or not a repository). */
const branchLabel = (name: string) => (name && name !== "HEAD" ? name : t("projects.noBranch"))

/** What each project and branch cost a Claude or Codex login this month or last, read every few minutes while shown. */
export function UsageProjects({ pluginId }: { pluginId: string }) {
  const open = usePanelOpen()
  const currency = useAppPreferencesStore((state) => state.currency)
  const [back, setBack] = useState(0)
  // Kept with the card and month it belongs to: the detail page reuses this component.
  const [read, setRead] = useState<{ key: string; projects: Projects } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const key = `${pluginId}|${back}`

  useEffect(() => {
    if (!open || !isTauri() || !hasUsageLogs(pluginId)) return
    let live = true
    const load = () =>
      invoke<Projects>("usage_projects", { pluginId, ...monthRange(new Date(), back) })
        .then((projects) => {
          if (live) setRead({ key: `${pluginId}|${back}`, projects })
        })
        .catch((error) => console.error("Failed to read the usage by project:", error))
    void load()
    const timer = setInterval(() => void load(), PROJECTS_REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [open, pluginId, back])

  useEffect(() => {
    setExpanded(null)
    setAll(false)
  }, [key])

  const data = read?.key === key ? read.projects : null
  if (!hasUsageLogs(pluginId) || (!data && read === null)) return null

  const locale = getLocale()
  const tokens = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 })
  const amount = (cost: number, count: number) =>
    data?.priced ? formatMoney(cost, currency, locale) : t("projects.tokens", { tokens: tokens.format(count) })
  const share = (project: Project) =>
    data?.priced && data.totalCost > 0 ? project.cost / data.totalCost : data && data.totalTokens > 0 ? project.tokens / data.totalTokens : 0
  const rows = data ? (all ? data.projects : data.projects.slice(0, FIRST_ROWS)) : []

  return (
    <section className="pb-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("projects.title")}</span>
        <div role="group" aria-label={t("projects.title")} className="flex rounded-md bg-foreground/5 p-0.5 text-[10px]">
          {[t("projects.thisMonth"), t("projects.lastMonth")].map((label, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={back === index}
              onClick={() => setBack(index)}
              className={cn(
                "rounded px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                back === index ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!data ? null : data.projects.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t("projects.empty")}</p>
      ) : (
        <>
          <div className="mb-1 flex items-baseline justify-between text-[11px]">
            <span className="text-muted-foreground">{t("projects.total")}</span>
            <span className="font-medium tabular-nums">{amount(data.totalCost, data.totalTokens)}</span>
          </div>
          <ul className="flex flex-col gap-0.5">
            {rows.map((project) => {
              const isOpen = expanded === project.path
              const name = project.name || t("projects.unknown")
              return (
                <li key={project.path}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : project.path)}
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
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(1, share(project) * 100)}%` }} />
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
            {data.priced ? t("projects.apiPrices") : data.noRunner ? t("projects.unpriced") : t("projects.unpricedFailed")}
          </p>
        </>
      )}
      {data && data.unreadable > 0 && (
        <p className="mt-1 text-[10px] text-destructive">{t("heatmap.unreadable", { count: data.unreadable })}</p>
      )}
    </section>
  )
}
