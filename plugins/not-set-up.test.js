import { readdirSync } from "node:fs"
import { expect, it } from "vitest"
import { isNotSetUpError } from "../src/lib/plugin-errors"
import { makeCtx } from "./test-helpers.js"

// A new install turns on the providers whose first probe finds something (use-provider-detection.ts).
// So with nothing set up, every shipped plugin (copy-bundled.cjs skips mock) must say so in words
// isNotSetUpError knows, without a request: anything else would turn its card on for everyone.
const ids = readdirSync("plugins", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "mock")
  .map((entry) => entry.name)

it("every plugin says 'not set up' when nothing of it is on the PC", async () => {
  expect(ids.length).toBeGreaterThan(10)
  for (const id of ids) {
    await import(/* @vite-ignore */ `./${id}/plugin.js`)
    const plugin = globalThis.__openusage_plugin
    const ctx = makeCtx()
    ctx.app.platform = "windows"
    let message = "(no error)"
    try {
      await plugin.probe(ctx)
    } catch (error) {
      message = String(error?.message ?? error)
    }
    expect(isNotSetUpError(message), `${id}: ${message}`).toBe(true)
    expect(ctx.host.http.request, id).not.toHaveBeenCalled()
  }
})
