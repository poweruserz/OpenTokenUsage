import { useState } from "react"
import { Hourglass } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import type { ResetCredit } from "@/lib/plugin-types"
import { getLocale, t, tLabel } from "@/lib/i18n"
import { formatCompactDuration } from "@/lib/pace-tooltip"
import { liveResetCredits, RESET_WARNING_MS } from "@/lib/reset-credits"
import { cn } from "@/lib/utils"

/** How many banked resets are still there to use. */
export function resetCount(credits: ResetCredit[], now: number): number {
  return liveResetCredits(credits, now).reduce((sum, credit) => sum + credit.count, 0)
}

/** The banked resets, one row per kind and expiry: what it resets, how many, and how long they last. */
export function ResetCreditRows({ credits, now, usageUrl }: { credits: ResetCredit[]; now: number; usageUrl?: string }) {
  const live = liveResetCredits(credits, now)
  const locale = getLocale()
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
    <div className="space-y-1.5 text-xs">
      {live.map((credit, index) => {
        const expiresMs = credit.expiresAt ? Date.parse(credit.expiresAt) : null
        if (expiresMs === null) {
          return (
            <div key={index}>
              {credit.kind && <div>{t(`banked.kind.${credit.kind}`)}</div>}
              <div className="text-muted-foreground">{t("banked.unknownExpiry", { count: credit.count })}</div>
            </div>
          )
        }
        const left = formatCompactDuration(expiresMs - now) ?? ""
        const expires = new Date(expiresMs)
        // The whole sentence and the exact time, for a pointer and a screen reader.
        const spelled = `${t("banked.expiresIn", { count: credit.count, time: left })} (${expires.toLocaleString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        })})`
        return (
          <div key={index}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate">
                {t(`banked.kind.${credit.kind ?? "any"}`)}{" "}
                <span className="tabular-nums text-muted-foreground">×{credit.count}</span>
              </span>
              <span
                title={spelled}
                className={cn(
                  "flex shrink-0 items-center gap-1 tabular-nums",
                  expiresMs - now <= RESET_WARNING_MS ? "text-amber-500" : "text-muted-foreground"
                )}
              >
                <Hourglass aria-hidden className="size-3" />
                <span aria-hidden>
                  {left} · {expires.toLocaleDateString(locale, { day: "numeric", month: "short" })}
                </span>
                <span className="sr-only">{spelled}</span>
              </span>
            </div>
            {credit.kind === "fable" && <p className="text-[10px] leading-snug text-muted-foreground">{t("banked.fableNote")}</p>}
          </div>
        )
      })}
      {live.length > 0 && usageUrl && (
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

/** The banked resets as a line of their own, where the page has no section for them. */
export function ResetCredits({ label, credits, now, usageUrl }: { label: string; credits: ResetCredit[]; now: number; usageUrl?: string }) {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{tLabel(label)}</span>
        <span>{t("banked.available", { count: resetCount(credits, now) })}</span>
      </div>
      <ResetCreditRows credits={credits} now={now} usageUrl={usageUrl} />
    </div>
  )
}
