import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ClaudeCodeSection } from "@/components/claude-code-section"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

// The state on opening, then what switching answers (a rejection: what Tauri rejects with); the log
// retention beside it keeps Claude's default.
const answer = (state: string, switched: string | { rejected: string } = state) =>
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "claude_statusline_state") return state
    if (command === "set_claude_statusline") {
      if (typeof switched === "object") throw switched.rejected
      return switched
    }
    if (command === "claude_log_retention") return 30
    throw new Error(`unexpected ${command}`)
  })

describe("ClaudeCodeSection", () => {
  // Braces: a function returned from beforeEach is run as a cleanup hook.
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
  })

  it("switches the bridge on and off from the checkbox", async () => {
    answer("off", "on")
    render(<ClaudeCodeSection />)
    const checkbox = await screen.findByRole("checkbox", { name: "Use Claude Code's status line" })
    expect(checkbox).not.toBeChecked()

    await userEvent.click(checkbox)
    expect(invoke).toHaveBeenCalledWith("set_claude_statusline", { enabled: true })
    expect(checkbox).toBeChecked()
    expect(screen.getByText(/Adds a status-line command/)).toBeInTheDocument()
  })

  it("leaves a status line of the user's alone and says why", async () => {
    answer("other")
    render(<ClaudeCodeSection />)
    expect(await screen.findByText(/already runs a status line of yours/)).toBeInTheDocument()
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true")
  })

  it("shows the reason when settings.json turns out to be unreadable on switching", async () => {
    // Tauri rejects with the command's error value: here the state that kept it from switching.
    answer("off", { rejected: "unreadable" })
    render(<ClaudeCodeSection />)
    await userEvent.click(await screen.findByRole("checkbox"))
    expect(await screen.findByText(/couldn't be read as JSON/)).toBeInTheDocument()
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "set_claude_statusline")).toHaveLength(1)
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true")
  })
})
