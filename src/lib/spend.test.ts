import { describe, expect, it } from "vitest"
import type { MetricLine, PluginDisplayState } from "@/lib/plugin-types"
import { localSpendBounds, localSpendSources, parseSpend, spendCardId, spendModels, spendSources, spendTotal } from "@/lib/spend"

describe("spendCardId", () => {
  it("names the card whose plan price a source is set against", () => {
    expect(spendCardId("claude-1a2b3c4d")).toBe("claude-1a2b3c4d")
    expect(spendCardId("local:cursor")).toBe("cursor")
    expect(spendCardId("local:droid")).toBe("factory")
    expect(spendCardId("local:qwen")).toBe("qwen-code")
  })
})

const card = (id: string, lines: MetricLine[]): PluginDisplayState =>
  ({
    meta: { id, name: id, lines: [] },
    data: { lines },
    loading: false,
    error: null,
    lastManualRefreshAt: null,
    lastUpdatedAt: null,
  }) as unknown as PluginDisplayState

const text = (label: string, value: string): MetricLine => ({ type: "text", label, value })
const chart: MetricLine = { type: "barChart", label: "Usage Trend", points: [] }

describe("spend", () => {
  it("reads the ccusage rows back to dollars and tokens", () => {
    expect(parseSpend("$1,234.50 · 1.2M tokens")).toEqual({ usd: 1234.5, tokens: 1_200_000 })
    expect(parseSpend("45K tokens")).toEqual({ usd: null, tokens: 45_000 })
    expect(parseSpend("$0.00 · 0 tokens")).toEqual({ usd: 0, tokens: 0 })
    expect(parseSpend("No data")).toBeNull()
  })

  it("adds up the cards with a 30-day row and shares their models out by tokens", () => {
    const sources = spendSources([
      card("claude", [
        { type: "progress", label: "Session", used: 1, limit: 100, format: { kind: "percent" } },
        text("Today", "$2.00 · 1M tokens"),
        text("Yesterday", "No data"),
        text("Last 30 Days", "$30.00 · 10M tokens"),
        chart,
        text("claude-opus-5-5", "80%"),
        text("claude-haiku-5-5", "<0.1%"),
      ]),
      card("codex", [text("Last 30 Days", "$10.00 · 4M tokens"), chart, text("gpt-5.5", "100%")]),
      card("deepseek", [text("Balance", "$12.50")]),
    ])
    expect(sources.map((source) => source.id)).toEqual(["claude", "codex"])
    expect(spendTotal(sources, "today")).toEqual({ usd: 2, tokens: 1_000_000 })
    expect(spendTotal(sources, "yesterday")).toBeNull()
    expect(spendTotal(sources, "month")).toEqual({ usd: 40, tokens: 14_000_000 })
    expect(spendModels(sources)).toEqual([
      { name: "claude-opus-5-5", tokens: 8_000_000 },
      { name: "gpt-5.5", tokens: 4_000_000 },
      { name: "claude-haiku-5-5", tokens: 10_000 },
    ])
  })

  it("asks other tools' records for local days, the 30 including today", () => {
    const bounds = localSpendBounds(new Date(2026, 10, 15, 18, 30))
    expect(bounds).toEqual({
      todayMs: new Date(2026, 10, 15).getTime(),
      yesterdayMs: new Date(2026, 10, 14).getTime(),
      sinceMs: new Date(2026, 9, 17).getTime(),
    })
  })

  it("takes other tools' sources apart from the cards, tokens only where no cost was recorded", () => {
    const sources = localSpendSources([
      {
        id: "opencode-go",
        name: "OpenCode",
        periods: { today: { usd: 0.5, tokens: 100 }, yesterday: { usd: 0, tokens: 0 }, month: { usd: 2, tokens: 900 } },
        models: [{ name: "deepseek", tokens: 900 }],
      },
      { id: "zai", name: "Z.ai", periods: { today: { usd: null, tokens: 5 }, yesterday: null, month: { usd: null, tokens: 50 } }, models: [] },
      { id: "broken", name: "x", periods: {} },
    ])
    expect(sources.map((source) => source.id)).toEqual(["local:opencode-go", "local:zai"])
    expect(spendTotal(sources, "month")).toEqual({ usd: 2, tokens: 950 })
    expect(sources[1]!.periods.yesterday).toBeNull()
    expect(localSpendSources("nope")).toEqual([])
  })
})
