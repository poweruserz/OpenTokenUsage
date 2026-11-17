import { describe, expect, it } from "vitest"
import { applyLineLayout, normalizeLineLayouts, orderedLabels } from "@/lib/line-layout"
import type { MetricLine } from "@/lib/plugin-types"

const line = (label: string): MetricLine => ({ type: "text", label, value: label })
const lines = ["Session", "Weekly", "Today", "Credits"].map(line)
const labels = (shown: MetricLine[]) => shown.map((entry) => entry.label)

describe("line layouts", () => {
  it("shows the rows in the dragged order, hidden ones left out, new ones after", () => {
    const layout = { order: ["Weekly", "Session"], hidden: ["Today"] }
    expect(labels(applyLineLayout(lines, layout))).toEqual(["Weekly", "Session", "Credits"])
    // The Customize list has the hidden row too.
    expect(orderedLabels(labels(lines), layout)).toEqual(["Weekly", "Session", "Today", "Credits"])
    expect(applyLineLayout(lines, undefined)).toBe(lines)
  })

  it("ignores labels the card no longer has", () => {
    const layout = { order: ["Gone", "Credits"], hidden: ["Gone"] }
    expect(labels(applyLineLayout(lines, layout))).toEqual(["Credits", "Session", "Weekly", "Today"])
  })

  it("keeps only well-formed layouts from storage", () => {
    expect(
      normalizeLineLayouts({
        claude: { order: ["Weekly", 3, "Weekly"], hidden: ["Today"] },
        codex: { order: "Weekly" },
        cursor: [],
        empty: { order: [], hidden: [] },
      })
    ).toEqual({ claude: { order: ["Weekly"], hidden: ["Today"] } })
    expect(normalizeLineLayouts("nope")).toEqual({})
  })
})
