import { describe, expect, it } from "vitest"
import { EDGE_BUTTON, makeEdgeRailSvg, type EdgeRailArgs } from "@/lib/edge-rail"
import { estimateTextWidth, type TaskbarStripItem } from "@/lib/taskbar-strip"

const item = (id: string, fill: number, color = "#ffffff", extra: Partial<TaskbarStripItem> = {}): TaskbarStripItem => ({
  id,
  iconUrl: `data:image/svg+xml,${id}`,
  logoColor: "#d97757",
  lines: [{ text: `${Math.round(fill * 100)}%`, color, fill, used: fill, label: "Session" }],
  ...extra,
})

const draw = (overrides: Partial<EdgeRailArgs> = {}) =>
  makeEdgeRailSvg({
    items: [item("claude", 0.88)],
    scale: 1,
    measure: estimateTextWidth,
    fontCss: "Segoe UI",
    plate: { color: "#000000", opacity: 0.7 },
    text: "#ffffff",
    ...overrides,
  })

describe("makeEdgeRailSvg", () => {
  it("fills each ring as far as the provider's first line and writes the value under it", () => {
    const { svg } = draw()
    const length = 2 * Math.PI * ((36 - 3) / 2)
    expect(svg).toContain(`stroke-dasharray="${length * 0.88} ${length}"`)
    expect(svg).toContain(">88%</text>")
  })

  it("rings the logo in its brand color, else its own, unless the value has a usage color", () => {
    expect(draw().svg).toContain(`stroke="#d97757" stroke-width="3" stroke-linecap="round"`)
    expect(draw({ rings: { claude: "#10a37f" } }).svg).toContain(`stroke="#10a37f" stroke-width="3" stroke-linecap="round"`)
    const warned = draw({ items: [item("claude", 0.95, "#e81123")], rings: { claude: "#10a37f" } })
    expect(warned.svg).toContain(`stroke="#e81123" stroke-width="3" stroke-linecap="round"`)
  })

  it("draws no arc for an empty ring or a text value", () => {
    expect(draw({ items: [item("claude", 0)] }).svg).not.toContain("stroke-dasharray")
    const balance: TaskbarStripItem = { id: "deepseek", iconUrl: "x", logoColor: "#4d6bfe", lines: [{ text: "$4.20", color: "#ffffff" }] }
    expect(draw({ items: [balance] }).svg).not.toContain("stroke-dasharray")
  })

  it("shows today and the rate only when given, each making the rail taller", () => {
    const plain = draw()
    const today = draw({ today: { label: "TODAY", tokens: "185.7M", money: "$509" } })
    expect(plain.svg).not.toContain("TODAY")
    expect(today.svg).toContain(">185.7M</text>")
    expect(today.svg).toContain(">$509</text>")
    expect(today.height).toBeGreaterThan(plain.height)
    const rate = draw({ rate: "98K/min" })
    expect(rate.svg).toContain(">98K/min</text>")
    expect(rate.height).toBeGreaterThan(plain.height)
  })

  it("keeps the refresh button in the bottom EDGE_BUTTON px and the pin in the slot above, at every scale", () => {
    for (const scale of [1, 1.5, 2]) {
      const { svg, width, height } = draw({ scale })
      expect(width).toBe(Math.round(64 * scale))
      const slot = Math.round(EDGE_BUTTON * scale)
      const [refresh, pin] = [...svg.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)" r="[\d.]+" fill="#000000"/g)].map((m) => Number(m[1]))
      expect(refresh).toBeGreaterThan(height - slot)
      expect(pin).toBeGreaterThan(height - 2 * slot)
      expect(pin).toBeLessThan(height - slot)
    }
  })

  it("lays the rail out side by side for the top edge, the buttons in the last slots on the right", () => {
    const items = [item("claude", 0.5), item("codex", 0.2)]
    const today = { label: "TODAY", tokens: "185.7M", money: "$509" }
    const tall = draw({ items, today, rate: "98K/min" })
    const { svg, width, height } = draw({ items, today, rate: "98K/min", horizontal: true })
    expect(width).toBeGreaterThan(height)
    expect(height).toBeLessThan(tall.height)
    expect(svg).toContain(">98K/min</text>")
    const slot = EDGE_BUTTON
    const [refresh, pin] = [...svg.matchAll(/<circle cx="([\d.]+)" cy="[\d.]+" r="[\d.]+" fill="#000000"/g)].map((m) => Number(m[1]))
    expect(refresh).toBeGreaterThan(width - slot)
    expect(pin).toBeGreaterThan(width - 2 * slot)
    expect(pin).toBeLessThan(width - slot)
    // The gradient runs along the rail: left to right.
    expect(draw({ horizontal: true, gradient: ["#002642", "#0063b1"] }).svg).toContain(`x2="1" y2="0"`)
  })

  it("fills the pin button in Windows blue while pinned", () => {
    expect(draw().svg).not.toContain(`fill="#0078D4"`)
    expect(draw({ pinned: true }).svg).toContain(`fill="#0078D4"`)
  })

  it("shrinks a value too wide for the rail", () => {
    const { svg } = draw({ items: [item("x", 0.5, "#ffffff", { lines: [{ text: "1234567890 credits", color: "#ffffff" }] })] })
    const size = Number(/font-size="([\d.]+)" font-weight="700"/.exec(svg)?.[1])
    expect(size).toBeLessThan(13)
    expect(size).toBeGreaterThanOrEqual(7)
  })

  it("fills rail and button with the gradient only when asked", () => {
    expect(draw().svg).not.toContain("linearGradient")
    const { svg } = draw({ gradient: ["#002642", "#0063b1"] })
    expect(svg).toContain(`<stop offset="0" stop-color="#002642"/><stop offset="1" stop-color="#0063b1"/>`)
    expect(svg.match(/fill="url\(#railFill\)"/g)).toHaveLength(3)
  })

  it("marks working sessions with a dot on the ring", () => {
    expect(draw({ items: [item("claude", 0.5, "#ffffff", { dot: "#4CC2FF" })] }).svg).toContain(`fill="#4CC2FF"`)
  })
})
