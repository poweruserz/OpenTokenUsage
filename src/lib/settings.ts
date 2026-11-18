import { LazyStore } from "@tauri-apps/plugin-store";
import type { PluginMeta } from "@/lib/plugin-types";
import { isLanguagePreference, type LanguagePreference } from "@/lib/i18n";
import type { MessageKey } from "@/locales/en";
import { normalizeCurrency, type CurrencySetting } from "@/lib/currency";
import { normalizeLineLayouts, type LineLayouts } from "@/lib/line-layout";

// Refresh cooldown duration in milliseconds (5 minutes)
export const REFRESH_COOLDOWN_MS = 300_000;

// Spec: persist plugin order + disabled list; new plugins append, disabled (a new install turns on
// what `use-provider-detection.ts` finds).
export type PluginSettings = {
  order: string[];
  disabled: string[];
};

export type AutoUpdateInterval = 5 | 15 | 30 | 60 | "smart";

/** "dark" is pure black (the former OLED theme); "halloween" is that black with pumpkin orange. */
export type ThemeMode = "dark" | "light" | "halloween";

export type DisplayMode = "used" | "left";

export type ResetTimerDisplayMode = "relative" | "absolute";

export type TimeFormatMode = "auto" | "12h" | "24h";

/** "numbers"/"logos": one tray icon per provider (`use-provider-tray-icons.ts`). */
export type MenubarIconStyle = "icon" | "percent" | "bars" | "numbers" | "logos";

export type TrayProvider = "auto" | string;
export type TrayMetric = "auto" | string;

export type TrayPercentColor = string;

export type GlobalShortcut = string | null;

const SETTINGS_STORE_PATH = "settings.json";
const PLUGIN_SETTINGS_KEY = "plugins";
const AUTO_UPDATE_SETTINGS_KEY = "autoUpdateInterval";
const THEME_MODE_KEY = "themeMode";
const DISPLAY_MODE_KEY = "displayMode";
const RESET_TIMER_DISPLAY_MODE_KEY = "resetTimerDisplayMode";
const TIME_FORMAT_MODE_KEY = "timeFormatMode";
const MENUBAR_ICON_STYLE_KEY = "menubarIconStyle";
const LEGACY_MENUBAR_METRIC_KEY = "menubarMetric";
const LEGACY_TRAY_ICON_STYLE_KEY = "trayIconStyle";
const LEGACY_TRAY_SHOW_PERCENTAGE_KEY = "trayShowPercentage";
const TRAY_PROVIDER_KEY = "trayProvider";
const TRAY_METRIC_KEY = "trayMetric";
const TRAY_PERCENT_COLOR_KEY = "trayPercentColor";
const TRAY_HIDDEN_PLUGINS_KEY = "trayHiddenPlugins";
const USAGE_ALERTS_KEY = "usageAlerts";
const ALERT_SETTINGS_KEY = "alertSettings";
const CURRENCY_KEY = "currency";
const PROJECT_BUDGETS_KEY = "projectBudgets";
const COLLAPSED_SECTIONS_KEY = "collapsedSections";
const PANEL_PINNED_KEY = "panelPinned";
const PANEL_WIDTH_KEY = "panelWidth";
// Read by src-tauri/src/tray.rs, which also writes the position while the user drags the panel.
const REMEMBER_PANEL_POSITION_KEY = "rememberPanelPosition";
const PANEL_POSITION_KEY = "panelPosition";
const TRAY_LOGO_COLORS_KEY = "trayLogoColors";
const PACE_WORKDAYS_KEY = "paceWorkdays";
const CLAUDE_DESKTOP_LOGIN_KEY = "claudeDesktopLogin";
const SEEN_NEW_FEATURES_KEY = "seenNewFeatures";
const TASKBAR_STRIP_KEY = "taskbarStrip";
const TASKBAR_STRIP_STYLE_KEY = "taskbarStripStyle";
const DESKTOP_WIDGETS_KEY = "desktopWidgets";
const NAV_RIGHT_KEY = "navRight";
const SENT_USAGE_ALERTS_KEY = "sentUsageAlerts";
const SENT_PROJECT_ALERTS_KEY = "sentProjectAlerts";
/** Enough for every provider x line x level for a few windows; oldest keys drop off first. */
const MAX_SENT_USAGE_ALERTS = 300;
const GLOBAL_SHORTCUT_KEY = "globalShortcut";
const START_ON_LOGIN_KEY = "startOnLogin";
const LANGUAGE_KEY = "language";
const UPDATE_RELAUNCH_KEY = "updateRelaunchVersion";
export const PROVIDER_DETECTION_KEY = "providerDetectionPending";
const UPDATE_NOTIFIED_KEY = "updateNotifiedVersion";
const STAR_PROMPT_KEY = "starPrompt";

export const DEFAULT_AUTO_UPDATE_INTERVAL: AutoUpdateInterval = 15;
export const DEFAULT_THEME_MODE: ThemeMode = "dark";
export const DEFAULT_DISPLAY_MODE: DisplayMode = "left";
export const DEFAULT_RESET_TIMER_DISPLAY_MODE: ResetTimerDisplayMode = "relative";
export const DEFAULT_TIME_FORMAT_MODE: TimeFormatMode = "auto";
export const DEFAULT_MENUBAR_ICON_STYLE: MenubarIconStyle = "icon";
export const DEFAULT_TRAY_PROVIDER: TrayProvider = "auto";
export const DEFAULT_TRAY_METRIC: TrayMetric = "auto";
export const DEFAULT_TRAY_PERCENT_COLOR: TrayPercentColor = "#ffffff";
export const DEFAULT_GLOBAL_SHORTCUT: GlobalShortcut = null;
export const DEFAULT_START_ON_LOGIN = true;

const AUTO_UPDATE_INTERVALS: AutoUpdateInterval[] = [5, 15, 30, 60, "smart"];
const THEME_MODES: ThemeMode[] = ["dark", "light", "halloween"];
const DISPLAY_MODES: DisplayMode[] = ["used", "left"];
const RESET_TIMER_DISPLAY_MODES: ResetTimerDisplayMode[] = ["relative", "absolute"];
const TIME_FORMAT_MODES: TimeFormatMode[] = ["auto", "12h", "24h"];
const MENUBAR_ICON_STYLES: MenubarIconStyle[] = ["icon", "percent", "bars", "numbers", "logos"];

/** A settings choice; the UI renders `t(labelKey, labelVars)` and shows `hintKey` on hover. */
export type SettingOption<T> = {
  value: T;
  labelKey: MessageKey;
  labelVars?: Record<string, number>;
  hintKey?: MessageKey;
};

export const MENUBAR_ICON_STYLE_OPTIONS: SettingOption<MenubarIconStyle>[] = [
  { value: "icon", labelKey: "settings.tray.icon" },
  { value: "percent", labelKey: "settings.tray.percent" },
  { value: "bars", labelKey: "settings.tray.bars" },
  { value: "numbers", labelKey: "settings.tray.numbers" },
  { value: "logos", labelKey: "settings.tray.logos" },
];

export function isPerProviderTrayStyle(style: MenubarIconStyle): boolean {
  return style === "numbers" || style === "logos";
}

