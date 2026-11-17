import { afterEach, describe, expect, it, vi } from "vitest"
import { partyConfetti } from "@/lib/party"

const reduceMotion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query }))

describe("party mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it("drops confetti over the panel, then clears it away", () => {
    vi.useFakeTimers()
    reduceMotion(false)
    partyConfetti(12)
    expect(document.querySelectorAll(".party-layer .party-piece")).toHaveLength(12)
    vi.advanceTimersByTime(3_000)
    expect(document.querySelector(".party-layer")).toBeNull()
  })

  it("keeps still when Windows asks for less motion", () => {
    reduceMotion(true)
    partyConfetti(12)
    expect(document.querySelector(".party-layer")).toBeNull()
  })
})
