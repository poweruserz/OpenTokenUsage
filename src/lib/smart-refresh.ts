import type { PluginOutput } from "@/lib/plugin-types"

export const MINUTE = 60_000
// While usage changes, not every minute: an account in steady use would otherwise ask its provider
// every minute for as long as the user works, and Claude's usage endpoint rate-limits.
export const ACTIVE_MINUTES = 2
const IDLE_MINUTES = [2, 5, 10, 15]

/** Fewest minutes between an account's checks. Anthropic allows about 30 usage reads an hour per
 *  login, shared with Claude Code and other monitors, so Claude's cards (extra accounts and WSL
 *  logins too) ask at most every 5 minutes instead of 2. */
export const smartFloorMinutes = (pluginId: string): number => (/^claude(-|$)/.test(pluginId) ? 5 : 0)

export type SmartSchedule = {
  signature: string | null
  activeUntil: number
  idleStep: number
  failures: number
  completedAt: number
  nextAt: number | null
  floorMinutes: number
}

export function newSmartSchedule(now: number, floorMinutes = 0): SmartSchedule {
  return {
    signature: null, activeUntil: now + 5 * MINUTE, idleStep: 0,
    failures: 0, completedAt: 0, nextAt: now + Math.max(ACTIVE_MINUTES, floorMinutes) * MINUTE,
    floorMinutes,
  }
}

/** Compare raw quota numbers, never ticking reset text, status badges or local history charts. */
export function quotaSignature(output: PluginOutput): string {
  return JSON.stringify(output.lines.flatMap((line) =>
    line.type === "progress" ? [[line.label, line.used, line.limit]] : []
  ).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
}

/** A result, not a request start, advances the account's schedule. */
export function completeSmartCheck(schedule: SmartSchedule, output: PluginOutput | null, error: boolean, now: number): SmartSchedule {
  if (error || !output || output.staleSince != null) {
    const failures = schedule.failures + 1
    const minutes = Math.max(IDLE_MINUTES[Math.min(failures - 1, 3)], schedule.floorMinutes)
    return { ...schedule, failures, completedAt: now, nextAt: now + minutes * MINUTE }
  }
  const signature = quotaSignature(output)
  const changed = signature !== schedule.signature
  const activeUntil = changed ? now + 5 * MINUTE : schedule.activeUntil
  const active = now < activeUntil
  const idleStep = active || schedule.failures > 0 ? 0 : schedule.idleStep
  const minutes = Math.max(active ? ACTIVE_MINUTES : IDLE_MINUTES[idleStep], schedule.floorMinutes)
  return {
    signature,
    activeUntil,
    idleStep: active ? 0 : Math.min(idleStep + 1, 3),
    failures: 0,
    completedAt: now,
    nextAt: now + minutes * MINUTE,
    floorMinutes: schedule.floorMinutes,
  }
}
