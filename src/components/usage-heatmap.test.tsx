import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { hasUsageLogs, heatmapGrid, UsageHeatmap, type Heatmap } from "@/components/usage-heatmap"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }))
let panelOpen = true
vi.mock("@/hooks/use-unseen-usage", () => ({ usePanelOpen: () => panelOpen }))
vi.mock("@/lib/settings", async (original) => ({
  ...(await original<typeof import("@/lib/settings")>()),
  saveCollapsedSections: vi.fn(async () => {}),
}))

// The host's UTC quarter hour of a local time; 2026-02-02 is a Monday.
const slotOf = (day: number, hour: number, minute = 0) => new Date(2026, 1, 2 + day, hour, minute).getTime() / 900_000
const heatmap = (slots: [number, number][], unreadable = 0): Heatmap => ({ slots, unreadable })
const readout = () => screen.getByText(/Busiest|tokens$/)

describe("usage heatmap", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    panelOpen = true
    // The grid starts closed; these tests are about it open.
    useAppPreferencesStore.setState({ collapsedSections: [] })
  })

  it("reads nothing while its section is closed, and reads once it's opened", async () => {
    useAppPreferencesStore.setState({ collapsedSections: ["heatmap"] })
    vi.mocked(invoke).mockResolvedValue(heatmap([[slotOf(1, 14), 10]]))
    render(<UsageHeatmap pluginId="claude" />)
    const title = screen.getByRole("button", { name: "Usage by hour, last 4 weeks" })
    expect(title).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("grid")).toBeNull()
    expect(invoke).not.toHaveBeenCalled()

    fireEvent.click(title)
    await waitFor(() => expect(screen.getByRole("grid")).toBeInTheDocument())
    expect(title).toHaveAttribute("aria-expanded", "true")
    expect(useAppPreferencesStore.getState().collapsedSections).toEqual([])
  })

  it("adds the quarter hours up per local weekday, Monday first, and hour", () => {
    const grid = heatmapGrid([
      [slotOf(0, 9), 100],
      [slotOf(0, 9, 45), 20], // same hour, later quarter
      [slotOf(7, 9), 50], // the next Monday, same hour
      [slotOf(6, 23, 30), 7], // Sunday night
    ])
    expect(grid).toHaveLength(7)
    expect(grid[0][9]).toBe(170)
    expect(grid[6][23]).toBe(7)
    expect(grid.flat().reduce((sum, value) => sum + value, 0)).toBe(177)
  })

  it("is shown for Claude and Codex logins, not for WSL copies or other providers", () => {
    expect(["claude", "codex", "claude-1a2b3c4d", "codex-0011aabb"].every(hasUsageLogs)).toBe(true)
    expect(["claude-wsl-0011aabb", "cursor", "openrouter"].some(hasUsageLogs)).toBe(false)
  })

  it("names the busiest hour and gives every cell its tokens", async () => {
    vi.mocked(invoke).mockResolvedValue(heatmap([[slotOf(1, 14), 2_500_000], [slotOf(3, 8), 1_000]]))
    render(<UsageHeatmap pluginId="claude" />)
    await waitFor(() => expect(readout().textContent).toMatch(/Busiest: Tue 2:00/))
    expect(invoke).toHaveBeenCalledWith("usage_heatmap", { pluginId: "claude" })
    expect(screen.getAllByRole("gridcell")).toHaveLength(7 * 24)
    expect(screen.getByRole("gridcell", { name: /Tue 2:00.*2\.5M tokens/ })).toBeInTheDocument()
  })

  it("follows the clock setting", async () => {
    vi.mocked(invoke).mockResolvedValue(heatmap([[slotOf(1, 14), 10]]))
    render(<UsageHeatmap pluginId="claude" timeFormatMode="24h" />)
    await waitFor(() => expect(readout().textContent).toMatch(/Tue 14:00/))
  })

  it("is one tab stop whose arrow keys read each cell out", async () => {
    vi.mocked(invoke).mockResolvedValue(heatmap([[slotOf(1, 14), 2_500_000]]))
    render(<UsageHeatmap pluginId="claude" />)
    await waitFor(() => expect(readout()).toBeInTheDocument())
    const stops = screen.getAllByRole("gridcell").filter((cell) => cell.tabIndex === 0)
    expect(stops).toHaveLength(1)

    act(() => stops[0].focus())
    expect(readout().textContent).toMatch(/Tue 2:00.*2\.5M tokens/)
    fireEvent.keyDown(stops[0], { key: "ArrowRight" })
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/Tue 3:00/)
    expect(readout().textContent).toMatch(/Tue 3:00.*0 tokens/)
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" })
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/Mon 3:00/)

    // Ctrl+Down switches the provider (use-panel.ts): the grid leaves it alone.
    const focused = document.activeElement!
    expect(fireEvent.keyDown(focused, { key: "ArrowDown", ctrlKey: true })).toBe(true)
    expect(document.activeElement).toBe(focused)
  })

  it("forgets the focused cell once the grid leaves the page", async () => {
    vi.mocked(invoke).mockResolvedValue(heatmap([[slotOf(1, 14), 2_500_000]]))
    const { rerender } = render(<UsageHeatmap pluginId="claude" />)
    await waitFor(() => expect(readout()).toBeInTheDocument())
    const stop = screen.getAllByRole("gridcell").find((cell) => cell.tabIndex === 0)!
    act(() => stop.focus())
    fireEvent.keyDown(stop, { key: "ArrowRight" })
    expect(readout().textContent).toMatch(/Tue 3:00/)

    // Another card picked with the cell still focused, then back: the busiest hour again.
    rerender(<UsageHeatmap pluginId="cursor" />)
    rerender(<UsageHeatmap pluginId="claude" />)
    expect(readout().textContent).toMatch(/Busiest: Tue 2:00/)
    expect(screen.getAllByRole("gridcell").filter((cell) => cell.tabIndex === 0)[0].getAttribute("aria-label")).toMatch(
      /Tue 2:00/
    )
  })

  it("says how many logs it couldn't read", async () => {
    vi.mocked(invoke).mockResolvedValue(heatmap([], 2))
    render(<UsageHeatmap pluginId="codex" />)
    await waitFor(() => expect(screen.getByText("Log files that couldn't be read: 2")).toBeInTheDocument())
    expect(screen.queryByRole("grid")).toBeNull()
  })

  it("never shows one card's hours under another card picked on the same page", async () => {
    vi.mocked(invoke).mockResolvedValue(heatmap([[slotOf(1, 14), 2_500_000]]))
    const { container, rerender } = render(<UsageHeatmap pluginId="claude" />)
    await waitFor(() => expect(screen.getByText(/Busiest/)).toBeInTheDocument())

    rerender(<UsageHeatmap pluginId="cursor" />)
    expect(container).toBeEmptyDOMElement()

    // Codex's first read is still running: its title alone until it answers.
    let answer: (value: Heatmap) => void = () => {}
    vi.mocked(invoke).mockReturnValue(new Promise((resolve) => (answer = resolve)))
    rerender(<UsageHeatmap pluginId="codex" />)
    expect(screen.queryByRole("grid")).toBeNull()
    expect(screen.queryByText(/Busiest/)).toBeNull()
    answer(heatmap([[slotOf(3, 8), 1_000]]))
    await waitFor(() => expect(screen.getByText(/Busiest/).textContent).toMatch(/Thu/))
  })

  it("shows no grid without usage, and reads nothing while the panel is hidden or for other cards", async () => {
    vi.mocked(invoke).mockResolvedValue(heatmap([]))
    render(<UsageHeatmap pluginId="codex" />)
    await waitFor(() => expect(invoke).toHaveBeenCalled())
    expect(screen.queryByRole("grid")).toBeNull()

    vi.mocked(invoke).mockClear()
    const other = render(<UsageHeatmap pluginId="cursor" />)
    expect(other.container).toBeEmptyDOMElement()
    panelOpen = false
    render(<UsageHeatmap pluginId="claude" />)
    expect(invoke).not.toHaveBeenCalled()
  })
})
