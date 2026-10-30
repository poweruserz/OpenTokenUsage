import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { initMock, markMock, openUrlMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  markMock: vi.fn(),
  openUrlMock: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/settings", () => ({
  initStarPrompt: initMock,
  markStarPromptShown: markMock,
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}))

import { StarPromptCard } from "@/components/star-prompt"
import { REPO_URL } from "@/lib/support"

const MINUTE = 60_000

describe("StarPromptCard", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    initMock.mockReset()
    markMock.mockReset().mockResolvedValue(undefined)
    openUrlMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function mount(prompt: { showAfter: number; shown: boolean }) {
    initMock.mockResolvedValue(prompt)
    render(<StarPromptCard />)
    await act(() => Promise.resolve())
  }

  it("shows once its time has come, saves that at once, and closes itself after a minute", async () => {
    await mount({ showAfter: Date.now() - 1, shown: false })

    expect(screen.getByRole("status")).toHaveTextContent("Enjoying OpenTokenUsage?")
    expect(markMock).toHaveBeenCalledTimes(1)

    act(() => vi.advanceTimersByTime(MINUTE - 1000))
    expect(screen.getByRole("status")).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole("status")).toBeNull()
    expect(markMock).toHaveBeenCalledTimes(1)
  })

  it("waits for a new install's 3 hours, then shows on the next minute's check", async () => {
    await mount({ showAfter: Date.now() + 3 * 60 * MINUTE, shown: false })
    expect(screen.queryByRole("status")).toBeNull()

    act(() => vi.advanceTimersByTime(3 * 60 * MINUTE - MINUTE))
    expect(screen.queryByRole("status")).toBeNull()
    act(() => vi.advanceTimersByTime(MINUTE))
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("never shows again once shown", async () => {
    await mount({ showAfter: 0, shown: true })
    act(() => vi.advanceTimersByTime(10 * MINUTE))
    expect(screen.queryByRole("status")).toBeNull()
    expect(markMock).not.toHaveBeenCalled()
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
