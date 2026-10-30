import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { LANGUAGES, useLocaleStore } from "@/lib/i18n"
import { getPluginErrorAction, PLUGIN_ERROR_PATTERNS, translatePluginError } from "@/lib/plugin-errors"
import enUS, { type PluginErrorKey } from "@/locales/plugin-errors/en-US"
import deDE from "@/locales/plugin-errors/de-DE"
import es419 from "@/locales/plugin-errors/es-419"
import esES from "@/locales/plugin-errors/es-ES"
import frFR from "@/locales/plugin-errors/fr-FR"
import itIT from "@/locales/plugin-errors/it-IT"
import jaJP from "@/locales/plugin-errors/ja-JP"
import koKR from "@/locales/plugin-errors/ko-KR"
import ptBR from "@/locales/plugin-errors/pt-BR"
import trTR from "@/locales/plugin-errors/tr-TR"
import zhCN from "@/locales/plugin-errors/zh-CN"

// Every message plugins/<id>/plugin.js, runtime.rs/lib.rs and use-probe-*.ts can show, with the key it maps to.
const FIXTURES: [string, PluginErrorKey][] = [
  // shared
  ["Request failed. Check your connection.", "requestFailed"], // amp, minimax, opencode-go, synthetic
  ["Request failed (HTTP 500). Try again later.", "requestFailedHttp"], // amp, minimax, opencode-go
  ["Request failed (HTTP 502)", "requestFailedHttpShort"], // synthetic
  ["Could not parse usage data.", "parseFailed"], // amp, minimax, opencode-go, synthetic
  ["Usage request failed. Check your connection.", "usageRequestFailed"],
  ["Usage request failed (HTTP 503). Try again later.", "usageRequestFailedHttp"],
  ["Usage request failed after refresh. Try again.", "usageFailedAfterRefresh"],
  ["Usage response invalid. Try again later.", "usageResponseInvalid"],
  // amp
  ["Amp not installed. Install Amp Code to get started.", "notInstalled"],
  ["Session expired. Re-authenticate in Amp Code.", "sessionExpiredReauthIn"],
  // antigravity
  ["Start Antigravity or run `agy` and try again.", "startAppOrRun"],
  // claude
  ["Not logged in. Run `claude` to authenticate.", "notLoggedInRun"],
  ["Session expired. Run `claude` to log in again.", "sessionExpiredRun"],
  ["Token expired. Run `claude` to log in again.", "tokenExpiredRun"],
  ["Rate limited by Anthropic, try again later", "rateLimited"],
  ["Rate limited by Anthropic, retry in ~7m", "rateLimitedRetry"],
  // codex
  ["Not logged in. Run `codex` to authenticate.", "notLoggedInRun"],
  ["Session expired. Run `codex` to log in again.", "sessionExpiredRun"],
  ["Token conflict. Run `codex` to log in again.", "tokenConflictRun"],
  ["Token revoked. Run `codex` to log in again.", "tokenRevokedRun"],
  ["Token expired. Run `codex` to log in again.", "tokenExpiredRun"],
  ["Usage not available for API key.", "usageNotForApiKey"],
  // copilot
  ["Not logged in. Run `gh auth login` first.", "notLoggedInRunFirst"],
  ["Token invalid. Run `gh auth login` to re-authenticate.", "tokenInvalidRun"],
  // cursor
  ["Session expired. Sign in via Cursor app or run `agent login`.", "sessionExpiredSignInOrRun"],
  ["Token expired. Sign in via Cursor app or run `agent login`.", "tokenExpiredSignInOrRun"],
  ["Not logged in. Sign in via Cursor app or run `agent login`.", "notLoggedInSignInOrRun"],
  ["Enterprise usage data unavailable. Try again later.", "enterpriseUsageUnavailable"],
  ["Team request-based usage data unavailable. Try again later.", "teamRequestUsageUnavailable"],
  ["Cursor request-based usage data unavailable. Try again later.", "requestUsageUnavailable"],
  ["No active Cursor subscription.", "noActiveSubscription"],
  ["Total usage limit missing from API response.", "totalLimitMissing"],
  // devin
  ["Run devin auth login or sign in to Devin and try again.", "runOrSignIn"],
  ["Devin quota data unavailable. Try again later.", "quotaUnavailable"],
  // factory (droid)
  ["Session expired. Run `droid` to log in again.", "sessionExpiredRun"],
  ["Not logged in. Run `droid` to authenticate.", "notLoggedInRun"],
  ["Invalid auth file. Run `droid` to authenticate.", "invalidAuthFileRun"],
  ["Token expired. Run `droid` to log in again.", "tokenExpiredRun"],
  ["Usage response missing data. Try again later.", "usageResponseMissingData"],
  // grok
  ["Grok not logged in. Run `grok login`.", "productNotLoggedInRun"],
  ["Grok auth expired. Run `grok login` again.", "productAuthExpiredRun"],
  ["Grok auth invalid. Run `grok login` again.", "productAuthInvalidRun"],
  ["Grok billing response changed.", "billingResponseChanged"],
  ["Grok billing request failed. Check your connection.", "billingRequestFailed"],
  ["Grok billing request failed (HTTP 500). Try again later.", "billingRequestFailedHttp"],
  // jetbrains-ai-assistant
  [
    "JetBrains AI Assistant quota data unavailable. Open AI Assistant once and try again.",
    "quotaUnavailableOpenOnce",
  ],
  [
    "JetBrains AI Assistant not detected. Open a JetBrains IDE with AI Assistant enabled.",
    "jetbrainsNotDetected",
  ],
  // kimi
  ["Session expired. Run `kimi login` to authenticate.", "sessionExpiredRunAuth"],
  ["Not logged in. Run `kimi login` to authenticate.", "notLoggedInRun"],
  ["Token expired. Run `kimi login` to authenticate.", "tokenExpiredRunAuth"],
  // kiro
  ["Open Kiro and sign in, then try again.", "openAppSignIn"],
  ["Kiro session expired. Open Kiro and sign in again.", "productSessionExpiredOpenApp"],
  [
    "Kiro usage data unavailable. Open the Kiro account dashboard once and try again.",
    "usageUnavailableOpenDashboard",
  ],
  // minimax
  ["Session expired. Check your MiniMax API key.", "sessionExpiredCheckKey"],
  ["MiniMax API error: invalid params", "apiError"],
  ["MiniMax API error (status 2013).", "apiErrorStatus"],
  ["MiniMax API key missing. Set MINIMAX_API_KEY or MINIMAX_CN_API_KEY.", "apiKeyMissingSetEnv"],
  // opencode-go
  [
    "Couldn't read OpenCode's auth.json. Check its file permissions or log into OpenCode Go again.",
    "authFileUnreadable",
  ],
  [
    "Couldn't read OpenCode's opencode-next.db. Check its file permissions or log into OpenCode Go again.",
    "authFileUnreadable",
  ],
  ["OpenCode Go not detected. Log in with OpenCode Go first.", "notDetectedLogIn"],
  ["OpenCode Go key was rejected. Log into OpenCode Go again.", "keyRejected"],
  ["No OpenCode Go subscription on this key.", "noSubscriptionOnKey"],
  // synthetic
  [
    "Synthetic API key not found. Set SYNTHETIC_API_KEY or add key to ~/.pi/agent/auth.json",
    "apiKeyNotFoundSetEnvOrFile",
  ],
  ["API key invalid or expired. Check your Synthetic API key.", "apiKeyInvalidOrExpired"],
  // zai
  ["API key invalid. Check your Z.ai API key.", "apiKeyInvalid"],
  ["No ZAI_API_KEY found. Set up environment variable first.", "envKeyNotFound"],
  // host (runtime.rs, lib.rs) and app (use-probe-*.ts)
  ["Probe crashed", "probeCrashed"],
  ["probe timed out after 15s", "probeTimedOut"],
  ["probe timed out after 5ms", "probeTimedOut"],
  ["probe timed out after 1.500s", "probeTimedOut"],
  ["The plugin failed, try again or contact plugin author.", "pluginFailed"],
  ["Failed to start probe", "probeStartFailed"],
  ["Couldn't update data. Try again?", "updateFailed"],
  // wsl.rs
  ["WSL isn't running. Start it to update this card.", "wslNotRunning"],
]

