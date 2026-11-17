import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { SettingsSection } from "@/components/settings-section"
import { Checkbox } from "@/components/ui/checkbox"
import { t } from "@/lib/i18n"

/** `claude_statusline.rs`: whether Claude's settings.json runs the bridge. */
export type ClaudeStatusLineState = "off" | "on" | "other" | "unreadable"

/**
 * The Claude Code status-line bridge: Claude Code posts its own 5-hour and weekly usage to the app,
 * so the Claude card reads Anthropic's rate-limited usage endpoint far less often.
 */
export function ClaudeCodeSection() {
  const [state, setState] = useState<ClaudeStatusLineState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    invoke<ClaudeStatusLineState>("claude_statusline_state")
      .then(setState)
      .catch((error) => console.error("Failed to read the Claude Code status line state:", error))
  }, [])

  const toggle = async (enabled: boolean) => {
    setBusy(true)
    try {
      setState(await invoke<ClaudeStatusLineState>("set_claude_statusline", { enabled }))
    } catch (error) {
      // The command answers with the state that kept it from changing (`other`, `unreadable`).
      if (error === "other" || error === "unreadable") setState(error)
      else console.error("Failed to switch the Claude Code status line:", error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSection title={t("settings.claudeCode.title")} description={t("settings.claudeCode.desc")}>
      <label className="flex items-center gap-2 text-[13px] select-none text-foreground">
        <Checkbox
          checked={state === "on"}
          disabled={busy || state === null || state === "other" || state === "unreadable"}
          onCheckedChange={(checked) => void toggle(checked === true)}
        />
        {t("settings.claudeCode.label")}
      </label>
      {state === "other" && <p className="mt-1.5 text-xs text-muted-foreground">{t("settings.claudeCode.other")}</p>}
      {state === "unreadable" && <p className="mt-1.5 text-xs text-destructive">{t("settings.claudeCode.unreadable")}</p>}
      {(state === "off" || state === "on") && (
        <p className="mt-1.5 text-xs text-muted-foreground">{t("settings.claudeCode.hint")}</p>
      )}
      <LogRetention />
    </SettingsSection>
  )
}

/** Days Claude Code keeps transcripts before deleting them (`cleanupPeriodDays`, 30 when unset). */
const RETENTION_DAYS = [30, 90, 370] as const

/**
 * How long Claude Code keeps its transcripts: the hour grid, projects and spend are read from them, so
 * past that many days the history is gone.
 */
function LogRetention() {
  const [days, setDays] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    invoke<number | null>("claude_log_retention")
      .then((value) => setDays(typeof value === "number" ? value : null))
      .catch((error) => console.error("Failed to read Claude Code's log retention:", error))
  }, [])

  const choose = async (next: number) => {
    setFailed(false)
    try {
      setDays(await invoke<number>("set_claude_log_retention", { days: next }))
    } catch (error) {
      console.error("Failed to set Claude Code's log retention:", error)
      setFailed(true)
    }
  }

  if (days === null) return null
  // A value of the user's own stays listed as it is.
  const options: number[] = RETENTION_DAYS.includes(days as (typeof RETENTION_DAYS)[number]) ? [...RETENTION_DAYS] : [days, ...RETENTION_DAYS]
  return (
    <div className="mt-3">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        {t("settings.claudeCode.retention")}
        <select value={days} onChange={(e) => void choose(Number(e.target.value))} className="fluent-control w-28">
          {options.map((value) => (
            <option key={value} value={value}>
              {t("settings.claudeCode.retentionDays", { days: value })}
            </option>
          ))}
        </select>
      </label>
      <p className={failed ? "mt-1 text-xs text-destructive" : "mt-1 text-xs text-muted-foreground"}>
        {failed ? t("settings.claudeCode.unreadable") : t("settings.claudeCode.retentionHint")}
      </p>
    </div>
  )
}
