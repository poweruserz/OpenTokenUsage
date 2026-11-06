import { insertAccount, isAccountId, isWslId } from "@/lib/accounts"
import { backupStore, DEFAULT_ALERT_SETTINGS, normalizeAlertSettings } from "@/lib/settings"

/**
 * The preferences a settings backup carries (store keys). Left out: accounts and logins (never in
 * this store), the panel's position, sent-notification keys, and update and star-prompt state,
 * which belong to one machine or one moment. A new preference key belongs here too.
 */
export const BACKUP_KEYS = [
  "alertSettings",
  "autoUpdateInterval",
  "currency",
  "displayMode",
  "globalShortcut",
  "language",
  "menubarIconStyle",
  "paceWorkdays",
  "panelPinned",
  "plugins",
  "rememberPanelPosition",
  "resetTimerDisplayMode",
  "startOnLogin",
  "taskbarStrip",
  "taskbarStripStyle",
  "themeMode",
  "timeFormatMode",
  "trayHiddenPlugins",
  "trayLogoColors",
  "trayMetric",
  "trayPercentColor",
  "trayProvider",
  "usageAlerts",
] as const

const BACKUP_APP = "OpenTokenUsage"

export async function buildSettingsBackup(): Promise<string> {
  const settings: Record<string, unknown> = {}
  for (const key of BACKUP_KEYS) {
    const value = await backupStore.get(key)
    if (value !== undefined) settings[key] = value
  }
  return JSON.stringify({ app: BACKUP_APP, version: 1, settings })
}

export type RestoreResult = { ok: true } | { ok: false; reason: "notBackup" }

function backupSettings(text: string): Record<string, unknown> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const raw = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  const settings = raw.settings
  if (raw.app !== BACKUP_APP || !settings || typeof settings !== "object" || Array.isArray(settings)) return null
  return settings as Record<string, unknown>
}

/**
 * A custom sound is a file in this PC's app data, which the backup doesn't carry: the custom
 * file's name always stays this PC's, and so does the sound when the backup's is "custom".
 */
async function withLocalSound(imported: unknown): Promise<unknown> {
  if (!imported || typeof imported !== "object") return imported
  const raw = imported as Record<string, unknown>
  const local = normalizeAlertSettings(await backupStore.get("alertSettings"))
  return {
    ...raw,
    sound: raw.sound === "custom" ? local.sound : raw.sound,
    customSoundName: local.customSoundName,
  }
}

const isLocalCard = (id: string) => isAccountId(id) || isWslId(id)
const basePlugin = (id: string) => id.replace(/-wsl-[0-9a-f]{8}$/, "").replace(/-[0-9a-f]{8}$/, "")
const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [])

/**
 * Extra-account and WSL cards belong to this PC: keep its own, with their on/off state, in the
 * imported order; the other PC's are dropped.
 */
async function withLocalCards(imported: unknown): Promise<unknown> {
  if (!imported || typeof imported !== "object") return imported
  const raw = imported as Record<string, unknown>
  const local = (await backupStore.get("plugins")) as Record<string, unknown> | undefined
  let order = stringList(raw.order).filter((id) => !isLocalCard(id))
  const disabled = stringList(raw.disabled).filter((id) => !isLocalCard(id))
  const localDisabled = stringList(local?.disabled)
  for (const id of stringList(local?.order).filter(isLocalCard)) {
    order = insertAccount(order, id, basePlugin(id))
    if (localDisabled.includes(id)) disabled.push(id)
  }
  return { ...raw, order, disabled }
}

/**
 * Makes this PC's preferences the backup's: keys the backup has are written (each loader checks
 * its value when the app starts again); keys it lacks were at their default there and are removed
 * here, so they go back to it. This PC keeps its provider list when a backup has none.
 */
export async function restoreSettingsBackup(text: string): Promise<RestoreResult> {
  const settings = backupSettings(text)
  if (!settings) return { ok: false, reason: "notBackup" }
  for (const key of BACKUP_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(settings, key)) {
      // Defaults, but this PC's custom sound file stays choosable (its name lives in alertSettings).
      if (key === "alertSettings") await backupStore.set(key, await withLocalSound(DEFAULT_ALERT_SETTINGS))
      else if (key !== "plugins") await backupStore.delete(key)
      continue
    }
    const value =
      key === "alertSettings"
        ? await withLocalSound(settings[key])
        : key === "plugins"
          ? await withLocalCards(settings[key])
          : settings[key]
    await backupStore.set(key, value)
  }
  await backupStore.save()
  return { ok: true }
}
