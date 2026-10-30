import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { openUrl } from "@tauri-apps/plugin-opener"
import { invoke } from "@tauri-apps/api/core"

import { SideNav } from "@/components/side-nav"
import { ISSUES_URL, REPO_URL, SUPPORT_URL } from "@/lib/support"

const darkModeState = vi.hoisted(() => ({
  useDarkModeMock: vi.fn(() => false),
}))

vi.mock("@/hooks/use-dark-mode", () => ({
  useDarkMode: darkModeState.useDarkModeMock,
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}))

describe("SideNav", () => {
  it("calls onViewChange for Home and Settings", async () => {
    const onViewChange = vi.fn()
    render(<SideNav activeView="home" onViewChange={onViewChange} plugins={[]} />)

    await userEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(onViewChange).toHaveBeenCalledWith("settings")

    await userEvent.click(screen.getByRole("button", { name: "Home" }))
    expect(onViewChange).toHaveBeenCalledWith("home")
  })

  it("renders plugin icon button and uses brand color when appropriate", () => {
    const onViewChange = vi.fn()
    render(
      <SideNav
        activeView="home"
        onViewChange={onViewChange}
        plugins={[
          { id: "p1", name: "Plugin 1", iconUrl: "icon.svg", brandColor: "#ff0000" },
        ]}
      />
    )

    const btn = screen.getByRole("button", { name: "Plugin 1" })
    expect(btn).toBeInTheDocument()

    const icon = screen.getByRole("img", { name: "Plugin 1" })
    expect(icon).toHaveStyle({ backgroundColor: "#ff0000" })
  })

  it("falls back to currentColor (light) or white (dark) for low-contrast brand colors", () => {
    const onViewChange = vi.fn()

    // Light mode + very light color => currentColor
    darkModeState.useDarkModeMock.mockReturnValueOnce(false)
    const { rerender } = render(
      <SideNav
        activeView="home"
        onViewChange={onViewChange}
        plugins={[{ id: "p", name: "P", iconUrl: "icon.svg", brandColor: "#ffffff" }]}
      />
    )
    const pStyle = screen.getByRole("img", { name: "P" }).getAttribute("style") ?? ""
    expect(pStyle).toMatch(/background-color:\s*currentcolor/i)

    // Dark mode + very dark color => white
    darkModeState.useDarkModeMock.mockReturnValueOnce(true)
    rerender(
      <SideNav
        activeView="home"
        onViewChange={onViewChange}
        plugins={[{ id: "p2", name: "P2", iconUrl: "icon.svg", brandColor: "#000000" }]}
      />
    )
    const p2Style = screen.getByRole("img", { name: "P2" }).getAttribute("style") ?? ""
    expect(p2Style).toContain("rgb(255, 255, 255)")
  })

  it("opens the FAQ in the panel from Help, with GitHub only as its last link", async () => {
    vi.mocked(openUrl).mockClear()
    vi.mocked(invoke).mockClear()
    render(<SideNav activeView="home" onViewChange={vi.fn()} plugins={[]} />)

    await userEvent.click(screen.getByRole("button", { name: "Help" }))
    expect(screen.getByRole("dialog", { name: "Frequently asked questions" })).toBeInTheDocument()
    expect(openUrl).not.toHaveBeenCalled()

    // Answers name settings by their own labels.
    await userEvent.click(screen.getByText("Can I track a second Claude or Codex account?"))
    expect(screen.getByText(/Settings → Extra accounts adds one/)).toBeVisible()

    await userEvent.click(screen.getByRole("button", { name: "Didn't find your answer? Ask on GitHub" }))
    expect(openUrl).toHaveBeenCalledWith(ISSUES_URL)
    expect(invoke).not.toHaveBeenCalledWith("hide_panel")

    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens the support dialog from the coffee cup instead of the site", async () => {
    vi.mocked(openUrl).mockClear()
    render(<SideNav activeView="home" onViewChange={vi.fn()} plugins={[]} />)

    await userEvent.click(screen.getByRole("button", { name: "Support OpenTokenUsage" }))
    expect(screen.getByRole("dialog", { name: "Keep OpenTokenUsage free" })).toBeInTheDocument()
    expect(screen.getByText("buymeacoffee.com/poweruserz")).toBeInTheDocument()
    expect(openUrl).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Maybe later" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(openUrl).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Support OpenTokenUsage" }))
    await userEvent.click(screen.getByRole("button", { name: "Buy me a coffee" }))
    expect(openUrl).toHaveBeenCalledWith(SUPPORT_URL)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("asks for a GitHub star in the support dialog", async () => {
    vi.mocked(openUrl).mockClear()
    render(<SideNav activeView="home" onViewChange={vi.fn()} plugins={[]} />)

    await userEvent.click(screen.getByRole("button", { name: "Support OpenTokenUsage" }))
    await userEvent.click(screen.getByRole("button", { name: "Star on GitHub" }))
    expect(openUrl).toHaveBeenCalledWith(REPO_URL)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("closes the support dialog on Escape", async () => {
    render(<SideNav activeView="home" onViewChange={vi.fn()} plugins={[]} />)
    await userEvent.click(screen.getByRole("button", { name: "Support OpenTokenUsage" }))
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
