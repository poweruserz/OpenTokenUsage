import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { ProviderCard } from "@/components/provider-card"

// Not in Tauri: the Claude card's live sessions stay out of these status-badge checks.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }))
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }))

const renderCard = (statusPageUrl: string | null = "https://status.example.com") =>
  render(<ProviderCard name="Claude" pluginId="claude" statusPageUrl={statusPageUrl} displayMode="used" />)

describe("ProviderStatusBadge", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    vi.mocked(openUrl).mockClear()
  })

  it("shows a major incident and opens the status page", async () => {
    vi.mocked(invoke).mockResolvedValue({ indicator: "major", description: "Partial System Outage" })
    renderCard()

    const badge = await screen.findByRole("button", { name: "Partial outage: Partial System Outage" })
    expect(invoke).toHaveBeenCalledWith("get_provider_status", { pluginId: "claude" })
    await userEvent.click(badge)
    expect(openUrl).toHaveBeenCalledWith("https://status.example.com")
  })

  it("stays hidden when everything is operational", async () => {
    vi.mocked(invoke).mockResolvedValue({ indicator: "none", description: "All Systems Operational" })
    renderCard()

    await waitFor(() => expect(invoke).toHaveBeenCalled())
    expect(screen.queryByText("All Systems Operational")).not.toBeInTheDocument()
    expect(screen.queryByText(/outage|Degraded|Maintenance/)).not.toBeInTheDocument()
  })

  it("does not call the host without a status page", () => {
    renderCard(null)
    expect(invoke).not.toHaveBeenCalled()
  })
})
