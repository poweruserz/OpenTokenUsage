import { useCallback, useEffect, useMemo, useRef } from "react"
import { useShallow } from "zustand/react/shallow"
import { AppShell } from "@/components/app/app-shell"
import { useAppPluginViews } from "@/hooks/app/use-app-plugin-views"
import { useProbe } from "@/hooks/app/use-probe"
import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap"
import { useSettingsDisplayActions } from "@/hooks/app/use-settings-display-actions"
import { useSettingsPluginActions } from "@/hooks/app/use-settings-plugin-actions"
import { useSettingsPluginList } from "@/hooks/app/use-settings-plugin-list"
import { useSettingsSystemActions } from "@/hooks/app/use-settings-system-actions"
import { useSettingsTheme } from "@/hooks/app/use-settings-theme"
import { useTrayIcon } from "@/hooks/app/use-tray-icon"
import { REFRESH_COOLDOWN_MS, savePluginSettings } from "@/lib/settings"
import { listen } from "@tauri-apps/api/event"
import type { PluginsChange } from "@/lib/accounts"
import { type PluginContextAction } from "@/components/side-nav"
import { useAppPluginStore } from "@/stores/app-plugin-store"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import { t, useLocaleStore } from "@/lib/i18n"
import { invoke } from "@tauri-apps/api/core"
import { useAppUpdate } from "@/hooks/use-app-update"
import { useUsageAlerts } from "@/hooks/app/use-usage-alerts"
import { useProviderTrayIcons } from "@/hooks/app/use-provider-tray-icons"
import { useTaskbarStrip } from "@/hooks/app/use-taskbar-strip"

const TRAY_PROBE_DEBOUNCE_MS = 500
const TRAY_SETTINGS_DEBOUNCE_MS = 2000

