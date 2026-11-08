import { describe, expect, it } from "vitest"
import type { PluginOutput } from "@/lib/plugin-types"
import { completeSmartCheck, MINUTE, newSmartSchedule, quotaSignature, smartFloorMinutes } from "@/lib/smart-refresh"

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

  // Anthropic budgets usage reads per login, shared with Claude Code's own reads.
  it("keeps Claude's cards, extra accounts and WSL logins at 10 minutes or more", () => {
    expect(["claude", "claude-1a2b3c4d", "claude-wsl-91f17ddf"].map(smartFloorMinutes)).toEqual([10, 10, 10])
    expect(["codex", "codex-1a2b3c4d", "cursor"].map(smartFloorMinutes)).toEqual([0, 0, 0])

    let now = 100_000
    let state = newSmartSchedule(now, 10)
    expect(state.nextAt! - now).toBe(10 * MINUTE)
    state = completeSmartCheck(state, output(), false, now)
    expect(state.nextAt! - now).toBe(10 * MINUTE)
    for (const minutes of [10, 10, 10, 15]) {
      now = state.nextAt!
      state = completeSmartCheck(state, output(), false, now)
      expect(state.nextAt! - now).toBe(minutes * MINUTE)
    }

    state = newSmartSchedule(now, 10)
    for (const minutes of [10, 10, 10, 15]) {
      state = completeSmartCheck(state, output(), true, now)
      expect(state.nextAt! - now).toBe(minutes * MINUTE)
      now = state.nextAt!
    }
  })

  it("asks Claude again 10 minutes after the read a kept answer came from, not after the probe", () => {
    const now = 100_000_000
    const kept = { ...output(), staleSince: now - 9 * MINUTE }
    expect(completeSmartCheck(newSmartSchedule(now, 10), kept, false, now).nextAt).toBe(now + MINUTE)
    // A card without a floor (a stopped WSL distro's cached data) backs off as before.
    expect(completeSmartCheck(newSmartSchedule(now), kept, false, now).nextAt).toBe(now + 2 * MINUTE)
    // Data kept longer ago than the floor backs off too.
    const old = { ...output(), staleSince: now - 60 * MINUTE }
    expect(completeSmartCheck(newSmartSchedule(now, 10), old, false, now).nextAt).toBe(now + 10 * MINUTE)
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
