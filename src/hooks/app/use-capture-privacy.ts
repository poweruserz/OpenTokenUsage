import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { loadCapturePrivacy } from "@/lib/settings"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

/**
 * "Hide from screen sharing" (`capture_privacy.rs`): loads the setting, hands it to the host (which
 * keeps the panel and the desktop widgets out of capture), and returns whether the tray numbers and
 * the taskbar strip should hide now (the user presents, or the PC is remote controlled).
 */
export function useCapturePrivacy(): boolean {
  const enabled = useAppPreferencesStore((state) => state.capturePrivacy)
  const setEnabled = useAppPreferencesStore((state) => state.setCapturePrivacy)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    loadCapturePrivacy()
      .then(setEnabled)
      .catch((error) => console.error("Failed to load the screen sharing setting:", error))
  }, [setEnabled])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    if (!enabled) setSharing(false)
    // Listen first, then turn it on: the host only sends changes, and answers with the state now.
    const listening = enabled
      ? listen<boolean>("privacy:sharing", (event) => setSharing(event.payload === true)).then(
          (stop) => (cancelled ? stop() : (unlisten = stop)),
          (error) => console.error("Failed to listen for screen sharing:", error)
        )
      : Promise.resolve()
    listening
      // Turned off meanwhile: that run applies "off", this one must not land after it.
      .then(() => (cancelled && enabled ? null : invoke<boolean>("set_capture_privacy", { enabled })))
      .then((now) => {
        if (enabled && !cancelled && now !== null) setSharing(now === true)
      })
      .catch((error) => console.error("Failed to apply the screen sharing setting:", error))
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [enabled])

  return enabled && sharing
}
