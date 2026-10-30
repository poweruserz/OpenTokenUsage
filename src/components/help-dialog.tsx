import { useEffect } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { ChevronDown, CircleHelp } from "lucide-react"
import { t, type MessageKey } from "@/lib/i18n"
import { ISSUES_URL } from "@/lib/support"

const FAQ: { q: MessageKey; a: MessageKey }[] = [
  { q: "faq.notDetected.q", a: "faq.notDetected.a" },
  { q: "faq.refresh.q", a: "faq.refresh.a" },
  { q: "faq.rateLimited.q", a: "faq.rateLimited.a" },
  { q: "faq.accounts.q", a: "faq.accounts.a" },
  { q: "faq.taskbar.q", a: "faq.taskbar.a" },
  { q: "faq.privacy.q", a: "faq.privacy.a" },
  { q: "faq.update.q", a: "faq.update.a" },
]

/** Opened from the question mark in the side nav: common questions, then a way to ask on GitHub. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
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

  // The answers name settings by their own labels, so a renamed setting stays right here.
  const labels = {
    settings: t("nav.settings"),
    autoRefresh: t("settings.autoRefresh.title"),
    smart: t("settings.autoRefresh.smart"),
    accounts: t("settings.accounts.title"),
    tray: t("settings.tray.title"),
    strip: t("settings.strip.title"),
    alerts: t("settings.alerts.title"),
    restart: t("footer.restartToUpdate"),
  }

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
        aria-labelledby="help-title"
        className="bg-popover rounded-lg border shadow-2xl p-5 max-w-sm w-full max-h-full overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
      >
        <h2 id="help-title" className="flex items-center gap-2 text-base font-semibold font-display mb-2">
          <CircleHelp aria-hidden className="size-5 shrink-0" strokeWidth={1.5} />
          {t("faq.title")}
        </h2>
        {FAQ.map((item) => (
          <details key={item.q} className="group border-b last:border-b-0 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              {t(item.q)}
              <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-1.5 text-xs text-muted-foreground text-pretty select-text">{t(item.a, labels)}</p>
          </details>
        ))}
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => openUrl(ISSUES_URL).catch(console.error)}
            className="text-xs text-primary text-left hover:underline focus:outline-none focus-visible:underline"
          >
            {t("faq.askOnGitHub")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus-visible:underline"
          >
            {t("app.close")}
          </button>
        </div>
      </div>
    </div>
  )
}
