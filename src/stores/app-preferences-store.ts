import { create } from "zustand"
import {
  DEFAULT_ALERT_SETTINGS,
  DEFAULT_AUTO_UPDATE_INTERVAL,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_MENUBAR_ICON_STYLE,
  DEFAULT_RESET_TIMER_DISPLAY_MODE,
  DEFAULT_START_ON_LOGIN,
  DEFAULT_DESKTOP_WIDGETS,
  DEFAULT_TASKBAR_STRIP_STYLE,
  DEFAULT_THEME_MODE,
  DEFAULT_TIME_FORMAT_MODE,
  DEFAULT_TRAY_METRIC,
  DEFAULT_TRAY_PERCENT_COLOR,
  DEFAULT_TRAY_PROVIDER,
  type AlertSettings,
  type AutoUpdateInterval,
  type DisplayMode,
  type GlobalShortcut,
  type MenubarIconStyle,
  type ResetTimerDisplayMode,
  type DesktopWidgets,
  type TaskbarStripStyle,
  type ThemeMode,
  type TimeFormatMode,
  type TrayMetric,
  type TrayPercentColor,
  type ProjectBudgets,
  type DetailSection,
  DEFAULT_COLLAPSED_SECTIONS,
  DEFAULT_CARD_FEATURES,
  type CardFeatures,
  type PlanPrices,
  type TrayProvider,
} from "@/lib/settings"
import { DEFAULT_CURRENCY, type CurrencySetting } from "@/lib/currency"
import type { LineLayouts } from "@/lib/line-layout"

type AppPreferencesStore = {
  autoUpdateInterval: AutoUpdateInterval
  themeMode: ThemeMode
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  timeFormatMode: TimeFormatMode
  globalShortcut: GlobalShortcut
  startOnLogin: boolean
  menubarIconStyle: MenubarIconStyle
  trayProvider: TrayProvider
  trayMetric: TrayMetric
  trayPercentColor: TrayPercentColor
  trayHiddenPlugins: string[]
  usageAlerts: boolean
  alertSettings: AlertSettings
  currency: CurrencySetting
  projectBudgets: ProjectBudgets
  collapsedSections: DetailSection[]
  panelPinned: boolean
  rememberPanelPosition: boolean
  trayLogoColors: boolean
  paceWorkdays: boolean
  taskbarStrip: boolean
  taskbarStripStyle: TaskbarStripStyle
  desktopWidgets: DesktopWidgets
  navRight: boolean
  capturePrivacy: boolean
  glass: boolean
  lineLayouts: LineLayouts
  cardFeatures: CardFeatures
  planPrices: PlanPrices
  setAutoUpdateInterval: (value: AutoUpdateInterval) => void
  setThemeMode: (value: ThemeMode) => void
  setDisplayMode: (value: DisplayMode) => void
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setTimeFormatMode: (value: TimeFormatMode) => void
  setGlobalShortcut: (value: GlobalShortcut) => void
  setStartOnLogin: (value: boolean) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  setTrayProvider: (value: TrayProvider) => void
  setTrayMetric: (value: TrayMetric) => void
  setTrayPercentColor: (value: TrayPercentColor) => void
  setTrayHiddenPlugins: (value: string[]) => void
  setUsageAlerts: (value: boolean) => void
  setAlertSettings: (value: AlertSettings) => void
  setCurrency: (value: CurrencySetting) => void
  setProjectBudgets: (value: ProjectBudgets) => void
  setCollapsedSections: (value: DetailSection[]) => void
  setPanelPinned: (value: boolean) => void
  setRememberPanelPosition: (value: boolean) => void
  setTrayLogoColors: (value: boolean) => void
  setPaceWorkdays: (value: boolean) => void
  setTaskbarStrip: (value: boolean) => void
  setTaskbarStripStyle: (value: TaskbarStripStyle) => void
  setDesktopWidgets: (value: DesktopWidgets) => void
  setNavRight: (value: boolean) => void
  setCapturePrivacy: (value: boolean) => void
  setGlass: (value: boolean) => void
  setLineLayouts: (value: LineLayouts) => void
  setCardFeatures: (value: CardFeatures) => void
  setPlanPrices: (value: PlanPrices) => void
  resetState: () => void
}

