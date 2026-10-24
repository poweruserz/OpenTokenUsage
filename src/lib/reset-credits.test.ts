import { describe, expect, it } from "vitest"
import { liveResetCredits } from "@/lib/reset-credits"
import { collectResetCreditAlerts } from "@/lib/usage-alerts"
const NOW = Date.parse("2026-10-24T12:00:00Z")
const HOUR = 3600000
const expiry = (hours: number) => new Date(NOW + hours * HOUR).toISOString()
const credits = [{ count: 2, expiresAt: expiry(48) }]
const collect = (sent: string[] = [], hours = 48) =>
  collectResetCreditAlerts({
    pluginId: "codex",
    providerName: "Codex",
    lines: [{ type: "text", label: "Rate Limit Resets", value: "2 available", resetCredits: credits }],
    sent: new Set(sent),
    nowMs: NOW + (48 - hours) * HOUR
  })
describe("banked reset inventory", () => {
  it("removes expired and invalid counts, sorts expiry, retains unknown expiry", () => {
    expect(
      liveResetCredits(
        [
          { count: 1 },
          { count: 1, expiresAt: expiry(-1) },
          { count: -1 },
          { count: 0.5 },
          { count: 2, expiresAt: expiry(5) }
        ],
        NOW
      )
    ).toEqual([
      { count: 2, expiresAt: expiry(5) },
      { count: 1, expiresAt: undefined }
    ])
    expect(liveResetCredits([{ count: 1, expiresAt: "bad" }], NOW)).toEqual([{ count: 1, expiresAt: undefined }])
  })
  it("warns once in seven days, again in 24 hours, never after expiry", () => {
    const first = collect()
    expect(first).toHaveLength(1)
    expect(first[0].body).toContain("2d 0h")
    expect(collect(first[0].keys)).toEqual([])
    const urgent = collect(first[0].keys, 24)
    expect(urgent).toHaveLength(1)
    expect(collect(urgent[0].keys, 12)).toEqual([])
    expect(collect([], 0)).toEqual([])
    expect(collect([], 200)).toEqual([])
  })
  it("does not warn about unknown expiry or spent credits", () => {
    expect(
      collectResetCreditAlerts({
        pluginId: "claude",
        providerName: "Claude",
        lines: [
          {
            type: "text",
            label: "Rate Limit Resets",
            value: "0",
            resetCredits: [{ count: 0, expiresAt: expiry(1) }, { count: 1 }]
          }
        ],
        sent: new Set(),
        nowMs: NOW
      })
    ).toEqual([])
  })
})
