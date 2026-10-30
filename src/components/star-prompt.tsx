import { useEffect, useState } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { t } from "@/lib/i18n"
import { initStarPrompt, markStarPromptShown, type StarPrompt } from "@/lib/settings"
import { REPO_URL } from "@/lib/support"

const VISIBLE_MS = 60_000

// Asked from the OS: before its first show the hidden panel's webview reports itself visible and
// focused (document.hidden, hasFocus), and the card came and went with the panel closed.
async function panelIsOpen() {
  return isTauri() && (await getCurrentWindow().isVisible())
}

/**
 * The one-time "star on GitHub" card at the bottom of the panel. It appears once its time has come
 * and the panel is open, closes itself after a minute, and never comes back.
 */
export function StarPromptCard() {
  const [prompt, setPrompt] = useState<StarPrompt | null>(null)
  const [open, setOpen] = useState(false)
  const [focusCount, setFocusCount] = useState(0)
  const tick = useNowTicker({ enabled: prompt !== null && !prompt.shown, intervalMs: 60_000, pauseWhenHidden: false })

  useEffect(() => {
    initStarPrompt()
      .then(setPrompt)
      .catch((error) => console.error("Failed to load the star prompt:", error))
  }, [])

  // Opening the panel focuses it: look again then, not only once a minute.
  useEffect(() => {
    const recheck = () => setFocusCount((count) => count + 1)
    window.addEventListener("focus", recheck)
    return () => window.removeEventListener("focus", recheck)
  }, [])

  useEffect(() => {
    if (!prompt || prompt.shown || Date.now() < prompt.showAfter) return
    let cancelled = false
    panelIsOpen()
      .then((isOpen) => {
        // A panel hidden while the OS answered isn't open any more (after the first show, `hidden` is true).
        if (cancelled || !isOpen || document.hidden) return
        // Saved as shown the moment it appears: hiding the panel early doesn't bring it back.
        setPrompt({ ...prompt, shown: true })
        setOpen(true)
        return markStarPromptShown()
      })
      .catch((error) => console.error("Failed to show the star prompt:", error))
    return () => {
      cancelled = true
    }
  }, [prompt, focusCount, tick])

  useEffect(() => {
    if (!open) return
    const timeout = window.setTimeout(() => setOpen(false), VISIBLE_MS)
    const handleVisibilityChange = () => {
      if (document.hidden) setOpen(false)
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [open])

  if (!open) return null

  return (
    <div
      role="status"
      className="absolute inset-x-0 bottom-1 z-20 flex items-start gap-2.5 rounded-lg border bg-popover p-3 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <Star aria-hidden className="mt-0.5 size-4 shrink-0 text-support" fill="currentColor" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-pretty">{t("star.title")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{t("star.body")}</p>
        <Button
          size="xs"
          className="mt-2"
          onClick={() => {
            openUrl(REPO_URL).catch(console.error)
            setOpen(false)
          }}
        >
          <Star aria-hidden strokeWidth={1.5} />
          {t("star.button")}
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="-mr-1 -mt-1 text-muted-foreground"
        onClick={() => setOpen(false)}
        aria-label={t("app.close")}
        title={t("app.close")}
      >
        <X aria-hidden />
      </Button>
    </div>
  )
}
