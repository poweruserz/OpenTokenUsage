import { describe, expect, it } from "vitest"
import {
  findRises,
  liveRise,
  plateIsLight,
  RISE_BLINK_MS,
  RISE_MS,
  widgetItems,
  widgetTooltip,
} from "@/lib/desktop-widgets"
import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import { DEFAULT_DESKTOP_WIDGETS, normalizeDesktopWidgets } from "@/lib/settings"
import type { TaskbarStripItem } from "@/lib/taskbar-strip"

const LABELS = ["Session", "Weekly"]

const item = (used: number[], id = "claude", labels = LABELS): TaskbarStripItem => ({
  id,
  iconUrl: "data:x",
  logoColor: "#DE7356",
  lines: used.map((share, i) => ({ text: `${Math.round(share * 100)}%`, color: "#ffffff", used: share, label: labels[i] })),
})

describe("findRises", () => {
  it("reports a line whose shown percent went up, never a first value or a drop", () => {
    const seen = new Map<string, number>()
    expect(findRises([item([0.3, 0.1])], seen)).toEqual([])
    expect(findRises([item([0.304, 0.1])], seen)).toEqual([]) // still 30 %
    expect(findRises([item([0.31, 0.1])], seen)).toEqual(["claude:Session"])
    expect(findRises([item([0.05, 0.12])], seen)).toEqual(["claude:Weekly"]) // the session reset
  })

  it("follows a line by its label, so showing another line isn't a rise", () => {
    const seen = new Map<string, number>()
    findRises([item([0.1, 0.45])], seen)
    // "both" → "weekly": the first line is now the weekly one, still 45 %.
    expect(findRises([item([0.45], "claude", ["Weekly"])], seen)).toEqual([])
  })

  it("forgets lines that went away, so turning widgets back on starts afresh", () => {
    const seen = new Map<string, number>()
    findRises([item([0.1])], seen)
    findRises([], seen)
    expect(findRises([item([0.9])], seen)).toEqual([])
  })

  it("skips text values, which have no share", () => {
    const seen = new Map<string, number>()
    const text: TaskbarStripItem = { ...item([]), lines: [{ text: "$9", color: "#ffffff" }] }
    findRises([text], seen)
    expect(findRises([text], seen)).toEqual([])
    expect(seen.size).toBe(0)
  })
})

describe("liveRise", () => {
  it("gives the rising lines with what is left of their blink and highlight", () => {
    const rising = new Map([["claude:Weekly", 1_000]])
    expect(liveRise([item([0.4, 0.2])], rising, 3_000)).toEqual({
      keys: new Set(["claude:Weekly"]),
      blinkMs: RISE_BLINK_MS - 2_000,
      holdMs: RISE_MS - 2_000,
    })
    expect(liveRise([item([0.4, 0.2])], rising, 1_000 + RISE_BLINK_MS + 5)!.blinkMs).toBe(0)
    expect(liveRise([item([0.4, 0.2])], rising, 1_000 + RISE_MS)).toBeNull()
  })
})

describe("widgetItems", () => {
  it("colors rising lines and swaps logos for the chosen color", () => {
    const [shown] = widgetItems([item([0.4, 0.2])], { rising: new Set(["claude:Weekly"]), highlight: "#60cdff", logo: "white" })
    expect(shown!.logoColor).toBe("#ffffff")
    expect(shown!.lines.map((line) => line.color)).toEqual(["#ffffff", "#60cdff"])
  })

  it("keeps brand logos as built", () => {
    const [shown] = widgetItems([item([0.4])], { rising: new Set(), highlight: "#60cdff", logo: "brand" })
    expect(shown!.logoColor).toBe("#DE7356")
  })
})

describe("widgetTooltip", () => {
  const HOUR = 3_600_000
  const now = Date.parse("2026-11-14T12:00:00Z")
  const progress = (label: string, used: number, resetsInMs: number, periodDurationMs: number) => ({
    type: "progress" as const,
    label,
    used,
    limit: 100,
    format: { kind: "percent" as const },
    resetsAt: new Date(now + resetsInMs).toISOString(),
    periodDurationMs,
  })
  const pluginsMeta = [{ id: "claude", name: "Claude", lines: [], primaryCandidates: ["Session"] }] as unknown as PluginMeta[]
  const pluginStates = {
    claude: {
      data: {
        lines: [progress("Session", 40, 2 * HOUR + 14 * 60_000, 5 * HOUR), progress("Weekly", 90, 72 * HOUR, 168 * HOUR)],
      } as unknown as PluginOutput,
    },
  }

  it("names the provider, then each line's value, reset and, when behind pace, when it runs out", () => {
    const text = widgetTooltip([item([0.4, 0.9])], { pluginsMeta, pluginStates, nowMs: now, workdays: false })
    expect(text).toBe(
      ["Claude", "Session: 40% · Resets in 2h 14m", "Weekly: 90% · Resets in 3d 0h · Runs out in 10h 40m"].join("\n")
    )
  })

  it("keeps a line without a reset to its value, and separates providers with a blank line", () => {
    const text = widgetTooltip([item([0.4]), item([0.1], "cursor")], { pluginsMeta, pluginStates: {}, nowMs: now, workdays: false })
    expect(text).toBe("Claude\nSession: 40%\n\ncursor\nSession: 10%")
  })
})

describe("normalizeDesktopWidgets", () => {
  it("defaults, and reads the old joined flag as a layout", () => {
    expect(normalizeDesktopWidgets(undefined)).toEqual(DEFAULT_DESKTOP_WIDGETS)
    expect(normalizeDesktopWidgets({ joined: false }).layout).toBe("separate")
    expect(normalizeDesktopWidgets({ joined: true }).layout).toBe("row")
    expect(normalizeDesktopWidgets({ layout: "column", joined: false }).layout).toBe("column")
    expect(normalizeDesktopWidgets({ layout: "edge" }).layout).toBe("edge")
    expect(normalizeDesktopWidgets({ gradient: true }).gradient).toBe(true)
    expect(normalizeDesktopWidgets({ gradient: "yes" }).gradient).toBe(false)
    expect(normalizeDesktopWidgets(undefined)).toMatchObject({ slide: true, slideMs: 200 })
    expect(normalizeDesktopWidgets({ slide: false, slideMs: 5000 })).toMatchObject({ slide: false, slideMs: 600 })
    expect(normalizeDesktopWidgets({ slideMs: 20 }).slideMs).toBe(100)
    expect(normalizeDesktopWidgets({ layout: "diagonal", bars: "yes" })).toMatchObject({ layout: "row", bars: true })
  })

  it("lets clicks pass only when asked, with Ctrl unless another key was picked", () => {
    expect(normalizeDesktopWidgets(undefined)).toMatchObject({ clickThrough: false, clickThroughKey: "ctrl" })
    expect(normalizeDesktopWidgets({ clickThrough: true, clickThroughKey: "alt" })).toMatchObject({ clickThrough: true, clickThroughKey: "alt" })
    expect(normalizeDesktopWidgets({ clickThroughKey: "win" }).clickThroughKey).toBe("ctrl")
  })
})

describe("plateIsLight", () => {
  it("puts black logos on a light plate and white ones on a dark one", () => {
    expect(plateIsLight("black", false)).toBe(true)
    expect(plateIsLight("white", true)).toBe(false)
    expect(plateIsLight("brand", true)).toBe(true)
  })
})
