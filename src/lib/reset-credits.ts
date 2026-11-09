import type { ResetCredit } from "@/lib/plugin-types"

export const RESET_WARNING_MS = 7 * 24 * 60 * 60 * 1000

const KINDS: readonly string[] = ["session", "weekly", "fable", "full"]

/**
 * Unknown expiry stays unknown; elapsed grants disappear even between provider refreshes. Resets of
 * one kind that expire together are one entry (a launch hands out several grants of one reset each).
 * A kind this version has no name for (kept by a later one) counts as none.
 */
export function liveResetCredits(credits: ResetCredit[], nowMs: number): ResetCredit[] {
  const live = new Map<string, ResetCredit>()
  for (const credit of credits) {
    if (!Number.isInteger(credit.count) || credit.count <= 0) continue
    const expiresAt = credit.expiresAt && Number.isFinite(Date.parse(credit.expiresAt)) ? credit.expiresAt : undefined
    if (expiresAt && Date.parse(expiresAt) <= nowMs) continue
    const kind = credit.kind && KINDS.includes(credit.kind) ? credit.kind : undefined
    const key = `${kind ?? ""}|${expiresAt ? Date.parse(expiresAt) : ""}`
    const same = live.get(key)
    live.set(key, same ? { ...same, count: same.count + credit.count } : { ...credit, expiresAt, kind })
  }
  return [...live.values()].sort(
    (a, b) => (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity)
  )
}
