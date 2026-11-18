import { Checkbox } from "@/components/ui/checkbox"
import { SettingsSection } from "@/components/settings-section"
import { t } from "@/lib/i18n"
import { saveCapturePrivacy } from "@/lib/settings"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

/** "Hide from screen sharing" (`use-capture-privacy.ts`, `capture_privacy.rs`). */
export function PrivacySection() {
  const enabled = useAppPreferencesStore((state) => state.capturePrivacy)
  const setEnabled = useAppPreferencesStore((state) => state.setCapturePrivacy)
  return (
    <SettingsSection newFeature="privacy" title={t("settings.privacy.title")}>
      <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
        <Checkbox
          key={String(enabled)}
          checked={enabled}
          className="mt-0.5"
          onCheckedChange={(checked) => {
            setEnabled(checked === true)
            void saveCapturePrivacy(checked === true).catch((error) =>
              console.error("Failed to save the screen sharing setting:", error)
            )
          }}
        />
        <span>
          {t("settings.privacy.hideWhenSharing")}
          <span className="block text-xs text-muted-foreground">{t("settings.privacy.hideWhenSharingHint")}</span>
        </span>
      </label>
    </SettingsSection>
  )
}
