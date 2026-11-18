import { insertAccount, isAccountId, isWslId } from "@/lib/accounts"
import { backupStore, DEFAULT_ALERT_SETTINGS, DEFAULT_TASKBAR_STRIP_STYLE, normalizeAlertSettings, PROVIDER_DETECTION_KEY } from "@/lib/settings"

/**
 * The preferences a settings backup carries (store keys). Left out: accounts and logins (never in
 * this store), the panel's and desktop widgets' positions, sent-notification keys, and update and star-prompt state,
 * which belong to one machine or one moment. A new preference key belongs here too.
 */
export const BACKUP_KEYS = [
  "alertSettings",
  "autoUpdateInterval",
  "capturePrivacy",
  "cardFeatures",
  "claudeDesktopLogin",
  "collapsedSections",
  "currency",
  "desktopWidgets",
  // Saved with collapsedSections: without it, a restored list looks older than "year" and closes it.
  "detailSectionsSeen",
  "displayMode",
  "glass",
  "globalShortcut",
  "language",
  "lineLayouts",
  "menubarIconStyle",
  "navRight",
  "paceWorkdays",
  "panelPinned",
  "panelWidth",
  "planPrices",
  "plugins",
  "projectBudgets",
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
  "whatsNewAfterUpdate",
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
    case "projectBudgets":
    case "planPrices":
    case "lineLayouts":
      return mergeCardMap(has ? imported : {}, local)
    case "taskbarStripStyle": {
      // 0.9.1 and later always save a style (`loadTaskbarStripStyle`): one without came from 0.8.6 or
      // older, whose default colored by usage.
      const base =
        has && Object.keys(asObject(imported)).length > 0 ? asObject(imported) : { ...DEFAULT_TASKBAR_STRIP_STYLE, colorMode: "heat" }
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
 * Every preference back to its default (Settings → Reset all settings): restores a backup that holds
 * only this PC's providers (which cards are on, in what order) and project budgets, so those and
 * everything a backup never touches (accounts, logins, this PC's sound file) stay.
 */
export async function resetAllSettings(): Promise<void> {
  // Defaults as a new install has them (usage colors off, the panel's spot remembered), not an old install's.
  const kept: Record<string, unknown> = { taskbarStripStyle: DEFAULT_TASKBAR_STRIP_STYLE, rememberPanelPosition: true }
  for (const key of ["plugins", "projectBudgets"] as const) {
    const value = await backupStore.get(key)
    if (value !== undefined) kept[key] = value
  }
  // With "Remember position" back on, an old dragged spot would keep the panel out of its default corner.
  await backupStore.delete("panelPosition")
  await restore(kept, true)
}

/**
 * Makes this PC's preferences the backup's: keys the backup has are written (each loader checks
 * its value when the app starts again); keys it lacks were at their default there and are removed
 * here, so they go back to it. Everything is worked out before the first write.
 */
export async function restoreSettingsBackup(text: string): Promise<RestoreResult> {
  const settings = backupSettings(text)
  if (!settings) return { ok: false, reason: "notBackup" }
  await restore(settings, false)
  return { ok: true }
}

/** `reset`: this PC's extra-account preferences go back to their defaults too, not kept as an import keeps them. */
async function restore(settings: Record<string, unknown>, reset: boolean): Promise<void> {
  const writes: [string, unknown][] = []
  for (const key of BACKUP_KEYS) {
    const has = Object.prototype.hasOwnProperty.call(settings, key)
    let local = await backupStore.get(key)
    // The providers and budgets a reset keeps are this PC's own already; the sound file stays choosable.
    if (reset && key === "alertSettings") local = { ...asObject(local), providerLevels: {} }
    else if (reset && key !== "plugins" && key !== "projectBudgets") local = undefined
    const value = restoredValue(key, has, settings[key], local)
    if (value !== KEEP) writes.push([key, value])
  }
  for (const [key, value] of writes) {
    if (value === undefined) await backupStore.delete(key)
    else await backupStore.set(key, value)
    // The backup decides the cards now: a first-run detection still pending would turn its off ones on.
    if (key === "plugins") await backupStore.delete(PROVIDER_DETECTION_KEY)
  }
  await backupStore.save()
}
