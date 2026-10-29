import { getLocale, type LanguageCode } from "@/lib/i18n"
import enUS, { type PluginErrorKey, type PluginErrorMessages } from "@/locales/plugin-errors/en-US"
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

const MESSAGES: Record<LanguageCode, PluginErrorMessages> = {
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

/**
 * English errors thrown by plugins (plugins/<id>/plugin.js) or made by the host (runtime.rs, lib.rs,
 * use-probe-*.ts). Named groups fill the matching {placeholders}. First match wins, so keep the
 * specific patterns ("Team ...") above the general ones ("{product} ...").
 */
export const PLUGIN_ERROR_PATTERNS: readonly { pattern: RegExp; key: PluginErrorKey }[] = [
  { pattern: /^Request failed\. Check your connection\.$/, key: "requestFailed" },
  { pattern: /^Request failed \(HTTP (?<status>\d+)\)\. Try again later\.$/, key: "requestFailedHttp" },
  { pattern: /^Request failed \(HTTP (?<status>\d+)\)$/, key: "requestFailedHttpShort" },
  { pattern: /^Could not parse usage data\.$/, key: "parseFailed" },
  { pattern: /^WSL isn't running\. Start it to update this card\.$/, key: "wslNotRunning" },

  { pattern: /^Usage request failed\. Check your connection\.$/, key: "usageRequestFailed" },
  { pattern: /^Usage request failed \(HTTP (?<status>\d+)\)\. Try again later\.$/, key: "usageRequestFailedHttp" },
  { pattern: /^Usage request failed after refresh\. Try again\.$/, key: "usageFailedAfterRefresh" },
  { pattern: /^Usage response invalid\. Try again later\.$/, key: "usageResponseInvalid" },
  { pattern: /^Usage response missing data\. Try again later\.$/, key: "usageResponseMissingData" },
  { pattern: /^Usage not available for API key\.$/, key: "usageNotForApiKey" },
  { pattern: /^Total usage limit missing from API response\.$/, key: "totalLimitMissing" },

  { pattern: /^Not logged in\. Run `(?<cmd>[^`]+)` to authenticate\.$/, key: "notLoggedInRun" },
  { pattern: /^Not logged in\. Run `(?<cmd>[^`]+)` first\.$/, key: "notLoggedInRunFirst" },
  { pattern: /^Session expired\. Run `(?<cmd>[^`]+)` to log in again\.$/, key: "sessionExpiredRun" },
  { pattern: /^Session expired\. Run `(?<cmd>[^`]+)` to authenticate\.$/, key: "sessionExpiredRunAuth" },
  { pattern: /^Token expired\. Run `(?<cmd>[^`]+)` to log in again\.$/, key: "tokenExpiredRun" },
  { pattern: /^Token expired\. Run `(?<cmd>[^`]+)` to authenticate\.$/, key: "tokenExpiredRunAuth" },
  { pattern: /^Token conflict\. Run `(?<cmd>[^`]+)` to log in again\.$/, key: "tokenConflictRun" },
  { pattern: /^Token revoked\. Run `(?<cmd>[^`]+)` to log in again\.$/, key: "tokenRevokedRun" },
  { pattern: /^Token invalid\. Run `(?<cmd>[^`]+)` to re-authenticate\.$/, key: "tokenInvalidRun" },
  { pattern: /^Invalid auth file\. Run `(?<cmd>[^`]+)` to authenticate\.$/, key: "invalidAuthFileRun" },

  { pattern: /^Not logged in\. Sign in via (?<app>.+?) app or run `(?<cmd>[^`]+)`\.$/, key: "notLoggedInSignInOrRun" },
  { pattern: /^Session expired\. Sign in via (?<app>.+?) app or run `(?<cmd>[^`]+)`\.$/, key: "sessionExpiredSignInOrRun" },
  { pattern: /^Token expired\. Sign in via (?<app>.+?) app or run `(?<cmd>[^`]+)`\.$/, key: "tokenExpiredSignInOrRun" },
  { pattern: /^Session expired\. Re-authenticate in (?<app>.+)\.$/, key: "sessionExpiredReauthIn" },
  { pattern: /^Start (?<app>.+?) or run `(?<cmd>[^`]+)` and try again\.$/, key: "startAppOrRun" },
  { pattern: /^Run (?<cmd>.+?) or sign in to (?<app>.+) and try again\.$/, key: "runOrSignIn" },
  { pattern: /^(?<product>.+?) not logged in\. Run `(?<cmd>[^`]+)`\.$/, key: "productNotLoggedInRun" },
  { pattern: /^(?<product>.+?) auth invalid\. Run `(?<cmd>[^`]+)` again\.$/, key: "productAuthInvalidRun" },
  { pattern: /^(?<product>.+?) auth expired\. Run `(?<cmd>[^`]+)` again\.$/, key: "productAuthExpiredRun" },
  { pattern: /^Open (?<app>.+?) and sign in, then try again\.$/, key: "openAppSignIn" },
  { pattern: /^(?<product>.+?) session expired\. Open (?<app>.+) and sign in again\.$/, key: "productSessionExpiredOpenApp" },

  { pattern: /^Session expired\. Check your (?<product>.+) API key\.$/, key: "sessionExpiredCheckKey" },
  { pattern: /^API key invalid\. Check your (?<product>.+) API key\.$/, key: "apiKeyInvalid" },
  { pattern: /^API key invalid or expired\. Check your (?<product>.+) API key\.$/, key: "apiKeyInvalidOrExpired" },
  { pattern: /^(?<product>.+?) API key missing\. Set (?<env>[A-Z0-9_]+) or (?<env2>[A-Z0-9_]+)\.$/, key: "apiKeyMissingSetEnv" },
  { pattern: /^(?<product>.+?) API key not found\. Set (?<env>[A-Z0-9_]+) or add key to (?<path>\S+)$/, key: "apiKeyNotFoundSetEnvOrFile" },
  { pattern: /^No (?<env>[A-Z0-9_]+) found\. Set up environment variable first\.$/, key: "envKeyNotFound" },
  { pattern: /^(?<product>.+?) key was rejected\. Log into \k<product> again\.$/, key: "keyRejected" },
  { pattern: /^No (?<product>.+) subscription on this key\.$/, key: "noSubscriptionOnKey" },
  { pattern: /^(?<product>.+?) not detected\. Log in with \k<product> first\.$/, key: "notDetectedLogIn" },
  {
    pattern: /^Couldn't read (?<app>.+?)'s (?<file>\S+)\. Check its file permissions or log into (?<product>.+) again\.$/,
    key: "authFileUnreadable",
  },

  { pattern: /^(?<product>.+?) not installed\. Install (?<app>.+) to get started\.$/, key: "notInstalled" },
  { pattern: /^No active (?<product>.+) subscription\.$/, key: "noActiveSubscription" },
  { pattern: /^No active (?<plan>.+?)\. Subscribe at (?<url>\S+) to see usage\.$/, key: "noActivePlanSubscribe" },
  { pattern: /^Enterprise usage data unavailable\. Try again later\.$/, key: "enterpriseUsageUnavailable" },
  { pattern: /^Team request-based usage data unavailable\. Try again later\.$/, key: "teamRequestUsageUnavailable" },
  { pattern: /^(?<product>.+?) request-based usage data unavailable\. Try again later\.$/, key: "requestUsageUnavailable" },
  { pattern: /^(?<product>.+?) quota data unavailable\. Try again later\.$/, key: "quotaUnavailable" },
  { pattern: /^(?<product>.+?) quota data unavailable\. Open (?<app>.+) once and try again\.$/, key: "quotaUnavailableOpenOnce" },
  {
    pattern: /^(?<product>.+?) usage data unavailable\. Open the \k<product> account dashboard once and try again\.$/,
    key: "usageUnavailableOpenDashboard",
  },
  {
    pattern: /^JetBrains AI Assistant not detected\. Open a JetBrains IDE with AI Assistant enabled\.$/,
    key: "jetbrainsNotDetected",
  },
  { pattern: /^(?<product>.+?) billing response changed\.$/, key: "billingResponseChanged" },
  { pattern: /^(?<product>.+?) billing request failed\. Check your connection\.$/, key: "billingRequestFailed" },
  {
    pattern: /^(?<product>.+?) billing request failed \(HTTP (?<status>\d+)\)\. Try again later\.$/,
    key: "billingRequestFailedHttp",
  },
  { pattern: /^(?<product>.+?) API error: (?<detail>.+)$/, key: "apiError" },
  { pattern: /^(?<product>.+?) API error \(status (?<code>-?\d+)\)\.$/, key: "apiErrorStatus" },
  { pattern: /^Rate limited by (?<provider>.+?), try again later$/, key: "rateLimited" },
  { pattern: /^Rate limited by (?<provider>.+?), retry in ~(?<minutes>\d+)m$/, key: "rateLimitedRetry" },

  { pattern: /^Probe crashed$/, key: "probeCrashed" },
  { pattern: /^probe timed out after (?<duration>\d+(?:\.\d+)?m?s)$/, key: "probeTimedOut" },
  { pattern: /^The plugin failed, try again or contact plugin author\.$/, key: "pluginFailed" },
  { pattern: /^Failed to start probe$/, key: "probeStartFailed" },
  { pattern: /^Couldn't update data\. Try again\?$/, key: "updateFailed" },
]

function matchPluginError(message: string) {
  for (const { pattern, key } of PLUGIN_ERROR_PATTERNS) {
    const match = pattern.exec(message)
    if (match) return { key, vars: match.groups ?? {} }
  }
  return null
}

/** Plugin error in the app language; unknown messages (e.g. raw server text) come back unchanged. */
export function translatePluginError(message: string): string {
  const match = matchPluginError(message)
  if (!match) return message
  return MESSAGES[getLocale()][match.key].replace(/\{(\w+)\}/g, (text, name: string) => match.vars[name] ?? text)
}

export type PluginErrorAction = { kind: "run"; command: string } | { kind: "env"; names: string[] }

/**
 * One-click fix for a known error: a login command to run in a terminal, or API-key environment
 * variables to set. The host only runs commands on its own allow-list (setup_actions.rs).
 */
export function getPluginErrorAction(message: string): PluginErrorAction | null {
  const vars = matchPluginError(message)?.vars
  if (vars?.cmd) return { kind: "run", command: vars.cmd }
  if (vars?.env) return { kind: "env", names: [vars.env, vars.env2].filter((name) => !!name) }
  return null
}
