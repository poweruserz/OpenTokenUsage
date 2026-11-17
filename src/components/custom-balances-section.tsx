import { useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { SettingsSection } from "@/components/settings-section"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** `config.rs`'s `BalanceEndpoint`: what the custom-balance plugin reads. */
export type BalanceEndpoint = {
  name: string
  preset: "newapi" | "newapi-token" | "sub2api" | "custom"
  baseUrl: string
  /** The environment variable holding the key: the key itself is never saved. */
  tokenEnv: string
  userId: string
  path: string
  remaining: string
  used: string
  total: string
  divisor: number
  currency: string
  auth: "bearer" | "x-api-key" | ""
}

/** A balance as typed: the divisor stays text until saved, so "0." and "0,01" can be typed. */
type Draft = Omit<BalanceEndpoint, "divisor"> & { divisor: string }

const MAX_BALANCES = 5
const PRESETS: { value: BalanceEndpoint["preset"]; label: string }[] = [
  { value: "newapi", label: "New API / One API" },
  { value: "newapi-token", label: "New API (API key)" },
  { value: "sub2api", label: "Sub2API" },
  { value: "custom", label: "Custom" },
]

const blank = (): Draft => ({
  name: "",
  preset: "newapi",
  baseUrl: "",
  tokenEnv: "",
  userId: "",
  path: "/user/balance",
  remaining: "data.balance",
  used: "",
  total: "",
  divisor: "1",
  currency: "USD",
  auth: "bearer",
})

function Field({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <label className={cn("block text-xs text-muted-foreground", className)}>
      <span className="mb-0.5 block">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="fluent-control w-full"
      />
    </label>
  )
}

/**
 * Settings → Providers → Custom balances: up to five panels (New API, One API, Sub2API) or plain GET
 * endpoints whose balance the "Custom balances" card shows (`plugins/custom-balance`).
 */
export function CustomBalancesSection() {
  const [balances, setBalances] = useState<Draft[] | null>(null)
  const [status, setStatus] = useState<"saved" | "invalid" | "broken" | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    invoke<BalanceEndpoint[]>("get_custom_balances")
      .then((list) => setBalances((Array.isArray(list) ? list : []).map((balance) => ({ ...balance, divisor: String(balance.divisor) }))))
      .catch((error) => console.error("Failed to read custom balances:", error))
  }, [])

  if (balances === null) return null
  const change = (index: number, patch: Partial<Draft>) => {
    setStatus(null)
    setBalances(balances.map((balance, i) => (i === index ? { ...balance, ...patch } : balance)))
  }
  const save = async () => {
    // Custom-only fields left as typed do no harm; the host checks every one it reads (a divisor that
    // isn't a number becomes 0, which it refuses).
    const list: BalanceEndpoint[] = balances.map((balance) => ({
      ...balance,
      name: balance.name.trim(),
      baseUrl: balance.baseUrl.trim(),
      divisor: Number(balance.divisor.trim().replace(",", ".")) || 0,
    }))
    try {
      await invoke("set_custom_balances", { balances: list })
      setStatus("saved")
    } catch (error) {
      console.error("Custom balances not saved:", error)
      // `configBroken`: the file has a typo, not the entries (`config.rs`).
      setStatus(error === "configBroken" ? "broken" : "invalid")
    }
  }

  return (
    <SettingsSection title={t("settings.balances.title")} description={t("settings.balances.desc")}>
      <div className="space-y-3">
        {balances.map((balance, index) => (
          <div key={index} className="space-y-1.5 rounded-md border border-surface-stroke p-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("settings.balances.name")} value={balance.name} onChange={(name) => change(index, { name })} />
              <label className="block text-xs text-muted-foreground">
                <span className="mb-0.5 block">{t("settings.balances.preset")}</span>
                <select
                  value={balance.preset}
                  onChange={(e) => change(index, { preset: e.target.value as BalanceEndpoint["preset"] })}
                  className="fluent-control w-full"
                >
                  {PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.value === "custom" ? t("settings.balances.custom") : preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label={t("settings.balances.url")}
                value={balance.baseUrl}
                placeholder="https://"
                onChange={(baseUrl) => change(index, { baseUrl })}
              />
              <Field
                label={t("settings.balances.env")}
                value={balance.tokenEnv}
                placeholder="OTU_RELAY_KEY"
                onChange={(tokenEnv) => change(index, { tokenEnv: tokenEnv.toUpperCase() })}
              />
              {balance.preset === "newapi" && (
                <Field label={t("settings.balances.userId")} value={balance.userId} onChange={(userId) => change(index, { userId })} />
              )}
            </div>
            {balance.preset === "custom" && (
              <div className="grid grid-cols-3 gap-2">
                <Field label={t("settings.balances.path")} value={balance.path} onChange={(path) => change(index, { path })} />
                <Field label={t("settings.balances.remaining")} value={balance.remaining} onChange={(remaining) => change(index, { remaining })} />
                <Field label={t("settings.balances.used")} value={balance.used} onChange={(used) => change(index, { used })} />
                <Field label={t("settings.balances.total")} value={balance.total} onChange={(total) => change(index, { total })} />
                <Field
                  label={t("settings.balances.divisor")}
                  value={balance.divisor}
                  onChange={(divisor) => change(index, { divisor })}
                />
                <Field
                  label={t("settings.balances.currency")}
                  value={balance.currency}
                  onChange={(currency) => change(index, { currency: currency.toUpperCase() })}
                />
                <label className="block text-xs text-muted-foreground">
                  <span className="mb-0.5 block">{t("settings.balances.auth")}</span>
                  <select
                    value={balance.auth || "bearer"}
                    onChange={(e) => change(index, { auth: e.target.value as BalanceEndpoint["auth"] })}
                    className="fluent-control w-full"
                  >
                    <option value="bearer">Authorization: Bearer</option>
                    <option value="x-api-key">x-api-key</option>
                  </select>
                </label>
              </div>
            )}
            <button
              type="button"
              className="text-xs text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setStatus(null)
                setBalances(balances.filter((_, i) => i !== index))
              }}
            >
              {t("settings.balances.remove")}
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          {balances.length < MAX_BALANCES && (
            <button
              type="button"
              className="fluent-control px-3"
              onClick={() => {
                setStatus(null)
                setBalances([...balances, blank()])
              }}
            >
              {t("settings.balances.add")}
            </button>
          )}
          <button type="button" className="fluent-control px-3" onClick={() => void save()}>
            {t("settings.balances.save")}
          </button>
          {status && (
            <span className={cn("text-xs", status === "saved" ? "text-muted-foreground" : "text-destructive")}>
              {t(status === "saved" ? "settings.balances.saved" : status === "broken" ? "settings.configBroken" : "settings.balances.invalid")}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("settings.balances.hint")}</p>
      </div>
    </SettingsSection>
  )
}
