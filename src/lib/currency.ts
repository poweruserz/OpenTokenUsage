import { formatFixedPrecisionNumber } from "@/lib/utils"

/** Currencies costs can be shown in (ISO 4217). Providers report them in US dollars. */
export const CURRENCIES = ["USD", "EUR", "GBP", "TRY", "JPY", "CNY", "KRW", "BRL", "INR", "CAD", "AUD", "CHF", "MXN"] as const
export type CurrencyCode = (typeof CURRENCIES)[number]

/**
 * The currency costs are shown in and how much of it one US dollar buys. The rate is entered by
 * hand: the app asks no exchange-rate service (no network beyond the providers, and the CSP).
 */
export type CurrencySetting = { code: CurrencyCode; rate: number }

export const DEFAULT_CURRENCY: CurrencySetting = { code: "USD", rate: 1 }

export function normalizeCurrency(value: unknown): CurrencySetting {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const code = (CURRENCIES as readonly unknown[]).includes(raw.code) ? (raw.code as CurrencyCode) : "USD"
  if (code === "USD") return DEFAULT_CURRENCY
  const rate = typeof raw.rate === "number" && Number.isFinite(raw.rate) && raw.rate > 0 ? raw.rate : 1
  return { code, rate }
}

/** A US-dollar amount in the chosen currency; dollars look as the card always showed them. */
export function formatMoney(usd: number, currency: CurrencySetting, locale: string): string {
  if (currency.code === "USD") return `$${formatFixedPrecisionNumber(usd)}`
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency.code }).format(usd * currency.rate)
}

const USD_AMOUNT = /\$(\d[\d,]*(?:\.\d+)?)/g

/**
 * Plugin text with dollar amounts ("$12.34 spent") in the chosen currency.
 * shortcut: every "$<number>" counts as US dollars (every provider bills in USD today); one that
 * bills in another dollar would need its line to say which.
 */
export function convertUsdText(text: string, currency: CurrencySetting, locale: string): string {
  if (currency.code === "USD") return text
  return text.replace(USD_AMOUNT, (_, amount: string) => formatMoney(Number(amount.replace(/,/g, "")), currency, locale))
}
