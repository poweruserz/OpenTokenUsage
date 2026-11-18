import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loginFix, PluginError } from "@/components/plugin-error"
import type { PluginMeta } from "@/lib/plugin-types"
import { useAppPluginStore } from "@/stores/app-plugin-store"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }))
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }))

describe("PluginError", () => {
  beforeEach(() => vi.mocked(invoke).mockClear())

  it("renders message", () => {
    render(<PluginError message="Boom" />)
    expect(screen.getByText("Boom")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("shows a lost sign-in calmly and a failure in red", () => {
    const { unmount } = render(<PluginError message="Token expired. Run `codex` to log in again." />)
    expect(screen.getByRole("alert").className).not.toContain("destructive")
    unmount()
    render(<PluginError message="Request failed. Check your connection." />)
    expect(screen.getByRole("alert").className).toContain("destructive")
  })

  it("loginFix runs the login command, signs an account in its own folder, and skips WSL", () => {
    const expired = "Token expired. Run `codex` to log in again."
    loginFix(expired, "codex")?.()
    expect(invoke).toHaveBeenCalledWith("run_in_terminal", { command: "codex" })
    loginFix(expired, "codex-1a2b3c4d")?.()
    expect(invoke).toHaveBeenCalledWith("start_account_login", { id: "codex-1a2b3c4d" })
    expect(loginFix(expired, "codex-wsl-1a2b3c4d")).toBeNull()
    expect(loginFix("Request failed. Check your connection.", "codex")).toBeNull()
  })

  it("formats backtick code in message", () => {
    render(<PluginError message="Check `config.json` file" />)
    expect(screen.getByText("config.json")).toBeInTheDocument()
  })

  it("signs an extra account in to its own folder instead of the usual login", async () => {
    render(<PluginError message="Start Antigravity or run `agy` and try again." pluginId="claude-1a2b3c4d" />)
    await userEvent.click(screen.getByRole("button", { name: "Run agy in terminal" }))
    expect(invoke).toHaveBeenCalledWith("start_account_login", { id: "claude-1a2b3c4d" })
    expect(invoke).not.toHaveBeenCalledWith("run_in_terminal", expect.anything())
  })

  it("runs the login command in a terminal", async () => {
    render(<PluginError message="Start Antigravity or run `agy` and try again." />)
    await userEvent.click(screen.getByRole("button", { name: "Run agy in terminal" }))
    expect(invoke).toHaveBeenCalledWith("run_in_terminal", { command: "agy" })
  })

  it("explains a missing API key and opens Environment Variables", async () => {
    render(<PluginError message="No ZAI_API_KEY found. Set up environment variable first." />)
    expect(screen.getByText(/user variable named ZAI_API_KEY/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Open Environment Variables" }))
    expect(invoke).toHaveBeenCalledWith("open_env_editor", undefined)
  })

  it("links to the provider's API key page", async () => {
    const zai = { id: "zai", links: [{ label: "API keys", url: "https://z.ai/manage-apikey/apikey-list" }] }
    useAppPluginStore.getState().setPluginsMeta([zai as unknown as PluginMeta])
    render(<PluginError pluginId="zai" message="No ZAI_API_KEY found. Set up environment variable first." />)
    await userEvent.click(screen.getByRole("button", { name: "API keys" }))
    expect(openUrl).toHaveBeenCalledWith("https://z.ai/manage-apikey/apikey-list")
    useAppPluginStore.getState().setPluginsMeta([])
  })

  it("offers no Windows fix for a WSL card", () => {
    render(<PluginError message="Start Antigravity or run `agy` and try again." pluginId="claude-wsl-1a2b3c4d" />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
