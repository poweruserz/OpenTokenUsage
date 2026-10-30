import { useEffect } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Star } from "lucide-react"
import { BmcCup } from "@/components/bmc-cup"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import { REPO_URL, SUPPORT_URL } from "@/lib/support"

/** The yellow Buy Me a Coffee button, with the address it opens written underneath. */
export function BuyMeACoffeeButton({ autoFocus, onOpen }: { autoFocus?: boolean; onOpen?: () => void }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-1.5">
      <button
        type="button"
        autoFocus={autoFocus}
        onClick={() => {
          openUrl(SUPPORT_URL).catch(console.error)
          onOpen?.()
        }}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-support text-support-foreground text-sm font-semibold hover:brightness-95 active:brightness-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <BmcCup className="h-5 w-auto" />
        {t("support.buyMeACoffee")}
      </button>
      <span className="text-xs text-muted-foreground">{SUPPORT_URL.replace(/^https:\/\//, "")}</span>
    </div>
  )
}

/** Opened from the coffee cup in the side nav: why a coffee helps, the button, and a GitHub star. */
export function SupportDialog({ onClose }: { onClose: () => void }) {
  // Same ways to close as the About dialog: Escape, a click outside, or the panel hiding.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    const handleVisibilityChange = () => {
      if (document.hidden) onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [onClose])

  return (
    <div
      data-panel-dialog
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        className="bg-popover rounded-lg border shadow-2xl p-6 max-w-xs w-full max-h-full overflow-y-auto text-center animate-in fade-in zoom-in-95 duration-200"
      >
        <BmcCup className="h-14 w-auto mx-auto mb-3 text-foreground" />
        <h2 id="support-title" className="text-lg font-semibold font-display mb-2 text-balance">
          {t("support.title")}
        </h2>
        <p className="text-sm text-muted-foreground mb-2 text-pretty">{t("support.body")}</p>
        <p className="text-sm text-foreground text-pretty">{t("support.ask")}</p>
        <BuyMeACoffeeButton autoFocus onOpen={onClose} />
        <div className="mt-4 border-t pt-3 flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground text-pretty">{t("support.starAsk")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              openUrl(REPO_URL).catch(console.error)
              onClose()
            }}
          >
            <Star aria-hidden className="text-support" fill="currentColor" strokeWidth={1.5} />
            {t("star.button")}
          </Button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus-visible:underline"
        >
          {t("support.later")}
        </button>
      </div>
    </div>
  )
}
