import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Eye, EyeOff, GripVertical, Play } from "lucide-react";
import { useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { GlobalShortcutSection } from "@/components/global-shortcut-section";
import { TaskbarStripSection } from "@/components/taskbar-strip-section";
import { SegmentedControl, SettingsSection } from "@/components/settings-section";
import { audioFileToWav, CUSTOM_SOUND_MAX_MB, CUSTOM_SOUND_MAX_SECONDS, SoundFileTooLargeError } from "@/lib/alert-sound";
import { getBarFillLayout, getTrayIconSizePx } from "@/lib/tray-bars-icon";
import { bytesToBase64 } from "@/lib/tray-provider-icons";
import {
  ALERT_SOUNDS,
  AUTO_UPDATE_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  isPerProviderTrayStyle,
  MENUBAR_ICON_STYLE_OPTIONS,
  RESET_TIMER_DISPLAY_OPTIONS,
  saveAlertSettings,
  saveLanguage,
  saveRememberPanelPosition,
  saveTrayHiddenPlugins,
  saveTrayLogoColors,
  saveTaskbarStrip,
  saveUsageAlerts,
  THEME_OPTIONS,
  TIME_FORMAT_OPTIONS,
  USAGE_ALERT_LEVELS,
  type AlertSettings,
  type AlertSound,
  type AutoUpdateInterval,
  type DisplayMode,
  type GlobalShortcut,
  type MenubarIconStyle,
  type ResetTimerDisplayMode,
  type ThemeMode,
  type TimeFormatMode,
} from "@/lib/settings";
import { getTimeFormatter } from "@/lib/reset-tooltip";
import { LANGUAGES, resolveLanguage, t, useLocaleStore, type LanguagePreference } from "@/lib/i18n";
import type { TraySettingsPreview } from "@/hooks/app/use-tray-icon";
import { cn } from "@/lib/utils";
import type { AccountsChange } from "@/lib/accounts";
import { AccountsSection } from "@/components/accounts-section";
import { useAppPreferencesStore } from "@/stores/app-preferences-store";

interface PluginConfig {
  id: string;
  name: string;
  enabled: boolean;
}

const TRAY_PREVIEW_SIZE_PX = getTrayIconSizePx(1) / 2;

const PREVIEW_BAR_TRACK_PX = 20;

// Sample time for the time-format and absolute-reset examples.
const EXAMPLE_TIME = new Date(2026, 1, 2, 11, 4);

function getPreviewBarLayout(fraction: number): { fillPercent: number; remainderPercent: number } {
  const { fillW, remainderDrawW } = getBarFillLayout(PREVIEW_BAR_TRACK_PX, fraction);
  return {
    fillPercent: (fillW / PREVIEW_BAR_TRACK_PX) * 100,
    remainderPercent: (remainderDrawW / PREVIEW_BAR_TRACK_PX) * 100,
  };
}

function TrayIconStylePreview({
  style,
  traySettingsPreview,
}: {
  style: MenubarIconStyle;
  traySettingsPreview: TraySettingsPreview;
}) {
  if (style === "icon") {
    return (
      <img
        src="/icon.png"
        alt=""
        className="shrink-0"
        style={{ width: `${TRAY_PREVIEW_SIZE_PX}px`, height: `${TRAY_PREVIEW_SIZE_PX}px` }}
      />
    );
  }

  if (style === "bars") {
    const fractions = traySettingsPreview.bars.length > 0
      ? traySettingsPreview.bars.map((b) => b.fraction ?? 0)
      : [0.83, 0.7, 0.56];

    return (
      <div className="flex flex-col gap-0.5 w-5">
        {fractions.map((fraction, i) => {
          const { fillPercent, remainderPercent } = getPreviewBarLayout(fraction);
          return (
            <div key={i} className="relative h-1 rounded-sm bg-current/15">
              {remainderPercent > 0 && (
                <span
                  aria-hidden
                  className="absolute right-0 inset-y-0 bg-current/20"
                  style={{ width: `${remainderPercent}%`, borderRadius: "1px 2px 2px 1px" }}
                />
              )}
              <div className="h-1 bg-current" style={{ width: `${fillPercent}%`, borderRadius: "2px 1px 1px 2px" }} />
            </div>
          );
        })}
      </div>
    );
  }

  const sampleFractions = traySettingsPreview.bars.length > 1
    ? traySettingsPreview.bars.slice(0, 2).map((b) => b.fraction ?? 0)
    : [0.58, 0.12];

  if (style === "numbers") {
    return (
      <span className="flex gap-1 text-[11px] font-bold tabular-nums leading-none">
        {sampleFractions.map((fraction, i) => (
          <span key={i}>{Math.round(fraction * 100)}</span>
        ))}
      </span>
    );
  }

  if (style === "logos") {
    return (
      <span className="flex gap-1">
        {sampleFractions.map((fraction, i) => (
          <svg key={i} viewBox="0 0 16 16" className="size-3.5" aria-hidden>
            <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
            <circle
              cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="2"
              strokeDasharray={`${fraction * 40.8} 40.8`} transform="rotate(-90 8 8)"
            />
            <circle cx="8" cy="8" r="2.5" fill="currentColor" />
          </svg>
        ))}
      </span>
    );
  }

  return (
    <span className="text-[13px] font-bold tabular-nums leading-none">
      {(traySettingsPreview.providerPercentText || "0%").replace(/%$/, "")}
    </span>
  );
}

function TrayLogoColorsToggle() {
  const trayLogoColors = useAppPreferencesStore((state) => state.trayLogoColors);
  const setTrayLogoColors = useAppPreferencesStore((state) => state.setTrayLogoColors);
  return (
    <label className="mt-2 flex items-center gap-2 text-[13px] select-none text-foreground">
      <Checkbox
        key={`tray-logo-colors-${trayLogoColors}`}
        checked={trayLogoColors}
        onCheckedChange={(checked) => {
          const next = checked === true;
          setTrayLogoColors(next);
          void saveTrayLogoColors(next).catch((error) => console.error("Failed to save logo colors:", error));
        }}
      />
      {t("settings.tray.logoColors")}
    </label>
  );
}

function SortablePluginItem({
  plugin,
  onToggle,
  inTray,
  onToggleTray,
}: {
  plugin: PluginConfig;
  onToggle: (id: string) => void;
  inTray: boolean;
  onToggleTray: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: plugin.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => onToggle(plugin.id)}
      className={cn(
        "flex items-center gap-2.5 px-2 h-9 rounded-md cursor-pointer hover:bg-accent transition-colors",
        isDragging && "opacity-50 bg-accent"
      )}
    >
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className={cn("flex-1 text-[13px]", !plugin.enabled && "text-muted-foreground")}>
        {plugin.name}
      </span>

      {plugin.enabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleTray(plugin.id);
          }}
          title={t(inTray ? "settings.plugins.inTray" : "settings.plugins.notInTray")}
          aria-label={t(inTray ? "settings.plugins.inTray" : "settings.plugins.notInTray")}
          aria-pressed={inTray}
          className={cn(
            "inline-flex items-center justify-center size-6 rounded-md hover:bg-accent transition-colors",
            inTray ? "text-foreground" : "text-muted-foreground/60"
          )}
        >
          {inTray ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      )}

      {/* Wrap to stop Base UI's internal input.click() from bubbling to the row div */}
      <span onClick={(e) => e.stopPropagation()}>
        <Checkbox
          key={`${plugin.id}-${plugin.enabled}`}
          checked={plugin.enabled}
          onCheckedChange={() => onToggle(plugin.id)}
        />
      </span>
    </div>
  );
}

