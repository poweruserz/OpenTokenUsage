import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Checkbox } from "@/components/ui/checkbox"
import { SegmentedControl, SettingsSection } from "@/components/settings-section"
import { useTaskbarStripPreview } from "@/hooks/app/use-taskbar-strip"
import { t } from "@/lib/i18n"
import {
  DEFAULT_TASKBAR_STRIP_STYLE,
  EDGE_SLIDE_MS,
  MAX_TASKBAR_STRIP_PROVIDERS,
  saveDesktopWidgets,
  saveTaskbarStrip,
  saveTaskbarStripStyle,
  saveTrayLogoColors,
  type DesktopWidgetLayout,
  type DesktopWidgetLogo,
  type DesktopWidgets,
  type EdgeSide,
  TASKBAR_STRIP_COLOR_MODES,
  TASKBAR_STRIP_COLOR_SCALES,
  TASKBAR_STRIP_FONTS,
  type MenubarIconStyle,
  type TaskbarStripColorMode,
  type TaskbarStripFont,
  type SettingOption,
  type TaskbarStripLineMode,
  type TaskbarStripMonitors,
  type TaskbarStripStyle,
  CLICK_THROUGH_KEYS,
  type ClickThroughKey,
} from "@/lib/settings"
import { colorOnScale, stripPluginSettings, stripTextLabel } from "@/lib/taskbar-strip"
import { cn } from "@/lib/utils"
import { useAppPluginStore } from "@/stores/app-plugin-store"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { StripPlacement } from "@/components/strip-placement"

const FONT_SIZES = [10, 11, 12, 13, 14, 15]

const LINE_MODE_LABELS = {
  both: "settings.strip.lineBoth",
  session: "label.Session",
  weekly: "label.Weekly",
} as const

const COLOR_MODE_LABELS = {
  heat: "settings.strip.colorHeat",
  traffic: "settings.strip.colorTraffic",
  cool: "settings.strip.colorCool",
  mono: "settings.strip.colorMono",
  pace: "settings.strip.colorPace",
  thresholds: "settings.strip.colorThresholds",
  off: "settings.strip.colorOff",
} as const

/** The chosen scale from 1 to 100 %, drawn as a bar so the user sees it before picking. */
function ScalePreview({ mode, base }: { mode: TaskbarStripColorMode; base: string }) {
  if (mode === "pace") return <p className="mt-1 text-xs text-muted-foreground">{t("settings.tray.paceColorHint")}</p>
  if (mode === "off" || mode === "thresholds") return null
  const stops = Array.from({ length: 11 }, (_, i) => `${colorOnScale(TASKBAR_STRIP_COLOR_SCALES[mode], i * 10, base)} ${i * 10}%`)
  return (
    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
      <span>1%</span>
      <span className="h-2 flex-1 rounded-full border border-surface-stroke" style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }} />
      <span>100%</span>
    </div>
  )
}

let saveTimer: number | undefined
/** Color pickers fire on every drag step; write the file once the user pauses. */
function saveStyleSoon(style: TaskbarStripStyle) {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTaskbarStripStyle(style).catch((error) => console.error("Failed to save taskbar strip style:", error))
  }, 300)
}

/** Key caps, as Windows prints them on every keyboard layout. */
const KEY_NAMES: Record<ClickThroughKey, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift" }

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-[13px] select-none text-foreground">
      <Checkbox key={String(checked)} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      {children}
    </label>
  )
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (next: string) => void; label: string }) {
  return (
    <input
      type="color"
      value={value}
      aria-label={label}
      title={label}
      onChange={(e) => onChange(e.target.value)}
      className="fluent-control h-7 w-10 cursor-pointer px-1"
    />
  )
}

