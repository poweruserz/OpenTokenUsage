import { insertAccount, isAccountId, isWslId } from "@/lib/accounts"
import { backupStore, DEFAULT_ALERT_SETTINGS, DEFAULT_TASKBAR_STRIP_STYLE, normalizeAlertSettings } from "@/lib/settings"

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

// Extra-account (`claude-1a2b3c4d`) and WSL (`claude-wsl-0011aabb`) cards exist on one PC only: every
// setting that names cards drops the backup's ones and keeps this PC's own entries.
const isLocalCard = (id: string) => isAccountId(id) || isWslId(id)
const basePlugin = (id: string) => id.replace(/-wsl-[0-9a-f]{8}$/, "").replace(/-[0-9a-f]{8}$/, "")
const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [])
const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

function mergeCardList(imported: unknown, local: unknown): string[] {
  return [...stringList(imported).filter((id) => !isLocalCard(id)), ...stringList(local).filter(isLocalCard)]
}

function mergeCardMap(imported: unknown, local: unknown): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(asObject(imported))) if (!isLocalCard(id)) merged[id] = value
  for (const [id, value] of Object.entries(asObject(local))) if (isLocalCard(id)) merged[id] = value
  return merged
}

/** This PC's cards stay in the imported order, right after their provider, with their on/off state. */
function withLocalCards(imported: Record<string, unknown>, local: unknown): Record<string, unknown> {
  let order = stringList(imported.order).filter((id) => !isLocalCard(id))
  const disabled = stringList(imported.disabled).filter((id) => !isLocalCard(id))
  const localDisabled = stringList(asObject(local).disabled)
  for (const id of stringList(asObject(local).order).filter(isLocalCard)) {
    order = insertAccount(order, id, basePlugin(id))
    if (localDisabled.includes(id)) disabled.push(id)
  }
  return { ...imported, order, disabled }
}

/**
 * Notification settings: the custom sound is a file in this PC's app data, which the backup
 * doesn't carry, so its name always stays this PC's, and so does the sound when the backup's is
 * "custom"; this PC's cards keep their own levels.
 */
function withLocalAlertSettings(imported: unknown, local: unknown): Record<string, unknown> {
  const base = asObject(imported)
  const localSettings = normalizeAlertSettings(local)
  return {
    ...base,
    sound: base.sound === "custom" ? localSettings.sound : base.sound,
    customSoundName: localSettings.customSoundName,
    providerLevels: mergeCardMap(base.providerLevels, asObject(local).providerLevels),
  }
}

const KEEP = Symbol("keep this PC's value")

/** What a key becomes: the value to store, `undefined` to remove it (its default), or KEEP. */
function restoredValue(key: (typeof BACKUP_KEYS)[number], has: boolean, imported: unknown, local: unknown): unknown {
  switch (key) {
    case "alertSettings":
      return withLocalAlertSettings(has ? imported : DEFAULT_ALERT_SETTINGS, local)
    case "plugins": {
      // A damaged or missing list would turn this PC's cards off as on a fresh install.
      const list = asObject(imported)
      return has && Array.isArray(list.order) && Array.isArray(list.disabled) ? withLocalCards(list, local) : KEEP
    }
    case "trayHiddenPlugins":
      return mergeCardList(has ? imported : [], local)
    case "taskbarStripStyle": {
      const base = has && Object.keys(asObject(imported)).length > 0 ? asObject(imported) : DEFAULT_TASKBAR_STRIP_STYLE
      const localStyle = asObject(local)
      return {
        ...base,
        // Not a list (null, or missing): the first enabled providers, as the loader reads it.
        providers: Array.isArray(base.providers) ? mergeCardList(base.providers, localStyle.providers) : null,
        lineModes: mergeCardMap(base.lineModes, localStyle.lineModes),
      }
    }
    case "trayProvider":
      if (!has) return undefined
      // The other PC's card can't be shown here: keep this PC's choice.
      return typeof imported === "string" && isLocalCard(imported) ? KEEP : imported
    default:
      return has ? imported : undefined
  }
}

/**
 * Makes this PC's preferences the backup's: keys the backup has are written (each loader checks
 * its value when the app starts again); keys it lacks were at their default there and are removed
 * here, so they go back to it. Everything is worked out before the first write.
 */
export async function restoreSettingsBackup(text: string): Promise<RestoreResult> {
  const settings = backupSettings(text)
  if (!settings) return { ok: false, reason: "notBackup" }
  const writes: [string, unknown][] = []
  for (const key of BACKUP_KEYS) {
    const has = Object.prototype.hasOwnProperty.call(settings, key)
    const value = restoredValue(key, has, settings[key], await backupStore.get(key))
    if (value !== KEEP) writes.push([key, value])
  }
  for (const [key, value] of writes) {
    if (value === undefined) await backupStore.delete(key)
    else await backupStore.set(key, value)
  }
  await backupStore.save()
  return { ok: true }
}
