import { useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { relaunch } from "@tauri-apps/plugin-process"
import { SettingsSection } from "@/components/settings-section"
import { t, type MessageKey } from "@/lib/i18n"
import { buildSettingsBackup, restoreSettingsBackup } from "@/lib/settings-backup"
import { cn } from "@/lib/utils"

/** Preferences to a file in Downloads and back (`settings_backup.rs`); logins and accounts stay out. */
export function SettingsBackupSection() {
  const [status, setStatus] = useState<{ saved: string } | { error: MessageKey } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
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
    <SettingsSection title={t("settings.backup.title")} description={t("settings.backup.desc")}>
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
    </SettingsSection>
  )
}
