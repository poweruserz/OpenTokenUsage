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
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AppWindow,
  Bell,
  Blocks,
  Eye,
  EyeOff,
  Gauge,
  GripVertical,
  LogIn,
  Palette,
  PanelBottom,
  Play,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { loginFix } from "@/components/plugin-error";
import { GlobalShortcutSection } from "@/components/global-shortcut-section";
import { PrivacySection } from "@/components/privacy-section";
import { GlassToggle } from "@/components/glass-toggle";
import { ProxySection } from "@/components/proxy-section";
import { TaskbarStripSection } from "@/components/taskbar-strip-section";
import { SegmentedControl, SettingsSection } from "@/components/settings-section";
import { audioFileToWav, CUSTOM_SOUND_MAX_MB, CUSTOM_SOUND_MAX_SECONDS, SoundFileTooLargeError } from "@/lib/alert-sound";
import { getBarFillLayout, getTrayIconSizePx } from "@/lib/tray-bars-icon";
import { bytesToBase64 } from "@/lib/tray-provider-icons";
import { TRAY_PACE_COLOR } from "@/lib/tray-primary-progress";
import { CURRENCIES, normalizeCurrency, type CurrencySetting } from "@/lib/currency";
import { parseAmount } from "@/lib/project-budgets";
import {
  ALERT_SOUNDS,
  REFILL_POINTS,
  refillAlertPoints,
  saveCardFeatures,
  savePlanPrices,
  SPEND_TOOLS,
  type CardFeatures,
  type PlanPrices,
  AUTO_UPDATE_OPTIONS,
  DEFAULT_TRAY_PERCENT_COLOR,
  DISPLAY_MODE_OPTIONS,
  isPerProviderTrayStyle,
  MENUBAR_ICON_STYLE_OPTIONS,
  RESET_TIMER_DISPLAY_OPTIONS,
  saveAlertSettings,
  saveCurrency,
  saveLanguage,
  savePaceWorkdays,
  saveRememberPanelPosition,
  saveNavRight,
  loadWhatsNew,
  saveWhatsNew,
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
  type SettingOption,
  type ThemeMode,
  type TimeFormatMode,
} from "@/lib/settings";
import { getTimeFormatter } from "@/lib/reset-tooltip";
import { LANGUAGES, resolveLanguage, t, useLocaleStore, type LanguagePreference } from "@/lib/i18n";
import { SettingsBackupSection } from "@/components/settings-backup-section";
import type { TraySettingsPreview } from "@/hooks/app/use-tray-icon";
import { cn } from "@/lib/utils";
import type { AccountsChange } from "@/lib/accounts";
import { AccountsSection } from "@/components/accounts-section";
import { ClaudeCodeSection } from "@/components/claude-code-section";
import { CustomBalancesSection } from "@/components/custom-balances-section";
import { useAppPreferencesStore } from "@/stores/app-preferences-store";
import { hasNewFeature, NewFeaturesContext, useNewFeatures } from "@/lib/new-features";

interface PluginConfig {
  id: string;
  name: string;
  enabled: boolean;
  signInError?: string | null;
}

const TRAY_PREVIEW_SIZE_PX = getTrayIconSizePx(1) / 2;

const PREVIEW_BAR_TRACK_PX = 20;

// Sample time for the time-format and absolute-reset examples.
const EXAMPLE_TIME = new Date(2026, 1, 2, 11, 4);

/** Settings in groups, like Windows Settings: one list on the left, the chosen group's cards on the right. */
const SETTINGS_CATEGORIES = [
  { id: "usage", labelKey: "settings.category.usage", Icon: Gauge },
  { id: "providers", labelKey: "settings.plugins.title", Icon: Blocks },
  { id: "notifications", labelKey: "settings.alerts.title", Icon: Bell },
  { id: "taskbar", labelKey: "settings.category.taskbar", Icon: PanelBottom },
  { id: "appearance", labelKey: "settings.category.appearance", Icon: Palette },
  { id: "app", labelKey: "settings.category.app", Icon: AppWindow },
] as const satisfies readonly { id: string; labelKey: string; Icon: LucideIcon }[];

const FIRST_CATEGORY = SETTINGS_CATEGORIES[0].id;

/** A WinUI NavigationView item, as in the side nav: accent pill and fill on the chosen one. */
const CATEGORY_TAB = cn(
  "relative flex min-h-9 w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] leading-4 outline-none transition-colors",
  "text-muted-foreground hover:bg-accent active:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring",
  "data-active:bg-accent data-active:text-foreground data-active:before:absolute data-active:before:left-0 data-active:before:top-1/2",
  "data-active:before:h-4 data-active:before:w-[3px] data-active:before:-translate-y-1/2 data-active:before:rounded-full data-active:before:bg-primary"
);

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

