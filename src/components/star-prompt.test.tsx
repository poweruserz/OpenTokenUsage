import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { initMock, markMock, openUrlMock, isVisibleMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  markMock: vi.fn(),
  openUrlMock: vi.fn(() => Promise.resolve()),
  isVisibleMock: vi.fn(),
}))

vi.mock("@/lib/settings", () => ({
  initStarPrompt: initMock,
  markStarPromptShown: markMock,
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}))

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
}))

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ isVisible: isVisibleMock }),
}))

import { StarPromptCard } from "@/components/star-prompt"
import { REPO_URL } from "@/lib/support"

const MINUTE = 60_000

// Lets the promise chain (load → ask the OS → show) settle.
const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

describe("StarPromptCard", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    initMock.mockReset()
    markMock.mockReset().mockResolvedValue(undefined)
    openUrlMock.mockClear()
    isVisibleMock.mockReset().mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function mount(prompt: { showAfter: number; shown: boolean }) {
    initMock.mockResolvedValue(prompt)
    render(<StarPromptCard />)
    await settle()
  }

  async function advance(ms: number) {
    act(() => vi.advanceTimersByTime(ms))
    await settle()
  }

  it("shows once its time has come, saves that at once, and closes itself after a minute", async () => {
    await mount({ showAfter: Date.now() - 1, shown: false })

    expect(screen.getByRole("status")).toHaveTextContent("Enjoying OpenTokenUsage?")
    expect(markMock).toHaveBeenCalledTimes(1)

    await advance(MINUTE - 1000)
    expect(screen.getByRole("status")).toBeInTheDocument()
    await advance(1000)
    expect(screen.queryByRole("status")).toBeNull()
    expect(markMock).toHaveBeenCalledTimes(1)
  })

  it("waits for a new install's 3 hours, then shows on the next minute's check", async () => {
    await mount({ showAfter: Date.now() + 3 * 60 * MINUTE, shown: false })
    expect(screen.queryByRole("status")).toBeNull()

    await advance(3 * 60 * MINUTE - MINUTE)
    expect(screen.queryByRole("status")).toBeNull()
    await advance(MINUTE)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  // Seen in the app: before its first show the hidden panel's webview reported itself visible and
  // focused, so the card came and went with the panel closed. The OS decides now.
  it("waits for the panel to open instead of showing to a hidden panel", async () => {
    isVisibleMock.mockResolvedValue(false)
    await mount({ showAfter: Date.now() - 1, shown: false })
    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    await advance(5 * MINUTE)
    expect(screen.queryByRole("status")).toBeNull()
    expect(markMock).not.toHaveBeenCalled()

    isVisibleMock.mockResolvedValue(true)
    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    await settle()
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(markMock).toHaveBeenCalledTimes(1)
  })

  it("never shows again once shown", async () => {
    await mount({ showAfter: 0, shown: true })
    await advance(10 * MINUTE)
    expect(screen.queryByRole("status")).toBeNull()
    expect(markMock).not.toHaveBeenCalled()
    expect(isVisibleMock).not.toHaveBeenCalled()
  })

  it("opens the repository from its button and can be closed", async () => {
    await mount({ showAfter: 0, shown: false })
    act(() => screen.getByRole("button", { name: "Star on GitHub" }).click())
    expect(openUrlMock).toHaveBeenCalledWith(REPO_URL)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("closes from its close button", async () => {
    await mount({ showAfter: 0, shown: false })
    act(() => screen.getByRole("button", { name: "Close" }).click())
    expect(screen.queryByRole("status")).toBeNull()
    expect(openUrlMock).not.toHaveBeenCalled()
  })
})
