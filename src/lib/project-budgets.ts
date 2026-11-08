import type { Projects } from "@/components/usage-projects"
import { formatMoney, type CurrencySetting } from "@/lib/currency"
import { t } from "@/lib/i18n"

const DAY = 86_400_000
/** Shares of a project's monthly budget that send a notification, highest first. */
export const BUDGET_LEVELS = [100, 80] as const

/** `YYYY-MM` of a local month's first day, for alert keys and file names. */
export const monthKey = (startMs: number) => {
  const start = new Date(startMs)
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`
}

/**
 * What a month's spend comes to at its end at the pace so far; null until a day of it has passed
 * (one busy morning would make the month look huge) and for a month that's over.
 */
export function monthEndForecast(spent: number, startMs: number, endMs: number, nowMs: number): number | null {
  if (nowMs - startMs < DAY || nowMs >= endMs) return null
  return spent * ((endMs - startMs) / (nowMs - startMs))
}

/** The budget share a spend has reached, for the bar's color: 0 below 80%, then 80 or 100. */
export function budgetLevel(spent: number, budget: number): number {
  return BUDGET_LEVELS.find((level) => spent >= (budget * level) / 100) ?? 0
}

export type BudgetAlert = { keys: string[]; title: string; body: string }

/**
 * Notifications due for a card's budgeted projects this month: one when a project reaches 80% of
 * its budget and one at 100%, each once per project and month (reaching 100% at once sends only
 * that one). `sent` holds the keys of those already shown.
 */
export function collectBudgetAlerts({
  pluginId,
  providerName,
  month,
  projects,
  budgets,
  sent,
  currency,
  locale,
}: {
  pluginId: string
  providerName: string
  month: string
  projects: Projects
  budgets: Record<string, number>
  sent: Set<string>
  currency: CurrencySetting
  locale: string
}): BudgetAlert[] {
  if (!projects.priced) return []
  const alerts: BudgetAlert[] = []
  for (const [path, budget] of Object.entries(budgets)) {
    const project = projects.projects.find((p) => p.path === path)
    const spent = project?.cost ?? 0
    const level = budgetLevel(spent, budget)
    if (level === 0) continue
    // The budget is part of the key: a corrected budget is a new one, with its own two alerts.
    const key = (at: number) => `project:${pluginId}:${month}:${path}:${Math.round(budget * 100)}:${at}`
    if (sent.has(key(level))) continue
    const name = project?.name || path || t("projects.unknown")
    alerts.push({
      keys: BUDGET_LEVELS.filter((at) => at <= level).map(key),
      title: t("projects.alert.title", { project: name, provider: providerName }),
      body: t("projects.alert.body", {
        percent: new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(spent / budget),
        spent: formatMoney(spent, currency, locale),
        budget: formatMoney(budget, currency, locale),
      }),
    })
  }
  return alerts
}

/** The locale's decimal and grouping marks (`.`/`,` in English, `,`/`.` in Turkish). */
function numberMarks(locale: string) {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5)
  return {
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    group: parts.find((part) => part.type === "group")?.value ?? ",",
  }
}

/**
 * An amount typed in the locale's style (`1,000.50` in English, `1.000,50` in Turkish; `12.5` and
 * `12,5` both work), or null when it isn't a positive amount. With both marks the last one is the
 * decimal point; one mark alone is grouping only where the locale groups with it and three digits follow.
 */
export function parseAmount(text: string, locale: string): number | null {
  const compact = text.replace(/[\s  ']/g, "")
  if (!/^[0-9.,]+$/.test(compact)) return null
  const last = Math.max(compact.lastIndexOf("."), compact.lastIndexOf(","))
  let normalized = compact
  if (compact.includes(".") && compact.includes(",")) {
    normalized = compact.slice(0, last).replace(/[.,]/g, "") + "." + compact.slice(last + 1)
  } else if (last >= 0) {
    const mark = compact[last]
    const grouping = compact.split(mark).length > 2 || (mark === numberMarks(locale).group && /^\d{3}$/.test(compact.slice(last + 1)))
    normalized = grouping ? compact.split(mark).join("") : compact.replace(mark, ".")
  }
  const value = Number(normalized)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * A month's projects as CSV, one row per branch: dollars at API prices, plus the chosen currency
 * at the rate the user set; the costs are left empty when ccusage couldn't price the month. Excel
 * reads a CSV with the system's list separator, which is ";" where the decimal mark is ",": the
 * file follows the app's language. Headers stay English so other tools can read it.
 */
export function projectsCsv(projects: Projects, month: string, currency: CurrencySetting, locale: string): string {
  const { decimal } = numberMarks(locale)
  const separator = decimal === "," ? ";" : ","
  const number = (value: number, digits: number) => (projects.priced ? value.toFixed(digits).replace(".", decimal) : "")
  // A spreadsheet can run a cell that starts like a formula: such text is kept as text.
  const cell = (value: string) => {
    const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return text.includes(separator) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const local = currency.code !== "USD"
  const header = ["Month", "Project", "Folder", "Branch", "Ticket", "Tokens", "Cost (USD)"]
  if (local) header.push(`Cost (${currency.code})`)
  const rows = [header]
  for (const project of projects.projects) {
    for (const branch of project.branches) {
      const row = [month, project.name, project.path, branch.name, branch.ticket ?? "", String(branch.tokens), number(branch.cost, 4)]
      if (local) row.push(number(branch.cost * currency.rate, 2))
      rows.push(row)
    }
  }
  return rows.map((row) => row.map(cell).join(separator)).join("\r\n") + "\r\n"
}
