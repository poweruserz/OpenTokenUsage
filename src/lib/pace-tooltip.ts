import { timeToLimitMs, type PaceResult, type PaceStatus } from "@/lib/pace-status"
import type { ProgressFormat } from "@/lib/plugin-types"
import type { DisplayMode } from "@/lib/settings"
import { formatCountNumber, formatFixedPrecisionNumber } from "@/lib/utils"
import { t } from "@/lib/i18n"

export function getPaceStatusText(status: PaceStatus): string {
  return t(status === "ahead" ? "pace.ahead" : status === "on-track" ? "pace.onTrack" : "pace.behind")
}

export function formatCompactDuration(deltaMs: number): string | null {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return null
  const totalSeconds = Math.floor(deltaMs / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const minutes = totalMinutes % 60

  if (days > 0) return t("duration.dh", { d: days, h: hours })
  if (totalHours > 0) return t("duration.hm", { h: totalHours, m: minutes })
  if (totalMinutes > 0) return t("duration.m", { m: totalMinutes })
  return t("duration.lt1m")
}

type RunsOutArgs = {
  paceResult: PaceResult | null
  used: number
  limit: number
  periodDurationMs: number
  resetsAtMs: number
  nowMs: number
  /** Weekly pace counts Monday to Friday only (`pace-status.ts`). */
  workdays?: boolean
}

function getRunsOutDurationText({
  paceResult,
  used,
  limit,
  periodDurationMs,
  resetsAtMs,
  nowMs,
  workdays = false,
}: RunsOutArgs): string | null {
  if (!paceResult || paceResult.status !== "behind") return null
  const etaMs = timeToLimitMs(used, limit, resetsAtMs, periodDurationMs, nowMs, workdays)
  if (etaMs === null || etaMs <= 0 || etaMs >= resetsAtMs - nowMs) return null
  return formatCompactDuration(etaMs)
}

/**
 * ETA text for when usage will hit the limit, e.g. "Runs out in 4d 5h".
 * Returns null if not behind pace or ETA can't be computed.
 */
export function formatRunsOutText(args: RunsOutArgs): string | null {
  const durationText = getRunsOutDurationText(args)
  return durationText ? t("pace.runsOutIn", { time: durationText }) : null
}

export function buildPaceDetailText(args: RunsOutArgs & { displayMode: DisplayMode }): string | null {
  const { paceResult, limit, displayMode } = args
  if (!paceResult || !Number.isFinite(limit) || limit <= 0 || paceResult.projectedUsage === 0) return null

  if (paceResult.status === "behind") {
    const durationText = getRunsOutDurationText(args)
    if (durationText) return t("pace.limitIn", { time: durationText })
  }

  // Show projected % at reset (clamped to 100%)
  const projectedPercent = Math.min(100, Math.round((paceResult.projectedUsage / limit) * 100))
  const shownPercent = displayMode === "left" ? 100 - projectedPercent : projectedPercent
  return t(displayMode === "left" ? "pace.leftAtReset" : "pace.usedAtReset", { percent: shownPercent })
}

export function formatDeficitText(
  deficit: number,
  format: ProgressFormat,
  displayMode: DisplayMode
): string | null {
  if (!Number.isFinite(deficit) || deficit <= 0) return null

  const withSuffix = (value: string) => t(displayMode === "left" ? "pace.short" : "pace.deficit", { value })
  if (format.kind === "percent") {
    const roundedPercent = Math.round(deficit)
    return roundedPercent > 0 ? withSuffix(`${roundedPercent}%`) : null
  }

  const roundedToCents = Math.round(deficit * 100) / 100
  if (roundedToCents <= 0) return null

  if (format.kind === "dollars") return withSuffix(`$${formatFixedPrecisionNumber(roundedToCents)}`)
  return withSuffix(`${formatCountNumber(roundedToCents)} ${format.suffix}`)
}