export const AUTO_UPDATE_OPTIONS: SettingOption<AutoUpdateInterval>[] =
  AUTO_UPDATE_INTERVALS.map((value) =>
    value === "smart"
      ? { value, labelKey: "settings.autoRefresh.smart" }
      : value === 60
        ? { value, labelKey: "settings.autoRefresh.hour" }
        : { value, labelKey: "settings.autoRefresh.minutes", labelVars: { n: value } }
  );

export const THEME_OPTIONS: SettingOption<ThemeMode>[] = THEME_MODES.map((value) => ({
  value,
  labelKey: `settings.theme.${value}` as const,
  hintKey: value === "dark" ? "settings.theme.darkHint" : undefined,
}));

export const DISPLAY_MODE_OPTIONS: SettingOption<DisplayMode>[] = [
  { value: "left", labelKey: "settings.usageMode.left" },
  { value: "used", labelKey: "settings.usageMode.used" },
];

export const RESET_TIMER_DISPLAY_OPTIONS: SettingOption<ResetTimerDisplayMode>[] = [
  { value: "relative", labelKey: "settings.resetTimers.relative" },
  { value: "absolute", labelKey: "settings.resetTimers.absolute" },
];

export const TIME_FORMAT_OPTIONS: SettingOption<TimeFormatMode>[] = [
  { value: "auto", labelKey: "settings.timeFormat.auto" },
  { value: "12h", labelKey: "settings.timeFormat.12h" },
  { value: "24h", labelKey: "settings.timeFormat.24h" },
];

const store = new LazyStore(SETTINGS_STORE_PATH);

const PREFERRED_ORDER = ["claude", "codex", "gemini"];

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  order: [],
  disabled: [],
};

export async function loadPluginSettings(): Promise<PluginSettings> {
  const stored = await store.get<PluginSettings>(PLUGIN_SETTINGS_KEY);
  if (!stored) return { ...DEFAULT_PLUGIN_SETTINGS };
  return {
    order: Array.isArray(stored.order) ? stored.order : [],
    disabled: Array.isArray(stored.disabled) ? stored.disabled : [],
  };
}

export async function savePluginSettings(settings: PluginSettings): Promise<void> {
  await store.set(PLUGIN_SETTINGS_KEY, settings);
  await store.save();
}

// TODO(remove after 2026-09-01): One-time Windsurf -> Devin settings migration.
export function migrateWindsurfToDevin(settings: PluginSettings): PluginSettings {
  const hasDevin = settings.order.includes("devin");
  const hasWindsurf = settings.order.includes("windsurf");
  const windsurfWasDisabled = settings.disabled.includes("windsurf");
  const order = Array.from(
    new Set(settings.order.map((id) => (id === "windsurf" ? "devin" : id)))
  );
  let disabled = settings.disabled.filter((id) => id !== "windsurf");

  if (hasWindsurf && !windsurfWasDisabled) {
    disabled = disabled.filter((id) => id !== "devin");
  }

  if (!hasDevin && windsurfWasDisabled && !disabled.includes("devin")) {
    disabled.push("devin");
  }

  return {
    order,
    disabled: Array.from(new Set(disabled)),
  };
}

function isAutoUpdateInterval(value: unknown): value is AutoUpdateInterval {
  return (
    (typeof value === "number" || value === "smart") &&
    AUTO_UPDATE_INTERVALS.includes(value as AutoUpdateInterval)
  );
}

export async function loadAutoUpdateInterval(): Promise<AutoUpdateInterval> {
  const stored = await store.get<unknown>(AUTO_UPDATE_SETTINGS_KEY);
  if (isAutoUpdateInterval(stored)) return stored;
  return DEFAULT_AUTO_UPDATE_INTERVAL;
}

export async function saveAutoUpdateInterval(
  interval: AutoUpdateInterval
): Promise<void> {
  await store.set(AUTO_UPDATE_SETTINGS_KEY, interval);
  await store.save();
}

export function normalizePluginSettings(
  settings: PluginSettings,
  plugins: PluginMeta[]
): PluginSettings {
  const knownIds = plugins.map((plugin) => plugin.id);
  const knownSet = new Set(knownIds);
  const hasSavedOrder = settings.order.length > 0;

  const order: string[] = [];
  const seen = new Set<string>();

  // If no saved order yet, seed with preferred IDs and append the rest below.
  const sourceOrder = hasSavedOrder
    ? settings.order
    : PREFERRED_ORDER.filter((id) => knownSet.has(id));

  for (const id of sourceOrder) {
    if (!knownSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  const newlyAdded: string[] = [];
  const tailIds = hasSavedOrder
    ? knownIds
    : knownIds
        .filter((id) => !PREFERRED_ORDER.includes(id))
        .sort((a, b) => a.localeCompare(b));

  for (const id of tailIds) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
      newlyAdded.push(id);
    }
  }

  const disabled = settings.disabled.filter((id) => knownSet.has(id));
  for (const id of hasSavedOrder ? newlyAdded : order) {
    if (!disabled.includes(id)) disabled.push(id);
  }
  return { order, disabled };
}

export function arePluginSettingsEqual(
  a: PluginSettings,
  b: PluginSettings
): boolean {
  if (a.order.length !== b.order.length) return false;
  if (a.disabled.length !== b.disabled.length) return false;
  for (let i = 0; i < a.order.length; i += 1) {
    if (a.order[i] !== b.order[i]) return false;
  }
  for (let i = 0; i < a.disabled.length; i += 1) {
    if (a.disabled[i] !== b.disabled[i]) return false;
  }
  return true;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && THEME_MODES.includes(value as ThemeMode);
}

export async function loadThemeMode(): Promise<ThemeMode> {
  const stored = await store.get<unknown>(THEME_MODE_KEY);
  if (isThemeMode(stored)) return stored;
  // Older builds also had "system" and "oled"; everything but light is dark now.
  return DEFAULT_THEME_MODE;
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  await store.set(THEME_MODE_KEY, mode);
  await store.save();
}

function isDisplayMode(value: unknown): value is DisplayMode {
  return typeof value === "string" && DISPLAY_MODES.includes(value as DisplayMode);
}

export async function loadDisplayMode(): Promise<DisplayMode> {
  const stored = await store.get<unknown>(DISPLAY_MODE_KEY);
  if (isDisplayMode(stored)) return stored;
  return DEFAULT_DISPLAY_MODE;
}

export async function saveDisplayMode(mode: DisplayMode): Promise<void> {
  await store.set(DISPLAY_MODE_KEY, mode);
  await store.save();
}

function isResetTimerDisplayMode(value: unknown): value is ResetTimerDisplayMode {
  return (
    typeof value === "string" &&
    RESET_TIMER_DISPLAY_MODES.includes(value as ResetTimerDisplayMode)
  );
}

export async function loadResetTimerDisplayMode(): Promise<ResetTimerDisplayMode> {
  const stored = await store.get<unknown>(RESET_TIMER_DISPLAY_MODE_KEY);
  if (isResetTimerDisplayMode(stored)) return stored;
  return DEFAULT_RESET_TIMER_DISPLAY_MODE;
}

export async function saveResetTimerDisplayMode(mode: ResetTimerDisplayMode): Promise<void> {
  await store.set(RESET_TIMER_DISPLAY_MODE_KEY, mode);
  await store.save();
}

function isTimeFormatMode(value: unknown): value is TimeFormatMode {
  return (
    typeof value === "string" &&
    TIME_FORMAT_MODES.includes(value as TimeFormatMode)
  );
}