function StripProviderRow({
  id,
  name,
  checked,
  disabled,
  lineMode,
  onToggle,
  onLineModeChange,
}: {
  id: string
  name: string
  checked: boolean
  disabled: boolean
  /** Absent for a provider that shows a text value: it has no session or weekly line to pick. */
  lineMode?: TaskbarStripLineMode
  onToggle: (id: string) => void
  onLineModeChange: (id: string, mode: TaskbarStripLineMode) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2.5 px-2 h-8 rounded-md hover:bg-accent", isDragging && "opacity-50 bg-accent")}
    >
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        aria-label={t("settings.strip.drag", { name })}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className={cn("flex-1 truncate text-[13px]", !checked && "text-muted-foreground")}>{name}</span>
      {checked && lineMode && (
        <select
          value={lineMode}
          aria-label={t("settings.strip.lineMode", { name })}
          onChange={(e) => onLineModeChange(id, e.target.value as TaskbarStripLineMode)}
          className="fluent-control h-6 w-24 py-0 text-xs"
        >
          {(Object.keys(LINE_MODE_LABELS) as TaskbarStripLineMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {t(LINE_MODE_LABELS[mode])}
            </option>
          ))}
        </select>
      )}
      <Checkbox
        key={`${id}-${checked}`}
        checked={checked}
        disabled={disabled}
        aria-label={name}
        onCheckedChange={() => onToggle(id)}
      />
    </div>
  )
}

/** A monitor as `list_taskbar_monitors` reports it. */
type TaskbarMonitor = { id: string; name: string; primary: boolean; hasTaskbar: boolean }

type MonitorsMode = "primary" | "all" | "pick"
const MONITOR_MODES: SettingOption<MonitorsMode>[] = [
  { value: "primary", labelKey: "settings.strip.monitorsPrimary" },
  { value: "all", labelKey: "settings.strip.monitorsAll" },
  { value: "pick", labelKey: "settings.strip.monitorsPick" },
]

