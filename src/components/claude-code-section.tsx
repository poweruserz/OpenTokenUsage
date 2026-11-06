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
    </SettingsSection>
  )
}
