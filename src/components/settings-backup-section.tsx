import { useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { relaunch } from "@tauri-apps/plugin-process"
import { SettingsSection } from "@/components/settings-section"
import { t, type MessageKey } from "@/lib/i18n"
import { buildSettingsBackup, resetAllSettings, restoreSettingsBackup } from "@/lib/settings-backup"
import { cn } from "@/lib/utils"

/** Preferences to a file in Downloads and back (`settings_backup.rs`); logins and accounts stay out. */
export function SettingsBackupSection() {
  const [status, setStatus] = useState<{ saved: string } | { error: MessageKey } | null>(null)
  // Reset asks once more before it wipes anything.
  const [confirmReset, setConfirmReset] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const resetAll = async () => {
    setStatus(null)
    try {
      await resetAllSettings()
      await relaunch()
    } catch (error) {
      console.error("Failed to reset settings:", error)
      setStatus({ error: "settings.backup.resetError" })
      setConfirmReset(false)
    }
  }
  const exportSettings = async () => {
    setStatus(null)
    try {
      setStatus({ saved: await invoke<string>("export_settings", { json: await buildSettingsBackup() }) })
    } catch (error) {
      console.error("Failed to export settings:", error)
      setStatus({ error: "settings.backup.exportError" })
    }
  }
  const importSettings = async (file: File) => {
    setStatus(null)
    try {
      const result = await restoreSettingsBackup(await file.text())
      if (!result.ok) {
        setStatus({ error: "settings.backup.notBackup" })
        return
      }
      // Every setting is checked and applied as the app starts.
      await relaunch()
    } catch (error) {
      console.error("Failed to import settings:", error)
      setStatus({ error: "settings.backup.importError" })
    }
  }
  return (
    <SettingsSection newFeature="backup" title={t("settings.backup.title")} description={t("settings.backup.desc")}>
      <div className="flex gap-2">
        <button type="button" className="fluent-control px-3" onClick={() => void exportSettings()}>
          {t("settings.backup.export")}
        </button>
        <button type="button" className="fluent-control px-3" onClick={() => fileInput.current?.click()}>
          {t("settings.backup.import")}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label={t("settings.backup.import")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (file) void importSettings(file)
          }}
        />
      </div>
      {status && (
        <p className={cn("mt-1.5 break-all text-xs", "error" in status ? "text-destructive" : "text-muted-foreground")}>
          {"error" in status ? t(status.error) : t("settings.backup.saved", { path: status.saved })}
        </p>
      )}
      <div className="mt-3 border-t border-surface-stroke pt-3">
        <p className="mb-2 text-xs text-muted-foreground">{t("settings.backup.resetHint")}</p>
        {confirmReset ? (
          <div className="flex gap-2">
            <button type="button" className="fluent-control px-3 text-destructive" onClick={() => void resetAll()}>
              {t("settings.backup.resetConfirm")}
            </button>
            <button type="button" className="fluent-control px-3" onClick={() => setConfirmReset(false)}>
              {t("settings.backup.resetCancel")}
            </button>
          </div>
        ) : (
          <button type="button" className="fluent-control px-3" onClick={() => setConfirmReset(true)}>
            {t("settings.backup.reset")}
          </button>
        )}
      </div>
    </SettingsSection>
  )
}
