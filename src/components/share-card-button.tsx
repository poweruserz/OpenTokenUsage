import { useState } from "react"
import { AlertCircle, Check, ImageDown } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { Button } from "@/components/ui/button"
import { convertUsdText, formatMoney } from "@/lib/currency"
import { getLocale, t } from "@/lib/i18n"
import type { MetricLine } from "@/lib/plugin-types"
import type { DisplayMode } from "@/lib/settings"
import { makeShareCardSvg, shareRows } from "@/lib/share-card"
import { measureTextWithCanvas } from "@/lib/taskbar-strip"
import { rasterizeSvgToRgba } from "@/lib/tray-bars-icon"
import { bytesToBase64 } from "@/lib/tray-provider-icons"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

/** The share card at twice its size: crisp when pasted into a chat or a document. */
const SCALE = 2

function accentColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--accent-base").trim()
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#0078d4"
}

/** Copies the card, as it reads now, to the clipboard as a picture (`share-card.ts`). */
export function ShareCardButton(props: { name: string; plan?: string; lines: MetricLine[]; displayMode: DisplayMode; now: number }) {
  const { name, plan, lines, displayMode, now } = props
  const currency = useAppPreferencesStore((state) => state.currency)
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")

  const copy = async () => {
    const locale = getLocale()
    try {
      const rows = shareRows(lines, {
        displayMode,
        now,
        money: (usd) => formatMoney(usd, currency, locale),
        moneyText: (text) => convertUsdText(text, currency, locale),
      })
      const stamp = new Date(now).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
      const { svg, width, height } = makeShareCardSvg({
        title: name,
        plan,
        rows,
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        accent: accentColor(),
        footer: `OpenTokenUsage · ${stamp}`,
        scale: SCALE,
        measure: measureTextWithCanvas,
      })
      const rgba = await rasterizeSvgToRgba(svg, width, height)
      await invoke("copy_image_to_clipboard", { rgba: bytesToBase64(rgba), width, height })
      setState("copied")
    } catch (error) {
      console.error("Failed to copy the card:", error)
      setState("failed")
    }
    window.setTimeout(() => setState("idle"), 1500)
  }

  const label = t(state === "copied" ? "card.imageCopied" : state === "failed" ? "card.imageCopyFailed" : "card.copyImage")
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={() => void copy()}
      className="ml-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
    >
      {state === "copied" ? (
        <Check className="h-3 w-3" />
      ) : state === "failed" ? (
        <AlertCircle className="h-3 w-3" />
      ) : (
        <ImageDown className="h-3 w-3" />
      )}
    </Button>
  )
}
