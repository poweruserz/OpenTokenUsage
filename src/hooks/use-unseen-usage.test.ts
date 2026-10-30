import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { isVisibleMock } = vi.hoisted(() => ({ isVisibleMock: vi.fn() }))

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
}))

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ isVisible: isVisibleMock }),
}))

import { UNSEEN_BLINK_MS, UNSEEN_SETTLE_MS, useUnseenUsage } from "@/hooks/use-unseen-usage"

// Lets the OS visibility answer reach the hook.
const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

async function setPanel(open: boolean) {
  isVisibleMock.mockResolvedValue(open)
  act(() => {
    window.dispatchEvent(new Event(open ? "focus" : "blur"))
  })
  await settle()
}

function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms))
}

// Seen values outlive a mount (as they outlive a page switch), so every test has its own key.
async function mount(key: string, used: number) {
  const view = renderHook(({ used }) => useUnseenUsage(key, used), { initialProps: { used } })
  await settle()
  return view
}

describe("useUnseenUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    isVisibleMock.mockReset().mockResolvedValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows what was spent while the panel was closed, blinks, fills, then counts it as seen", async () => {
    const { result, rerender } = await mount("spent", 10)
    expect(result.current).toBeNull()

    rerender({ used: 25 })
    expect(result.current).toEqual({ from: 10, settling: false })
    advance(60 * 60_000)
    expect(result.current).toEqual({ from: 10, settling: false })

    await setPanel(true)
    advance(UNSEEN_BLINK_MS - 1)
    expect(result.current).toEqual({ from: 10, settling: false })
    advance(1)
    expect(result.current).toEqual({ from: 10, settling: true })
    advance(UNSEEN_SETTLE_MS)
    expect(result.current).toBeNull()

    await setPanel(false)
    await setPanel(true)
    expect(result.current).toBeNull()
  })

  it("doesn't count a reset as spent usage", async () => {
    const { result, rerender } = await mount("reset", 60)
    rerender({ used: 5 })
    expect(result.current).toBeNull()
    rerender({ used: 8 })
    expect(result.current).toEqual({ from: 5, settling: false })
  })

  it("counts a drop as a reset even when it stays above what was seen", async () => {
    const { result, rerender } = await mount("reset-above-seen", 10)
    rerender({ used: 60 })
    expect(result.current).toEqual({ from: 10, settling: false })
    rerender({ used: 30 })
    expect(result.current).toBeNull()
    rerender({ used: 35 })
    expect(result.current).toEqual({ from: 30, settling: false })
  })

  it("keeps it for the next open when the panel closes mid-blink", async () => {
    await setPanel(true)
    const { result, rerender } = await mount("closed-early", 10)
    rerender({ used: 20 })
    advance(2_000)
    await setPanel(false)
    advance(10_000)
    expect(result.current).toEqual({ from: 10, settling: false })

    await setPanel(true)
    advance(UNSEEN_BLINK_MS + UNSEEN_SETTLE_MS)
    expect(result.current).toBeNull()
  })

  it("starts over when more is spent while it blinks", async () => {
    await setPanel(true)
    const { result, rerender } = await mount("more", 10)
    rerender({ used: 20 })
    advance(3_000)
    rerender({ used: 30 })
    advance(3_000)
    expect(result.current).toEqual({ from: 10, settling: false })
    advance(UNSEEN_BLINK_MS - 3_000 + UNSEEN_SETTLE_MS)
    expect(result.current).toBeNull()
  })

  it("draws nothing without a key", async () => {
    const { result } = renderHook(() => useUnseenUsage(null, 50))
    await settle()
    expect(result.current).toBeNull()
  })
})
