import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { openUrl } from "@tauri-apps/plugin-opener"
import { ResetCredits } from "@/components/reset-credits"
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }))
const now = Date.parse("2026-10-24T12:00:00Z")
const url = "https://chatgpt.com/settings/usage"
describe("reset inventory", () => {
  it("shows live count, countdown, absolute expiry, unknown expiry and opens usage", async () => {
    render(
      <ResetCredits
        now={now}
        usageUrl={url}
        credits={[
          { count: 1, expiresAt: "2026-10-26T15:00:00Z" },
          { count: 2 },
          { count: 1, expiresAt: "2020-01-01T00:00:00Z" }
        ]}
      />
    )
    expect(screen.getByText("3 available")).toBeInTheDocument()
    expect(screen.getByText("1 reset(s) expire in 2d 3h")).toBeInTheDocument()
    expect(screen.getByText("2 reset(s): expiry unavailable")).toBeInTheDocument()
    expect(screen.getByText(/2026/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button"))
    expect(openUrl).toHaveBeenCalledWith(url)
  })
  it("removes expired resets between probes", () => {
    const credits = [{ count: 1, expiresAt: new Date(now + 1000).toISOString() }]
    const { rerender } = render(<ResetCredits credits={credits} now={now} usageUrl={url} />)
    rerender(<ResetCredits credits={credits} now={now + 1000} usageUrl={url} />)
    expect(screen.getByText("0 available")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
  it("shows a visible error if opening the page fails", async () => {
    vi.mocked(openUrl).mockRejectedValueOnce(new Error("blocked"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<ResetCredits credits={[{ count: 1 }]} now={now} usageUrl={url} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not open"))
  })
})