function PaceWorkdaysToggle() {
  const workdays = useAppPreferencesStore((state) => state.paceWorkdays);
  const setWorkdays = useAppPreferencesStore((state) => state.setPaceWorkdays);
  return (
    <label className="mt-2 flex items-start gap-2 text-[13px] select-none text-foreground">
      <Checkbox
        key={`pace-workdays-${workdays}`}
        checked={workdays}
        className="mt-0.5"
        onCheckedChange={(checked) => {
          const next = checked === true;
          setWorkdays(next);
          void savePaceWorkdays(next).catch((error) => console.error("Failed to save the work-day pace setting:", error));
        }}
      />
      <span>
        {t("settings.usageMode.workdays")}
        <span className="block text-xs text-muted-foreground">{t("settings.usageMode.workdaysHint")}</span>
      </span>
    </label>
  );
}

/** Costs in another currency, at a rate the user enters (no exchange-rate service is asked). */
function CurrencySection() {
  const currency = useAppPreferencesStore((state) => state.currency);
  const setCurrency = useAppPreferencesStore((state) => state.setCurrency);
  const update = (next: CurrencySetting) => {
    setCurrency(next);
    void saveCurrency(next).catch((error) => console.error("Failed to save the currency:", error));
  };
  return (
    <SettingsSection title={t("settings.currency.title")} description={t("settings.currency.desc")}>
      <div className="flex gap-2">
        <select
          aria-label={t("settings.currency.title")}
          value={currency.code}
          onChange={(e) => update(normalizeCurrency({ code: e.target.value, rate: currency.rate }))}
          className="fluent-control flex-1"
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        {currency.code !== "USD" && (
          <label className="flex flex-1 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">{t("settings.currency.rate", { code: currency.code })}</span>
            <input
              key={currency.code}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              defaultValue={currency.rate}
              onChange={(e) => {
                const rate = Number(e.target.value);
                if (Number.isFinite(rate) && rate > 0) update({ ...currency, rate });
              }}
              // An empty or zero rate isn't applied: show the rate the cards still use.
              onBlur={(e) => {
                if (Number(e.target.value) !== currency.rate) e.target.value = String(currency.rate);
              }}
              className="fluent-control min-w-0 flex-1"
            />
          </label>
        )}
      </div>
      {currency.code !== "USD" && <p className="mt-1.5 text-xs text-muted-foreground">{t("settings.currency.hint")}</p>}
    </SettingsSection>
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
  const signIn = plugin.enabled && plugin.signInError ? loginFix(plugin.signInError, plugin.id) : null;

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

      {signIn && (
        <>
          <span className="text-xs text-muted-foreground">{t("settings.plugins.signedOut")}</span>
          <Button
            variant="outline"
            size="xs"
            className="text-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              signIn();
            }}
          >
            <LogIn className="size-3" />
            {t("settings.accounts.signIn")}
          </Button>
        </>
      )}

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

function toggleLevel(levels: number[], level: number) {
  return levels.includes(level) ? levels.filter((value) => value !== level) : [...levels, level].sort((a, b) => a - b);
}

/** Like SegmentedControl, but any number of levels can be on. */
function LevelButtons({ levels, onToggle, label }: { levels: number[]; onToggle: (level: number) => void; label: string }) {
  return (
    <div className="flex gap-0.5 rounded-md border bg-secondary p-0.5" role="group" aria-label={label}>
      {USAGE_ALERT_LEVELS.map((level) => {
        const on = levels.includes(level);
        return (
          <button
            key={level}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(level)}
            className={cn(
              "h-7 min-w-0 flex-1 rounded-[3px] text-[13px] tabular-nums whitespace-nowrap transition-colors",
              on ? "bg-primary text-primary-foreground font-medium" : "text-foreground hover:bg-accent active:bg-accent/60"
            )}
          >
            {level}%
          </button>
        );
      })}
    </div>
  );
}

