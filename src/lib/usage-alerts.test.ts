import { describe, expect, it } from "vitest"
import type { MetricLine } from "@/lib/plugin-types"
import { collectUsageAlerts } from "@/lib/usage-alerts"
import type { DisplayMode } from "@/lib/settings"

const HOUR = 60 * 60 * 1000
const NOW = Date.parse("2026-09-28T12:00:00Z")

function line(used: number, resetsInMs: number, periodMs = 5 * HOUR): MetricLine {
  return {
    type: "progress",
    label: "Session",
    used,
    limit: 100,
    format: { kind: "percent" },
    resetsAt: new Date(NOW + resetsInMs).toISOString(),
    periodDurationMs: periodMs,
  }
}

const collect = (lines: MetricLine[], sent: string[] = [], previousLines?: MetricLine[], levels = [80, 95], displayMode: DisplayMode = "used") =>
  collectUsageAlerts({ pluginId: "claude", providerName: "Claude", lines, previousLines, sent: new Set(sent), nowMs: NOW, levels, displayMode })

describe("collectUsageAlerts", () => {
  it("stays quiet below the thresholds and at an easy pace", () => {
    expect(collect([line(40, 4 * HOUR)])).toEqual([])
  })

  it("alerts once at 80% and remembers it", () => {
    const [alert] = collect([line(82, 2 * HOUR)])
    expect(alert?.title).toBe("Claude: Session at 82% used")
    expect(alert?.body).toBe("Resets in 2h 0m")
    expect(collect([line(85, 2 * HOUR)], alert!.keys)).toEqual([])
  })

  it("uses the selected direction in notifications without changing thresholds", () => {
    const [left] = collect([line(82, 2 * HOUR)], [], undefined, [80, 95], "left")
    const [used] = collect([line(82, 2 * HOUR)], [], undefined, [80, 95], "used")
    expect(left?.title).toBe("Claude: Session at 18% left")
    expect(used?.title).toBe("Claude: Session at 82% used")
    expect(left?.keys).toEqual(used?.keys)
    expect(collect([line(85, 2 * HOUR)], left!.keys, undefined, [80, 95], "used")).toEqual([])
    expect(collect([line(97, HOUR)], [], undefined, [80, 95], "left")[0]?.title).toBe("Claude: Session at 3% left")
  })

  it("keeps an over-limit percentage when used, and stops at 0% left", () => {
    expect(collect([line(120, HOUR)])[0]?.title).toBe("Claude: Session at 120% used")
    expect(collect([line(120, HOUR)], [], undefined, [80, 95], "left")[0]?.title).toBe("Claude: Session at 0% left")
  })

  it("jumping straight past 95% sends one alert that also covers 80%", () => {
    const alerts = collect([line(97, HOUR)])
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.keys).toHaveLength(2)
    expect(collect([line(98, HOUR)], alerts[0]!.keys)).toEqual([])
  })

  it("uses the levels from the settings", () => {
    expect(collect([line(55, 4 * HOUR)], [], undefined, [50, 100]).map((a) => a.title)).toEqual(["Claude: Session at 55% used"])
    const full = collect([line(100, HOUR)], [], undefined, [50, 100])
    expect(full[0]!.keys).toEqual(["claude|Session|" + line(100, HOUR).resetsAt + "|t100", "claude|Session|" + line(100, HOUR).resetsAt + "|t50"])
    // No levels picked: no threshold alert (a pace alert can still come; here it resets first).
    expect(collect([line(97, 60 * 1000)], [], undefined, [])).toEqual([])
  })

  it("warns when the pace runs out before the reset", () => {
    // 60% used after 2h of a 5h window -> 100% at ~3h20m, reset at 5h.
    const [alert] = collect([line(60, 3 * HOUR)])
    expect(alert?.title).toBe("Claude: Session is running out")
    expect(alert?.body).toContain("1h 20m")
  })

  it("no pace alert when the window resets before it would run out", () => {
    // 55% used after 4h -> would need ~3.3h more, reset in 1h.
    expect(collect([line(55, HOUR)])).toEqual([])
  })

  it("announces a reset of a nearly full window", () => {
    const before = line(90, 10 * 60 * 1000)
    const after = line(0, 5 * HOUR)
    const alerts = collect([after], [], [before])
    expect(alerts.map((a) => a.title)).toEqual(["Claude: Session has reset"])
  })

  it("does not announce a reset of a lightly used window", () => {
    expect(collect([line(0, 5 * HOUR)], [], [line(30, 10 * 60 * 1000)])).toEqual([])
  })

  // Claude's resets_at jitters by milliseconds between probes (05:59:59.760, .777, .819 …).
  it("a reset time that jitters is the same window: no repeat threshold alert", () => {
    const [alert] = collect([line(82, 2 * HOUR)])
    expect(collect([line(83, 2 * HOUR + 17)], alert!.keys)).toEqual([])
    expect(collect([line(83, 2 * HOUR - 60 * 1000)], alert!.keys)).toEqual([])
  })

  it("the next window alerts again after a real reset", () => {
    const [alert] = collect([line(90, 10 * 60 * 1000)])
    expect(collect([line(82, 5 * HOUR)], alert!.keys).map((a) => a.title)).toEqual(["Claude: Session at 82% used"])
  })

  it("a reset time that jitters later is not a reset", () => {
    expect(collect([line(85, 2 * HOUR + 34)], [], [line(84, 2 * HOUR)]).map((a) => a.title)).toEqual([
      "Claude: Session at 85% used",
    ])
  })
})