export async function loadTimeFormatMode(): Promise<TimeFormatMode> {
  const stored = await store.get<unknown>(TIME_FORMAT_MODE_KEY);
  if (isTimeFormatMode(stored)) return stored;
  return DEFAULT_TIME_FORMAT_MODE;
}

export async function saveTimeFormatMode(mode: TimeFormatMode): Promise<void> {
  await store.set(TIME_FORMAT_MODE_KEY, mode);
  await store.save();
}

function isMenubarIconStyle(value: unknown): value is MenubarIconStyle {
  return (
    typeof value === "string" &&
    MENUBAR_ICON_STYLES.includes(value as MenubarIconStyle)
  );
}

export async function loadMenubarIconStyle(): Promise<MenubarIconStyle> {
  const stored = await store.get<unknown>(MENUBAR_ICON_STYLE_KEY);
  // Migrate legacy values
  if (stored === "provider") return "icon";
  if (stored === "donut") return "percent";
  if (isMenubarIconStyle(stored)) return stored;
  return DEFAULT_MENUBAR_ICON_STYLE;
}

export async function saveMenubarIconStyle(style: MenubarIconStyle): Promise<void> {
  await store.set(MENUBAR_ICON_STYLE_KEY, style);
  await store.save();
}

export async function loadTrayProvider(): Promise<TrayProvider> {
  const stored = await store.get<unknown>(TRAY_PROVIDER_KEY);
  return typeof stored === "string" && stored.length > 0 ? stored : DEFAULT_TRAY_PROVIDER;
}

export async function saveTrayProvider(value: TrayProvider): Promise<void> {
  await store.set(TRAY_PROVIDER_KEY, value);
  await store.save();
}

export async function loadTrayMetric(): Promise<TrayMetric> {
  const stored = await store.get<unknown>(TRAY_METRIC_KEY);
  return typeof stored === "string" && stored.length > 0 ? stored : DEFAULT_TRAY_METRIC;
}

export async function saveTrayMetric(value: TrayMetric): Promise<void> {
  await store.set(TRAY_METRIC_KEY, value);
  await store.save();
}

export async function loadUsageAlerts(): Promise<boolean> {
  const stored = await store.get<unknown>(USAGE_ALERTS_KEY);
  return typeof stored === "boolean" ? stored : true;
}

export async function saveUsageAlerts(value: boolean): Promise<void> {
  await store.set(USAGE_ALERTS_KEY, value);
  await store.save();
}

/** Usage levels (percent) a notification can be sent at. */
export const USAGE_ALERT_LEVELS = [50, 60, 70, 80, 90, 95, 100] as const;

/**
 * Notification sounds: Windows' own, the bundled ones (`src-tauri/sounds`, ids must match
 * `alert_sound.rs`), none, or the user's file.
 */
export const ALERT_SOUNDS = [
  "windows",
  "chime",
  "glass",
  "steel",
  "pizzicato",
  "retro",
  "two-tone",
  "three-tone",
  "rise",
  "none",
  "custom",
] as const;
export type AlertSound = (typeof ALERT_SOUNDS)[number];

export type AlertSettings = {
  /** Usage levels (percent) that send a notification, ascending. */
  levels: number[];
  /** A provider's own levels by plugin id, in place of `levels` (empty: no level alerts for it). */
  providerLevels?: Record<string, number[]>;
  sound: AlertSound;
  /** Name of the user's file; the converted sound lives in the app data folder. */
  customSoundName: string | null;
  /** Whether a Claude or Codex session using tokens far faster than usual (often a loop) notifies. On unless false. */
  spikes?: boolean;
  /** Whether a limit that refills before its reset (by `refillPoints` or more) notifies. On unless false. */
  refills?: boolean;
  refillPoints?: number;
};

/** How many points of a limit an early refill gives back before it notifies. */
export const REFILL_POINTS = [5, 10, 20, 30] as const;
const DEFAULT_REFILL_POINTS = 10;

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  levels: [80, 95],
  sound: "windows",
  customSoundName: null,
  spikes: true,
  refills: true,
  refillPoints: DEFAULT_REFILL_POINTS,
};

/** The points an early refill must give back to notify, or null when those alerts are off. */
export function refillAlertPoints(settings: AlertSettings): number | null {
  return settings.refills === false ? null : (settings.refillPoints ?? DEFAULT_REFILL_POINTS);
}

function knownLevels(value: unknown[]): number[] {
  return USAGE_ALERT_LEVELS.filter((level) => value.includes(level));
}

/** Stored alert settings with every unknown or broken field replaced by its default. */
export function normalizeAlertSettings(value: unknown): AlertSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const levels = Array.isArray(raw.levels) ? knownLevels(raw.levels) : DEFAULT_ALERT_SETTINGS.levels;
  const customSoundName =
    typeof raw.customSoundName === "string" && raw.customSoundName.length > 0 ? raw.customSoundName : null;
  const known = (ALERT_SOUNDS as readonly unknown[]).includes(raw.sound);
  const sound = known && (raw.sound !== "custom" || customSoundName) ? (raw.sound as AlertSound) : DEFAULT_ALERT_SETTINGS.sound;
  const providerLevels: Record<string, number[]> = {};
  if (raw.providerLevels && typeof raw.providerLevels === "object") {
    for (const [id, own] of Object.entries(raw.providerLevels)) {
      if (/^[a-z0-9-]+$/.test(id) && Array.isArray(own)) providerLevels[id] = knownLevels(own);
    }
  }
  const refillPoints = (REFILL_POINTS as readonly unknown[]).includes(raw.refillPoints)
    ? (raw.refillPoints as number)
    : DEFAULT_REFILL_POINTS;
  return {
    levels,
    providerLevels,
    sound,
    customSoundName,
    spikes: raw.spikes !== false,
    refills: raw.refills !== false,
    refillPoints,
  };
}

/** The usage levels that notify for one provider: its own, or everyone's. */
export function alertLevelsFor(settings: AlertSettings, pluginId: string): number[] {
  return settings.providerLevels?.[pluginId] ?? settings.levels;
}

export async function loadAlertSettings(): Promise<AlertSettings> {
  return normalizeAlertSettings(await store.get<unknown>(ALERT_SETTINGS_KEY));
}

export async function saveAlertSettings(value: AlertSettings): Promise<void> {
  await store.set(ALERT_SETTINGS_KEY, value);
  await store.save();
}

export async function loadCurrency(): Promise<CurrencySetting> {
  return normalizeCurrency(await store.get<unknown>(CURRENCY_KEY));
}

export async function saveCurrency(value: CurrencySetting): Promise<void> {
  await store.set(CURRENCY_KEY, value);
  await store.save();
}

/** Monthly US-dollar budgets per card (plugin id) and project folder, from the projects list. */
export type ProjectBudgets = Record<string, Record<string, number>>;

export function normalizeProjectBudgets(value: unknown): ProjectBudgets {
  const budgets: ProjectBudgets = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return budgets;
  for (const [pluginId, projects] of Object.entries(value)) {
    if (!projects || typeof projects !== "object" || Array.isArray(projects)) continue;
    const kept = Object.entries(projects).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0
    );
    if (kept.length > 0) budgets[pluginId] = Object.fromEntries(kept);
  }
  return budgets;
}

export async function loadProjectBudgets(): Promise<ProjectBudgets> {
  return normalizeProjectBudgets(await store.get<unknown>(PROJECT_BUDGETS_KEY));
}

