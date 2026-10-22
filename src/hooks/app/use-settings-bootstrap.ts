import { useCallback, useEffect } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart"
import type { PluginMeta } from "@/lib/plugin-types"
import {
  arePluginSettingsEqual,
  DEFAULT_AUTO_UPDATE_INTERVAL,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_MENUBAR_ICON_STYLE,
  DEFAULT_RESET_TIMER_DISPLAY_MODE,
  DEFAULT_START_ON_LOGIN,
  DEFAULT_THEME_MODE,
  DEFAULT_TIME_FORMAT_MODE,
  getEnabledPluginIds,
  loadAutoUpdateInterval,
  loadDisplayMode,
  loadGlobalShortcut,
  loadMenubarIconStyle,
  loadTrayMetric,
  loadLanguage,
  loadTrayHiddenPlugins,
  loadUsageAlerts,
  loadAlertSettings,
  loadPanelPinned,
  loadRememberPanelPosition,
  loadTrayLogoColors,
  loadTaskbarStrip,
  loadTaskbarStripStyle,
  loadTrayPercentColor,
  loadTrayProvider,
  migrateLegacyTraySettings,
  migrateWindsurfToDevin,
  loadPluginSettings,
  loadResetTimerDisplayMode,
  loadStartOnLogin,
  loadThemeMode,
  loadTimeFormatMode,
  normalizePluginSettings,
  savePluginSettings,
  type AlertSettings,
  type AutoUpdateIntervalMinutes,
  type DisplayMode,
  type GlobalShortcut,
  type MenubarIconStyle,
  type PluginSettings,
  type ResetTimerDisplayMode,
  type TaskbarStripStyle,
  type ThemeMode,
  type TimeFormatMode,
  type TrayMetric,
  type TrayPercentColor,
  type TrayProvider,
} from "@/lib/settings"
import { useLocaleStore } from "@/lib/i18n"

type UseSettingsBootstrapArgs = {
  setPluginSettings: (value: PluginSettings | null) => void
  setPluginsMeta: (value: PluginMeta[]) => void
  setAutoUpdateInterval: (value: AutoUpdateIntervalMinutes) => void
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
  setPanelPinned: (value: boolean) => void
  setRememberPanelPosition: (value: boolean) => void
  setTrayLogoColors: (value: boolean) => void
  setTaskbarStrip: (value: boolean) => void
  setTaskbarStripStyle: (value: TaskbarStripStyle) => void
  setLoadingForPlugins: (ids: string[]) => void
  setErrorForPlugins: (ids: string[], error: string) => void
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>
}

