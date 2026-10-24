import type { ResetCredit } from "@/lib/plugin-types"

export const RESET_WARNING_MS = 7 * 24 * 60 * 60 * 1000

/** Unknown expiry stays unknown; elapsed grants disappear even between provider refreshes. */
export function liveResetCredits(credits: ResetCredit[], nowMs: number): ResetCredit[] {
  return credits
    .filter((credit) => Number.isInteger(credit.count) && credit.count > 0)
    .map((credit) => ({
      ...credit,
      expiresAt: credit.expiresAt && Number.isFinite(Date.parse(credit.expiresAt)) ? credit.expiresAt : undefined
    }))
    .filter((credit) => !credit.expiresAt || Date.parse(credit.expiresAt) > nowMs)
    .sort(
      (a, b) => (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity)
    )
}