export async function saveProjectBudgets(value: ProjectBudgets): Promise<void> {
  await store.set(PROJECT_BUDGETS_KEY, value);
  await store.save();
}

/** The parts of a provider's detail page (and the overview's spend) that a click on their title closes, for every provider. */
export const DETAIL_SECTIONS = ["resets", "cost", "models", "sessions", "week", "heatmap", "year", "projects", "spend"] as const;
export type DetailSection = (typeof DETAIL_SECTIONS)[number];
/** Closed until opened: the two longest parts, and the hour grid and the year read the logs only once open. */
export const DEFAULT_COLLAPSED_SECTIONS: DetailSection[] = ["models", "heatmap", "year"];

export function normalizeCollapsedSections(value: unknown): DetailSection[] {
  if (!Array.isArray(value)) return DEFAULT_COLLAPSED_SECTIONS;
  return DETAIL_SECTIONS.filter((section) => value.includes(section));
}

/** The sections that existed when the list was last saved; a list saved before it knew "year". */
const SEEN_SECTIONS_KEY = "detailSectionsSeen";

/** The saved list, with a section added since it was saved closed when it starts closed by default. */
export async function loadCollapsedSections(): Promise<DetailSection[]> {
  const saved = await store.get<unknown>(COLLAPSED_SECTIONS_KEY);
  const collapsed = normalizeCollapsedSections(saved);
  if (!Array.isArray(saved)) return collapsed;
  const seenValue = await store.get<unknown>(SEEN_SECTIONS_KEY);
  const seen: unknown[] = Array.isArray(seenValue) ? seenValue : DETAIL_SECTIONS.filter((section) => section !== "year");
  const added = DEFAULT_COLLAPSED_SECTIONS.filter((section) => !seen.includes(section));
  return DETAIL_SECTIONS.filter((section) => collapsed.includes(section) || added.includes(section));
}

export async function saveCollapsedSections(value: DetailSection[]): Promise<void> {
  await store.set(COLLAPSED_SECTIONS_KEY, value);
  await store.set(SEEN_SECTIONS_KEY, DETAIL_SECTIONS);
  await store.save();
}

async function loadBoolean(key: string, fallback: boolean): Promise<boolean> {
  const stored = await store.get<unknown>(key);
  return typeof stored === "boolean" ? stored : fallback;
}

async function saveBoolean(key: string, value: boolean): Promise<void> {
  await store.set(key, value);
  await store.save();
}

/** The provider nav on the panel's right side instead of its left. */
export const loadNavRight = () => loadBoolean(NAV_RIGHT_KEY, false);
export const saveNavRight = (value: boolean) => saveBoolean(NAV_RIGHT_KEY, value);
/** What's new (`use-whats-new.ts`): shown once after an update unless turned off; the version it was last handled for. */
const WHATS_NEW_KEY = "whatsNewAfterUpdate";
const WHATS_NEW_SEEN_KEY = "whatsNewVersion";
export const loadWhatsNew = () => loadBoolean(WHATS_NEW_KEY, true);
export const saveWhatsNew = (value: boolean) => saveBoolean(WHATS_NEW_KEY, value);
export async function loadWhatsNewSeen(): Promise<string | null> {
  const stored = await store.get<unknown>(WHATS_NEW_SEEN_KEY);
  return typeof stored === "string" ? stored : null;
}
export async function saveWhatsNewSeen(version: string): Promise<void> {
  await store.set(WHATS_NEW_SEEN_KEY, version);
  await store.save();
}
/** Each card's row order and hidden rows (`line-layout.ts`). */
const LINE_LAYOUTS_KEY = "lineLayouts";
export async function loadLineLayouts(): Promise<LineLayouts> {
  return normalizeLineLayouts(await store.get<unknown>(LINE_LAYOUTS_KEY));
}
export async function saveLineLayouts(value: LineLayouts): Promise<void> {
  await store.set(LINE_LAYOUTS_KEY, value);
  await store.save();
}
/** Other tools whose own records the spend summary can add (`local_spend.rs` ids). */
export const SPEND_TOOLS = [
  { id: "opencode-go", name: "OpenCode" },
  { id: "zai", name: "Z.ai" },
  { id: "grok", name: "Grok" },
  { id: "cline", name: "Cline" },
] as const;

/** Extra parts of the overview and cards: live sessions, the spend summary and the tools it counts. */
export type CardFeatures = {
  liveSessions: boolean;
  /** On a live Claude session: when its prompt cache runs out. */
  cacheTimer: boolean;
  /** On a live session: how full its context window is. */
  contextFill: boolean;
  spend: boolean;
  /** `SPEND_TOOLS` ids the spend summary leaves out (their logs are not read). */
  spendToolsOff: string[];
  /** Also some 30 more tools through tokscale (`tokscale.rs`, run with bunx/npx); off unless chosen. */
  tokscale: boolean;
  /** In the spend summary: a card's 30 days at API prices as a multiple of its plan's price. */
  planMultiple: boolean;
  /** On a Claude/Codex detail page: a year of daily use with streaks. */
  yearHeatmap: boolean;
  /** Keep every day's tokens seen (`usage-archive.json`), so days whose logs were deleted still count. */
  keepUsage: boolean;
  /** Write the usage export (`usage_export.rs`) to Downloads once a day. */
  autoExport: boolean;
};
export const DEFAULT_CARD_FEATURES: CardFeatures = {
  liveSessions: true,
  cacheTimer: true,
  contextFill: true,
  spend: true,
  spendToolsOff: [],
  tokscale: false,
  planMultiple: true,
  yearHeatmap: true,
  keepUsage: true,
  autoExport: false,
};
export function normalizeCardFeatures(value: unknown): CardFeatures {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof CardFeatures, unknown>>;
  const known: readonly string[] = SPEND_TOOLS.map((tool) => tool.id);
  return {
    liveSessions: raw.liveSessions !== false,
    cacheTimer: raw.cacheTimer !== false,
    contextFill: raw.contextFill !== false,
    spend: raw.spend !== false,
    spendToolsOff: Array.isArray(raw.spendToolsOff)
      ? raw.spendToolsOff.filter((id): id is string => typeof id === "string" && known.includes(id))
      : [],
    tokscale: raw.tokscale === true,
    planMultiple: raw.planMultiple !== false,
    yearHeatmap: raw.yearHeatmap !== false,
    keepUsage: raw.keepUsage !== false,
    autoExport: raw.autoExport === true,
  };
}
/** What each card's plan costs a month, in US dollars (Settings → Subscriptions), by card id. */
export type PlanPrices = Record<string, number>;
export function normalizePlanPrices(value: unknown): PlanPrices {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, number] =>
        /^[a-z0-9-]+$/.test(entry[0]) && typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0 && entry[1] <= 100_000
    )
  );
}
const PLAN_PRICES_KEY = "planPrices";
export async function loadPlanPrices(): Promise<PlanPrices> {
  return normalizePlanPrices(await store.get<unknown>(PLAN_PRICES_KEY));
}
export async function savePlanPrices(value: PlanPrices): Promise<void> {
  await store.set(PLAN_PRICES_KEY, value);
  await store.save();
}