/** One provider's own levels in place of everyone's. */
function ProviderAlertLevels({
  plugins,
  settings,
  update,
}: {
  plugins: PluginConfig[];
  settings: AlertSettings;
  update: (next: AlertSettings) => void;
}) {
  const enabled = plugins.filter((plugin) => plugin.enabled);
  const [selected, setSelected] = useState<string | null>(null);
  if (enabled.length === 0) return null;
  const id = enabled.some((plugin) => plugin.id === selected) ? selected! : enabled[0].id;
  const own = settings.providerLevels?.[id];
  const name = enabled.find((plugin) => plugin.id === id)!.name;
  const setOwn = (levels: number[] | undefined) => {
    const providerLevels = { ...settings.providerLevels };
    if (levels) providerLevels[id] = levels;
    else delete providerLevels[id];
    update({ ...settings, providerLevels });
  };
  const describe = (levels: number[]) => (levels.length ? levels.map((level) => `${level}%`).join(", ") : t("settings.alerts.none"));

  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground" htmlFor="alert-provider">
        {t("settings.alerts.perProvider")}
      </label>
      <select id="alert-provider" value={id} onChange={(e) => setSelected(e.target.value)} className="fluent-control w-full">
        {enabled.map((plugin) => {
          const levels = settings.providerLevels?.[plugin.id];
          return (
            <option key={plugin.id} value={plugin.id}>
              {levels ? `${plugin.name} · ${describe(levels)}` : plugin.name}
            </option>
          );
        })}
      </select>
      <label className="mt-1.5 flex items-center gap-2 text-[13px] select-none text-foreground">
        <Checkbox
          key={`alert-same-${id}-${!own}`}
          checked={!own}
          onCheckedChange={(checked) => setOwn(checked === true ? undefined : [...settings.levels])}
        />
        {t("settings.alerts.sameAsAll")}
      </label>
      {own && (
        <div className="mt-1.5">
          <LevelButtons levels={own} onToggle={(level) => setOwn(toggleLevel(own, level))} label={name} />
        </div>
      )}
    </div>
  );
}

/** Which usage levels notify, and the sound (bundled, Windows', or the user's own file). */
function AlertOptions({ plugins }: { plugins: PluginConfig[] }) {
  const settings = useAppPreferencesStore((state) => state.alertSettings);
  const setSettings = useAppPreferencesStore((state) => state.setAlertSettings);
  const [fileError, setFileError] = useState<"tooLarge" | "unreadable" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (next: AlertSettings) => {
    setSettings(next);
    void saveAlertSettings(next).catch((error) => console.error("Failed to save alert settings:", error));
  };
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
        <LevelButtons
          levels={settings.levels}
          onToggle={(level) => update({ ...settings, levels: toggleLevel(settings.levels, level) })}
          label={t("settings.alerts.levels")}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("settings.alerts.ticksHint")}</p>
      </div>

      <ProviderAlertLevels plugins={plugins} settings={settings} update={update} />

      <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
        <Checkbox
          className="mt-0.5"
          checked={settings.spikes !== false}
          onCheckedChange={(checked) => update({ ...settings, spikes: checked === true })}
        />
        {t("settings.alerts.spikes")}
      </label>

      <div>
        <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
          <Checkbox
            className="mt-0.5"
            checked={settings.refills !== false}
            onCheckedChange={(checked) => update({ ...settings, refills: checked === true })}
          />
          {t("settings.alerts.refills")}
        </label>
        {settings.refills !== false && (
          <label className="ml-6 mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            {t("settings.alerts.refillPoints")}
            <select
              value={refillAlertPoints(settings) ?? REFILL_POINTS[1]}
              onChange={(e) => update({ ...settings, refillPoints: Number(e.target.value) })}
              className="fluent-control w-28"
            >
              {REFILL_POINTS.map((points) => (
                <option key={points} value={points}>
                  {t("settings.alerts.points", { points })}
                </option>
              ))}
            </select>
          </label>
        )}
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

const NAV_SIDE_OPTIONS: SettingOption<"left" | "right">[] = [
  { value: "left", labelKey: "settings.panel.navLeft" },
  { value: "right", labelKey: "settings.panel.navRight" },
];

function PanelSection() {
  const remember = useAppPreferencesStore((state) => state.rememberPanelPosition);
  const setRemember = useAppPreferencesStore((state) => state.setRememberPanelPosition);
  const navRight = useAppPreferencesStore((state) => state.navRight);
  const setNavRight = useAppPreferencesStore((state) => state.setNavRight);
  const setNavSide = (side: "left" | "right") => {
    setNavRight(side === "right");
    void saveNavRight(side === "right").catch((error) => console.error("Failed to save the nav side:", error));
  };
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
    <SettingsSection newFeature="panel" title={t("settings.panel.title")} description={t("settings.panel.desc")}>
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
      <div className="mt-3">
        <div className="text-xs text-muted-foreground mb-1">{t("settings.panel.navSide")}</div>
        <SegmentedControl
          options={NAV_SIDE_OPTIONS}
          value={navRight ? "right" : "left"}
          onChange={setNavSide}
          ariaLabel={t("settings.panel.navSide")}
        />
      </div>
    </SettingsSection>
  );
}

