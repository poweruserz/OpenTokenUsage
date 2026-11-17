import { useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { loadGlass } from "@/lib/settings"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

/**
 * Glass (Settings → Appearance): loads the setting and has the host put Acrylic behind the panel in
 * place of Mica (`window_style::set_window_glass`); `.glass` turns the layers see-through only when
 * the window really got it (never on Windows 10).
 */
export function useGlass() {
  const glass = useAppPreferencesStore((state) => state.glass)
  const setGlass = useAppPreferencesStore((state) => state.setGlass)
  // Mica is what the window starts with: nothing to switch back until glass was asked for.
  const askedRef = useRef(false)
  // Only the latest switch's answer counts (on, then off before the first answer came).
  const generationRef = useRef(0)

  useEffect(() => {
    loadGlass()
      .then(setGlass)
      .catch((error) => console.error("Failed to load the glass setting:", error))
  }, [setGlass])

  useEffect(() => {
    if (!glass && !askedRef.current) return
    askedRef.current = true
    const generation = ++generationRef.current
    invoke<boolean>("set_window_glass", { enabled: glass })
      .then((applied) => {
        if (generation === generationRef.current) document.documentElement.classList.toggle("glass", applied)
      })
      .catch((error) => console.error("Failed to apply the glass setting:", error))
  }, [glass])
}
