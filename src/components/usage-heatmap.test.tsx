import { render, screen, waitFor } from "@testing-library/react"
import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { hasUsageLogs, heatmapGrid, UsageHeatmap } from "@/components/usage-heatmap"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }))
let panelOpen = true
vi.mock("@/hooks/use-unseen-usage", () => ({ usePanelOpen: () => panelOpen }))

// The host's UTC hour of a local time; 2026-02-02 is a Monday.
const hourOf = (day: number, hour: number) => new Date(2026, 1, 2 + day, hour).getTime() / 3_600_000

describe("usage heatmap", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    panelOpen = true
  })

  it("adds the hours up per local weekday, Monday first, and hour", () => {
    const grid = heatmapGrid([
      [hourOf(0, 9), 100],
      [hourOf(7, 9), 50], // the next Monday, same hour
      [hourOf(6, 23), 7], // Sunday night
    ])
    expect(grid).toHaveLength(7)
    expect(grid[0][9]).toBe(150)
    expect(grid[6][23]).toBe(7)
    expect(grid.flat().reduce((sum, value) => sum + value, 0)).toBe(157)
  })

  it("is shown for Claude and Codex logins, not for WSL copies or other providers", () => {
    expect(["claude", "codex", "claude-1a2b3c4d", "codex-0011aabb"].every(hasUsageLogs)).toBe(true)
    expect(["claude-wsl-0011aabb", "cursor", "openrouter"].some(hasUsageLogs)).toBe(false)
  })

  it("shows the busiest hour and each cell's tokens", async () => {
    vi.mocked(invoke).mockResolvedValue([
      [hourOf(1, 14), 2_500_000],
      [hourOf(3, 8), 1_000],
    ])
    const { container } = render(<UsageHeatmap pluginId="claude" />)
    await waitFor(() => expect(screen.getByText(/Busiest/)).toBeInTheDocument())
    expect(invoke).toHaveBeenCalledWith("usage_heatmap", { pluginId: "claude" })
    expect(screen.getByText(/Busiest/).textContent).toMatch(/Tue/)
    expect(container.querySelector('[title*="2.5M"]')).not.toBeNull()
  })

  it("never shows one card's hours under another card picked on the same page", async () => {
    vi.mocked(invoke).mockResolvedValue([[hourOf(1, 14), 2_500_000]])
    const { container, rerender } = render(<UsageHeatmap pluginId="claude" />)
    await waitFor(() => expect(screen.getByText(/Busiest/)).toBeInTheDocument())

    rerender(<UsageHeatmap pluginId="cursor" />)
    expect(container).toBeEmptyDOMElement()

    // Codex's first read is still running: nothing until it answers.
    let answer: (hours: [number, number][]) => void = () => {}
    vi.mocked(invoke).mockReturnValue(new Promise((resolve) => (answer = resolve)))
    rerender(<UsageHeatmap pluginId="codex" />)
    expect(container).toBeEmptyDOMElement()
    answer([[hourOf(3, 8), 1_000]])
    await waitFor(() => expect(screen.getByText(/Busiest/).textContent).toMatch(/Thu/))
  })

  it("stays empty without usage, while the panel is hidden, and for other cards", async () => {
    vi.mocked(invoke).mockResolvedValue([])
    const { container } = render(<UsageHeatmap pluginId="codex" />)
    await waitFor(() => expect(invoke).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()

    vi.mocked(invoke).mockClear()
    render(<UsageHeatmap pluginId="cursor" />)
    panelOpen = false
    render(<UsageHeatmap pluginId="claude" />)
    expect(invoke).not.toHaveBeenCalled()
  })
})