const CARD_FEATURES_KEY = "cardFeatures";
export async function loadCardFeatures(): Promise<CardFeatures> {
  return normalizeCardFeatures(await store.get<unknown>(CARD_FEATURES_KEY));
}
export async function saveCardFeatures(value: CardFeatures): Promise<void> {
  await store.set(CARD_FEATURES_KEY, value);
  await store.save();
}

/** Glass (`window_style::set_window_glass`): Acrylic behind see-through layers, in place of Mica. */
const GLASS_KEY = "glass";
export const loadGlass = () => loadBoolean(GLASS_KEY, false);
export const saveGlass = (value: boolean) => saveBoolean(GLASS_KEY, value);

/** "Hide from screen sharing" (`capture_privacy.rs`). */
const CAPTURE_PRIVACY_KEY = "capturePrivacy";
export const loadCapturePrivacy = () => loadBoolean(CAPTURE_PRIVACY_KEY, false);
export const saveCapturePrivacy = (value: boolean) => saveBoolean(CAPTURE_PRIVACY_KEY, value);

/** Title bar pin: keep the panel above other windows. */
export const loadPanelPinned = () => loadBoolean(PANEL_PINNED_KEY, false);
export const savePanelPinned = (value: boolean) => saveBoolean(PANEL_PINNED_KEY, value);

/** The panel's width in logical px: dragging its left or right edge makes it up to 40% wider. */
export const PANEL_MIN_WIDTH = 400;
export const PANEL_MAX_WIDTH = 560;
/** The settings view's width: its sections sit in two columns. `resize_panel` (lib.rs) allows up to this. */
export const SETTINGS_PANEL_WIDTH = 760;

export function normalizePanelWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return PANEL_MIN_WIDTH;
  return Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, value)));
}

export async function loadPanelWidth(): Promise<number> {
  return normalizePanelWidth(await store.get<unknown>(PANEL_WIDTH_KEY));
}

export async function savePanelWidth(value: number): Promise<void> {
  await store.set(PANEL_WIDTH_KEY, normalizePanelWidth(value));
  await store.save();
}

/**
 * Open the panel where the user last dragged it instead of above the taskbar (`tray.rs`, which reads the stored
 * key). Decided once when unset: on for a new install, off for one from 0.9.1 and older (plugin settings saved),
 * so it must run before the bootstrap's first plugin-settings save.
 */
export async function loadRememberPanelPosition(): Promise<boolean> {
  const stored = await store.get<unknown>(REMEMBER_PANEL_POSITION_KEY);
  if (typeof stored === "boolean") return stored;
  const value = (await store.get<unknown>(PLUGIN_SETTINGS_KEY)) == null;
  await store.set(REMEMBER_PANEL_POSITION_KEY, value);
  await store.save();
  return value;
}

/** Turning it on keeps the panel's current spot (outer top-left, physical px); off forgets it. */
export async function saveRememberPanelPosition(value: boolean, position: { x: number; y: number } | null): Promise<void> {
  await store.set(REMEMBER_PANEL_POSITION_KEY, value);
  if (value && position) await store.set(PANEL_POSITION_KEY, { x: position.x, y: position.y });
  else await store.delete(PANEL_POSITION_KEY);
  await store.save();
}

/** The version an in-app update is installing; the app that starts as that version opens its panel. */
export async function loadUpdateRelaunchVersion(): Promise<string | null> {
  const stored = await store.get<unknown>(UPDATE_RELAUNCH_KEY);
  return typeof stored === "string" ? stored : null;
}

export async function saveUpdateRelaunchVersion(version: string | null): Promise<void> {
  if (version === null) await store.delete(UPDATE_RELAUNCH_KEY);
  else await store.set(UPDATE_RELAUNCH_KEY, version);
  await store.save();
}

/** Set while a new install's provider detection runs, so a start cut short detects again. */
export async function loadProviderDetectionPending(): Promise<boolean> {
  return (await store.get<unknown>(PROVIDER_DETECTION_KEY)) === true;
}

export async function saveProviderDetectionPending(pending: boolean): Promise<void> {
  if (pending) await store.set(PROVIDER_DETECTION_KEY, true);
  else await store.delete(PROVIDER_DETECTION_KEY);
  await store.save();
}

/** The last version whose "update ready" notification was shown: each version notifies once. */
export async function loadUpdateNotifiedVersion(): Promise<string | null> {
  const stored = await store.get<unknown>(UPDATE_NOTIFIED_KEY);
  return typeof stored === "string" ? stored : null;
}

export async function saveUpdateNotifiedVersion(version: string): Promise<void> {
  await store.set(UPDATE_NOTIFIED_KEY, version);
  await store.save();
}

/** How long a new install waits for the one-time "star on GitHub" card. */
export const STAR_PROMPT_DELAY_MS = 3 * 60 * 60 * 1000;

export type StarPrompt = { showAfter: number; shown: boolean };

function readStarPrompt(value: unknown): StarPrompt | null {
  if (!value || typeof value !== "object") return null;
  const { showAfter, shown } = value as Record<string, unknown>;
  return typeof showAfter === "number" && Number.isFinite(showAfter) && typeof shown === "boolean"
    ? { showAfter, shown }
    : null;
}

let starPromptInit: Promise<StarPrompt> | null = null;

/**
 * The star card's state, created on the first start without one. The first start of any version
 * saves the plugin settings, so an install that has them is an existing user (card on the next panel
 * open) and one without is new (card after 3 hours). Settings bootstrap awaits this before that save,
 * and every caller shares the one promise, so an update never looks like a new install.
 */
export function initStarPrompt(now = Date.now()): Promise<StarPrompt> {
  starPromptInit ??= (async () => {
    const stored = readStarPrompt(await store.get<unknown>(STAR_PROMPT_KEY));
    if (stored) return stored;
    const existing = (await store.get<unknown>(PLUGIN_SETTINGS_KEY)) != null;
    const prompt = { showAfter: existing ? now : now + STAR_PROMPT_DELAY_MS, shown: false };
    await store.set(STAR_PROMPT_KEY, prompt);
    await store.save();
    return prompt;
  })().catch((error) => {
    starPromptInit = null;
    throw error;
  });
  return starPromptInit;
}

export async function markStarPromptShown(): Promise<void> {
  const shown = { ...(await initStarPrompt()), shown: true };
  starPromptInit = Promise.resolve(shown);
  await store.set(STAR_PROMPT_KEY, shown);
  await store.save();
}

/** Provider logos in their brand color (tray "logos" style and the taskbar strip). */
export const loadTrayLogoColors = () => loadBoolean(TRAY_LOGO_COLORS_KEY, true);
/** Weekly pace counts Monday to Friday only (`pace-status.ts`). */
/** Ids of new-feature badges whose settings group was opened (`new-features.ts`); this PC's, not backed up. */
export async function loadSeenNewFeatures(): Promise<string[]> {
  const stored = await store.get<unknown>(SEEN_NEW_FEATURES_KEY);
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
}

export async function saveSeenNewFeatures(ids: string[]): Promise<void> {
  await store.set(SEEN_NEW_FEATURES_KEY, ids);
  await store.save();
}

/** The Claude card reads the Claude app's sign-in when Claude Code has none (`claude_desktop.rs`). */
export const loadClaudeDesktopLogin = () => loadBoolean(CLAUDE_DESKTOP_LOGIN_KEY, true);
export const saveClaudeDesktopLogin = (value: boolean) => saveBoolean(CLAUDE_DESKTOP_LOGIN_KEY, value);
export const loadPaceWorkdays = () => loadBoolean(PACE_WORKDAYS_KEY, false);
export const savePaceWorkdays = (value: boolean) => saveBoolean(PACE_WORKDAYS_KEY, value);
export const saveTrayLogoColors = (value: boolean) => saveBoolean(TRAY_LOGO_COLORS_KEY, value);

