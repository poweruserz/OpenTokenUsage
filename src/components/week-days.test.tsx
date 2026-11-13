import { render, screen } from "@testing-library/react"
import { invoke } from "@tauri-apps/api/core"
import { beforeEach, expect, it, vi } from "vitest"
import { dayBounds, WeekDays } from "@/components/week-days"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }))
vi.mock("@/hooks/use-unseen-usage", () => ({ usePanelOpen: () => true }))

const DAY = 86_400_000

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  useAppPreferencesStore.setState({ collapsedSections: [] })
})

it("cuts a weekly limit at each local midnight up to now", () => {
  const start = new Date(2026, 10, 5, 10, 7).getTime() // Thu 5 Nov, 10:07
  const now = new Date(2026, 10, 7, 15).getTime()
  expect(dayBounds(start, now)).toEqual([
    start,
    new Date(2026, 10, 6).getTime(),
    new Date(2026, 10, 7).getTime(),
    now,
  ])
  // Before its first midnight: one day.
  expect(dayBounds(start, start + 60_000)).toEqual([start, start + 60_000])
})

it("shares the weekly limit used so far out over the days by their weighted tokens", async () => {
  vi.mocked(invoke).mockResolvedValue([1, 3])
  const resetsAt = new Date(Date.now() + 6 * DAY).toISOString() // a day and a bit into the week
  render(<WeekDays pluginId="claude" weekly={{ used: 40, limit: 100, resetsAt, periodDurationMs: 7 * DAY }} />)
  const days = await screen.findAllByRole("listitem")
  expect(days.map((day) => day.querySelector(".sr-only")?.textContent)).toEqual([
    expect.stringMatching(/: about 10% of the weekly limit$/),
    expect.stringMatching(/: about 30% of the weekly limit$/),
  ])
  expect(screen.getByText(/The 40% of the weekly limit used so far/)).toBeInTheDocument()
  const asked = vi.mocked(invoke).mock.calls[0][1] as { pluginId: string; bounds: number[] }
  expect(asked.pluginId).toBe("claude")
  expect(asked.bounds[0]).toBe(Math.round(Date.parse(resetsAt) / 60_000) * 60_000 - 7 * DAY)
})

it("writes a tiny day in the language's own percent style", async () => {
  vi.mocked(invoke).mockResolvedValue([1, 999])
  const resetsAt = new Date(Date.now() + 6 * DAY).toISOString()
  render(<WeekDays pluginId="claude" weekly={{ used: 40, limit: 100, resetsAt, periodDurationMs: 7 * DAY }} />)
  expect(await screen.findByText(`<${new Intl.NumberFormat("en-US", { style: "percent" }).format(0.01)}`)).toBeInTheDocument()
})

it("leaves out a window longer than a week, which Codex can also call weekly", () => {
  const weekly = { used: 40, limit: 100, resetsAt: new Date(Date.now() + DAY).toISOString(), periodDurationMs: 30 * DAY }
  const { container } = render(<WeekDays pluginId="codex" weekly={weekly} />)
  expect(container).toBeEmptyDOMElement()
  expect(invoke).not.toHaveBeenCalled()
})

it("is not shown without a weekly line, for cards without local logs, and reads nothing while closed", () => {
  const weekly = { used: 40, limit: 100, resetsAt: new Date(Date.now() + DAY).toISOString(), periodDurationMs: 7 * DAY }
  const { container, unmount } = render(<WeekDays pluginId="claude" />)
  expect(container).toBeEmptyDOMElement()
  unmount()
  render(<WeekDays pluginId="cursor" weekly={weekly} />)
  expect(screen.queryByText("Weekly limit by day")).toBeNull()

  useAppPreferencesStore.setState({ collapsedSections: ["week"] })
  render(<WeekDays pluginId="claude" weekly={weekly} />)
  expect(screen.getByText("Weekly limit by day")).toBeInTheDocument()
  expect(invoke).not.toHaveBeenCalled()
})
