import type { DisplayMode } from "@/lib/settings"
import { clamp01 } from "@/lib/utils"

/** One conversion for every surface; alert thresholds still use raw consumed usage. */
export function getDisplayedUsage(used: number, limit: number, mode: DisplayMode) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) {
    return { amount: 0, fraction: 0 }
  }
  const amount = mode === "left" ? Math.max(0, limit - used) : used
  return { amount, fraction: clamp01(amount / limit) }
}
