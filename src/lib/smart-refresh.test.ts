import { describe, expect, it } from "vitest"
import type { PluginOutput } from "@/lib/plugin-types"
import { completeSmartCheck, MINUTE, newSmartSchedule, quotaSignature } from "@/lib/smart-refresh"

const output = (used = 20): PluginOutput => ({
  providerId: "claude", displayName: "Claude", iconUrl: "",
  lines: [{ type: "progress", label: "Session", used, limit: 100, format: { kind: "percent" } }],
})

describe("Smart refresh schedule", () => {
  // Two minutes, not one, while usage changes: an account in steady use otherwise asks its
  // provider every minute for as long as the user works (Claude's usage endpoint rate-limits).
  it("checks every 2 minutes for five minutes after a change, then backs off 2, 5, 10, 15 and stays capped", () => {
    let now = 100_000
    let state = completeSmartCheck(newSmartSchedule(now), output(), false, now)
    expect(state.nextAt! - now).toBe(2 * MINUTE)
    // Checks at +2 and +4 are still inside the five active minutes; the idle steps follow.
    for (const minutes of [2, 2, 2, 5, 10, 15, 15]) {
      now = state.nextAt!
      state = completeSmartCheck(state, output(), false, now)
      expect(state.nextAt! - now).toBe(minutes * MINUTE)
    }
    state = completeSmartCheck(state, output(20.01), false, now)
    expect(state.nextAt).toBe(now + 2 * MINUTE)
  })

  it("compares raw numbers independently of text, countdowns, charts and ordering", () => {
    const data = output()
    const other: PluginOutput = { ...data, lines: [
      { type: "text", label: "Reset", value: "3 minutes" },
      { ...data.lines[0], resetsAt: "tomorrow" } as PluginOutput["lines"][number],
      { type: "barChart", label: "Local history", points: [{ label: "today", value: 5 }] },
    ] }
    expect(quotaSignature(data)).toBe(quotaSignature(other))
    expect(quotaSignature(output(20.01))).not.toBe(quotaSignature(data))
  })

  it("backs off failures and stale data without treating either as idle success", () => {
    let now = 100_000
    let state = newSmartSchedule(now)
    for (const minutes of [2, 5, 10, 15, 15]) {
      state = completeSmartCheck(state, output(), true, now)
      expect(state.nextAt! - now).toBe(minutes * MINUTE)
      now = state.nextAt!
    }
    state = completeSmartCheck(state, { ...output(), staleSince: now - MINUTE }, false, now)
    expect(state.failures).toBe(6)
    state = completeSmartCheck(state, output(), false, now)
    expect(state.failures).toBe(0)
    expect(state.nextAt).toBe(now + 2 * MINUTE)
  })
})
