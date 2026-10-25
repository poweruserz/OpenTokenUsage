import { describe, expect, it } from "vitest"
import { getDisplayedUsage } from "@/lib/usage-display"

describe("getDisplayedUsage", () => {
  it("uses the same direction for fractions and amounts", () => {
    expect(getDisplayedUsage(82, 100, "left")).toEqual({ amount: 18, fraction: 0.18 })
    expect(getDisplayedUsage(82, 100, "used")).toEqual({ amount: 82, fraction: 0.82 })
    expect(getDisplayedUsage(4, 10, "left")).toEqual({ amount: 6, fraction: 0.6 })
  })

  it("clamps displayed fractions and guards invalid limits", () => {
    expect(getDisplayedUsage(110, 100, "left")).toEqual({ amount: 0, fraction: 0 })
    expect(getDisplayedUsage(110, 100, "used")).toEqual({ amount: 110, fraction: 1 })
    expect(getDisplayedUsage(3, 0, "left")).toEqual({ amount: 0, fraction: 0 })
    expect(getDisplayedUsage(Number.NaN, 100, "used")).toEqual({ amount: 0, fraction: 0 })
  })
})
