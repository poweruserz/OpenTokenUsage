import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { hasNewFeature, NEW_FEATURES, seenAfterOpening, shownNewFeatures, useNewFeatures } from "@/lib/new-features"
import { useAppUiStore } from "@/stores/app-ui-store"

vi.mock("@/lib/settings", () => {
  let seen: string[] = []
  return {
    loadSeenNewFeatures: vi.fn(async () => seen),
    saveSeenNewFeatures: vi.fn(async (ids: string[]) => {
      seen = ids
    }),
  }
})

const ROOT = join(__dirname, "..", "..")
const parts = (version: string) => version.split(".").map(Number)
const atLeast = (version: string, floor: string) => {
  const [a, b] = [parts(version), parts(floor)]
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}

describe("new-feature badges", () => {
  it("badge everything until its group was opened, and only that group's features go", () => {
    expect(shownNewFeatures([]).has("cards")).toBe(true)
    const seen = seenAfterOpening([], "usage")
    expect(seen).toEqual(["cards"])
    expect(seen).not.toContain("claudeCode")
    const shown = shownNewFeatures(seen ?? [])
    expect(hasNewFeature(shown, "usage")).toBe(false)
    expect(hasNewFeature(shown, "providers")).toBe(true)
    // Opening a group whose features were already seen changes nothing (no write).
    expect(seenAfterOpening(seen ?? [], "usage")).toBeNull()
  })

  it("a remount within one visit (a language switch) keeps the badges; leaving Settings ends the visit", async () => {
    useAppUiStore.setState({ activeView: "settings" })
    const first = renderHook(() => useNewFeatures("usage"))
    await waitFor(() => expect(first.result.current.shown.has("cards")).toBe(true))
    first.unmount()
    const again = renderHook(() => useNewFeatures("usage"))
    await waitFor(() => expect(again.result.current.shown.has("cards")).toBe(true))
    useAppUiStore.setState({ activeView: "home" })
    again.unmount()
    useAppUiStore.setState({ activeView: "settings" })
    const next = renderHook(() => useNewFeatures("usage"))
    await waitFor(() => expect(next.result.current.shown.has("claudeCode")).toBe(true))
    expect(next.result.current.shown.has("cards")).toBe(false)
    next.unmount()
  })

  it("lists only features of this release and the one before (drop older ones at release time)", () => {
    const version: string = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version
    const releases = [...readFileSync(join(ROOT, "CHANGELOG.md"), "utf8").matchAll(/^## v(\d+\.\d+\.\d+)/gm)].map((m) => m[1])
    const at = releases.indexOf(version)
    const floor = at >= 0 && releases[at + 1] ? releases[at + 1] : version
    for (const [id, { since }] of Object.entries(NEW_FEATURES)) {
      expect(atLeast(since, floor), `${id} (since ${since}) is older than ${floor}`).toBe(true)
    }
  })

  it("every listed feature badges a settings card", () => {
    const files = [
      join(ROOT, "src", "pages", "settings.tsx"),
      ...readdirSync(join(ROOT, "src", "components"))
        .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
        .map((name) => join(ROOT, "src", "components", name)),
    ]
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n")
    for (const id of Object.keys(NEW_FEATURES)) expect(source, id).toContain(`newFeature="${id}"`)
  })
})
