import { useState } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import type { ResetCredit } from "@/lib/plugin-types"
import { getLocale, t, tLabel } from "@/lib/i18n"
import { formatCompactDuration } from "@/lib/pace-tooltip"
import { liveResetCredits, RESET_WARNING_MS } from "@/lib/reset-credits"

export function ResetCredits({ credits, now, usageUrl }: { credits: ResetCredit[]; now: number; usageUrl?: string }) {
  const live = liveResetCredits(credits, now)
  const count = live.reduce((sum, credit) => sum + credit.count, 0)
  const [linkFailed, setLinkFailed] = useState(false)
  async function openUsage() {
    if (!usageUrl) return
    setLinkFailed(false)
    try {
      await openUrl(usageUrl)
    } catch (error) {
      console.error("Failed to open reset usage page:", error)
      setLinkFailed(true)
    }
  }
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{tLabel("Rate Limit Resets")}</span>
        <span>{t("banked.available", { count })}</span>
      </div>
      {live.map((credit, index) => (
        <div
          key={index}
          className={
            credit.expiresAt && Date.parse(credit.expiresAt) - now <= RESET_WARNING_MS
              ? "text-amber-500"
              : "text-muted-foreground"
          }
        >
          {credit.expiresAt ? (
            <>
              <div>
                {t("banked.expiresIn", {
                  count: credit.count,
                  time: formatCompactDuration(Date.parse(credit.expiresAt) - now) ?? ""
                })}
              </div>
              <div className="text-[10px]">
                {new Date(credit.expiresAt).toLocaleString(getLocale(), {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short"
                })}
              </div>
            </>
          ) : (
            t("banked.unknownExpiry", { count: credit.count })
          )}
        </div>
      ))}
      {count > 0 && usageUrl && (
        <button
          type="button"
          className="text-xs underline hover:text-foreground text-muted-foreground"
          onClick={() => void openUsage()}
        >
          {t("banked.openUsage")}
        </button>
      )}
      {linkFailed && (
        <div role="alert" className="text-destructive">
          {t("banked.linkFailed")}
        </div>
      )}
    </div>
  )
}