function LanguageSection() {
  const preference = useLocaleStore((state) => state.preference);
  const setPreference = useLocaleStore((state) => state.setPreference);
  const systemLanguage = LANGUAGES.find((l) => l.code === resolveLanguage("system"));

  const handleChange = (value: LanguagePreference) => {
    setPreference(value);
    void saveLanguage(value).catch((error) => {
      console.error("Failed to save language:", error);
    });
  };

  return (
    <SettingsSection title={t("settings.language.title")} description={t("settings.language.desc")}>
      <select
        aria-label={t("settings.language.title")}
        value={preference}
        onChange={(e) => handleChange(e.target.value as LanguagePreference)}
        className="fluent-control w-full"
      >
        <option value="system">
          {t("settings.language.system")}
          {systemLanguage ? ` (${systemLanguage.name})` : ""}
        </option>
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.name}
          </option>
        ))}
      </select>
    </SettingsSection>
  );
}

function playAlertSound(sound: AlertSound) {
  invoke("play_alert_sound", { sound, preview: true }).catch((error) => console.error("play_alert_sound failed:", error));
}

/** Which usage levels notify, and the sound (bundled, Windows', or the user's own file). */
function AlertOptions() {
  const settings = useAppPreferencesStore((state) => state.alertSettings);
  const setSettings = useAppPreferencesStore((state) => state.setAlertSettings);
  const [fileError, setFileError] = useState<"tooLarge" | "unreadable" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (next: AlertSettings) => {
    setSettings(next);
    void saveAlertSettings(next).catch((error) => console.error("Failed to save alert settings:", error));
  };
  const toggleLevel = (level: number) =>
    update({
      ...settings,
      levels: settings.levels.includes(level)
        ? settings.levels.filter((value) => value !== level)
        : [...settings.levels, level].sort((a, b) => a - b),
    });
  const chooseSound = (sound: AlertSound) => {
    update({ ...settings, sound });
    playAlertSound(sound);
  };
  const applySoundFile = async (file: File) => {
    setFileError(null);
    try {
      const wav = await audioFileToWav(file);
      await invoke("save_custom_alert_sound", { wav: bytesToBase64(wav) });
      update({ ...settings, sound: "custom", customSoundName: file.name });
      playAlertSound("custom");
    } catch (error) {
      console.error("Failed to use the sound file:", error);
      setFileError(error instanceof SoundFileTooLargeError ? "tooLarge" : "unreadable");
    }
  };

  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="mb-1 text-xs text-muted-foreground">{t("settings.alerts.levels")}</div>
        {/* Like SegmentedControl, but any number of levels can be on. */}
        <div className="flex gap-0.5 rounded-md border bg-secondary p-0.5" role="group" aria-label={t("settings.alerts.levels")}>
          {USAGE_ALERT_LEVELS.map((level) => {
            const on = settings.levels.includes(level);
            return (
              <button
                key={level}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLevel(level)}
                className={cn(
                  "h-7 min-w-0 flex-1 rounded-[3px] text-[13px] tabular-nums whitespace-nowrap transition-colors",
                  on
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-foreground hover:bg-accent active:bg-accent/60"
                )}
              >
                {level}%
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="alert-sound">
          {t("settings.alerts.sound")}
        </label>
        <div className="flex gap-1.5">
          <select
            id="alert-sound"
            value={settings.sound}
            onChange={(e) => chooseSound(e.target.value as AlertSound)}
            className="fluent-control min-w-0 flex-1"
          >
            {ALERT_SOUNDS.filter((sound) => sound !== "custom" || settings.customSoundName).map((sound) => (
              <option key={sound} value={sound}>
                {sound === "custom" ? t("sound.custom", { name: settings.customSoundName ?? "" }) : t(`sound.${sound}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => playAlertSound(settings.sound)}
            disabled={settings.sound === "none"}
            title={t("settings.alerts.play")}
            aria-label={t("settings.alerts.play")}
            className="fluent-control inline-flex w-9 shrink-0 items-center justify-center px-0 disabled:opacity-40"
          >
            <Play className="size-3.5" />
          </button>
        </div>
        <button
          type="button"
          className="mt-1.5 text-xs text-primary underline-offset-2 hover:underline"
          onClick={() => fileInput.current?.click()}
        >
          {t("settings.alerts.chooseFile")}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void applySoundFile(file);
          }}
        />
        <p className={cn("mt-0.5 text-xs", fileError ? "text-destructive" : "text-muted-foreground")}>
          {fileError === "tooLarge"
            ? t("settings.alerts.fileTooLarge", { mb: CUSTOM_SOUND_MAX_MB })
            : fileError
              ? t("settings.alerts.fileError")
              : t("settings.alerts.fileHint", { seconds: CUSTOM_SOUND_MAX_SECONDS })}
        </p>
      </div>
    </div>
  );
}

function PanelSection() {
  const remember = useAppPreferencesStore((state) => state.rememberPanelPosition);
  const setRemember = useAppPreferencesStore((state) => state.setRememberPanelPosition);
  const toggle = async (next: boolean) => {
    setRemember(next);
    try {
      // Turning it on keeps where the panel is right now.
      const position = next && isTauri() ? await getCurrentWindow().outerPosition() : null;
      await saveRememberPanelPosition(next, position);
    } catch (error) {
      console.error("Failed to save the remember-position setting:", error);
    }
  };
  return (
    <SettingsSection title={t("settings.panel.title")} description={t("settings.panel.desc")}>
      <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
        <Checkbox
          key={`remember-position-${remember}`}
          checked={remember}
          className="mt-0.5"
          onCheckedChange={(checked) => void toggle(checked === true)}
        />
        <span>
          {t("settings.panel.remember")}
          <span className="block text-xs text-muted-foreground">{t("settings.panel.rememberHint")}</span>
        </span>
      </label>
    </SettingsSection>
  );
}

function NotificationsSection() {
  const usageAlerts = useAppPreferencesStore((state) => state.usageAlerts);
  const setUsageAlerts = useAppPreferencesStore((state) => state.setUsageAlerts);
  return (
    <SettingsSection title={t("settings.alerts.title")} description={t("settings.alerts.desc")}>
      <label className="flex items-center gap-2 text-[13px] select-none text-foreground">
        <Checkbox
          key={`usage-alerts-${usageAlerts}`}
          checked={usageAlerts}
          onCheckedChange={(checked) => {
            const next = checked === true;
            setUsageAlerts(next);
            void saveUsageAlerts(next).catch((error) => {
              console.error("Failed to save usage alerts setting:", error);
            });
          }}
        />
        {t("settings.alerts.label")}
      </label>
      {usageAlerts && <AlertOptions />}
    </SettingsSection>
  );
}

interface SettingsPageProps {
  plugins: PluginConfig[];
  onReorder: (orderedIds: string[]) => void;
  onToggle: (id: string) => void;
  onAccountsChanged: (change: AccountsChange) => void;
  autoUpdateInterval: AutoUpdateInterval;
  onAutoUpdateIntervalChange: (value: AutoUpdateInterval) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (value: ThemeMode) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (value: DisplayMode) => void;
  resetTimerDisplayMode: ResetTimerDisplayMode;
  onResetTimerDisplayModeChange: (value: ResetTimerDisplayMode) => void;
  timeFormatMode: TimeFormatMode;
  onTimeFormatModeChange: (value: TimeFormatMode) => void;
  menubarIconStyle: MenubarIconStyle;
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void;
  trayProvider: string;
  onTrayProviderChange: (value: string) => void;
  trayMetric: string;
  onTrayMetricChange: (value: string) => void;
  trayPercentColor: string;
  onTrayPercentColorChange: (value: string) => void;
  traySettingsPreview: TraySettingsPreview;
  globalShortcut: GlobalShortcut;
  onGlobalShortcutChange: (value: GlobalShortcut) => void;
  startOnLogin: boolean;
  onStartOnLoginChange: (value: boolean) => void;
}

/** Choice with a second, smaller line (an example of what it looks like). */
function OptionWithExample({ label, example, isActive }: { label: string; example: string; isActive: boolean }) {
  return (
    <span className="flex flex-col items-center leading-tight">
      <span>{label}</span>
      <span className={cn("text-[11px] font-normal", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
        {example}
      </span>
    </span>
  );
}

export function SettingsPage({
  plugins,
  onReorder,
  onToggle,
  onAccountsChanged,
  autoUpdateInterval,
  onAutoUpdateIntervalChange,
  themeMode,
  onThemeModeChange,
  displayMode,
  onDisplayModeChange,
  resetTimerDisplayMode,
  onResetTimerDisplayModeChange,
  timeFormatMode,
  onTimeFormatModeChange,
  menubarIconStyle,
  onMenubarIconStyleChange,
  trayProvider,
  onTrayProviderChange,
  trayMetric,
  onTrayMetricChange,
  trayPercentColor,
  onTrayPercentColorChange,
  traySettingsPreview,
  globalShortcut,
  onGlobalShortcutChange,
  startOnLogin,
  onStartOnLoginChange,
}: SettingsPageProps) {
  const taskbarStrip = useAppPreferencesStore((state) => state.taskbarStrip);
  const setTaskbarStrip = useAppPreferencesStore((state) => state.setTaskbarStrip);
  // The taskbar strip and the tray styles that show numbers exclude each other.
  const handleMenubarIconStyleChange = (style: MenubarIconStyle) => {
    if (style !== "icon" && taskbarStrip) {
      setTaskbarStrip(false);
      void saveTaskbarStrip(false).catch((error) => console.error("Failed to save taskbar strip:", error));
    }
    onMenubarIconStyleChange(style);
  };
  const trayHiddenPlugins = useAppPreferencesStore((state) => state.trayHiddenPlugins);
  const setTrayHiddenPlugins = useAppPreferencesStore((state) => state.setTrayHiddenPlugins);
  const handleToggleTray = (id: string) => {
    const next = trayHiddenPlugins.includes(id)
      ? trayHiddenPlugins.filter((hiddenId) => hiddenId !== id)
      : [...trayHiddenPlugins, id];
    setTrayHiddenPlugins(next);
    void saveTrayHiddenPlugins(next).catch((error) => {
      console.error("Failed to save tray-hidden providers:", error);
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Enabled providers first (stable sort keeps the user's order inside each group); dragging works
  // on this list, so a reorder saves the grouped order.
  const sortedPlugins = [...plugins].sort((a, b) => Number(b.enabled) - Number(a.enabled));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sortedPlugins.findIndex((item) => item.id === active.id);
      const newIndex = sortedPlugins.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      onReorder(arrayMove(sortedPlugins, oldIndex, newIndex).map((item) => item.id));
    }
  };

  return (
    <div className="py-2 space-y-1">
      <SettingsSection title={t("settings.autoRefresh.title")} description={t("settings.autoRefresh.desc")}>
        <SegmentedControl
          ariaLabel={t("settings.autoRefresh.title")}
          options={AUTO_UPDATE_OPTIONS}
          value={autoUpdateInterval}
          onChange={onAutoUpdateIntervalChange}
        />
        {autoUpdateInterval === "smart" && (
          <p className="mt-2 text-xs text-muted-foreground">{t("settings.autoRefresh.smartHint")}</p>
        )}
      </SettingsSection>

      <SettingsSection title={t("settings.usageMode.title")} description={t("settings.usageMode.desc")}>
        <SegmentedControl
          ariaLabel={t("settings.usageMode.title")}
          options={DISPLAY_MODE_OPTIONS}
          value={displayMode}
          onChange={onDisplayModeChange}
        />
      </SettingsSection>

      <SettingsSection title={t("settings.resetTimers.title")} description={t("settings.resetTimers.desc")}>
        <SegmentedControl
          ariaLabel={t("settings.resetTimers.title")}
          options={RESET_TIMER_DISPLAY_OPTIONS}
          value={resetTimerDisplayMode}
          onChange={onResetTimerDisplayModeChange}
          itemClassName="h-auto py-1"
          renderOption={(option, isActive) => (
            <OptionWithExample
              label={t(option.labelKey)}
              isActive={isActive}
              example={
                option.value === "relative"
                  ? t("duration.hm", { h: 5, m: 12 })
                  : t("settings.resetTimers.todayAt", { time: getTimeFormatter(timeFormatMode).format(EXAMPLE_TIME) })
              }
            />
          )}
        />
      </SettingsSection>

      <SettingsSection title={t("settings.timeFormat.title")} description={t("settings.timeFormat.desc")}>
        <SegmentedControl
          ariaLabel={t("settings.timeFormat.title")}
          options={TIME_FORMAT_OPTIONS}
          value={timeFormatMode}
          onChange={onTimeFormatModeChange}
          itemClassName="h-auto py-1"
          renderOption={(option, isActive) => (
            <OptionWithExample
              label={t(option.labelKey)}
              isActive={isActive}
              example={getTimeFormatter(option.value).format(EXAMPLE_TIME)}
            />
          )}
        />
      </SettingsSection>

      <SettingsSection title={t("settings.tray.title")} description={t("settings.tray.desc")}>
        <SegmentedControl
          ariaLabel={t("settings.tray.title")}
          options={MENUBAR_ICON_STYLE_OPTIONS}
          value={menubarIconStyle}
          onChange={handleMenubarIconStyleChange}
          itemClassName="h-9 flex items-center justify-center"
          renderOption={(option) => (
            <TrayIconStylePreview style={option.value} traySettingsPreview={traySettingsPreview} />
          )}
        />
        {menubarIconStyle !== "icon" && (
          <div className="flex gap-2 mt-2">
            {!isPerProviderTrayStyle(menubarIconStyle) && (
            <label className="flex-1 text-xs text-muted-foreground">
              <span className="mb-1 block">{t("settings.tray.provider")}</span>
              <select
                aria-label={t("settings.tray.provider")}
                value={trayProvider}
                onChange={(e) => onTrayProviderChange(e.target.value)}
                className="fluent-control w-full"
              >
                <option value="auto">{t("settings.tray.auto")}</option>
                <option value="tightest">{t("settings.tray.tightest")}</option>
                {plugins.filter((p) => p.enabled).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            )}
            <label className="flex-1 text-xs text-muted-foreground">
              <span className="mb-1 block">{t("settings.tray.metric")}</span>
              <select
                aria-label={t("settings.tray.metric")}
                value={trayMetric}
                onChange={(e) => onTrayMetricChange(e.target.value)}
                className="fluent-control w-full"
              >
                <option value="auto">{t("settings.tray.auto")}</option>
                <option value="Session">{t("label.Session")}</option>
                <option value="Weekly">{t("label.Weekly")}</option>
              </select>
            </label>
            {menubarIconStyle === "percent" && (
              <label className="w-14 text-xs text-muted-foreground">
                <span className="mb-1 block">{t("settings.tray.color")}</span>
                <input
                  type="color"
                  value={trayPercentColor}
                  onChange={(e) => onTrayPercentColorChange(e.target.value)}
                  className="fluent-control w-full cursor-pointer px-1"
                  title={t("settings.tray.colorTitle")}
                />
              </label>
            )}
          </div>
        )}
        {menubarIconStyle === "logos" && <TrayLogoColorsToggle />}
        {isPerProviderTrayStyle(menubarIconStyle) && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("settings.tray.perProviderHint")}{" "}
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => invoke("open_taskbar_settings").catch((e) => console.error("open_taskbar_settings failed:", e))}
            >
              {t("settings.tray.openTaskbarSettings")}
            </button>
          </p>
        )}
      </SettingsSection>

      <TaskbarStripSection onMenubarIconStyleChange={onMenubarIconStyleChange} />

      <SettingsSection title={t("settings.theme.title")} description={t("settings.theme.desc")}>
        <SegmentedControl
          ariaLabel={t("settings.theme.title")}
          options={THEME_OPTIONS}
          value={themeMode}
          onChange={onThemeModeChange}
        />
      </SettingsSection>

      <SettingsSection title={t("settings.plugins.title")} description={t("settings.plugins.desc")}>
        <div className="-mx-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortedPlugins.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {sortedPlugins.map((plugin) => (
                <SortablePluginItem
                  key={plugin.id}
                  plugin={plugin}
                  onToggle={onToggle}
                  inTray={!trayHiddenPlugins.includes(plugin.id)}
                  onToggleTray={handleToggleTray}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </SettingsSection>

      <AccountsSection onAccountsChanged={onAccountsChanged} />

      <LanguageSection />

      <GlobalShortcutSection globalShortcut={globalShortcut} onGlobalShortcutChange={onGlobalShortcutChange} />

      <PanelSection />

      <NotificationsSection />

      <SettingsSection title={t("settings.startOnLogin.title")} description={t("settings.startOnLogin.desc")}>
        <label className="flex items-center gap-2 text-[13px] select-none text-foreground">
          <Checkbox
            key={`start-on-login-${startOnLogin}`}
            checked={startOnLogin}
            onCheckedChange={(checked) => onStartOnLoginChange(checked === true)}
          />
          {t("settings.startOnLogin.label")}
        </label>
      </SettingsSection>
    </div>
  );
}
