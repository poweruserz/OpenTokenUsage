import { t, tLabel } from "@/lib/i18n"
import type { MetricLine } from "@/lib/plugin-types"
import type { DisplayMode } from "@/lib/settings"
import { getDisplayedUsage } from "@/lib/usage-display"
import { formatCompactDuration } from "@/lib/pace-tooltip"

type ProgressLine = Extract<MetricLine, { type: "progress" }>

export type UsageAlert = {
  title: string
  body: string
  /** Dedupe keys to remember once this alert is sent (a 95% alert also covers the lower levels). */
  keys: string[]
}

/** Pace alerts only once a window is at least half used, so early spikes stay quiet. */
const PACE_MIN_FRACTION = 0.5
/** A reset is worth announcing only if the window was nearly full before it. */
const RESET_MIN_FRACTION = 0.8
/**
 * Reset times this close are one window: Claude's resets_at jitters by milliseconds between probes,
 * others by minutes. Shortcut: assumes no window is shorter than 2 h (the shortest today is 5 h).
 */
const SAME_WINDOW_MS = 60 * 60 * 1000

/** Whether `prefix + window + suffix` was sent, matching the window by time so a jittering reset time is one window. */
function wasSent(sent: ReadonlySet<string>, prefix: string, window: string, suffix: string): boolean {
  if (sent.has(prefix + window + suffix)) return true
  const windowMs = Date.parse(window)
  if (!Number.isFinite(windowMs)) return false
  for (const key of sent) {
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue
    const sentMs = Date.parse(key.slice(prefix.length, key.length - suffix.length))
    if (Math.abs(sentMs - windowMs) <= SAME_WINDOW_MS) return true
  }
  return false
}

function progressLines(lines: MetricLine[] | undefined): ProgressLine[] {
  return (lines ?? []).filter(
    (line): line is ProgressLine => line.type === "progress" && line.limit > 0 && Number.isFinite(line.used)
  )
}

/**
 * Notifications for one provider's fresh probe result. Pure: `sent` holds keys of alerts already
 * shown (persisted by the caller), so each alert fires once per provider + line + window.
 */
export function collectUsageAlerts(args: {
  pluginId: string
  providerName: string
  lines: MetricLine[]
  previousLines?: MetricLine[]
  sent: ReadonlySet<string>
  nowMs: number
  /** Usage levels (percent) that notify, from the settings. */
  levels: readonly number[]
  displayMode: DisplayMode
}): UsageAlert[] {
  const { pluginId, providerName, lines, previousLines, sent, nowMs, displayMode } = args
  const levels = [...args.levels].sort((a, b) => b - a)
  const alerts: UsageAlert[] = []
  const previousByLabel = new Map(progressLines(previousLines).map((line) => [line.label, line]))

  for (const line of progressLines(lines)) {
    const label = tLabel(line.label)
    const fraction = line.used / line.limit
    const window = line.resetsAt ?? "none"
    const prefix = `${pluginId}|${line.label}|`
    const base = prefix + window
    const resetsAtMs = line.resetsAt ? Date.parse(line.resetsAt) : Number.NaN

    // Limit reset: same line, a clearly later reset time (not jitter), and it was nearly full before.
    const previous = previousByLabel.get(line.label)
    if (previous?.resetsAt && line.resetsAt && resetsAtMs - Date.parse(previous.resetsAt) > SAME_WINDOW_MS) {
      const resetKey = `${prefix}${previous.resetsAt}|reset`
      if (previous.used / previous.limit >= RESET_MIN_FRACTION && !wasSent(sent, prefix, previous.resetsAt, "|reset")) {
        alerts.push({
          title: t("alert.reset.title", { provider: providerName, label }),
          body: t("alert.reset.body"),
          keys: [resetKey],
        })
      }
    }

    // Thresholds: announce only the highest level crossed; it also marks the lower ones as sent.
    const level = levels.find((value) => fraction * 100 >= value)
    if (level !== undefined) {
      const keys = levels.filter((value) => value <= level).map((value) => `${base}|t${value}`)
      if (!wasSent(sent, prefix, window, `|t${level}`)) {
        const timeLeft = Number.isFinite(resetsAtMs) ? formatCompactDuration(resetsAtMs - nowMs) : null
        // The amount, not the clamped fraction: an over-limit line says "120% used", as its card does.
        const shownPercent = Math.round((getDisplayedUsage(line.used, line.limit, displayMode).amount / line.limit) * 100)
        alerts.push({
          title: t(displayMode === "left" ? "alert.threshold.left" : "alert.threshold.title", { provider: providerName, label, percent: shownPercent }),
          body: timeLeft ? t("reset.in", { time: timeLeft }) : "",
          keys,
        })
      }
      continue // no pace alert on top of a threshold alert
    }

    // Pace: on track to hit the limit before this window resets.
    const periodMs = line.periodDurationMs
    if (!periodMs || !Number.isFinite(resetsAtMs) || fraction < PACE_MIN_FRACTION) continue
    const elapsedMs = nowMs - (resetsAtMs - periodMs)
    if (elapsedMs <= 0 || nowMs >= resetsAtMs) continue
    const etaMs = (line.limit - line.used) / (line.used / elapsedMs)
    const paceKey = `${base}|pace`
    if (etaMs > 0 && etaMs < resetsAtMs - nowMs && !wasSent(sent, prefix, window, "|pace")) {
      alerts.push({
        title: t("alert.pace.title", { provider: providerName, label }),
        body: t("alert.pace.body", { time: formatCompactDuration(etaMs) ?? "" }),
        keys: [paceKey],
      })
    }
  }
  return alerts
}
