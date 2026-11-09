import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DetailSection, useStoredDetailSections } from "@/components/detail-section"
import { ProviderCard } from "@/components/provider-card"
import type { MetricLine } from "@/lib/plugin-types"
import {
  DEFAULT_COLLAPSED_SECTIONS,
  loadCollapsedSections,
  normalizeCollapsedSections,
  saveCollapsedSections,
} from "@/lib/settings"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }))
vi.mock("@/lib/settings", async (original) => ({
  ...(await original<typeof import("@/lib/settings")>()),
  loadCollapsedSections: vi.fn(async () => []),
  saveCollapsedSections: vi.fn(async () => {}),
}))
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children, render }: { children?: ReactNode; render?: unknown }) =>
    typeof render === "function" ? render({ children }) : <div>{children}</div>,
  TooltipContent: () => null,
}))

const LINES: MetricLine[] = [
  { type: "progress", label: "Weekly", used: 30, limit: 100, format: { kind: "percent" } },
  {
    type: "text",
    label: "Rate Limit Resets",
    value: "4 available",
    resetCredits: [
      { count: 1, expiresAt: "2099-12-16T04:59:00Z", kind: "weekly" },
      { count: 3, expiresAt: "2099-03-09T07:59:00Z", kind: "fable" },
    ],
  },
  { type: "text", label: "Today", value: "$18.18 · 39M tokens" },
  { type: "barChart", label: "Usage Trend", points: [{ label: "2/1", value: 1, valueLabel: "1 token" }] },
  { type: "text", label: "claude-opus-5-5", value: "94.3%" },
]
const title = (name: string | RegExp) => screen.getByRole("button", { name })

describe("detail page sections", () => {
  beforeEach(() => {
    vi.mocked(saveCollapsedSections).mockClear()
    useAppPreferencesStore.setState({ collapsedSections: DEFAULT_COLLAPSED_SECTIONS })
  })

  it("lays a provider's lines out under titles that close, models closed at first", () => {
    render(<ProviderCard name="Claude" displayMode="used" lines={LINES} />)
    expect(screen.getByText("Weekly")).toBeInTheDocument()
    // Resets: the count beside the title, a row per kind under it.
    expect(title("Rate Limit Resets")).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("4 available")).toBeInTheDocument()
    expect(screen.getByText("Fable reset").textContent).toBe("Fable reset ×3")
    expect(title("Cost")).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Today")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Usage Trend/ })).toBeInTheDocument()
    expect(title("Models")).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("claude-opus-5-5")).toBeNull()
  })

  it("closes and opens a section on its title, keeps the count in view, and saves it", () => {
    render(<ProviderCard name="Claude" displayMode="used" lines={LINES} />)
    fireEvent.click(title("Models"))
    expect(screen.getByText("claude-opus-5-5")).toBeInTheDocument()
    expect(saveCollapsedSections).toHaveBeenLastCalledWith(["heatmap"])

    fireEvent.click(title("Rate Limit Resets"))
    expect(screen.queryByText("Fable reset")).toBeNull()
    expect(screen.getByText("4 available")).toBeInTheDocument()
    expect(saveCollapsedSections).toHaveBeenLastCalledWith(["heatmap", "resets"])
    expect(useAppPreferencesStore.getState().collapsedSections).toEqual(["heatmap", "resets"])
  })

  it("leaves the overview card as one run of lines", () => {
    render(
      <ProviderCard
        name="Claude"
        displayMode="used"
        lines={LINES}
        scopeFilter="overview"
        skeletonLines={LINES.map((line) => ({ type: line.type, label: line.label, scope: "overview" as const }))}
      />
    )
    expect(screen.queryByRole("button", { name: "Cost" })).toBeNull()
    expect(screen.getByText("claude-opus-5-5")).toBeInTheDocument()
  })

  it("shows what stands beside the title while closed, and the controls while open", () => {
    useAppPreferencesStore.setState({ collapsedSections: ["projects"] })
    render(
      <DetailSection id="projects" title="Projects" aside="12" controls={<button type="button">This month</button>}>
        <p>rows</p>
      </DetailSection>
    )
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.queryByText("rows")).toBeNull()
    fireEvent.click(title("Projects"))
    expect(screen.getByText("rows")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "This month" })).toBeInTheDocument()
    expect(screen.queryByText("12")).toBeNull()
  })

  it("gives a section with nothing under it a title that opens nothing", () => {
    const none: MetricLine[] = [{ type: "text", label: "Rate Limit Resets", value: "0 available", resetCredits: [] }]
    render(<ProviderCard name="Claude" displayMode="used" lines={none} />)
    expect(screen.getByText("Rate Limit Resets")).toBeInTheDocument()
    expect(screen.getByText("0 available")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Rate Limit Resets" })).toBeNull()
  })

  it("restores the closed sections at start, and keeps the defaults when that fails", async () => {
    vi.mocked(loadCollapsedSections).mockResolvedValueOnce(["projects"])
    const { unmount } = renderHook(() => useStoredDetailSections())
    await waitFor(() => expect(useAppPreferencesStore.getState().collapsedSections).toEqual(["projects"]))
    unmount()

    useAppPreferencesStore.setState({ collapsedSections: DEFAULT_COLLAPSED_SECTIONS })
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(loadCollapsedSections).mockRejectedValueOnce(new Error("locked"))
    renderHook(() => useStoredDetailSections())
    await waitFor(() => expect(logged).toHaveBeenCalled())
    expect(useAppPreferencesStore.getState().collapsedSections).toEqual(DEFAULT_COLLAPSED_SECTIONS)
    logged.mockRestore()
  })

  it("still closes a section when saving that fails: the failure is only logged", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(saveCollapsedSections).mockRejectedValueOnce(new Error("disk full"))
    render(<ProviderCard name="Claude" displayMode="used" lines={LINES} />)
    fireEvent.click(title("Cost"))
    expect(screen.queryByText("Today")).toBeNull()
    await waitFor(() => expect(logged).toHaveBeenCalled())
    expect(screen.queryByRole("alert")).toBeNull()
    logged.mockRestore()
  })

  it("reads a saved list of closed sections, and starts from the defaults without one", () => {
    expect(normalizeCollapsedSections(undefined)).toEqual(DEFAULT_COLLAPSED_SECTIONS)
    expect(normalizeCollapsedSections("models")).toEqual(DEFAULT_COLLAPSED_SECTIONS)
    expect(normalizeCollapsedSections([])).toEqual([])
    expect(normalizeCollapsedSections(["projects", "nonsense", 3, "resets", "projects"])).toEqual(["resets", "projects"])
  })
})
