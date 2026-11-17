import { useCallback, useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { fetchReleaseByTag } from "@/hooks/use-changelog"
import { loadWhatsNew, loadWhatsNewSeen, saveWhatsNewSeen } from "@/lib/settings"

/**
 * Whether to show what's new: on, not shown for this version yet, and an update came before it. A
 * first start without a saved version is a new install, unless an in-app update just ran (the
 * version before this feature saved none); an update through WinGet or the installer is one when a
 * version was saved before.
 */
export function whatsNewDue(on: boolean, seen: string | null, current: string, afterUpdate: boolean): boolean {
  return on && seen !== current && (seen !== null || afterUpdate)
}

/**
 * The version whose what's new the panel shows, once, after an update: its release notes, and the
 * video the update shipped (`whats_new.rs`), deleted once the window is closed or isn't due. Without
 * the notes (offline), it waits for the next start.
 */
export function useWhatsNew(afterUpdate: boolean | null | undefined) {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    if (afterUpdate == null || !isTauri()) return
    let cancelled = false
    void (async () => {
      const [current, on, seen] = await Promise.all([getVersion(), loadWhatsNew(), loadWhatsNewSeen()])
      if (!whatsNewDue(on, seen, current, afterUpdate)) {
        if (seen !== current) await saveWhatsNewSeen(current)
        await invoke("forget_whats_new_video")
        return
      }
      const notes = await fetchReleaseByTag(`v${current}`).catch(() => null)
      if (notes && !cancelled) setVersion(current)
    })().catch(console.error)
    return () => {
      cancelled = true
    }
  }, [afterUpdate])

  const close = useCallback(() => {
    if (version === null) return
    setVersion(null)
    void saveWhatsNewSeen(version)
      .then(() => invoke("forget_whats_new_video"))
      .catch(console.error)
  }, [version])

  return { version, close }
}