const DICTS = {
  "en-US": enUS,
  "fr-FR": frFR,
  "de-DE": deDE,
  "it-IT": itIT,
  "ja-JP": jaJP,
  "ko-KR": koKR,
  "pt-BR": ptBR,
  "es-419": es419,
  "es-ES": esES,
  "tr-TR": trTR,
  "zh-CN": zhCN,
}

const placeholders = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
const groupNames = (pattern: RegExp) => [...new Set([...pattern.source.matchAll(/\(\?<(\w+)>/g)].map((m) => m[1]))].sort()
const firstMatch = (message: string) => PLUGIN_ERROR_PATTERNS.find(({ pattern }) => pattern.test(message))?.key

describe("translatePluginError", () => {
  afterEach(() => useLocaleStore.getState().setPreference("en-US"))

  it("maps every known message to the expected key", () => {
    for (const [message, key] of FIXTURES) expect(firstMatch(message), message).toBe(key)
  })

  it("rebuilds the exact English message in en-US", () => {
    useLocaleStore.getState().setPreference("en-US")
    for (const [message] of FIXTURES) expect(translatePluginError(message)).toBe(message)
  })

  it("translates every known message in every other locale", () => {
    for (const { code } of LANGUAGES) {
      if (code === "en-US") continue
      useLocaleStore.getState().setPreference(code)
      for (const [message] of FIXTURES) {
        const out = translatePluginError(message)
        expect(out, `${code}: ${message}`).not.toBe(message)
        expect(out, `${code}: ${message}`).not.toMatch(/\{\w+\}/)
      }
    }
  })

  it("substitutes captures", () => {
    useLocaleStore.getState().setPreference("tr-TR")
    expect(translatePluginError("Not logged in. Run `kimi login` to authenticate.")).toBe(
      "Oturum açılmadı. Kimlik doğrulaması için `kimi login` komutunu çalıştırın.",
    )
    expect(translatePluginError("Usage request failed (HTTP 503). Try again later.")).toBe(
      "Kullanım isteği başarısız oldu (HTTP 503). Daha sonra yeniden deneyin.",
    )
    expect(translatePluginError("Rate limited by Anthropic, retry in ~7m")).toBe(
      "Anthropic hız sınırına ulaşıldı, ~7 dk sonra yeniden deneyin",
    )
    expect(translatePluginError("MiniMax API key missing. Set MINIMAX_API_KEY or MINIMAX_CN_API_KEY.")).toBe(
      "MiniMax API anahtarı eksik. MINIMAX_API_KEY veya MINIMAX_CN_API_KEY değişkenini ayarlayın.",
    )
    expect(translatePluginError("OpenCode Go key was rejected. Log into OpenCode Go again.")).toBe(
      "OpenCode Go anahtarı reddedildi. OpenCode Go hesabında yeniden oturum açın.",
    )
    expect(translatePluginError("probe timed out after 15s")).toBe("Veri sorgusu 15s sonra zaman aşımına uğradı")
  })

  it("passes unknown messages through unchanged", () => {
    useLocaleStore.getState().setPreference("tr-TR")
    expect(translatePluginError("quota exceeded for org")).toBe("quota exceeded for org")
    expect(translatePluginError("")).toBe("")
  })
})

describe("plugin error dictionaries", () => {
  it("covers every key with a pattern whose groups match the placeholders", () => {
    expect(new Set(PLUGIN_ERROR_PATTERNS.map((p) => p.key))).toEqual(new Set(Object.keys(enUS)))
    for (const { pattern, key } of PLUGIN_ERROR_PATTERNS) expect(groupNames(pattern), key).toEqual(placeholders(enUS[key]))
  })

  it("has a dictionary for every app language", () => {
    expect(Object.keys(DICTS).sort()).toEqual(LANGUAGES.map((l) => l.code).sort())
  })

  for (const [code, dict] of Object.entries(DICTS)) {
    it(`${code} has the en-US keys and placeholders`, () => {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(enUS).sort())
      for (const key of Object.keys(enUS) as PluginErrorKey[]) {
        expect(placeholders(dict[key]), `${code} ${key}`).toEqual(placeholders(enUS[key]))
      }
    })
  }
})

