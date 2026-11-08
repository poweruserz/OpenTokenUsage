import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { monthRange, UsageProjects, type Project, type Projects } from "@/components/usage-projects"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }))
vi.mock("@/hooks/use-unseen-usage", () => ({ usePanelOpen: () => true }))

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
    useAppPreferencesStore.setState({ currency: { code: "USD", rate: 1 } })
  })

  it("asks for this local month, or the last one, with ccusage's first and last day", () => {
    const now = new Date(2026, 2, 15, 12) // 15 March 2026
    expect(monthRange(now, 0)).toEqual({
      startMs: new Date(2026, 2, 1).getTime(), endMs: new Date(2026, 3, 1).getTime(), since: "20260301", until: "20260331",
    })
    expect(monthRange(new Date(2026, 0, 3), 1)).toMatchObject({ since: "20251201", until: "20251231" })
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

  it("is not shown for cards without local logs", () => {
    const { container } = render(<UsageProjects pluginId="cursor" />)
    expect(container).toBeEmptyDOMElement()
    expect(invoke).not.toHaveBeenCalled()
  })
})