/** Live sessions on the Claude/Codex cards, and the spend summary under the cards with the other tools it counts. */
function CardFeaturesSection() {
  const features = useAppPreferencesStore((state) => state.cardFeatures);
  const setFeatures = useAppPreferencesStore((state) => state.setCardFeatures);
  const update = (patch: Partial<CardFeatures>) => {
    const next = { ...features, ...patch };
    setFeatures(next);
    void saveCardFeatures(next).catch((error) => console.error("Failed to save card features:", error));
  };
  const toggleTool = (id: string, on: boolean) =>
    update({ spendToolsOff: on ? features.spendToolsOff.filter((off) => off !== id) : [...features.spendToolsOff, id] });
  return (
    <SettingsSection newFeature="cards" title={t("settings.cards.title")} description={t("settings.cards.desc")}>
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
          <Checkbox
            key={`live-sessions-${features.liveSessions}`}
            checked={features.liveSessions}
            className="mt-0.5"
            onCheckedChange={(checked) => update({ liveSessions: checked === true })}
          />
          {t("settings.cards.liveSessions")}
        </label>
        {features.liveSessions && (
          <div className="ml-6 space-y-1.5">
            <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
              <Checkbox
                key={`cache-timer-${features.cacheTimer}`}
                checked={features.cacheTimer}
                className="mt-0.5"
                onCheckedChange={(checked) => update({ cacheTimer: checked === true })}
              />
              {t("settings.cards.cacheTimer")}
            </label>
            <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
              <Checkbox
                key={`context-fill-${features.contextFill}`}
                checked={features.contextFill}
                className="mt-0.5"
                onCheckedChange={(checked) => update({ contextFill: checked === true })}
              />
              {t("settings.cards.contextFill")}
            </label>
          </div>
        )}
        <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
          <Checkbox
            key={`spend-${features.spend}`}
            checked={features.spend}
            className="mt-0.5"
            onCheckedChange={(checked) => update({ spend: checked === true })}
          />
          {t("settings.cards.spend")}
        </label>
        {features.spend && (
          <div className="ml-6">
            <div className="mb-1 text-xs text-muted-foreground">{t("settings.cards.spendTools")}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {SPEND_TOOLS.map((tool) => {
                const on = !features.spendToolsOff.includes(tool.id);
                return (
                  <label key={tool.id} className="flex items-center gap-2 text-[13px] select-none text-foreground">
                    <Checkbox key={`${tool.id}-${on}`} checked={on} onCheckedChange={(checked) => toggleTool(tool.id, checked === true)} />
                    {tool.name}
                  </label>
                );
              })}
            </div>
            <label className="mt-1.5 flex items-start gap-2 text-[13px] select-none text-foreground">
              <Checkbox
                key={`tokscale-${features.tokscale}`}
                checked={features.tokscale}
                className="mt-0.5"
                onCheckedChange={(checked) => update({ tokscale: checked === true })}
              />
              <span>
                {t("settings.cards.tokscale")}
                <span className="block text-xs text-muted-foreground">{t("settings.cards.tokscaleHint")}</span>
              </span>
            </label>
          </div>
        )}
        <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
          <Checkbox
            key={`year-${features.yearHeatmap}`}
            checked={features.yearHeatmap}
            className="mt-0.5"
            onCheckedChange={(checked) => update({ yearHeatmap: checked === true })}
          />
          {t("settings.cards.yearHeatmap")}
        </label>
        <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
          <Checkbox
            key={`keep-usage-${features.keepUsage}`}
            checked={features.keepUsage}
            className="mt-0.5"
            onCheckedChange={(checked) => update({ keepUsage: checked === true })}
          />
          <span>
            {t("settings.cards.keepUsage")}
            <span className="block text-xs text-muted-foreground">{t("settings.cards.keepUsageHint")}</span>
          </span>
        </label>
      </div>
    </SettingsSection>
  );
}