export function useSettingsBootstrap({
  setPluginSettings,
  setPluginsMeta,
  setAutoUpdateInterval,
  setThemeMode,
  setDisplayMode,
  setResetTimerDisplayMode,
  setTimeFormatMode,
  setGlobalShortcut,
  setStartOnLogin,
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
  setLoadingForPlugins,
  setErrorForPlugins,
  startBatch,
}: UseSettingsBootstrapArgs) {
  const applyStartOnLogin = useCallback(async (value: boolean) => {
    if (!isTauri()) return
    // Always rewrite when on: isEnabled() only checks the Run entry exists, and the exe moves when
    // an old per-machine MSI install becomes a per-user NSIS install.
    if (value) {
      await enableAutostart()
      return
    }

    if (await isAutostartEnabled()) await disableAutostart()
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      // Language first and on its own: the UI remounts on a language switch, and a failure in the
      // plugin chain below must not keep the stored language from applying.
      try {
        const hidden = await loadTrayHiddenPlugins()
        if (isMounted) setTrayHiddenPlugins(hidden)
      } catch (error) {
        console.error("Failed to load tray-hidden providers:", error)
      }
      try {
        const [alerts, alertSettings] = await Promise.all([loadUsageAlerts(), loadAlertSettings()])
        if (isMounted) {
          setUsageAlerts(alerts)
          setAlertSettings(alertSettings)
        }
      } catch (error) {
        console.error("Failed to load usage alerts setting:", error)
      }
      try {
        const [pinned, rememberPosition] = await Promise.all([loadPanelPinned(), loadRememberPanelPosition()])
        if (isMounted) {
          setPanelPinned(pinned)
          setRememberPanelPosition(rememberPosition)
        }
      } catch (error) {
        console.error("Failed to load panel settings:", error)
      }
      try {
        const [logoColors, strip, stripStyle] = await Promise.all([
          loadTrayLogoColors(),
          loadTaskbarStrip(),
          loadTaskbarStripStyle(),
        ])
        if (isMounted) {
          setTrayLogoColors(logoColors)
          setTaskbarStrip(strip)
          setTaskbarStripStyle(stripStyle)
        }
      } catch (error) {
        console.error("Failed to load tray logo/taskbar strip settings:", error)
      }
      try {
        const storedLanguage = await loadLanguage()
        if (isMounted) useLocaleStore.getState().setPreference(storedLanguage)
      } catch (error) {
        console.error("Failed to load language:", error)
      }

      try {
        const availablePlugins = await invoke<PluginMeta[]>("list_plugins")
        if (!isMounted) return
        setPluginsMeta(availablePlugins)

        const storedSettings = await loadPluginSettings()
        const migratedSettings = migrateWindsurfToDevin(storedSettings)
        const normalized = normalizePluginSettings(migratedSettings, availablePlugins)
        if (!arePluginSettingsEqual(storedSettings, normalized)) {
          await savePluginSettings(normalized)
        }

        let storedInterval = DEFAULT_AUTO_UPDATE_INTERVAL
        try {
          storedInterval = await loadAutoUpdateInterval()
        } catch (error) {
          console.error("Failed to load auto-update interval:", error)
        }

        let storedThemeMode = DEFAULT_THEME_MODE
        try {
          storedThemeMode = await loadThemeMode()
        } catch (error) {
          console.error("Failed to load theme mode:", error)
        }

        let storedDisplayMode = DEFAULT_DISPLAY_MODE
        try {
          storedDisplayMode = await loadDisplayMode()
        } catch (error) {
          console.error("Failed to load display mode:", error)
        }

        let storedResetTimerDisplayMode = DEFAULT_RESET_TIMER_DISPLAY_MODE
        try {
          storedResetTimerDisplayMode = await loadResetTimerDisplayMode()
        } catch (error) {
          console.error("Failed to load reset timer display mode:", error)
        }

        let storedTimeFormatMode = DEFAULT_TIME_FORMAT_MODE
        try {
          storedTimeFormatMode = await loadTimeFormatMode()
        } catch (error) {
          console.error("Failed to load time format mode:", error)
        }

        let storedGlobalShortcut = DEFAULT_GLOBAL_SHORTCUT
        try {
          storedGlobalShortcut = await loadGlobalShortcut()
        } catch (error) {
          console.error("Failed to load global shortcut:", error)
        }

        let storedStartOnLogin = DEFAULT_START_ON_LOGIN
        try {
          storedStartOnLogin = await loadStartOnLogin()
        } catch (error) {
          console.error("Failed to load start on login:", error)
        }

        try {
          await applyStartOnLogin(storedStartOnLogin)
        } catch (error) {
          console.error("Failed to apply start on login setting:", error)
        }
        try {
          await migrateLegacyTraySettings()
        } catch (error) {
          console.error("Failed to migrate legacy tray settings:", error)
        }

        let storedMenubarIconStyle = DEFAULT_MENUBAR_ICON_STYLE
        try {
          storedMenubarIconStyle = await loadMenubarIconStyle()
        } catch (error) {
          console.error("Failed to load menubar icon style:", error)
        }

        let storedTrayProvider = "auto"
        let storedTrayMetric = "auto"
        let storedTrayPercentColor = "#ffffff"
        try {
          storedTrayProvider = await loadTrayProvider()
          storedTrayMetric = await loadTrayMetric()
          storedTrayPercentColor = await loadTrayPercentColor()
        } catch (error) {
          console.error("Failed to load tray provider/metric:", error)
        }

        if (isMounted) {
          setPluginSettings(normalized)
          setAutoUpdateInterval(storedInterval)
          setThemeMode(storedThemeMode)
          setDisplayMode(storedDisplayMode)
          setResetTimerDisplayMode(storedResetTimerDisplayMode)
          setTimeFormatMode(storedTimeFormatMode)
          setGlobalShortcut(storedGlobalShortcut)
          setStartOnLogin(storedStartOnLogin)
          setMenubarIconStyle(storedMenubarIconStyle)
          setTrayProvider(storedTrayProvider)
          setTrayMetric(storedTrayMetric)
          setTrayPercentColor(storedTrayPercentColor)

          const enabledIds = getEnabledPluginIds(normalized)
          setLoadingForPlugins(enabledIds)
          try {
            await startBatch(enabledIds)
          } catch (error) {
            console.error("Failed to start probe batch:", error)
            if (isMounted) {
              setErrorForPlugins(enabledIds, "Failed to start probe")
            }
          }
        }
      } catch (e) {
        console.error("Failed to load plugin settings:", e)
      }
    }

    loadSettings()

    return () => {
      isMounted = false
    }
  }, [
    applyStartOnLogin,
    setAutoUpdateInterval,
    setDisplayMode,
    setErrorForPlugins,
    setGlobalShortcut,
    setLoadingForPlugins,
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
    migrateWindsurfToDevin,
    migrateLegacyTraySettings,
    setPluginSettings,
    setPluginsMeta,
    setResetTimerDisplayMode,
    setStartOnLogin,
    setThemeMode,
    setTimeFormatMode,
    startBatch,
  ])

  return {
    applyStartOnLogin,
  }
}