/** Experimental: usage text embedded in the taskbar next to the tray (`taskbar_strip.rs`). */
/**
 * On unless the user turned it off, or picked a tray style that shows numbers (the two exclude each other):
 * a new install, and an older one that never touched it, gets the strip.
 */
export async function loadTaskbarStrip(): Promise<boolean> {
  const stored = await store.get<unknown>(TASKBAR_STRIP_KEY);
  if (typeof stored === "boolean") return stored;
  return (await loadMenubarIconStyle()) === "icon";
}
export const saveTaskbarStrip = (value: boolean) => saveBoolean(TASKBAR_STRIP_KEY, value);

export const MAX_TASKBAR_STRIP_PROVIDERS = 6;

/** Fonts that ship with Windows 11 and have clear digits. */
export const TASKBAR_STRIP_FONTS = [
  { id: "segoe-variable", label: "Segoe UI Variable", css: `"Segoe UI Variable Text", "Segoe UI", sans-serif` },
  { id: "segoe", label: "Segoe UI", css: `"Segoe UI", sans-serif` },
  { id: "bahnschrift", label: "Bahnschrift", css: `Bahnschrift, "Segoe UI", sans-serif` },
  { id: "cascadia", label: "Cascadia Mono", css: `"Cascadia Mono", Consolas, monospace` },
  { id: "consolas", label: "Consolas", css: `Consolas, monospace` },
  { id: "calibri", label: "Calibri", css: `Calibri, "Segoe UI", sans-serif` },
  { id: "verdana", label: "Verdana", css: `Verdana, sans-serif` },
  { id: "arial", label: "Arial", css: `Arial, sans-serif` },
] as const;

export type TaskbarStripFont = (typeof TASKBAR_STRIP_FONTS)[number]["id"];

/** Which values a provider shows in the strip. */
export type TaskbarStripLineMode = "both" | "session" | "weekly";
const STRIP_LINE_MODES: TaskbarStripLineMode[] = ["both", "session", "weekly"];

/**
 * How numbers are colored by the share of the limit used: a preset scale from 1 to 100 %, the
 * user's own two thresholds, or not at all. "base" in a scale = the strip's text color.
 */
export const TASKBAR_STRIP_COLOR_SCALES = {
  heat: [[0, "base"], [45, "#FACC15"], [75, "#FB923C"], [92, "#EF4444"]],
  traffic: [[0, "#22C55E"], [55, "#FACC15"], [90, "#EF4444"]],
  cool: [[0, "base"], [45, "#38BDF8"], [75, "#A78BFA"], [92, "#F43F5E"]],
  mono: [[0, "base"], [90, "base"], [100, "#EF4444"]],
} as const satisfies Record<string, readonly (readonly [number, string])[]>;

/** "pace": the line's pace in its window, in the card's pace colors (`PACE_COLORS`). */
export type TaskbarStripColorMode = "off" | "thresholds" | "pace" | keyof typeof TASKBAR_STRIP_COLOR_SCALES;
export const TASKBAR_STRIP_COLOR_MODES: TaskbarStripColorMode[] = ["heat", "traffic", "cool", "mono", "pace", "thresholds", "off"];

/**
 * Which taskbars show the strip: the main one, every one, or picked monitors. A picked monitor keeps
 * its name so Settings can still list it while it's unplugged; the id is `taskbar_strip.rs` `monitor_id`.
 */
export type TaskbarStripMonitors = "primary" | "all" | { id: string; name: string }[];
const MAX_STRIP_MONITORS = 16;

/** Look of the taskbar strip; everything the user can restyle. */
export type TaskbarStripStyle = {
  /** Left taskbar edge or right notification-area edge; offset uses logical pixels. */
  position: "left" | "right";
  offset: number;
  /** Providers shown, in strip order (own order, independent of the nav); null = first enabled ones. */
  providers: string[] | null;
  font: TaskbarStripFont;
  fontSize: number;
  bold: boolean;
  /** Text color; null follows the taskbar (white on dark, black on light). */
  textColor: string | null;
  /** Color a number by how much of the limit is used; thresholds use warnAt/criticalAt. */
  colorMode: TaskbarStripColorMode;
  warnAt: number;
  criticalAt: number;
  warnColor: string;
  criticalColor: string;
  /** Per provider id; missing = "both" (session on top, weekly below). */
  lineModes: Record<string, TaskbarStripLineMode>;
  showPercentSign: boolean;
  monitors: TaskbarStripMonitors;
  /** The focused window's AI tool (`foreground.rs`) goes first. */
  followActive: boolean;
  /** ...in detail: both its lines, each with its name and time to reset. */
  followDetail: boolean;
  /** A dot on a logo while its agent sessions work or wait (`agent_activity`). */
  activityDots: boolean;
  /** Claude/Codex tokens per minute (`token_rates`) after their first number, and in the tray's hover text. */
  tokenRate: boolean;
  /** The strip hides while no AI tool behind its cards runs (`running_ai_tools`). */
  onlyWhileRunning: boolean;
};

export const DEFAULT_TASKBAR_STRIP_STYLE: TaskbarStripStyle = {
  position: "right",
  offset: 8,
  providers: null,
  font: "segoe-variable",
  fontSize: 12,
  bold: true,
  textColor: null,
  colorMode: "off",
  warnAt: 70,
  criticalAt: 90,
  warnColor: "#F5A524",
  criticalColor: "#F04438",
  lineModes: {},
  showPercentSign: true,
  monitors: "primary",
  followActive: false,
  followDetail: true,
  activityDots: true,
  tokenRate: false,
  onlyWhileRunning: false,
};

function normalizeStripMonitors(value: unknown): TaskbarStripMonitors {
  if (value === "primary" || value === "all") return value;
  if (!Array.isArray(value)) return "primary";
  const picked = value
    .filter(
      (monitor): monitor is { id: string; name: string } =>
        !!monitor &&
        typeof monitor === "object" &&
        typeof monitor.id === "string" &&
        monitor.id.length > 0 &&
        monitor.id.length <= 128 &&
        typeof monitor.name === "string"
    )
    .slice(0, MAX_STRIP_MONITORS)
    .map(({ id, name }) => ({ id, name: name.slice(0, 64) }));
  return picked.length > 0 ? picked : "primary";
}

/** What `set_taskbar_strip` takes: "primary", "all" or the picked monitor ids. */
export const stripMonitorsArg = (monitors: TaskbarStripMonitors) =>
  typeof monitors === "string" ? monitors : monitors.map((monitor) => monitor.id);

const isHexColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const isPercent = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 100;