describe("getPluginErrorAction", () => {
  it("offers the login command or the missing API-key variables", () => {
    expect(getPluginErrorAction("Start Antigravity or run `agy` and try again.")).toEqual({ kind: "run", command: "agy" })
    expect(getPluginErrorAction("No ZAI_API_KEY found. Set up environment variable first.")).toEqual({
      kind: "env",
      names: ["ZAI_API_KEY"],
    })
    expect(getPluginErrorAction("MiniMax API key missing. Set MINIMAX_API_KEY or MINIMAX_CN_API_KEY.")).toEqual({
      kind: "env",
      names: ["MINIMAX_API_KEY", "MINIMAX_CN_API_KEY"],
    })
    expect(getPluginErrorAction("Request failed. Check your connection.")).toBeNull()
    expect(getPluginErrorAction("quota exceeded for org")).toBeNull()
  })

  it("every command a plugin asks for is on the host allow-list", () => {
    const rust = readFileSync("src-tauri/src/setup_actions.rs", "utf8")
    const allowList = rust.slice(rust.indexOf("ALLOWED_COMMANDS"), rust.indexOf("];"))
    for (const [message] of FIXTURES) {
      const action = getPluginErrorAction(message)
      if (action?.kind === "run") expect(allowList, message).toContain(`"${action.command}"`)
    }
  })
})
