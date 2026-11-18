import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { hasNewFeature, NEW_FEATURES, seenAfterOpening, shownNewFeatures } from "@/lib/new-features"

const ROOT = join(__dirname, "..", "..")
const parts = (version: string) => version.split(".").map(Number)
const atLeast = (version: string, floor: string) => {
  const [a, b] = [parts(version), parts(floor)]
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}

describe("new-feature badges", () => {
  it("badge everything until its group was opened, and only that group's features go", () => {
    expect(shownNewFeatures([]).has("widgets")).toBe(true)
    const seen = seenAfterOpening([], "taskbar")
    expect(seen).toEqual(expect.arrayContaining(["widgets", "stripLook"]))
    expect(seen).not.toContain("proxy")
    const shown = shownNewFeatures(seen ?? [])
    expect(hasNewFeature(shown, "taskbar")).toBe(false)
    expect(hasNewFeature(shown, "app")).toBe(true)
    // Opening a group whose features were already seen changes nothing (no write).
    expect(seenAfterOpening(seen ?? [], "taskbar")).toBeNull()
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
