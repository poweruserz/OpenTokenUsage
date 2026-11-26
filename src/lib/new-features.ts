import { createContext, useEffect, useState } from "react"
import { loadSeenNewFeatures, saveSeenNewFeatures } from "@/lib/settings"
import { useAppUiStore } from "@/stores/app-ui-store"

/**
 * Settings cards with something added in the last two releases: a "New" badge on the card and a dot on its
 * group until that group was opened once (`seenNewFeatures`, shown until the next visit). Drop an entry
 * once a release ships two versions after its `since` (new-features.test.ts fails until then).
 */
export const NEW_FEATURES = {
  cards: { since: "0.9.2", category: "usage" },
  claudeCode: { since: "0.9.2", category: "providers" },
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

// Reads and writes one after another, so quick group switches never drop one.
let chain: Promise<unknown> = Promise.resolve()
// The badges of the current visit, read once: the page remounts within a visit (a language switch, strict
// mode's double effects), and a second read would already see the groups opened since.
let visit: Promise<Set<NewFeatureId>> | null = null

function openedGroup(category: string) {
  chain = chain
    .then(async () => {
      const next = seenAfterOpening(await loadSeenNewFeatures(), category)
      if (next) await saveSeenNewFeatures(next)
    })
    .catch((error) => console.error("Failed to record the seen settings:", error))
}

/**
 * The badges for one visit to Settings (a group's badges stay while it's looked at), and every group opened
 * (`opened`, the first one included) recorded as seen for the next visit.
 */
export function useNewFeatures(firstCategory: string) {
  const [shown, setShown] = useState<ReadonlySet<NewFeatureId>>(new Set())

  useEffect(() => {
    let mounted = true
    if (!visit) {
      visit = chain.then(async () => shownNewFeatures(await loadSeenNewFeatures())).catch((error) => {
        console.error("Failed to read the seen settings:", error)
        return new Set<NewFeatureId>()
      })
      chain = visit
    }
    void visit.then((set) => mounted && setShown(set))
    openedGroup(firstCategory)
    return () => {
      mounted = false
      // Leaving Settings ends the visit; a remount while it's still shown doesn't.
      if (useAppUiStore.getState().activeView !== "settings") visit = null
    }
  }, [firstCategory])

  return { shown, opened: openedGroup }
}