/** What's new after an update (`use-whats-new.ts`), read once at start, so its state lives here. */
function WhatsNewSection() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    loadWhatsNew().then(setOn, () => setOn(true));
  }, []);
  if (on === null) return null;
  return (
    <SettingsSection newFeature="whatsNew" title={t("settings.whatsNew.title")}>
      <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
        <Checkbox
          key={String(on)}
          checked={on}
          className="mt-0.5"
          onCheckedChange={(checked) => {
            setOn(checked === true);
            void saveWhatsNew(checked === true).catch((error) => console.error("Failed to save what's new:", error));
          }}
        />
        <span>
          {t("settings.whatsNew.label")}
          <span className="block text-xs text-muted-foreground">{t("settings.whatsNew.hint")}</span>
        </span>
      </label>
    </SettingsSection>
  );
}

/** Usage as CSV + JSON in Downloads (`usage_export.rs`): now, or quietly once a day. */
function UsageExportSection() {
  const features = useAppPreferencesStore((state) => state.cardFeatures);
  const setFeatures = useAppPreferencesStore((state) => state.setCardFeatures);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const exportNow = async () => {
    setBusy(true);
    try {
      const path = await invoke<string>("export_usage", {
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        keep: features.keepUsage,
        reveal: true,
      });
      setResult({ ok: true, text: t("settings.export.done", { path }) });
    } catch (error) {
      console.error("Failed to export usage:", error);
      setResult({ ok: false, text: t("settings.export.failed") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSection newFeature="export" title={t("settings.export.title")} description={t("settings.export.desc")}>
      <button type="button" disabled={busy} onClick={() => void exportNow()} className="fluent-control px-3 disabled:opacity-50">
        {t("settings.export.now")}
      </button>
      {result && <p className={cn("mt-1.5 break-all text-xs", result.ok ? "text-muted-foreground" : "text-destructive")}>{result.text}</p>}
      <label className="mt-2 flex items-start gap-2 text-[13px] select-none text-foreground">
        <Checkbox
          key={`auto-export-${features.autoExport}`}
          checked={features.autoExport}
          className="mt-0.5"
          onCheckedChange={(checked) => {
            const next = { ...features, autoExport: checked === true };
            setFeatures(next);
            void saveCardFeatures(next).catch((error) => console.error("Failed to save card features:", error));
          }}
        />
        {t("settings.export.daily")}
      </label>
    </SettingsSection>
  );
}

/** What each enabled card's plan costs a month, typed in the app's currency and kept in US dollars. */
function SubscriptionsSection({ plugins }: { plugins: PluginConfig[] }) {
  const prices = useAppPreferencesStore((state) => state.planPrices);
  const setPrices = useAppPreferencesStore((state) => state.setPlanPrices);
  const features = useAppPreferencesStore((state) => state.cardFeatures);
  const setFeatures = useAppPreferencesStore((state) => state.setCardFeatures);
  const currency = useAppPreferencesStore((state) => state.currency);
  const locale = useLocaleStore((state) => state.locale);
  const save = (next: PlanPrices) => {
    setPrices(next);
    void savePlanPrices(next).catch((error) => console.error("Failed to save plan prices:", error));
  };
  const commit = (id: string, text: string) => {
    const amount = parseAmount(text, locale);
    const { [id]: _old, ...rest } = prices;
    save(amount && amount > 0 ? { ...rest, [id]: amount / currency.rate } : rest);
  };
  const shown = (usd: number | undefined) =>
    usd == null ? "" : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(usd * currency.rate);
  return (
    <SettingsSection newFeature="plans" title={t("settings.plans.title")} description={t("settings.plans.desc")}>
      <label className="flex items-start gap-2 text-[13px] select-none text-foreground">
        <Checkbox
          key={`plan-multiple-${features.planMultiple}`}
          checked={features.planMultiple}
          className="mt-0.5"
          onCheckedChange={(checked) => {
            const next = { ...features, planMultiple: checked === true };
            setFeatures(next);
            void saveCardFeatures(next).catch((error) => console.error("Failed to save card features:", error));
          }}
        />
        {t("settings.plans.multiple")}
      </label>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {plugins
          .filter((plugin) => plugin.enabled)
          .map((plugin) => (
            <label key={plugin.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate text-foreground">{plugin.name}</span>
              <input
                // Keyed by the stored value, so a currency or language change shows the new number.
                key={`${plugin.id}-${prices[plugin.id] ?? ""}-${currency.code}-${currency.rate}-${locale}`}
                defaultValue={shown(prices[plugin.id])}
                inputMode="decimal"
                placeholder="—"
                aria-label={t("settings.plans.price", { name: plugin.name })}
                onBlur={(e) => commit(plugin.id, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className="fluent-control w-20 text-right tabular-nums"
              />
              <span className="w-8 shrink-0">{currency.code}</span>
            </label>
          ))}
      </div>
    </SettingsSection>
  );
}

function NotificationsSection({ plugins }: { plugins: PluginConfig[] }) {
  const usageAlerts = useAppPreferencesStore((state) => state.usageAlerts);
  const setUsageAlerts = useAppPreferencesStore((state) => state.setUsageAlerts);
  return (
    <SettingsSection newFeature="alerts" title={t("settings.alerts.title")} description={t("settings.alerts.desc")}>
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
      {usageAlerts && <AlertOptions plugins={plugins} />}
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
  const tabsRef = useRef<HTMLDivElement>(null);
  const newFeatures = useNewFeatures(FIRST_CATEGORY);

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
    // The wider settings view (SETTINGS_PANEL_WIDTH): the groups on the left, the chosen one's cards in a column.
    <NewFeaturesContext.Provider value={newFeatures.shown}>
    <Tabs
      ref={tabsRef}
      orientation="vertical"
      defaultValue={FIRST_CATEGORY}
      // A long group may have been scrolled: start the next one at its top.
      onValueChange={(value) => {
        tabsRef.current?.scrollIntoView?.({ block: "start" });
        newFeatures.opened(String(value));
      }}
      className="items-start py-2"
    >
      <TabsPrimitive.List aria-label={t("settings.categories")} className="sticky top-2 flex w-44 shrink-0 flex-col gap-0.5">
        {SETTINGS_CATEGORIES.map(({ id, labelKey, Icon }) => (
          <TabsPrimitive.Tab key={id} value={id} className={CATEGORY_TAB}>
            <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            {t(labelKey)}
            {hasNewFeature(newFeatures.shown, id) && (
              <span
                className="ml-auto size-1.5 shrink-0 rounded-full bg-primary animate-pulse motion-reduce:animate-none"
                aria-hidden
              />
            )}
          </TabsPrimitive.Tab>
        ))}
      </TabsPrimitive.List>

      <TabsContent value="usage" className="min-w-0 space-y-1">
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
          <PaceWorkdaysToggle />
        </SettingsSection>

        <CurrencySection />

        <CardFeaturesSection />

        <SubscriptionsSection plugins={plugins} />

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
      </TabsContent>

      <TabsContent value="taskbar" className="min-w-0 space-y-1">
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
              {menubarIconStyle === "percent" && trayPercentColor !== TRAY_PACE_COLOR && (
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
          {menubarIconStyle === "percent" && (
            <label className="mt-2 flex items-start gap-2 text-[13px] select-none text-foreground">
              <Checkbox
                key={`tray-pace-color-${trayPercentColor === TRAY_PACE_COLOR}`}
                checked={trayPercentColor === TRAY_PACE_COLOR}
                className="mt-0.5"
                onCheckedChange={(checked) =>
                  onTrayPercentColorChange(checked === true ? TRAY_PACE_COLOR : DEFAULT_TRAY_PERCENT_COLOR)
                }
              />
              <span>
                {t("settings.tray.paceColor")}
                <span className="block text-xs text-muted-foreground">{t("settings.tray.paceColorHint")}</span>
              </span>
            </label>
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
      </TabsContent>

      <TabsContent value="appearance" className="min-w-0 space-y-1">
        <SettingsSection newFeature="theme" title={t("settings.theme.title")} description={t("settings.theme.desc")}>
          <SegmentedControl
            ariaLabel={t("settings.theme.title")}
            options={THEME_OPTIONS}
            value={themeMode}
            onChange={onThemeModeChange}
          />
          <GlassToggle />
        </SettingsSection>

        <PanelSection />
      </TabsContent>

      <TabsContent value="providers" className="min-w-0 space-y-1">
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

        <CustomBalancesSection />

        <ClaudeCodeSection />
      </TabsContent>

      <TabsContent value="notifications" className="min-w-0 space-y-1">
        <NotificationsSection plugins={plugins} />
      </TabsContent>

      <TabsContent value="app" className="min-w-0 space-y-1">
        <LanguageSection />

        <GlobalShortcutSection globalShortcut={globalShortcut} onGlobalShortcutChange={onGlobalShortcutChange} />

        <ProxySection />

        <PrivacySection />

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

        <WhatsNewSection />

        <UsageExportSection />

        <SettingsBackupSection />
      </TabsContent>
    </Tabs>
    </NewFeaturesContext.Provider>
  );
}

