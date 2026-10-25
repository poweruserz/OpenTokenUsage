import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { SegmentedControl } from "@/components/settings-section"
import { t } from "@/lib/i18n"
import type { SettingOption, TaskbarStripStyle } from "@/lib/settings"

// "left" is the taskbar's free side away from the tray: its middle when Windows aligns the icons left.
const positions = (iconsLeft: boolean): SettingOption<TaskbarStripStyle["position"]>[] => [
  { value: "left", labelKey: iconsLeft ? "settings.strip.positionCenter" : "settings.strip.positionLeft" },
  { value: "right", labelKey: "settings.strip.positionRight" },
]

export function StripPlacement({
  position,
  offset,
  onChange,
}: {
  position: TaskbarStripStyle["position"]
  offset: number
  onChange: (patch: Partial<TaskbarStripStyle>) => void
}) {
  // Allow empty/invalid text while editing; only valid offsets reach the saved settings.
  const [draft, setDraft] = useState<string | null>(null)
  const [iconsLeft, setIconsLeft] = useState(false)
  useEffect(() => {
    invoke<boolean>("taskbar_icons_left")
      .then((value) => setIconsLeft(value === true))
      .catch((error) => console.error("Failed to read the taskbar alignment:", error))
  }, [])
  return (
    <div className="space-y-2">
      <div>
        <div className="mb-1 text-xs text-muted-foreground">{t("settings.strip.position")}</div>
        <SegmentedControl
          options={positions(iconsLeft)}
          value={position}
          onChange={(next) => onChange({ position: next })}
          ariaLabel={t("settings.strip.position")}
        />
      </div>
      <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {t("settings.strip.offset")}
        <input
          type="number"
          min={0}
          max={4096}
          step={1}
          value={draft ?? offset}
          className="fluent-control w-24"
          onBlur={() => setDraft(null)}
          onChange={(event) => {
            setDraft(event.currentTarget.value)
            const next = event.currentTarget.valueAsNumber
            if (Number.isInteger(next) && next >= 0 && next <= 4096) onChange({ offset: next })
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">{t("settings.strip.positionHint")}</p>
    </div>
  )
}
