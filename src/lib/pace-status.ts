export type PaceStatus = "ahead" | "on-track" | "behind"

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/** Time between two instants that falls on Monday to Friday (local time). */
export function workdayMs(fromMs: number, toMs: number): number {
  let total = 0
  for (let at = fromMs; at < toMs; ) {
    const day = new Date(at)
    const nextMidnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()
    const end = Math.min(nextMidnight, toMs)
    if (day.getDay() !== 0 && day.getDay() !== 6) total += end - at
    at = end
  }
  return total
}

/** The instant `workMs` of Monday-to-Friday time after `fromMs` (weekends are skipped). */
export function addWorkdayMs(fromMs: number, workMs: number): number {
  let at = fromMs
  let left = workMs
  // At most ~10 years of days: the callers only care whether it lands before a reset.
  for (let days = 0; left > 0 && days < 3660; days++) {
    const day = new Date(at)
    const nextMidnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()
    if (day.getDay() !== 0 && day.getDay() !== 6) {
      if (left <= nextMidnight - at) return at + left
      left -= nextMidnight - at
    }
    at = nextMidnight
  }
  return at
}

/** Whether a window is counted in work days: the setting is on and the window is about a week. */
function countsWorkdays(periodDurationMs: number, workdays: boolean): boolean {
  return workdays && Math.abs(periodDurationMs - WEEK_MS) < DAY_MS
}

/**
 * How much of a window has passed (0..1, unclamped outside it). With `workdays`, a weekly window
 * counts only Monday to Friday, so a weekend without use doesn't read as being ahead of pace.
 */
export function paceElapsedFraction(
  resetsAtMs: number,
  periodDurationMs: number,
  nowMs: number,
  workdays = false
): number {
  const startMs = resetsAtMs - periodDurationMs
  if (countsWorkdays(periodDurationMs, workdays)) {
    const total = workdayMs(startMs, resetsAtMs)
    if (total > 0) return workdayMs(startMs, Math.min(Math.max(nowMs, startMs), resetsAtMs)) / total
  }
  return (nowMs - startMs) / periodDurationMs
}

/**
 * How long until usage reaches `limit` at its rate so far (ms from now), or null when it can't be
 * told. With work days, the rate is per work time and the time left skips weekends.
 */
export function timeToLimitMs(
  used: number,
  limit: number,
  resetsAtMs: number,
  periodDurationMs: number,
  nowMs: number,
  workdays = false
): number | null {
  if (!(used > 0) || !(limit > used)) return null
  const startMs = resetsAtMs - periodDurationMs
  const spentMs = countsWorkdays(periodDurationMs, workdays) ? workdayMs(startMs, nowMs) : nowMs - startMs
  if (!(spentMs > 0)) return null
  // Too early in a work-day week to tell (the card's 5% rule): a weekend's use over Monday's first
  // minutes isn't a rate. Calendar windows keep alerting early, as before.
  if (countsWorkdays(periodDurationMs, workdays) && spentMs < 0.05 * workdayMs(startMs, resetsAtMs)) return null
  const neededMs = ((limit - used) / used) * spentMs
  return countsWorkdays(periodDurationMs, workdays) ? addWorkdayMs(nowMs, neededMs) - nowMs : neededMs
}

export type PaceResult = {
  status: PaceStatus
  /** Projected usage at end of period (same unit as used/limit) */
  projectedUsage: number
}

/**
 * Calculate pace status based on current usage rate vs. period duration.
 *
 * @param used - Current usage amount
 * @param limit - Maximum/limit amount
 * @param resetsAtMs - Timestamp (ms) when the period resets
 * @param periodDurationMs - Total duration of the period (ms)
 * @param nowMs - Current timestamp (ms)
 * @param workdays - A weekly window counts Monday to Friday only (`paceElapsedFraction`)
 * @returns PaceResult or null if calculation not possible
 */
export function calculatePaceStatus(
  used: number,
  limit: number,
  resetsAtMs: number,
  periodDurationMs: number,
  nowMs: number,
  workdays = false
): PaceResult | null {
  if (
    !Number.isFinite(used) ||
    !Number.isFinite(limit) ||
    !Number.isFinite(resetsAtMs) ||
    !Number.isFinite(periodDurationMs) ||
    !Number.isFinite(nowMs)
  ) {
    return null
  }

  if (limit <= 0 || periodDurationMs <= 0) return null

  const periodStartMs = resetsAtMs - periodDurationMs
  const elapsedMs = nowMs - periodStartMs
  if (elapsedMs <= 0 || nowMs >= resetsAtMs) return null

  // No usage = definitionally ahead of pace (skip 5% threshold)
  if (used === 0) return { status: "ahead", projectedUsage: 0 }

  const elapsedFraction = paceElapsedFraction(resetsAtMs, periodDurationMs, nowMs, workdays)
  // A weekend at the start of a work-day week has no work time yet.
  const projectedUsage = elapsedFraction > 0 ? used / elapsedFraction : used

  // Already at/over limit = definitionally behind (skip 5% threshold)
  if (used >= limit) return { status: "behind", projectedUsage }

  // Too early to predict accurately (< 5% of period elapsed)
  if (elapsedFraction < 0.05) return null

  // Normal classification
  let status: PaceStatus
  if (projectedUsage <= limit * 0.8) {
    status = "ahead"
  } else if (projectedUsage <= limit) {
    status = "on-track"
  } else {
    status = "behind"
  }

  return { status, projectedUsage }
}

/**
 * How much usage exceeds the ideal linear pace (same unit as used/limit).
 * Returns positive deficit or null when ahead/on-pace/incalculable.
 */
export function calculateDeficit(
  used: number,
  limit: number,
  resetsAtMs: number,
  periodDurationMs: number,
  nowMs: number,
  workdays = false
): number | null {
  if (
    !Number.isFinite(used) ||
    !Number.isFinite(limit) ||
    !Number.isFinite(resetsAtMs) ||
    !Number.isFinite(periodDurationMs) ||
    !Number.isFinite(nowMs)
  ) {
    return null
  }
  if (limit <= 0 || periodDurationMs <= 0) return null

  const periodStartMs = resetsAtMs - periodDurationMs
  const elapsedMs = nowMs - periodStartMs
  if (elapsedMs <= 0 || nowMs >= resetsAtMs) return null

  const elapsedFraction = paceElapsedFraction(resetsAtMs, periodDurationMs, nowMs, workdays)
  if (elapsedFraction < 0.05 && used < limit) return null

  const expectedUsage = elapsedFraction * limit
  const deficit = used - expectedUsage
  return deficit > 0 ? deficit : null
}
