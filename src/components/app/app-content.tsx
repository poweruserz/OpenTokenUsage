import { useShallow } from "zustand/react/shallow"
import { OverviewPage } from "@/pages/overview"
import { ProviderDetailPage } from "@/pages/provider-detail"
import { SettingsPage } from "@/pages/settings"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import type { TraySettingsPreview } from "@/hooks/app/use-tray-icon"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import type { AccountsChange } from "@/lib/accounts"
import type {
  AutoUpdateInterval,
  DisplayMode,
  GlobalShortcut,
  MenubarIconStyle,
  ResetTimerDisplayMode,
  ThemeMode,
  TimeFormatMode,
} from "@/lib/settings"

type AppContentDerivedProps = {
  displayPlugins: DisplayPluginState[]
  settingsPlugins: SettingsPluginState[]
  selectedPlugin: DisplayPluginState | null
}

export type AppContentActionProps = {
  onRetryPlugin: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  onToggle: (id: string) => void
  onAccountsChanged: (change: AccountsChange) => void
  onAutoUpdateIntervalChange: (value: AutoUpdateInterval) => void
  onThemeModeChange: (mode: ThemeMode) => void
  onDisplayModeChange: (mode: DisplayMode) => void
  onResetTimerDisplayModeChange: (mode: ResetTimerDisplayMode) => void
  onResetTimerDisplayModeToggle: () => void
  onTimeFormatModeChange: (mode: TimeFormatMode) => void
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void
  onTrayProviderChange: (value: string) => void
  onTrayMetricChange: (value: string) => void
  onTrayPercentColorChange: (value: string) => void
  traySettingsPreview: TraySettingsPreview
  onGlobalShortcutChange: (value: GlobalShortcut) => void
  onStartOnLoginChange: (value: boolean) => void
}

export type AppContentProps = AppContentDerivedProps & AppContentActionProps

export function AppContent({
  displayPlugins,
  settingsPlugins,
  selectedPlugin,
  onRetryPlugin,
  onReorder,
  onToggle,
  onAccountsChanged,
  onAutoUpdateIntervalChange,
  onThemeModeChange,
  onDisplayModeChange,
  onResetTimerDisplayModeChange,
  onResetTimerDisplayModeToggle,
  onTimeFormatModeChange,
  onMenubarIconStyleChange,
  onTrayProviderChange,
  onTrayMetricChange,
  onTrayPercentColorChange,
  traySettingsPreview,
  onGlobalShortcutChange,
  onStartOnLoginChange,
}: AppContentProps) {
  const { activeView } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
    }))
  )

  const {
    displayMode,
    resetTimerDisplayMode,
    timeFormatMode,
    menubarIconStyle,
    trayProvider,
    trayMetric,
    trayPercentColor,
    autoUpdateInterval,
    globalShortcut,
    themeMode,
    startOnLogin,
  } = useAppPreferencesStore(
    useShallow((state) => ({
      displayMode: state.displayMode,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      timeFormatMode: state.timeFormatMode,
      menubarIconStyle: state.menubarIconStyle,
      trayProvider: state.trayProvider,
      trayMetric: state.trayMetric,
      trayPercentColor: state.trayPercentColor,
      autoUpdateInterval: state.autoUpdateInterval,
      globalShortcut: state.globalShortcut,
      themeMode: state.themeMode,
      startOnLogin: state.startOnLogin,
    }))
  )

  if (activeView === "home") {
    return (
      <OverviewPage
        plugins={displayPlugins}
        onRetryPlugin={onRetryPlugin}
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        timeFormatMode={timeFormatMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
      />
    )
  }

  if (activeView === "settings") {
    return (
      <SettingsPage
        plugins={settingsPlugins}
        onReorder={onReorder}
        onToggle={onToggle}
        onAccountsChanged={onAccountsChanged}
        autoUpdateInterval={autoUpdateInterval}
        onAutoUpdateIntervalChange={onAutoUpdateIntervalChange}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
        displayMode={displayMode}
        onDisplayModeChange={onDisplayModeChange}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeChange={onResetTimerDisplayModeChange}
        timeFormatMode={timeFormatMode}
        onTimeFormatModeChange={onTimeFormatModeChange}
        menubarIconStyle={menubarIconStyle}
        onMenubarIconStyleChange={onMenubarIconStyleChange}
        trayProvider={trayProvider}
        onTrayProviderChange={onTrayProviderChange}
        trayMetric={trayMetric}
        onTrayMetricChange={onTrayMetricChange}
        trayPercentColor={trayPercentColor}
        onTrayPercentColorChange={onTrayPercentColorChange}
        traySettingsPreview={traySettingsPreview}
        globalShortcut={globalShortcut}
        onGlobalShortcutChange={onGlobalShortcutChange}
        startOnLogin={startOnLogin}
        onStartOnLoginChange={onStartOnLoginChange}
      />
    )
  }

  const handleRetry = selectedPlugin
    ? () => onRetryPlugin(selectedPlugin.meta.id)
    : /* v8 ignore next */ undefined

  return (
    <ProviderDetailPage
      plugin={selectedPlugin}
      onRetry={handleRetry}
      displayMode={displayMode}
      resetTimerDisplayMode={resetTimerDisplayMode}
      timeFormatMode={timeFormatMode}
      onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
    />
  )
}
