import { Checkbox } from "@/components/ui/checkbox"
import { t } from "@/lib/i18n"
import { saveGlass } from "@/lib/settings"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

/** Glass (`use-glass.ts`): Acrylic behind see-through layers. */
export function GlassToggle() {
  const glass = useAppPreferencesStore((state) => state.glass)
  const setGlass = useAppPreferencesStore((state) => state.setGlass)
  return (
    <label className="mt-2 flex items-start gap-2 text-[13px] select-none text-foreground">
      <Checkbox
        key={String(glass)}
        checked={glass}
        className="mt-0.5"
        onCheckedChange={(checked) => {
          setGlass(checked === true)
          void saveGlass(checked === true).catch((error) => console.error("Failed to save the glass setting:", error))
        }}
      />
      <span>
        {t("settings.theme.glass")}
        <span className="block text-xs text-muted-foreground">{t("settings.theme.glassHint")}</span>
      </span>
    </label>
  )
}
