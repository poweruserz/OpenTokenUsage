import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Checkbox } from "@/components/ui/checkbox"
import { SettingsSection } from "@/components/settings-section"
import { t, type MessageKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type ProxySetting = { enabled: boolean; url: string }

const STATUS_TEXT = {
  saved: "settings.proxy.saved",
  invalid: "settings.proxy.invalid",
  error: "settings.proxy.error",
  broken: "settings.configBroken",
} as const satisfies Record<string, MessageKey>

/**
 * The outbound proxy for provider, status-page and update requests (`config.rs`, kept in
 * ~/.openusage/config.json). Saved ones apply from the next request; the host refuses an address
 * that isn't a proxy.
 */
export function ProxySection() {
  const [setting, setSetting] = useState<ProxySetting>({ enabled: false, url: "" })
  const [status, setStatus] = useState<keyof typeof STATUS_TEXT | null>(null)

  useEffect(() => {
    invoke<ProxySetting>("get_proxy_setting")
      .then((saved) => saved && setSetting(saved))
      .catch((error) => console.error("Failed to read the proxy setting:", error))
  }, [])

  const save = async (next: ProxySetting) => {
    setStatus(null)
    try {
      await invoke("set_proxy_setting", { enabled: next.enabled, url: next.url })
      setStatus("saved")
    } catch (error) {
      if (error !== "invalidUrl") console.error("Failed to save the proxy setting:", error)
      setStatus(error === "invalidUrl" ? "invalid" : error === "configBroken" ? "broken" : "error")
    }
  }

  return (
    <SettingsSection newFeature="proxy" title={t("settings.proxy.title")} description={t("settings.proxy.desc")}>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save(setting)
        }}
      >
        <label className="flex items-center gap-2 text-[13px] select-none text-foreground">
          <Checkbox
            key={String(setting.enabled)}
            checked={setting.enabled}
            onCheckedChange={(checked) => {
              const next = { ...setting, enabled: checked === true }
              setSetting(next)
              // Off applies at once; on waits for an address if there's none yet.
              if (!next.enabled || next.url.trim()) void save(next)
            }}
          />
          {t("settings.proxy.enable")}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            aria-label={t("settings.proxy.url")}
            placeholder="http://127.0.0.1:8080"
            value={setting.url}
            onChange={(e) => {
              setSetting({ ...setting, url: e.target.value })
              setStatus(null)
            }}
            className="fluent-control min-w-0 flex-1"
          />
          <button type="submit" className="fluent-control px-3">
            {t("settings.proxy.save")}
          </button>
        </div>
        {status && (
          <p className={cn("text-xs", status === "saved" ? "text-muted-foreground" : "text-destructive")} role="status">
            {t(STATUS_TEXT[status])}
          </p>
        )}
      </form>
    </SettingsSection>
  )
}