/** Stored style with every unknown or broken field replaced by its default. */
export function normalizeTaskbarStripStyle(value: unknown): TaskbarStripStyle {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof TaskbarStripStyle, unknown>>;
  const d = DEFAULT_TASKBAR_STRIP_STYLE;
  const providers = Array.isArray(raw.providers)
    ? raw.providers.filter((id): id is string => typeof id === "string").slice(0, MAX_TASKBAR_STRIP_PROVIDERS)
    : null;
  return {
    providers,
    position: raw.position === "left" ? "left" : d.position,
    offset:
      typeof raw.offset === "number" && Number.isInteger(raw.offset) && raw.offset >= 0 && raw.offset <= 4096
        ? raw.offset
        : d.offset,
    font: TASKBAR_STRIP_FONTS.some((font) => font.id === raw.font) ? (raw.font as TaskbarStripFont) : d.font,
    fontSize: typeof raw.fontSize === "number" && raw.fontSize >= 10 && raw.fontSize <= 15 ? raw.fontSize : d.fontSize,
    bold: typeof raw.bold === "boolean" ? raw.bold : d.bold,
    textColor: isHexColor(raw.textColor) ? raw.textColor : null,
    colorMode: TASKBAR_STRIP_COLOR_MODES.includes(raw.colorMode as TaskbarStripColorMode)
      ? (raw.colorMode as TaskbarStripColorMode)
      : (raw as { usageColors?: unknown }).usageColors === false // before color modes existed
        ? "off"
        : // A saved style without one is from before color modes, whose default colored by usage.
          value && typeof value === "object"
          ? "heat"
          : d.colorMode,
    warnAt: isPercent(raw.warnAt) ? raw.warnAt : d.warnAt,
    criticalAt: isPercent(raw.criticalAt) ? raw.criticalAt : d.criticalAt,
    warnColor: isHexColor(raw.warnColor) ? raw.warnColor : d.warnColor,
    criticalColor: isHexColor(raw.criticalColor) ? raw.criticalColor : d.criticalColor,
    lineModes: Object.fromEntries(
      Object.entries(raw.lineModes && typeof raw.lineModes === "object" ? raw.lineModes : {}).filter(
        (entry): entry is [string, TaskbarStripLineMode] => STRIP_LINE_MODES.includes(entry[1] as TaskbarStripLineMode)
      )
    ),
    showPercentSign: typeof raw.showPercentSign === "boolean" ? raw.showPercentSign : d.showPercentSign,
    monitors: normalizeStripMonitors(raw.monitors),
    followActive: raw.followActive === true,
    followDetail: raw.followDetail !== false,
    activityDots: raw.activityDots !== false,
    tokenRate: raw.tokenRate === true,
    onlyWhileRunning: raw.onlyWhileRunning === true,
  };
}

/**
 * Usage colors were on by default up to 0.8.6: an install from before then (it has plugin settings,
 * saved on every first start, after this runs) keeps them, a new install starts with them off. Either
 * is saved the first time, so a new install's later starts don't look like an update.
 */
export async function loadTaskbarStripStyle(): Promise<TaskbarStripStyle> {
  const stored = await store.get<unknown>(TASKBAR_STRIP_STYLE_KEY);
  if (stored != null) return normalizeTaskbarStripStyle(stored);
  const existing = (await store.get<unknown>(PLUGIN_SETTINGS_KEY)) != null;
  const first = { colorMode: existing ? "heat" : "off" };
  await store.set(TASKBAR_STRIP_STYLE_KEY, first);
  await store.save();
  return normalizeTaskbarStripStyle(first);
}

export async function saveTaskbarStripStyle(value: TaskbarStripStyle): Promise<void> {
  await store.set(TASKBAR_STRIP_STYLE_KEY, value);
  await store.save();
}

export type DesktopWidgetLogo = "brand" | "white" | "black";
/**
 * All providers in one widget, side by side or stacked, one widget per provider, one widget showing each
 * in turn, or against a screen edge (`edgeSide`), sliding out under the pointer (the edge dock).
 */
export type DesktopWidgetLayout = "row" | "column" | "separate" | "cycle" | "edge";
const DESKTOP_WIDGET_LAYOUTS: DesktopWidgetLayout[] = ["row", "column", "separate", "cycle", "edge"];

/** The screen edge the edge dock sits on; on the top one its rail lies side by side. */
export const EDGE_SIDES = ["right", "left", "top"] as const;
export type EdgeSide = (typeof EDGE_SIDES)[number];

/**
 * The taskbar strip's providers and look as floating desktop widgets (`taskbar_strip/desktop.rs`):
 * one widget per provider or all joined in one. Where each one sits is `desktopWidgetPositions`,
 * which only the host writes (per PC, so not in the settings backup).
 */
export type DesktopWidgets = {
  enabled: boolean;
  layout: DesktopWidgetLayout;
  /** A thin bar under each percent, filled as far as the number says. */
  bars: boolean;
  /** The background plate's opacity, 0-100 %; logos and numbers stay opaque. */
  plateOpacity: number;
  /** White and black logos also set the plate (dark, light) and the default text color. */
  logo: DesktopWidgetLogo;
  /** The edge rail's plate fades from its color at the top to Windows blue at the bottom. */
  gradient: boolean;
  /** The edge rail slides out and back over `slideMs` (else it jumps). */
  slide: boolean;
  slideMs: number;
  /** The edge rail stays out (its pin button, or Settings) instead of tucking away. */
  edgePinned: boolean;
  edgeSide: EdgeSide;
  onTop: boolean;
  /** Line up with screen edges and other widgets while dragged. */
  snap: boolean;
  /** Can't be dragged; a click still opens the panel. */
  locked: boolean;
  /** Clicks go to the window behind; with `clickThroughKey` held they reach the widget. */
  clickThrough: boolean;
  clickThroughKey: ClickThroughKey;
};

/** The edge rail's slide duration slider, in ms. */
export const EDGE_SLIDE_MS = { min: 100, max: 600, step: 50 } as const;

export const CLICK_THROUGH_KEYS = ["ctrl", "alt", "shift"] as const;
export type ClickThroughKey = (typeof CLICK_THROUGH_KEYS)[number];

export const DEFAULT_DESKTOP_WIDGETS: DesktopWidgets = {
  enabled: false,
  layout: "row",
  bars: true,
  plateOpacity: 60,
  logo: "brand",
  gradient: false,
  slide: true,
  slideMs: 200,
  edgePinned: false,
  edgeSide: "right",
  onTop: true,
  snap: true,
  locked: false,
  clickThrough: false,
  clickThroughKey: "ctrl",
};

export function normalizeDesktopWidgets(value: unknown): DesktopWidgets {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof DesktopWidgets, unknown>>;
  const d = DEFAULT_DESKTOP_WIDGETS;
  const flag = (key: "enabled" | "bars" | "gradient" | "slide" | "edgePinned" | "onTop" | "snap" | "locked" | "clickThrough") =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : d[key];
  const opacity = raw.plateOpacity;
  const slideMs = raw.slideMs;
  return {
    enabled: flag("enabled"),
    layout: DESKTOP_WIDGET_LAYOUTS.includes(raw.layout as DesktopWidgetLayout)
      ? (raw.layout as DesktopWidgetLayout)
      : (raw as { joined?: unknown }).joined === false // before layouts existed
        ? "separate"
        : d.layout,
    bars: flag("bars"),
    plateOpacity:
      typeof opacity === "number" && Number.isFinite(opacity) ? Math.round(Math.min(100, Math.max(0, opacity))) : d.plateOpacity,
    logo: raw.logo === "white" || raw.logo === "black" ? raw.logo : d.logo,
    gradient: flag("gradient"),
    slide: flag("slide"),
    slideMs:
      typeof slideMs === "number" && Number.isFinite(slideMs)
        ? Math.round(Math.min(EDGE_SLIDE_MS.max, Math.max(EDGE_SLIDE_MS.min, slideMs)))
        : d.slideMs,
    edgePinned: flag("edgePinned"),
    edgeSide: EDGE_SIDES.includes(raw.edgeSide as EdgeSide) ? (raw.edgeSide as EdgeSide) : d.edgeSide,
    onTop: flag("onTop"),
    snap: flag("snap"),
    locked: flag("locked"),
    clickThrough: flag("clickThrough"),
    clickThroughKey: CLICK_THROUGH_KEYS.includes(raw.clickThroughKey as ClickThroughKey)
      ? (raw.clickThroughKey as ClickThroughKey)
      : d.clickThroughKey,
  };
}

