import { useContext, type ReactNode } from "react"
import { t } from "@/lib/i18n"
import { NewFeaturesContext, type NewFeatureId } from "@/lib/new-features"
import type { SettingOption } from "@/lib/settings"
import { cn } from "@/lib/utils"

/** A small "New" pill that breathes slowly (still under reduced motion). */
export function NewBadge() {
  return (
    <span className="ml-1.5 inline-flex rounded-full bg-primary/15 px-1.5 align-middle text-[10px] font-semibold leading-4 text-primary animate-pulse motion-reduce:animate-none">
      {t("settings.newBadge")}
    </span>
  )
}

/** Windows 11 Settings card: title, one-line description, then the control. */
export function SettingsSection({
  title,
  description,
  newFeature,
  children,
}: {
  title: string
  description?: string
  /** Badged "New" while this card's addition is new and its group wasn't opened before (`new-features.ts`). */
  newFeature?: NewFeatureId
  children: ReactNode
}) {
  const shown = useContext(NewFeaturesContext)
  return (
    <section className="rounded-lg border border-surface-stroke bg-surface px-3 py-2.5">
      <h3 className="text-sm font-semibold leading-5">
        {title}
        {newFeature && shown.has(newFeature) && <NewBadge />}
      </h3>
      {description && <p className="text-xs text-muted-foreground leading-4 mb-2">{description}</p>}
      {!description && <div className="h-1.5" />}
      {children}
    </section>
  )
}

/** Fluent toggle-button group: one choice, the checked one filled with the accent color. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  renderOption,
  itemClassName,
}: {
  options: SettingOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  renderOption?: (option: SettingOption<T>, isActive: boolean) => ReactNode
  itemClassName?: string
}) {
  return (
    <div className="flex gap-0.5 rounded-md border bg-secondary p-0.5" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const isActive = option.value === value
        const label = t(option.labelKey, option.labelVars)
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={option.hintKey ? t(option.hintKey) : label}
            onClick={() => onChange(option.value)}
            className={cn(
              // nowrap + truncate: a long translation must never wrap out of the 28px pill
              "flex-1 min-w-0 h-7 rounded-[3px] px-1.5 text-[13px] whitespace-nowrap truncate transition-colors",
              isActive
                ? "bg-primary text-primary-foreground font-medium"
                : "text-foreground hover:bg-accent active:bg-accent/60",
              itemClassName
            )}
          >
            {renderOption ? renderOption(option, isActive) : label}
          </button>
        )
      })}
    </div>
  )
}
