import { create } from "zustand"
import { en, type Messages, type MessageKey } from "@/locales/en"
import { de } from "@/locales/de"
import { es419 } from "@/locales/es-419"
import { esES } from "@/locales/es-ES"
import { fr } from "@/locales/fr"
import { it } from "@/locales/it"
import { ja } from "@/locales/ja"
import { ko } from "@/locales/ko"
import { ptBR } from "@/locales/pt-BR"
import { tr } from "@/locales/tr"
import { zhCN } from "@/locales/zh-CN"

export type { MessageKey }

/** Picker order; `name` is the language's own name, `english` the subtitle. */
export const LANGUAGES = [
  { code: "en-US", name: "English (United States)", english: "English (United States)", messages: en },
  { code: "fr-FR", name: "Français (France)", english: "French (France)", messages: fr },
  { code: "de-DE", name: "Deutsch (Deutschland)", english: "German (Germany)", messages: de },
  { code: "it-IT", name: "Italiano (Italia)", english: "Italian (Italy)", messages: it },
  { code: "ja-JP", name: "日本語 (日本)", english: "Japanese (Japan)", messages: ja },
  { code: "ko-KR", name: "한국어 (대한민국)", english: "Korean (South Korea)", messages: ko },
  { code: "pt-BR", name: "Português (Brasil)", english: "Portuguese (Brazil)", messages: ptBR },
  { code: "es-419", name: "Español (Latinoamérica)", english: "Spanish (Latin America)", messages: es419 },
  { code: "es-ES", name: "Español (España)", english: "Spanish (Spain)", messages: esES },
  { code: "tr-TR", name: "Türkçe (Türkiye)", english: "Turkish (Türkiye)", messages: tr },
  { code: "zh-CN", name: "简体中文 (中国)", english: "Chinese (Simplified)", messages: zhCN },
] as const satisfies readonly { code: string; name: string; english: string; messages: Messages }[]

export type LanguageCode = (typeof LANGUAGES)[number]["code"]
/** "system" follows the Windows display language. */
export type LanguagePreference = "system" | LanguageCode

const BY_CODE = new Map<string, Messages>(LANGUAGES.map((l) => [l.code, l.messages]))

/** Best match for a BCP 47 tag: exact, then regional rules, then same base language. */
export function matchLanguage(tag: string): LanguageCode | null {
  const exact = LANGUAGES.find((l) => l.code.toLowerCase() === tag.toLowerCase())
  if (exact) return exact.code
  const [base, region = ""] = tag.toLowerCase().split("-")
  if (base === "es") return region === "es" || region === "" ? "es-ES" : "es-419"
  if (base === "zh") return "zh-CN"
  const sameBase = LANGUAGES.find((l) => l.code.toLowerCase().split("-")[0] === base)
  return sameBase ? sameBase.code : null
}

export function resolveLanguage(
  preference: LanguagePreference,
  systemTags: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language],
): LanguageCode {
  if (preference !== "system") return preference
  for (const tag of systemTags) {
    if (!tag) continue // navigator.language can be undefined outside a browser
    const match = matchLanguage(tag)
    if (match) return match
  }
  return "en-US"
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "system" || (typeof value === "string" && BY_CODE.has(value))
}

// Module-level current locale so plain helpers (reset/pace/tray text) can call t() too.
let current: LanguageCode = resolveLanguage("system")

type Vars = Record<string, string | number>

export function t(key: MessageKey, vars?: Vars): string {
  const template = BY_CODE.get(current)?.[key] ?? en[key]
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

/** Plugin line labels ("Session", "Weekly", ...) come from manifests; translate the known ones. */
export function tLabel(label: string): string {
  const key = `label.${label}` as MessageKey
  if (key in en) return t(key)
  // One of several of a kind ("Balance 2") keeps its number.
  const numbered = /^(.+) (\d+)$/.exec(label)
  const base = numbered && (`label.${numbered[1]}` as MessageKey)
  return base && base in en ? `${t(base)} ${numbered[2]}` : label
}

export function getLocale(): LanguageCode {
  return current
}

type LocaleStore = {
  preference: LanguagePreference
  locale: LanguageCode
  setPreference: (preference: LanguagePreference) => void
}

export const useLocaleStore = create<LocaleStore>((set) => ({
  preference: "system",
  locale: current,
  setPreference: (preference) => {
    current = resolveLanguage(preference)
    if (typeof document !== "undefined") document.documentElement.lang = current
    set({ preference, locale: current })
  },
}))
