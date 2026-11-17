import { describe, expect, it } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const LEDGER = "~/.qwen/usage/token-usage-2026-02.jsonl"
const rows = (...items) => items.map((item) => JSON.stringify(item)).join("\n") + "\n"
const requests = (result) => result.lines.map((line) => [line.label, line.value])

describe("qwen-code plugin", () => {
  it("says it's not installed, without a request, when ~/.qwen is missing", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    expect(() => plugin.probe(ctx)).toThrow("Qwen Code not installed. Install Qwen Code to get started.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("counts this month's answered requests and today's from the ledger", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    ctx.host.fs.writeText(
      LEDGER,
      rows(
        { localDate: "2026-02-02", model: "qwen3-coder-plus", totalTokens: 26644 },
        { localDate: "2026-02-01", model: "qwen3-coder-plus", totalTokens: 100 },
        { localDate: "2026-02-02", model: "qwen3-coder-plus", totalTokens: 0 }
      ) + "not json\n"
    )
    const result = plugin.probe(ctx)
    expect(result.plan).toBeUndefined()
    expect(requests(result)).toEqual([
      ["Requests today", "1"],
      ["Requests this month", "2"],
    ])
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("shows zeros on a new month and names a Token Plan setup", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    ctx.host.fs.writeText(
      "~/.qwen/settings.json",
      JSON.stringify({ model: { baseUrl: "https://token-plan.maas.qwencloudapi.com/compatible-mode/v1" } })
    )
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Token Plan")
    expect(requests(result)).toEqual([
      ["Requests today", "0"],
      ["Requests this month", "0"],
    ])
  })

  it("follows the active endpoint over a Token Plan entry left in providerMetadata", async () => {
    const plugin = await loadPlugin()
    const ctx = makeCtx()
    ctx.host.fs.writeText(
      "~/.qwen/settings.json",
      JSON.stringify({
        model: { baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1" },
        providerMetadata: { "token-plan": { version: "x" } },
      })
    )
    expect(plugin.probe(ctx).plan).toBeUndefined()
    ctx.host.fs.writeText("~/.qwen/settings.json", JSON.stringify({ providerMetadata: { "token-plan": { version: "x" } } }))
    expect(plugin.probe(ctx).plan).toBe("Token Plan")
  })
})
