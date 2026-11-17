import { useEffect } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import type { ThemeMode } from "@/lib/settings"

export function useSettingsTheme(themeMode: ThemeMode) {
  useEffect(() => {
    // Halloween is the dark theme with pumpkin orange (`.halloween` in index.css).
    const dark = themeMode !== "light"
    const root = document.documentElement
    root.classList.toggle("dark", dark)
    // Dark is pure black (the `.oled` tokens in index.css).
    root.classList.toggle("oled", dark)
    root.classList.toggle("halloween", themeMode === "halloween")
    // Mica takes its tint from the window's theme, not the page's: without this a light page sits
    // on dark Mica whenever Windows itself is dark (and the other way round).
    if (isTauri()) {
      getCurrentWindow()
        .setTheme(dark ? "dark" : "light")
        .catch((error) => console.error("Failed to set the window theme:", error))
    }
  }, [themeMode])
}