export async function loadDesktopWidgets(): Promise<DesktopWidgets> {
  return normalizeDesktopWidgets(await store.get<unknown>(DESKTOP_WIDGETS_KEY));
}

export async function saveDesktopWidgets(value: DesktopWidgets): Promise<void> {
  await store.set(DESKTOP_WIDGETS_KEY, value);
  await store.save();
}

export async function loadSentUsageAlerts(): Promise<string[]> {
  const stored = await store.get<unknown>(SENT_USAGE_ALERTS_KEY);
  return Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : [];
}

export async function saveSentUsageAlerts(keys: string[]): Promise<void> {
  await store.set(SENT_USAGE_ALERTS_KEY, keys.slice(-MAX_SENT_USAGE_ALERTS));
  await store.save();
}

/** Project budget notifications already shown; kept apart from the usage ones, which have their own writer. */
export async function loadSentProjectAlerts(): Promise<string[]> {
  const stored = await store.get<unknown>(SENT_PROJECT_ALERTS_KEY);
  return Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : [];
}

export async function saveSentProjectAlerts(keys: string[]): Promise<void> {
  await store.set(SENT_PROJECT_ALERTS_KEY, keys.slice(-MAX_SENT_USAGE_ALERTS));
  await store.save();
}

/** Providers kept in the side nav but left out of the tray icon/tooltip. */
export async function loadTrayHiddenPlugins(): Promise<string[]> {
  const stored = await store.get<unknown>(TRAY_HIDDEN_PLUGINS_KEY);
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
}

export async function saveTrayHiddenPlugins(ids: string[]): Promise<void> {
  await store.set(TRAY_HIDDEN_PLUGINS_KEY, ids);
  await store.save();
}

export async function loadTrayPercentColor(): Promise<TrayPercentColor> {
  const stored = await store.get<unknown>(TRAY_PERCENT_COLOR_KEY);
  return typeof stored === "string" && stored.length > 0 ? stored : DEFAULT_TRAY_PERCENT_COLOR;
}

export async function saveTrayPercentColor(value: TrayPercentColor): Promise<void> {
  await store.set(TRAY_PERCENT_COLOR_KEY, value);
  await store.save();
}

type LegacyStoreWithDelete = {
  delete?: (key: string) => Promise<void>;
};

async function deleteStoreKey(key: string): Promise<void> {
  const maybeDelete = (store as unknown as LegacyStoreWithDelete).delete;
  if (typeof maybeDelete === "function") {
    await maybeDelete.call(store, key);
    return;
  }
  // Fallback for store implementations without delete support.
  await store.set(key, null);
}

export async function migrateLegacyTraySettings(): Promise<void> {
  const [legacyTrayStyle, legacyShowPercentage, currentMenubarStyle, legacyMenubarMetric, currentTrayMetric] =
    await Promise.all([
      store.get<unknown>(LEGACY_TRAY_ICON_STYLE_KEY),
      store.get<unknown>(LEGACY_TRAY_SHOW_PERCENTAGE_KEY),
      store.get<unknown>(MENUBAR_ICON_STYLE_KEY),
      store.get<unknown>(LEGACY_MENUBAR_METRIC_KEY),
      store.get<unknown>(TRAY_METRIC_KEY),
    ]);

  const hasLegacyTrayStyle = legacyTrayStyle != null;
  const hasLegacyShowPercentage = legacyShowPercentage != null;
  const hasLegacyMenubarMetric = legacyMenubarMetric != null;
  if (!hasLegacyTrayStyle && !hasLegacyShowPercentage && !hasLegacyMenubarMetric) return;

  // The old Default/Weekly "menubarMetric" duplicated trayMetric and only the bars style read it,
  // so a Weekly pick in the Metric dropdown was ignored there. trayMetric is now the only setting.
  if (legacyMenubarMetric === "weekly" && (currentTrayMetric == null || currentTrayMetric === "auto")) {
    await store.set(TRAY_METRIC_KEY, "Weekly");
  }

  if (hasLegacyTrayStyle && currentMenubarStyle == null) {
    if (legacyTrayStyle === "bars") {
      await store.set(MENUBAR_ICON_STYLE_KEY, "bars");
    } else if (legacyTrayStyle === "circle") {
      await store.set(MENUBAR_ICON_STYLE_KEY, "percent");
    }
  }

  const removals: Promise<void>[] = [];
  if (hasLegacyTrayStyle) removals.push(deleteStoreKey(LEGACY_TRAY_ICON_STYLE_KEY));
  if (hasLegacyShowPercentage) removals.push(deleteStoreKey(LEGACY_TRAY_SHOW_PERCENTAGE_KEY));
  if (hasLegacyMenubarMetric) removals.push(deleteStoreKey(LEGACY_MENUBAR_METRIC_KEY));
  await Promise.all(removals);
  await store.save();
}

export function getEnabledPluginIds(settings: PluginSettings): string[] {
  const disabledSet = new Set(settings.disabled);
  return settings.order.filter((id) => !disabledSet.has(id));
}

function isGlobalShortcut(value: unknown): value is GlobalShortcut {
  if (value === null) return true;
  return typeof value === "string";
}

export async function loadGlobalShortcut(): Promise<GlobalShortcut> {
  const stored = await store.get<unknown>(GLOBAL_SHORTCUT_KEY);
  if (isGlobalShortcut(stored)) return stored;
  return DEFAULT_GLOBAL_SHORTCUT;
}

export async function saveGlobalShortcut(shortcut: GlobalShortcut): Promise<void> {
  await store.set(GLOBAL_SHORTCUT_KEY, shortcut);
  await store.save();
}

export async function loadStartOnLogin(): Promise<boolean> {
  const stored = await store.get<unknown>(START_ON_LOGIN_KEY);
  if (typeof stored === "boolean") return stored;
  return DEFAULT_START_ON_LOGIN;
}

export async function saveStartOnLogin(value: boolean): Promise<void> {
  await store.set(START_ON_LOGIN_KEY, value);
  await store.save();
}

export async function loadLanguage(): Promise<LanguagePreference> {
  const stored = await store.get<unknown>(LANGUAGE_KEY);
  return isLanguagePreference(stored) ? stored : "system";
}

export async function saveLanguage(value: LanguagePreference): Promise<void> {
  await store.set(LANGUAGE_KEY, value);
  await store.save();
}

/** Raw access to stored keys, for settings backups only (`settings-backup.ts`); everything else uses its loader. */
export const backupStore = {
  get: (key: string) => store.get<unknown>(key),
  set: (key: string, value: unknown) => store.set(key, value),
  delete: (key: string) => deleteStoreKey(key),
  save: () => store.save(),
};
