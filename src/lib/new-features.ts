import { createContext, useCallback, useEffect, useRef, useState } from "react"
import { loadSeenNewFeatures, saveSeenNewFeatures } from "@/lib/settings"

/**
 * Settings cards with something added in the last two releases: a "New" badge on the card and a dot on its
 * group until that group was opened once (`seenNewFeatures`, shown until the next visit). Drop an entry
 * once a release ships two versions after its `since` (new-features.test.ts fails until then).
 */
export const NEW_FEATURES = {
  cards: { since: "0.9.1", category: "usage" },
  plans: { since: "0.9.1", category: "usage" },
  widgets: { since: "0.9.1", category: "taskbar" },
  stripLook: { since: "0.9.1", category: "taskbar" },
  theme: { since: "0.9.1", category: "appearance" },
  panel: { since: "0.9.1", category: "appearance" },
  balances: { since: "0.9.1", category: "providers" },
  claudeCode: { since: "0.9.2", category: "providers" },
  alerts: { since: "0.9.1", category: "notifications" },
  proxy: { since: "0.9.1", category: "app" },
  privacy: { since: "0.9.1", category: "app" },
  whatsNew: { since: "0.9.1", category: "app" },
  export: { since: "0.9.1", category: "app" },
  backup: { since: "0.9.1", category: "app" },
} as const satisfies Record<string, { since: string; category: string }>

export type NewFeatureId = keyof typeof NEW_FEATURES

const IDS = Object.keys(NEW_FEATURES) as NewFeatureId[]

/** The features still badged after `seen` ones were looked at. */
export function shownNewFeatures(seen: readonly string[]): Set<NewFeatureId> {
  return new Set(IDS.filter((id) => !seen.includes(id)))
}

/** `seen` once a settings group was opened: its features join it (null when nothing changes). */
export function seenAfterOpening(seen: readonly string[], category: string): string[] | null {
  const added = IDS.filter((id) => NEW_FEATURES[id].category === category && !seen.includes(id))
  return added.length > 0 ? [...seen, ...added] : null
}

export function hasNewFeature(shown: ReadonlySet<NewFeatureId>, category: string) {
  return IDS.some((id) => shown.has(id) && NEW_FEATURES[id].category === category)
}

/** What the open settings page badges; empty outside it. */
export const NewFeaturesContext = createContext<ReadonlySet<NewFeatureId>>(new Set())

/**
 * The badges for one visit to Settings: read once (so a group's badges stay while it's looked at), and every
 * group opened (`opened`, the first one included) is recorded as seen for the next visit.
 */
export function useNewFeatures(firstCategory: string) {
  const [shown, setShown] = useState<ReadonlySet<NewFeatureId>>(new Set())
  // Reads and writes one after another, so quick group switches never drop one.
  const chain = useRef<Promise<void>>(Promise.resolve())

  const opened = useCallback((category: string) => {
    chain.current = chain.current
      .then(async () => {
        const next = seenAfterOpening(await loadSeenNewFeatures(), category)
        if (next) await saveSeenNewFeatures(next)
      })
      .catch((error) => console.error("Failed to record the seen settings:", error))
  }, [])

  useEffect(() => {
    chain.current = chain.current
      .then(async () => setShown(shownNewFeatures(await loadSeenNewFeatures())))
      .catch((error) => console.error("Failed to read the seen settings:", error))
    opened(firstCategory)
  }, [firstCategory, opened])

  return { shown, opened }
}
