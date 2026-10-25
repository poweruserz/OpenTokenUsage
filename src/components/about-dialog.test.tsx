import { readFileSync } from "node:fs"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AboutDialog } from "@/components/about-dialog"
import { SUPPORT_URL } from "@/lib/support"

const openerState = vi.hoisted(() => ({
  openUrlMock: vi.fn(() => Promise.resolve()),
}))

const changelogState = vi.hoisted(() => ({
  releases: [] as import("@/hooks/use-changelog").Release[],
  loading: false,
  error: null as string | null,
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openerState.openUrlMock,
}))

vi.mock("@/hooks/use-changelog", () => ({
  useChangelog: () => changelogState,
}))

describe("AboutDialog", () => {
  it("renders version, links, and maintainers", () => {
    render(<AboutDialog version="1.2.3" onClose={() => {}} />)
    expect(screen.getByText("OpenTokenUsage")).toBeInTheDocument()
    expect(screen.getByText("v1.2.3")).toBeInTheDocument()
    expect(screen.getByText("GitHub")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "PowerUserZ" })).toBeInTheDocument()
  })

  it("opens maintainer GitHub profiles on click", async () => {
    render(<AboutDialog version="1.2.3" onClose={() => {}} />)

    await userEvent.click(screen.getByRole("button", { name: "PowerUserZ" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith("https://github.com/PowerUserZ")
  })

  it("opens the Buy Me a Coffee page, the same one the tray menu opens", async () => {
    render(<AboutDialog version="1.2.3" onClose={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Buy me a coffee" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith(SUPPORT_URL)
    expect(screen.getByText("buymeacoffee.com/poweruserz")).toBeInTheDocument()
    expect(readFileSync("src-tauri/src/tray.rs", "utf8")).toContain(`const SUPPORT_URL: &str = "${SUPPORT_URL}";`)
  })

  it("closes on Escape", async () => {
    const onClose = vi.fn()
    render(<AboutDialog version="1.2.3" onClose={onClose} />)
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
  })

  it("goes back to about view on Escape when showing changelog", async () => {
    const onClose = vi.fn()
    render(<AboutDialog version="1.2.3" onClose={onClose} />)

    // Switch to changelog view.
    await userEvent.click(screen.getByRole("button", { name: "View changelog" }))

    // Press Escape; should go back to About view, not close.
    await userEvent.keyboard("{Escape}")

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText("OpenTokenUsage")).toBeInTheDocument()
  })

  it("does not close on other keys", async () => {
    const onClose = vi.fn()
    render(<AboutDialog version="1.2.3" onClose={onClose} />)
    await userEvent.keyboard("{Enter}")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("closes on backdrop click only", async () => {
    const onClose = vi.fn()
    const { container } = render(<AboutDialog version="1.2.3" onClose={onClose} />)
    const backdrop = container.firstElementChild as HTMLElement
    await userEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)

    // Clicking inside the dialog should not close.
    onClose.mockClear()
    await userEvent.click(screen.getByText("OpenTokenUsage"))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("calls openUrl and logs errors on failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    openerState.openUrlMock.mockImplementationOnce(() => Promise.reject(new Error("fail")))

    render(<AboutDialog version="1.2.3" onClose={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "GitHub" }))

    expect(openerState.openUrlMock).toHaveBeenCalled()
    // wait microtask for catch
    await Promise.resolve()
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it("closes when document becomes hidden", () => {
    const onClose = vi.fn()
    render(<AboutDialog version="1.2.3" onClose={onClose} />)

    const original = Object.getOwnPropertyDescriptor(document, "hidden")
    Object.defineProperty(document, "hidden", { value: true, configurable: true })
    document.dispatchEvent(new Event("visibilitychange"))
    expect(onClose).toHaveBeenCalled()

    if (original) {
      Object.defineProperty(document, "hidden", original)
    }
  })

  it("does not close on visibilitychange when document is visible", () => {
    const onClose = vi.fn()
    render(<AboutDialog version="1.2.3" onClose={onClose} />)

    const original = Object.getOwnPropertyDescriptor(document, "hidden")
    Object.defineProperty(document, "hidden", { value: false, configurable: true })
    document.dispatchEvent(new Event("visibilitychange"))
    expect(onClose).not.toHaveBeenCalled()

    if (original) {
      Object.defineProperty(document, "hidden", original)
    }
  })
})