const initialState = {
  autoUpdateInterval: DEFAULT_AUTO_UPDATE_INTERVAL,
  themeMode: DEFAULT_THEME_MODE,
  displayMode: DEFAULT_DISPLAY_MODE,
  resetTimerDisplayMode: DEFAULT_RESET_TIMER_DISPLAY_MODE,
  timeFormatMode: DEFAULT_TIME_FORMAT_MODE,
  globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
  startOnLogin: DEFAULT_START_ON_LOGIN,
  menubarIconStyle: DEFAULT_MENUBAR_ICON_STYLE,
  trayProvider: DEFAULT_TRAY_PROVIDER,
  trayMetric: DEFAULT_TRAY_METRIC,
  trayPercentColor: DEFAULT_TRAY_PERCENT_COLOR,
  trayHiddenPlugins: [] as string[],
  usageAlerts: true,
  alertSettings: DEFAULT_ALERT_SETTINGS,
  currency: DEFAULT_CURRENCY,
  projectBudgets: {} as ProjectBudgets,
  collapsedSections: DEFAULT_COLLAPSED_SECTIONS,
  panelPinned: false,
  rememberPanelPosition: false,
  trayLogoColors: true,
  paceWorkdays: false,
  taskbarStrip: false,
  taskbarStripStyle: DEFAULT_TASKBAR_STRIP_STYLE,
  desktopWidgets: DEFAULT_DESKTOP_WIDGETS,
  navRight: false,
  capturePrivacy: false,
  glass: false,
  lineLayouts: {} as LineLayouts,
  cardFeatures: DEFAULT_CARD_FEATURES,
  planPrices: {} as PlanPrices,
}

export const useAppPreferencesStore = create<AppPreferencesStore>((set) => ({
  ...initialState,
  setAutoUpdateInterval: (value) => set({ autoUpdateInterval: value }),
  setThemeMode: (value) => set({ themeMode: value }),
  setDisplayMode: (value) => set({ displayMode: value }),
  setResetTimerDisplayMode: (value) => set({ resetTimerDisplayMode: value }),
  setTimeFormatMode: (value) => set({ timeFormatMode: value }),
  setGlobalShortcut: (value) => set({ globalShortcut: value }),
  setStartOnLogin: (value) => set({ startOnLogin: value }),
  setMenubarIconStyle: (value) => set({ menubarIconStyle: value }),
  setTrayProvider: (value) => set({ trayProvider: value }),
  setTrayMetric: (value) => set({ trayMetric: value }),
  setTrayPercentColor: (value) => set({ trayPercentColor: value }),
  setTrayHiddenPlugins: (value) => set({ trayHiddenPlugins: value }),
  setUsageAlerts: (value) => set({ usageAlerts: value }),
  setAlertSettings: (value) => set({ alertSettings: value }),
  setCurrency: (value) => set({ currency: value }),
  setProjectBudgets: (value) => set({ projectBudgets: value }),
  setCollapsedSections: (value) => set({ collapsedSections: value }),
  setPanelPinned: (value) => set({ panelPinned: value }),
  setRememberPanelPosition: (value) => set({ rememberPanelPosition: value }),
  setTrayLogoColors: (value) => set({ trayLogoColors: value }),
  setPaceWorkdays: (value) => set({ paceWorkdays: value }),
  setTaskbarStrip: (value) => set({ taskbarStrip: value }),
  setTaskbarStripStyle: (value) => set({ taskbarStripStyle: value }),
  setDesktopWidgets: (value) => set({ desktopWidgets: value }),
  setNavRight: (value) => set({ navRight: value }),
  setCapturePrivacy: (value) => set({ capturePrivacy: value }),
  setGlass: (value) => set({ glass: value }),
  setLineLayouts: (value) => set({ lineLayouts: value }),
  setCardFeatures: (value) => set({ cardFeatures: value }),
  setPlanPrices: (value) => set({ planPrices: value }),
  resetState: () => set(initialState),
}))
