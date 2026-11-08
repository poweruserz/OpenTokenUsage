import { describe, expect, it } from "vitest"
import type { Project, Projects } from "@/components/usage-projects"
import { budgetLevel, collectBudgetAlerts, monthEndForecast, monthKey, parseAmount, projectsCsv } from "@/lib/project-budgets"

const DAY = 86_400_000
const project = (path: string, cost: number, branches: Project["branches"] = []): Project => ({
  name: path.split("/").pop() ?? "", path, cost, tokens: 1000, branches,
})
const projects = (list: Project[], priced = true): Projects => ({
  priced, noRunner: false, totalCost: 0, totalTokens: 0, unattributedCost: 0, projects: list, unreadable: 0,
})
const USD = { code: "USD" as const, rate: 1 }

describe("project budgets", () => {
  it("carries the month's spend to its end at the pace so far, once a day has passed", () => {
    const start = new Date(2026, 10, 1).getTime()
    const end = new Date(2026, 11, 1).getTime() // 30 days
    expect(monthEndForecast(10, start, end, start + 10 * DAY)).toBeCloseTo(30)
    expect(monthEndForecast(10, start, end, start + DAY / 2)).toBeNull()
    expect(monthEndForecast(10, start, end, end)).toBeNull() // a month that's over
    expect(monthKey(start)).toBe("2026-11")
  })

  it("colors a bar from 80% of the budget and again at 100%", () => {
    expect([budgetLevel(79, 100), budgetLevel(80, 100), budgetLevel(99.9, 100), budgetLevel(150, 100)]).toEqual([0, 80, 80, 100])
  })

  it("notifies at 80% and at 100% once per project and month, and only once when 100% comes first", () => {
    const sent = new Set<string>()
    const collect = (cost: number, month = "2026-11") =>
      collectBudgetAlerts({
        pluginId: "claude",
        providerName: "Claude",
        month,
        projects: projects([project("C:/work/shop", cost), project("C:/work/blog", 500)]),
        budgets: { "C:/work/shop": 50, "C:/work/gone": 10 },
        sent,
        currency: USD,
        locale: "en",
      })
    const send = (alerts: ReturnType<typeof collect>) => {
      alerts.forEach((alert) => alert.keys.forEach((key) => sent.add(key)))
      return alerts
    }
    expect(collect(30)).toEqual([]) // 60%; the unbudgeted blog and a project gone this month say nothing
    const at80 = send(collect(41))
    expect(at80).toHaveLength(1)
    expect(at80[0].title).toBe("shop budget (Claude)")
    expect(at80[0].body).toMatch(/^82% of the \$50(\.00)? monthly budget used: \$41(\.00)? so far\.$/)
    expect(collect(45)).toEqual([])
    expect(send(collect(60))[0].body).toMatch(/^120%/)
    expect(collect(70)).toEqual([])

    // A new month, straight past 100%: one notification, and 80% isn't sent afterwards.
    const jump = send(collect(55, "2026-12"))
    expect(jump).toHaveLength(1)
    expect(jump[0].keys).toEqual(["project:claude:2026-12:C:/work/shop:5000:100", "project:claude:2026-12:C:/work/shop:5000:80"])
    expect(collectBudgetAlerts({
      pluginId: "claude", providerName: "Claude", month: "2026-12", projects: projects([project("C:/work/shop", 99)], false),
      budgets: { "C:/work/shop": 1 }, sent: new Set(), currency: USD, locale: "en",
    })).toEqual([]) // unpriced: nothing to compare
  })

  it("alerts again for a corrected budget, which a mistyped small one must not use up", () => {
    const sent = new Set<string>()
    const collect = (budget: number) =>
      collectBudgetAlerts({
        pluginId: "claude", providerName: "Claude", month: "2026-11", projects: projects([project("C:/work/shop", 850)]),
        budgets: { "C:/work/shop": budget }, sent, currency: USD, locale: "en",
      })
    collect(5).forEach((alert) => alert.keys.forEach((key) => sent.add(key)))
    expect(collect(1000).map((alert) => alert.body)).toEqual([expect.stringMatching(/^85%/)])
  })

  it("reads an amount typed in the app language's style", () => {
    const cases: [string, string, number | null][] = [
      ["50", "en", 50], ["12.5", "en", 12.5], ["12,5", "en", 12.5], ["1,000", "en", 1000], ["1,250.50", "en", 1250.5],
      ["5.000", "tr", 5000], ["12,5", "tr", 12.5], ["12.5", "tr", 12.5], ["1.250,50", "tr", 1250.5], ["1 000", "fr", 1000],
      ["1.234.567", "en", 1234567], ["0", "en", null], ["-5", "en", null], ["abc", "en", null], ["", "en", null], ["1e3", "en", null],
    ]
    for (const [text, locale, value] of cases) expect([text, locale, parseAmount(text, locale)]).toEqual([text, locale, value])
  })

  it("writes one CSV row per branch, quoting what needs it and keeping formulas as text", () => {
    const csv = projectsCsv(
      projects([
        project("C:/work/shop, inc", 1.5, [
          { name: "KST-1-fix", ticket: "KST-1", cost: 1.25, tokens: 900 },
          { name: "=cmd|' /C calc'!A0", ticket: null, cost: 0.25, tokens: 100 },
        ]),
      ]),
      "2026-11",
      { code: "EUR", rate: 0.5 },
      "en"
    )
    expect(csv.split("\r\n")).toEqual([
      "Month,Project,Folder,Branch,Ticket,Tokens,Cost (USD),Cost (EUR)",
      '2026-11,"shop, inc","C:/work/shop, inc",KST-1-fix,KST-1,900,1.2500,0.63',
      "2026-11,\"shop, inc\",\"C:/work/shop, inc\",'=cmd|' /C calc'!A0,,100,0.2500,0.13",
      "",
    ])
    expect(projectsCsv(projects([]), "2026-11", USD, "en")).toBe("Month,Project,Folder,Branch,Ticket,Tokens,Cost (USD)\r\n")
  })

  it("follows a comma-decimal language with semicolons, and leaves costs empty when unpriced", () => {
    const shop = project("C:/work/shop", 1.5, [{ name: "main", ticket: null, cost: 1.5, tokens: 900 }])
    expect(projectsCsv(projects([shop]), "2026-11", { code: "TRY", rate: 40 }, "tr").split("\r\n")[1]).toBe(
      "2026-11;shop;C:/work/shop;main;;900;1,5000;60,00"
    )
    expect(projectsCsv(projects([shop], false), "2026-11", USD, "en").split("\r\n")[1]).toBe("2026-11,shop,C:/work/shop,main,,900,")
  })
})
