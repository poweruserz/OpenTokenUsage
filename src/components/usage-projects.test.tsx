import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { monthRange, UsageProjects, weekRange, type Project, type Projects } from "@/components/usage-projects"
import { loadProjectBudgets, saveProjectBudgets } from "@/lib/settings"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }))
vi.mock("@/hooks/use-unseen-usage", () => ({ usePanelOpen: () => true }))
vi.mock("@/lib/settings", async (original) => ({
  ...(await original<typeof import("@/lib/settings")>()),
  loadProjectBudgets: vi.fn(),
  saveProjectBudgets: vi.fn(),
}))

const project = (name: string, cost: number, tokens: number, branches: Project["branches"] = []): Project => ({
  name, path: `C:/work/${name}`, cost, tokens, branches,
})
const projects = (list: Project[], over: Partial<Projects> = {}): Projects => ({
  priced: true,
  noRunner: false,
  totalCost: list.reduce((sum, p) => sum + p.cost, 0),
  totalTokens: list.reduce((sum, p) => sum + p.tokens, 0),
  unattributedCost: 0,
  projects: list,
  unreadable: 0,
  ...over,
})

describe("usage by project", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    vi.mocked(saveProjectBudgets).mockResolvedValue()
    vi.mocked(loadProjectBudgets).mockImplementation(async () => structuredClone(useAppPreferencesStore.getState().projectBudgets))
    useAppPreferencesStore.setState({ currency: { code: "USD", rate: 1 }, projectBudgets: {} })
  })

  it("asks for this local month, or the last one, with ccusage's first and last day", () => {
    const now = new Date(2026, 2, 15, 12) // 15 March 2026
    expect(monthRange(now, 0)).toEqual({
      startMs: new Date(2026, 2, 1).getTime(), endMs: new Date(2026, 3, 1).getTime(), since: "20260301", until: "20260331",
    })
    expect(monthRange(new Date(2026, 0, 3), 1)).toMatchObject({ since: "20251201", until: "20251231" })
  })

  it("asks for a weekly limit up to today, with its first day's midnight for ccusage's whole-day prices", () => {
    const endMs = new Date(2026, 2, 19, 10).getTime() // resets 19 March, 10:00
    expect(weekRange(endMs, 7 * 86_400_000, new Date(2026, 2, 15, 12))).toEqual({
      startMs: new Date(2026, 2, 12, 10).getTime(),
      endMs,
      since: "20260312",
      until: "20260315",
      priceStartMs: new Date(2026, 2, 12).getTime(),
    })
  })

  it("splits the current weekly limit by project, without the monthly budgets, forecast and CSV", async () => {
    vi.mocked(invoke).mockResolvedValue(projects([project("shop", 30, 300)]))
    const { rerender } = render(<UsageProjects pluginId="claude" />)
    await screen.findByRole("button", { name: /shop/ })
    expect(screen.queryByRole("button", { name: "Weekly limit" })).toBeNull() // no weekly line, no tab

    const resetsAt = new Date(Date.now() + 2 * 86_400_000).toISOString()
    rerender(<UsageProjects pluginId="claude" weekly={{ resetsAt, periodDurationMs: 7 * 86_400_000 }} />)
    fireEvent.click(screen.getByRole("button", { name: "Weekly limit" }))
    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("usage_projects", expect.objectContaining({ priceStartMs: expect.any(Number) })))
    const asked = vi.mocked(invoke).mock.calls.at(-1)?.[1] as { startMs: number; endMs: number }
    expect(asked.endMs).toBe(Math.round(Date.parse(resetsAt) / 60_000) * 60_000)
    expect(asked.startMs).toBe(asked.endMs - 7 * 86_400_000)

    fireEvent.click(await screen.findByRole("button", { name: /shop/ }))
    expect(screen.queryByLabelText("Monthly budget")).toBeNull()
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull()
    expect(screen.queryByText(/by month end/)).toBeNull()

    // Claude's reset time moves by milliseconds on every probe: that is the same window, not a new read.
    const calls = vi.mocked(invoke).mock.calls.length
    rerender(<UsageProjects pluginId="claude" weekly={{ resetsAt: new Date(Date.parse(resetsAt) + 7).toISOString(), periodDurationMs: 7 * 86_400_000 }} />)
    expect(vi.mocked(invoke).mock.calls.length).toBe(calls)
    expect(screen.getByRole("button", { name: /shop/ })).toHaveAttribute("aria-expanded", "true")
  })

  it("lists projects with their cost and share, and a project's branches with their ticket", async () => {
    vi.mocked(invoke).mockResolvedValue(projects([
      project("shop", 75, 900, [
        { name: "KST-482-rate-limits", ticket: "KST-482", cost: 50, tokens: 600 },
        { name: "HEAD", ticket: null, cost: 25, tokens: 300 },
      ]),
      project("blog", 25, 100),
    ]))
    render(<UsageProjects pluginId="claude" />)
    const shop = await screen.findByRole("button", { name: /shop/ })
    expect(invoke).toHaveBeenCalledWith("usage_projects", expect.objectContaining({ pluginId: "claude" }))
    expect(screen.getByText(/^\$100(\.00)?$/)).toBeInTheDocument()
    expect(shop.textContent).toMatch(/75%.*\$75/)
    expect(shop).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(shop)
    expect(shop).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("KST-482")).toBeInTheDocument()
    expect(screen.getByText("No branch")).toBeInTheDocument()
    expect(screen.getByText(/API list prices/)).toBeInTheDocument()
  })

  it("shows the costs in the chosen currency and tokens alone when ccusage couldn't price them", async () => {
    useAppPreferencesStore.setState({ currency: { code: "EUR", rate: 0.5 } })
    vi.mocked(invoke).mockResolvedValue(projects([project("shop", 10, 2_000_000)]))
    const { unmount } = render(<UsageProjects pluginId="claude" />)
    expect((await screen.findByRole("button", { name: /shop/ })).textContent).toMatch(/5[.,]00/)
    unmount()

    vi.mocked(invoke).mockResolvedValue(projects([project("shop", 0, 2_000_000)], { priced: false, noRunner: true, totalCost: 0 }))
    const codex = render(<UsageProjects pluginId="codex" />)
    expect((await screen.findByRole("button", { name: /shop/ })).textContent).toMatch(/2M tokens/)
    expect(screen.getByText(/need bun or Node\.js/)).toBeInTheDocument()
    codex.unmount()

    // ccusage is there but failed this time: no advice to install anything.
    vi.mocked(invoke).mockResolvedValue(projects([project("shop", 0, 2_000_000)], { priced: false, totalCost: 0 }))
    render(<UsageProjects pluginId="codex" />)
    expect(await screen.findByText(/couldn't price this month/)).toBeInTheDocument()
  })

  it("switches to last month and keeps the long tail behind Show more", async () => {
    const many = Array.from({ length: 8 }, (_, i) => project(`p${i}`, 8 - i, 10))
    vi.mocked(invoke).mockResolvedValue(projects(many))
    render(<UsageProjects pluginId="claude" />)
    await screen.findByRole("button", { name: /p0/ })
    expect(screen.queryByRole("button", { name: /p7/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }))
    expect(screen.getByRole("button", { name: /p7/ })).toBeInTheDocument()

    vi.mocked(invoke).mockResolvedValue(projects([]))
    fireEvent.click(screen.getByRole("button", { name: "Last month" }))
    await waitFor(() => expect(screen.getByText("No usage in this month.")).toBeInTheDocument())
    expect(screen.getByRole("button", { name: "Last month" })).toHaveAttribute("aria-pressed", "true")
    const asked = vi.mocked(invoke).mock.calls.at(-1)?.[1] as { since: string }
    expect(asked.since).toBe(monthRange(new Date(), 1).since)
  })

  it("says when the projects couldn't be read, and shows a priced month whose dollars no project took", async () => {
    vi.mocked(invoke).mockRejectedValue("scan failed")
    const { unmount } = render(<UsageProjects pluginId="claude" />)
    expect(await screen.findByText(/Couldn't read the projects/)).toBeInTheDocument()
    unmount()

    vi.mocked(invoke).mockResolvedValue(projects([], { totalCost: 12, unattributedCost: 12, unreadable: 3 }))
    render(<UsageProjects pluginId="claude" />)
    expect(await screen.findByText(/^\$12(\.00)?$/)).toBeInTheDocument()
    expect(screen.getByText(/couldn't be matched to a project/)).toBeInTheDocument()
    expect(screen.queryByText("No usage in this month.")).toBeNull()
  })

  it("keeps a monthly budget per project in the chosen currency and colors the bar from 80%", async () => {
    useAppPreferencesStore.setState({ currency: { code: "EUR", rate: 0.5 } })
    vi.mocked(invoke).mockResolvedValue(projects([project("shop", 41, 10)]))
    render(<UsageProjects pluginId="claude" />)
    fireEvent.click(await screen.findByRole("button", { name: /shop/ }))
    // Not an amount: said, and nothing saved.
    fireEvent.change(screen.getByLabelText("Monthly budget"), { target: { value: "lots" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByRole("alert")).toHaveTextContent(/Type an amount/)
    expect(saveProjectBudgets).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("Monthly budget"), { target: { value: "25" } })
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    // 25 EUR at 0.5 EUR a dollar is a $50 budget, of which $41 is 82%.
    const budgets = { claude: { "C:/work/shop": 50 } }
    await waitFor(() => expect(useAppPreferencesStore.getState().projectBudgets).toEqual(budgets))
    expect(saveProjectBudgets).toHaveBeenCalledWith(budgets)
    expect(screen.getByText(/82% of the budget used/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /shop/ }).querySelector(".bg-yellow-500")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    await waitFor(() => expect(useAppPreferencesStore.getState().projectBudgets).toEqual({}))
  })

  it("keeps the other budgets on disk when the store never loaded them, and queues quick saves", async () => {
    vi.mocked(loadProjectBudgets).mockResolvedValue({ codex: { "C:/work/api": 30 } })
    vi.mocked(invoke).mockResolvedValue(projects([project("shop", 10, 10)]))
    render(<UsageProjects pluginId="claude" />)
    fireEvent.click(await screen.findByRole("button", { name: /shop/ }))
    fireEvent.change(screen.getByLabelText("Monthly budget"), { target: { value: "1,000" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(saveProjectBudgets).toHaveBeenCalledWith({ codex: { "C:/work/api": 30 }, claude: { "C:/work/shop": 1000 } })
    )


    // Two saves at once: the second reads what the first wrote, so neither edit is lost.
    let disk: Record<string, Record<string, number>> = { codex: { "C:/work/api": 30 } }
    vi.mocked(loadProjectBudgets).mockImplementation(async () => structuredClone(disk))
    vi.mocked(saveProjectBudgets).mockImplementation(async (next) => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      disk = structuredClone(next)
    })
    fireEvent.change(screen.getByLabelText("Monthly budget"), { target: { value: "70" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    fireEvent.change(screen.getByLabelText("Monthly budget"), { target: { value: "80" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(disk).toEqual({ codex: { "C:/work/api": 30 }, claude: { "C:/work/shop": 80 } }))

    // A save that fails is logged, as for every setting, and keeps what was there.
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(loadProjectBudgets).mockRejectedValue(new Error("store"))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(error).toHaveBeenCalledWith("Failed to save project budgets:", expect.any(Error)))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(disk.claude).toEqual({ "C:/work/shop": 80 })
    error.mockRestore()
  })

  it("saves the month as CSV and says where", async () => {
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === "export_projects_csv" ? "C:/Users/me/Downloads/OpenTokenUsage-projects-claude-2026-11.csv" : projects([project("shop", 5, 10, [
        { name: "main", ticket: null, cost: 5, tokens: 10 },
      ])])
    )
    render(<UsageProjects pluginId="claude" />)
    fireEvent.click(await screen.findByRole("button", { name: "Export CSV" }))
    expect(await screen.findByRole("status")).toHaveTextContent(/Saved to .*OpenTokenUsage-projects-claude/)
    const [, args] = vi.mocked(invoke).mock.calls.find(([command]) => command === "export_projects_csv")!
    expect(args).toMatchObject({ pluginId: "claude", month: expect.stringMatching(/^\d{4}-\d{2}$/) })
    expect((args as { csv: string }).csv).toMatch(/^Month,Project,Folder,Branch,Ticket,Tokens,Cost \(USD\)\r\n.*,shop,C:\/work\/shop,main,,10,5\.0000\r\n$/)
  })

  it("is not shown for cards without local logs", () => {
    const { container } = render(<UsageProjects pluginId="cursor" />)
    expect(container).toBeEmptyDOMElement()
    expect(invoke).not.toHaveBeenCalled()
  })
})