/** Which taskbars show the strip: the main one, all, or ticked monitors (unplugged ones stay listed). */
function StripMonitors({ value, onChange }: { value: TaskbarStripMonitors; onChange: (next: TaskbarStripMonitors) => void }) {
  const [connected, setConnected] = useState<TaskbarMonitor[]>([])
  const mode: MonitorsMode = typeof value === "string" ? value : "pick"
  const picked = Array.isArray(value) ? value : []

  useEffect(() => {
    invoke<TaskbarMonitor[]>("list_taskbar_monitors")
      .then((monitors) => setConnected(Array.isArray(monitors) ? monitors : []))
      .catch((error) => console.error("Failed to list monitors:", error))
  }, [mode])

  const rows = [
    ...connected.map((monitor) => ({ ...monitor, connected: true })),
    ...picked
      .filter((monitor) => !connected.some((other) => other.id === monitor.id))
      .map((monitor) => ({ ...monitor, primary: false, hasTaskbar: false, connected: false })),
  ]
  const labelOf = (row: (typeof rows)[number]) =>
    !row.connected
      ? t("settings.strip.monitorDisconnected", { name: row.name })
      : !row.hasTaskbar
        ? t("settings.strip.monitorNoTaskbar", { name: row.name })
        : row.primary
          ? t("settings.strip.monitorMain", { name: row.name })
          : row.name

  const setMode = (next: MonitorsMode) => {
    if (next !== "pick") return onChange(next)
    // Start the list with the main monitor ticked, so picking never means "nowhere".
    const main = connected.find((monitor) => monitor.primary) ?? connected[0]
    if (picked.length > 0) onChange(picked)
    else if (main) onChange([{ id: main.id, name: main.name }])
  }
  const toggle = (row: (typeof rows)[number]) => {
    const next = picked.some((monitor) => monitor.id === row.id)
      ? picked.filter((monitor) => monitor.id !== row.id)
      : [...picked, { id: row.id, name: row.name }]
    onChange(next.length > 0 ? next : "primary")
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{t("settings.strip.monitors")}</div>
      <SegmentedControl options={MONITOR_MODES} value={mode} onChange={setMode} ariaLabel={t("settings.strip.monitors")} />
      {mode === "pick" && (
        <div className="mt-2 space-y-1.5">
          {rows.map((row) => (
            <CheckRow key={row.id} checked={picked.some((monitor) => monitor.id === row.id)} onChange={() => toggle(row)}>
              <span className={cn(!row.connected && "text-muted-foreground")}>{labelOf(row)}</span>
            </CheckRow>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{t("settings.strip.monitorsHint")}</p>
    </div>
  )
}

const WIDGET_LAYOUTS: SettingOption<DesktopWidgetLayout>[] = [
  { value: "row", labelKey: "settings.strip.desktopRow" },
  { value: "column", labelKey: "settings.strip.desktopColumn" },
  { value: "separate", labelKey: "settings.strip.desktopSeparate" },
  { value: "cycle", labelKey: "settings.strip.desktopCycle", hintKey: "settings.strip.desktopCycleHint" },
  { value: "edge", labelKey: "settings.strip.desktopEdge", hintKey: "settings.strip.desktopEdgeHint" },
]

const EDGE_SIDE_OPTIONS: SettingOption<EdgeSide>[] = [
  { value: "right", labelKey: "settings.strip.desktopEdgeRight" },
  { value: "left", labelKey: "settings.strip.desktopEdgeLeft" },
  { value: "top", labelKey: "settings.strip.desktopEdgeTop" },
]

const WIDGET_LOGOS: SettingOption<DesktopWidgetLogo>[] = [
  { value: "brand", labelKey: "settings.strip.desktopLogoBrand" },
  { value: "white", labelKey: "settings.strip.desktopLogoWhite" },
  { value: "black", labelKey: "settings.strip.desktopLogoBlack" },
]

let widgetSaveTimer: number | undefined
/** The opacity slider fires on every step; write the file once the user pauses. */
function saveWidgetsSoon(value: DesktopWidgets) {
  window.clearTimeout(widgetSaveTimer)
  widgetSaveTimer = window.setTimeout(() => {
    saveDesktopWidgets(value).catch((error) => console.error("Failed to save desktop widgets:", error))
  }, 300)
}

/** The desktop widgets' own options; their providers and look are the strip's (below). */
function DesktopWidgetControls({ value, onChange }: { value: DesktopWidgets; onChange: (patch: Partial<DesktopWidgets>) => void }) {
  return (
    <div className="mt-3 space-y-3 pl-6">
      <div>
        <div className="text-xs text-muted-foreground mb-1">{t("settings.strip.desktopLayout")}</div>
        <SegmentedControl
          options={WIDGET_LAYOUTS}
          value={value.layout}
          onChange={(layout) => onChange({ layout })}
          ariaLabel={t("settings.strip.desktopLayout")}
        />
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">{t("settings.strip.desktopLogo")}</div>
        <SegmentedControl
          options={WIDGET_LOGOS}
          value={value.logo}
          onChange={(logo) => onChange({ logo })}
          ariaLabel={t("settings.strip.desktopLogo")}
        />
      </div>
      <label className="block text-xs text-muted-foreground">
        <span className="mb-1 flex justify-between">
          <span>{t("settings.strip.desktopPlate")}</span>
          <span className="tabular-nums">{value.plateOpacity}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value.plateOpacity}
          onChange={(e) => onChange({ plateOpacity: Number(e.target.value) })}
          className="w-full accent-[var(--accent-base)]"
        />
      </label>
      <div className="flex flex-col gap-2">
        {value.layout === "edge" && (
          <>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t("settings.strip.desktopEdgeSide")}</div>
              <SegmentedControl
                options={EDGE_SIDE_OPTIONS}
                value={value.edgeSide}
                onChange={(edgeSide) => onChange({ edgeSide })}
                ariaLabel={t("settings.strip.desktopEdgeSide")}
              />
            </div>
            <CheckRow checked={value.slide} onChange={(slide) => onChange({ slide })}>
              {t("settings.strip.desktopSlide")}
            </CheckRow>
            {value.slide && (
              <label className="ml-6 block text-xs text-muted-foreground">
                <span className="mb-1 flex justify-between">
                  <span>{t("settings.strip.desktopSlideMs")}</span>
                  <span className="tabular-nums">{value.slideMs} ms</span>
                </span>
                <input
                  type="range"
                  min={EDGE_SLIDE_MS.min}
                  max={EDGE_SLIDE_MS.max}
                  step={EDGE_SLIDE_MS.step}
                  value={value.slideMs}
                  onChange={(e) => onChange({ slideMs: Number(e.target.value) })}
                  className="w-full accent-[var(--accent-base)]"
                />
              </label>
            )}
            <CheckRow checked={value.gradient} onChange={(gradient) => onChange({ gradient })}>
              {t("settings.strip.desktopGradient")}
            </CheckRow>
            <CheckRow checked={value.edgePinned} onChange={(edgePinned) => onChange({ edgePinned })}>
              {t("settings.strip.desktopPinned")}
            </CheckRow>
          </>
        )}
        <CheckRow checked={value.bars} onChange={(bars) => onChange({ bars })}>
          {t("settings.strip.desktopBars")}
        </CheckRow>
        <CheckRow checked={value.onTop} onChange={(onTop) => onChange({ onTop })}>
          {t("settings.strip.desktopOnTop")}
        </CheckRow>
        <CheckRow checked={value.snap} onChange={(snap) => onChange({ snap })}>
          {t("settings.strip.desktopSnap")}
        </CheckRow>
        <CheckRow checked={value.locked} onChange={(locked) => onChange({ locked })}>
          {t("settings.strip.desktopLocked")}
        </CheckRow>
        <CheckRow checked={value.clickThrough} onChange={(clickThrough) => onChange({ clickThrough })}>
          {t("settings.strip.desktopClickThrough")}
        </CheckRow>
        {value.clickThrough && (
          <label className="ml-6 flex items-center gap-2 text-xs text-muted-foreground">
            {t("settings.strip.desktopClickThroughKey")}
            <select
              value={value.clickThroughKey}
              onChange={(e) => onChange({ clickThroughKey: e.target.value as ClickThroughKey })}
              className="fluent-control w-24"
            >
              {CLICK_THROUGH_KEYS.map((key) => (
                <option key={key} value={key}>
                  {KEY_NAMES[key]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}

/**
 * Experimental taskbar strip (on/off, live preview, where it sits), its desktop widgets, and the look
 * both share (providers, fonts, colors): three cards.
 */
export function TaskbarStripSection({ onMenubarIconStyleChange }: { onMenubarIconStyleChange: (style: MenubarIconStyle) => void }) {
  const enabled = useAppPreferencesStore((state) => state.taskbarStrip)
  const setEnabled = useAppPreferencesStore((state) => state.setTaskbarStrip)
  const widgets = useAppPreferencesStore((state) => state.desktopWidgets)
  const setWidgets = useAppPreferencesStore((state) => state.setDesktopWidgets)
  const updateWidgets = (patch: Partial<DesktopWidgets>) => {
    const next = { ...widgets, ...patch }
    setWidgets(next)
    saveWidgetsSoon(next)
  }
  const style = useAppPreferencesStore((state) => state.taskbarStripStyle)
  const setStyle = useAppPreferencesStore((state) => state.setTaskbarStripStyle)
  const logoColors = useAppPreferencesStore((state) => state.trayLogoColors)
  const setLogoColors = useAppPreferencesStore((state) => state.setTrayLogoColors)
  const pluginsMeta = useAppPluginStore((state) => state.pluginsMeta)
  const pluginSettings = useAppPluginStore((state) => state.pluginSettings)
  const preview = useTaskbarStripPreview((state) => state.preview)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const update = (patch: Partial<TaskbarStripStyle>) => {
    const next = { ...style, ...patch }
    setStyle(next)
    saveStyleSoon(next)
  }

  const setStripEnabled = (next: boolean) => {
    setEnabled(next)
    void saveTaskbarStrip(next).catch((error) => console.error("Failed to save taskbar strip:", error))
    // The strip replaces the tray styles that show numbers: keep just the app icon in the tray.
    if (next) onMenubarIconStyleChange("icon")
  }

  const nameOf = (id: string) => pluginsMeta.find((meta) => meta.id === id)?.name ?? id
  const textOnly = (id: string) => {
    const meta = pluginsMeta.find((entry) => entry.id === id)
    return meta !== undefined && stripTextLabel(meta) !== undefined
  }
  const enabledIds = pluginSettings ? pluginSettings.order.filter((id) => !pluginSettings.disabled.includes(id)) : []
  const shown = pluginSettings ? stripPluginSettings(style.providers, pluginSettings).order : []
  const rows = [...shown, ...enabledIds.filter((id) => !shown.includes(id))]
  const full = shown.length >= MAX_TASKBAR_STRIP_PROVIDERS

  const toggleProvider = (id: string) => {
    const next = shown.includes(id) ? shown.filter((other) => other !== id) : [...shown, id]
    update({ providers: next.slice(0, MAX_TASKBAR_STRIP_PROVIDERS) })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const reordered = arrayMove(rows, rows.indexOf(String(active.id)), rows.indexOf(String(over.id)))
    update({ providers: reordered.filter((id) => shown.includes(id)) })
  }

  // Three cards: the strip and where it sits, the desktop widgets, and the look both share.
  return (
    <>
      <SettingsSection title={t("settings.strip.title")} description={t("settings.strip.desc")}>
        <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
          <Checkbox key={`strip-${enabled}`} checked={enabled} className="mt-0.5" onCheckedChange={(next) => setStripEnabled(next === true)} />
          <span>
            {t("settings.strip.enable")}
            <span className="block text-xs text-muted-foreground">{t("settings.strip.enableHint")}</span>
          </span>
        </label>
        {enabled && (
          <div className="mt-3 space-y-3">
            {preview && (
              <div
                className={cn(
                  "flex h-12 items-center justify-center overflow-hidden rounded-md border border-surface-stroke",
                  preview.onLightTaskbar ? "bg-[#eeeeee]" : "bg-[#1c1c1c]"
                )}
                aria-label={t("settings.strip.preview")}
              >
                <img
                  alt=""
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`}
                  style={{ width: preview.width / preview.scale, height: preview.height / preview.scale }}
                />
              </div>
            )}
            <StripMonitors value={style.monitors} onChange={(monitors) => update({ monitors })} />
            <StripPlacement position={style.position} offset={style.offset} onChange={update} />
            <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
              <Checkbox
                key={`running-${style.onlyWhileRunning}`}
                checked={style.onlyWhileRunning}
                className="mt-0.5"
                onCheckedChange={(next) => update({ onlyWhileRunning: next === true })}
              />
              <span>
                {t("settings.strip.onlyWhileRunning")}
                <span className="block text-xs text-muted-foreground">{t("settings.strip.onlyWhileRunningHint")}</span>
              </span>
            </label>
          </div>
        )}
      </SettingsSection>

      <SettingsSection newFeature="widgets" title={t("settings.widgets.title")} description={t("settings.widgets.desc")}>
        <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
          <Checkbox
            key={`desktop-${widgets.enabled}`}
            checked={widgets.enabled}
            className="mt-0.5"
            onCheckedChange={(next) => updateWidgets({ enabled: next === true })}
          />
          <span>
            {t("settings.strip.desktop")}
            <span className="block text-xs text-muted-foreground">{t("settings.strip.desktopHint")}</span>
          </span>
        </label>
        {widgets.enabled && <DesktopWidgetControls value={widgets} onChange={updateWidgets} />}
      </SettingsSection>

      {(enabled || widgets.enabled) && (
        <SettingsSection newFeature="stripLook" title={t("settings.stripLook.title")} description={t("settings.stripLook.desc")}>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                {t("settings.strip.providers", { max: MAX_TASKBAR_STRIP_PROVIDERS })}
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={rows} strategy={verticalListSortingStrategy}>
                  {rows.map((id) => (
                    <StripProviderRow
                      key={id}
                      id={id}
                      name={nameOf(id)}
                      checked={shown.includes(id)}
                      disabled={full && !shown.includes(id)}
                      lineMode={textOnly(id) ? undefined : (style.lineModes[id] ?? "both")}
                      onToggle={toggleProvider}
                      onLineModeChange={(provider, mode) => update({ lineModes: { ...style.lineModes, [provider]: mode } })}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <p className="mt-1 text-xs text-muted-foreground">{t("settings.strip.providersHint")}</p>
            </div>

            <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
              <Checkbox
                key={`follow-${style.followActive}`}
                checked={style.followActive}
                className="mt-0.5"
                onCheckedChange={(next) => update({ followActive: next === true })}
              />
              <span>
                {t("settings.strip.followActive")}
                <span className="block text-xs text-muted-foreground">{t("settings.strip.followActiveHint")}</span>
              </span>
            </label>
            {style.followActive && (
              <div className="ml-6">
                <CheckRow checked={style.followDetail} onChange={(followDetail) => update({ followDetail })}>
                  {t("settings.strip.followDetail")}
                </CheckRow>
              </div>
            )}
            <CheckRow checked={style.activityDots} onChange={(activityDots) => update({ activityDots })}>
              {t("settings.strip.activityDots")}
            </CheckRow>
            <CheckRow checked={style.tokenRate} onChange={(tokenRate) => update({ tokenRate })}>
              {t("settings.strip.tokenRate")}
            </CheckRow>

            <div className="flex gap-2">
              <label className="flex-1 text-xs text-muted-foreground">
                <span className="mb-1 block">{t("settings.strip.font")}</span>
                <select
                  value={style.font}
                  onChange={(e) => update({ font: e.target.value as TaskbarStripFont })}
                  className="fluent-control w-full"
                >
                  {TASKBAR_STRIP_FONTS.map((font) => (
                    <option key={font.id} value={font.id} style={{ fontFamily: font.css }}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-20 text-xs text-muted-foreground">
                <span className="mb-1 block">{t("settings.strip.size")}</span>
                <select
                  value={style.fontSize}
                  onChange={(e) => update({ fontSize: Number(e.target.value) })}
                  className="fluent-control w-full"
                >
                  {FONT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size} px
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <CheckRow checked={style.bold} onChange={(bold) => update({ bold })}>
                {t("settings.strip.bold")}
              </CheckRow>
              <CheckRow checked={style.showPercentSign} onChange={(showPercentSign) => update({ showPercentSign })}>
                {t("settings.strip.showPercentSign")}
              </CheckRow>
              {/* The strip's logos; the widgets pick theirs above. */}
              {enabled && (
                <CheckRow
                  checked={logoColors}
                  onChange={(next) => {
                    setLogoColors(next)
                    void saveTrayLogoColors(next).catch((error) => console.error("Failed to save logo colors:", error))
                  }}
                >
                  {t("settings.tray.logoColors")}
                </CheckRow>
              )}
            </div>

            <div className="flex items-center gap-2">
              <CheckRow checked={style.textColor !== null} onChange={(custom) => update({ textColor: custom ? "#ffffff" : null })}>
                {t("settings.strip.customTextColor")}
              </CheckRow>
              {style.textColor !== null && (
                <ColorInput value={style.textColor} label={t("settings.strip.customTextColor")} onChange={(textColor) => update({ textColor })} />
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-muted-foreground">
                <span className="mb-1 block">{t("settings.strip.colorMode")}</span>
                <select
                  value={style.colorMode}
                  onChange={(e) => update({ colorMode: e.target.value as TaskbarStripColorMode })}
                  className="fluent-control w-full"
                >
                  {TASKBAR_STRIP_COLOR_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(COLOR_MODE_LABELS[mode])}
                    </option>
                  ))}
                </select>
              </label>
              <ScalePreview mode={style.colorMode} base={style.textColor ?? (preview?.onLightTaskbar ? "#000000" : "#ffffff")} />
              {style.colorMode === "thresholds" && (
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5 pl-6 text-xs text-muted-foreground">
                  {(
                    [
                      ["warnAt", "warnColor", "settings.strip.warnAt"],
                      ["criticalAt", "criticalColor", "settings.strip.criticalAt"],
                    ] as const
                  ).map(([atKey, colorKey, labelKey]) => (
                    <div key={atKey} className="contents">
                      <span>{t(labelKey)}</span>
                      <span className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={style[atKey]}
                          onChange={(e) => {
                            const value = Math.min(100, Math.max(1, Math.round(Number(e.target.value) || 1)))
                            update({ [atKey]: value })
                          }}
                          className="fluent-control w-16"
                        />
                        %
                      </span>
                      <ColorInput value={style[colorKey]} label={t(labelKey)} onChange={(color) => update({ [colorKey]: color })} />
                    </div>
                  ))}
                  <span className="col-span-3">{t("settings.strip.usageColorsHint")}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="text-xs text-primary underline-offset-2 hover:underline"
              onClick={() => update({ ...DEFAULT_TASKBAR_STRIP_STYLE, providers: style.providers })}
            >
              {t("settings.strip.reset")}
            </button>
          </div>
        </SettingsSection>
      )}
    </>
  )
}
