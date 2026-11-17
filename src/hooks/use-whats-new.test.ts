import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { whatsNewDue } from "@/hooks/use-whats-new"

describe("whatsNewDue", () => {
  it("shows once after an update, never on a new install or when turned off", () => {
    expect(whatsNewDue(true, "0.8.6", "0.8.7", false)).toBe(true) // WinGet or the installer
    expect(whatsNewDue(true, null, "0.8.7", true)).toBe(true) // in-app update from a version without it
    expect(whatsNewDue(true, null, "0.8.7", false)).toBe(false) // a new install
    expect(whatsNewDue(true, "0.8.7", "0.8.7", true)).toBe(false) // already shown
    expect(whatsNewDue(false, "0.8.6", "0.8.7", true)).toBe(false)
  })
})

it("ships no video for a version before this one", () => {
  // A video left from an earlier release would come back with the next update: delete it when the version moves on.
  const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version
  const parts = (v: string) => v.split(".").map(Number)
  const older = (a: string, b: string) => {
    const [x, y] = [parts(a), parts(b)]
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]
    return false
  }
  const videos = readdirSync("src-tauri/resources/whats-new").filter((name) => name.endsWith(".webm"))
  for (const name of videos) {
    expect(name, "named <version>.webm").toMatch(/^\d+\.\d+\.\d+\.webm$/)
    expect(older(name.slice(0, -".webm".length), version), `${name} is older than ${version}`).toBe(false)
  }
})