function App() {
  const {
    activeView,
    setActiveView,
  } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
      setActiveView: state.setActiveView,
    }))
  )

  const {
    pluginsMeta,
    setPluginsMeta,
    pluginSettings,
    setPluginSettings,
  } = useAppPluginStore(
    useShallow((state) => ({
      pluginsMeta: state.pluginsMeta,
      setPluginsMeta: state.setPluginsMeta,
      pluginSettings: state.pluginSettings,
      setPluginSettings: state.setPluginSettings,
    }))
  )

  const {
    autoUpdateInterval,
    setAutoUpdateInterval,
    themeMode,
    setThemeMode,
    displayMode,
    setDisplayMode,
    menubarIconStyle,
    setMenubarIconStyle,
    trayProvider,
    setTrayProvider,
    trayMetric,
    setTrayMetric,
    trayPercentColor,
    setTrayPercentColor,
    setTrayHiddenPlugins,
    usageAlerts,
    setUsageAlerts,
    alertSettings,
    setAlertSettings,
    setPanelPinned,
    setRememberPanelPosition,
    trayLogoColors,
    setTrayLogoColors,
    taskbarStrip,
    setTaskbarStrip,
    taskbarStripStyle,
    setTaskbarStripStyle,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setTimeFormatMode,
    setGlobalShortcut,
    setStartOnLogin,
  } = useAppPreferencesStore(
    useShallow((state) => ({
      autoUpdateInterval: state.autoUpdateInterval,
      setAutoUpdateInterval: state.setAutoUpdateInterval,
      themeMode: state.themeMode,
      setThemeMode: state.setThemeMode,
      displayMode: state.displayMode,
      setDisplayMode: state.setDisplayMode,
      menubarIconStyle: state.menubarIconStyle,
      setMenubarIconStyle: state.setMenubarIconStyle,
      trayProvider: state.trayProvider,
      setTrayProvider: state.setTrayProvider,
      trayMetric: state.trayMetric,
      setTrayMetric: state.setTrayMetric,
      trayPercentColor: state.trayPercentColor,
      setTrayPercentColor: state.setTrayPercentColor,
      setTrayHiddenPlugins: state.setTrayHiddenPlugins,
      usageAlerts: state.usageAlerts,
      setUsageAlerts: state.setUsageAlerts,
      alertSettings: state.alertSettings,
      setAlertSettings: state.setAlertSettings,
      setPanelPinned: state.setPanelPinned,
      setRememberPanelPosition: state.setRememberPanelPosition,
      trayLogoColors: state.trayLogoColors,
      taskbarStrip: state.taskbarStrip,
      taskbarStripStyle: state.taskbarStripStyle,
      setTaskbarStripStyle: state.setTaskbarStripStyle,
      setTrayLogoColors: state.setTrayLogoColors,
      setTaskbarStrip: state.setTaskbarStrip,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      setResetTimerDisplayMode: state.setResetTimerDisplayMode,
      setTimeFormatMode: state.setTimeFormatMode,
      setGlobalShortcut: state.setGlobalShortcut,
      setStartOnLogin: state.setStartOnLogin,
    }))
  )

  const scheduleProbeTrayUpdateRef = useRef<() => void>(() => {})
  const handleProbeResult = useCallback(() => {
    scheduleProbeTrayUpdateRef.current()
  }, [])

  const {
    pluginStates,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    autoUpdateNextAt,
    setAutoUpdateNextAt,
    handleRetryPlugin,
    handleRefreshAll,
  } = useProbe({
    pluginSettings,
    autoUpdateInterval,
    onProbeResult: handleProbeResult,
  })

  // Providers hidden from the tray stay in the nav; for the tray they count as disabled.
  const trayHiddenPlugins = useAppPreferencesStore((state) => state.trayHiddenPlugins)
  const trayPluginSettings = useMemo(
    () =>
      pluginSettings && trayHiddenPlugins.length > 0
        ? { ...pluginSettings, disabled: [...pluginSettings.disabled, ...trayHiddenPlugins] }
        : pluginSettings,
    [pluginSettings, trayHiddenPlugins]
  )

  useUsageAlerts({ pluginStates, pluginsMeta, enabled: usageAlerts, settings: alertSettings, displayMode })

  const { scheduleTrayIconUpdate, traySettingsPreview } = useTrayIcon({
    pluginsMeta,
    pluginSettings: trayPluginSettings,
    pluginStates,
    displayMode,
    menubarIconStyle,
    trayProvider,
    trayMetric,
    trayPercentColor,
    themeMode,
    activeView,
  })

  const redrawAppTrayIcon = useCallback(() => scheduleTrayIconUpdate("settings", 0), [scheduleTrayIconUpdate])
  useProviderTrayIcons({
    pluginsMeta,
    pluginSettings: trayPluginSettings,
    pluginStates,
    displayMode,
    style: menubarIconStyle,
    trayMetric,
    themeMode,
    logoColors: trayLogoColors,
    onAppIconShown: redrawAppTrayIcon,
  })

  useTaskbarStrip({
    enabled: taskbarStrip,
    pluginsMeta,
    pluginSettings,
    pluginStates,
    displayMode,
    logoColors: trayLogoColors,
    style: taskbarStripStyle,
    themeMode,
  })

  useEffect(() => {
    scheduleProbeTrayUpdateRef.current = () => {
      scheduleTrayIconUpdate("probe", TRAY_PROBE_DEBOUNCE_MS)
    }
  }, [scheduleTrayIconUpdate])

  const { applyStartOnLogin } = useSettingsBootstrap({
    setPluginSettings,
    setPluginsMeta,
    setAutoUpdateInterval,
    setThemeMode,
    setDisplayMode,
    setMenubarIconStyle,
    setTrayProvider,
    setTrayMetric,
    setTrayPercentColor,
    setTrayHiddenPlugins,
    setUsageAlerts,
    setAlertSettings,
    setPanelPinned,
    setRememberPanelPosition,
    setTrayLogoColors,
    setTaskbarStrip,
    setTaskbarStripStyle,
    setResetTimerDisplayMode,
    setTimeFormatMode,
    setGlobalShortcut,
    setStartOnLogin,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
  })

  useSettingsTheme(themeMode)

  const {
    handleThemeModeChange,
    handleDisplayModeChange,
    handleResetTimerDisplayModeChange,
    handleResetTimerDisplayModeToggle,
    handleTimeFormatModeChange,
    handleMenubarIconStyleChange,
    handleTrayProviderChange,
    handleTrayMetricChange,
    handleTrayPercentColorChange,
  } = useSettingsDisplayActions({
    setThemeMode,
    setDisplayMode,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setTimeFormatMode,
    setMenubarIconStyle,
    setTrayProvider,
    setTrayMetric,
    setTrayPercentColor,
    scheduleTrayIconUpdate,
  })

  const {
    handleAutoUpdateIntervalChange,
    handleGlobalShortcutChange,
    handleStartOnLoginChange,
  } = useSettingsSystemActions({
    pluginSettings,
    setAutoUpdateInterval,
    setAutoUpdateNextAt,
    setGlobalShortcut,
    setStartOnLogin,
    applyStartOnLogin,
  })

  const {
    handleReorder,
    handleToggle,
    handleAccountsChanged,
    handlePluginsChanged,
  } = useSettingsPluginActions({
    pluginSettings,
    setPluginSettings,
    setPluginsMeta,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    scheduleTrayIconUpdate,
  })

  // WSL cards come and go with WSL logins (`wsl.rs`); the host says so after a refresh. Subscribed
  // once, so no event falls into a re-subscribe gap; the latest handler is read through a ref.
  const pluginsChangedRef = useRef(handlePluginsChanged)
  pluginsChangedRef.current = handlePluginsChanged
  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    listen<PluginsChange>("plugins:changed", (event) => void pluginsChangedRef.current(event.payload)).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const settingsPlugins = useSettingsPluginList({
    pluginSettings,
    pluginsMeta,
  })

  const { displayPlugins, navPlugins, selectedPlugin } = useAppPluginViews({
    activeView,
    setActiveView,
    pluginSettings,
    pluginsMeta,
    pluginStates,
  })

  const pluginSettingsRef = useRef(pluginSettings)
  useEffect(() => {
    pluginSettingsRef.current = pluginSettings
  }, [pluginSettings])

  const handlePluginContextAction = useCallback(
    (pluginId: string, action: PluginContextAction) => {
      if (action === "reload") {
        handleRetryPlugin(pluginId)
        return
      }

      const currentSettings = pluginSettingsRef.current
      if (!currentSettings) return
      const alreadyDisabled = currentSettings.disabled.includes(pluginId)
      if (alreadyDisabled) return

      const nextSettings = {
        ...currentSettings,
        disabled: [...currentSettings.disabled, pluginId],
      }
      setPluginSettings(nextSettings)
      scheduleTrayIconUpdate("settings", TRAY_SETTINGS_DEBOUNCE_MS)
      void savePluginSettings(nextSettings).catch((error) => {
        console.error("Failed to save plugin toggle:", error)
      })

      if (activeView === pluginId) {
        setActiveView("home")
      }
    },
    [activeView, handleRetryPlugin, scheduleTrayIconUpdate, setActiveView, setPluginSettings]
  )

  const isPluginRefreshAvailable = useCallback(
    (pluginId: string) => {
      const pluginState = pluginStates[pluginId]
      if (!pluginState) return true
      if (pluginState.loading) return false
      if (!pluginState.lastManualRefreshAt) return true
      return Date.now() - pluginState.lastManualRefreshAt >= REFRESH_COOLDOWN_MS
    },
    [pluginStates]
  )

  // Remount the UI on a language switch so every string (incl. helper-formatted text) re-renders.
  const locale = useLocaleStore((state) => state.locale)
  const appUpdate = useAppUpdate()

  // The tray menu is native (Rust); send it the labels for the current language.
  useEffect(() => {
    invoke("set_tray_menu_labels", {
      labels: {
        showStats: t("tray.showStats"),
        goToSettings: t("tray.goToSettings"),
        debugLevel: t("tray.debugLevel"),
        copyLogPath: t("tray.copyLogPath"),
        about: t("tray.about"),
        support: t("support.buyMeACoffee"),
        quit: t("tray.quit"),
      },
    }).catch((error) => console.error("Failed to translate tray menu:", error))
  }, [locale])

  return (
    <AppShell
      key={locale}
      appUpdate={appUpdate}
      onRefreshAll={handleRefreshAll}
      navPlugins={navPlugins}
      displayPlugins={displayPlugins}
      settingsPlugins={settingsPlugins}
      autoUpdateNextAt={autoUpdateNextAt}
      selectedPlugin={selectedPlugin}
      onPluginContextAction={handlePluginContextAction}
      isPluginRefreshAvailable={isPluginRefreshAvailable}
      onNavReorder={handleReorder}
      appContentProps={{
        onRetryPlugin: handleRetryPlugin,
        onReorder: handleReorder,
        onToggle: handleToggle,
        onAccountsChanged: handleAccountsChanged,
        onAutoUpdateIntervalChange: handleAutoUpdateIntervalChange,
        onThemeModeChange: handleThemeModeChange,
        onDisplayModeChange: handleDisplayModeChange,
        onResetTimerDisplayModeChange: handleResetTimerDisplayModeChange,
        onResetTimerDisplayModeToggle: handleResetTimerDisplayModeToggle,
        onTimeFormatModeChange: handleTimeFormatModeChange,
        onMenubarIconStyleChange: handleMenubarIconStyleChange,
        onTrayProviderChange: handleTrayProviderChange,
        onTrayMetricChange: handleTrayMetricChange,
        onTrayPercentColorChange: handleTrayPercentColorChange,
        traySettingsPreview,
        onGlobalShortcutChange: handleGlobalShortcutChange,
        onStartOnLoginChange: handleStartOnLoginChange,
      }}
    />
  )
}

export { App }
