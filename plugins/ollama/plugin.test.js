import { describe, expect, it } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const reply = (status, body) => ({ status, headers: {}, bodyText: typeof body === "string" ? body : JSON.stringify(body) })

const setup = (answers, installed = true) => {
  const ctx = makeCtx()
  if (installed) ctx.host.fs.writeText("~/.ollama/id_ed25519.pub", "key")
  ctx.host.http.request.mockImplementation((request) => {
    const path = new URL(request.url).pathname
    const answer = answers[path]
    if (answer instanceof Error) throw answer
    return answer ?? reply(404, "not found")
  })
  return ctx
}

describe("ollama plugin", () => {
  it("says Ollama isn't installed without asking anything", async () => {
    const plugin = await loadPlugin()
    const ctx = setup({}, false)
    expect(() => plugin.probe(ctx)).toThrow("Ollama not installed. Install Ollama to get started.")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("asks to start the server when nothing answers on its port", async () => {
    const plugin = await loadPlugin()
    expect(() => plugin.probe(setup({ "/api/version": new Error("refused") }))).toThrow(
      "Start Ollama or run `ollama serve` and try again."
    )
  })

  it("shows the installed models with their size on disk and the ones loaded now", async () => {
    const plugin = await loadPlugin()
    const ctx = setup({
      "/api/version": reply(200, { version: "0.12.3" }),
      "/api/tags": reply(200, { models: [{ name: "llama3:8b", size: 4_700_000_000 }, { name: "qwen3:4b", size: 2_500_000_000 }] }),
      "/api/ps": reply(200, { models: [{ name: "llama3:8b" }] }),
    })
    expect(plugin.probe(ctx)).toEqual({
      plan: "v0.12.3",
      lines: [
        { type: "text", label: "Installed models", value: "2 · 7.2 GB" },
        { type: "text", label: "Loaded now", value: "llama3:8b" },
      ],
    })
    expect(ctx.host.http.request.mock.calls[0][0].url).toBe("http://127.0.0.1:11434/api/version")
  })

  it("keeps the card when one list fails, and fails only when both do", async () => {
    const plugin = await loadPlugin()
    const partial = setup({
      "/api/version": reply(200, { version: "0.12.3" }),
      "/api/tags": reply(200, { models: [] }),
      "/api/ps": reply(500, "boom"),
    })
    expect(plugin.probe(partial).lines).toEqual([{ type: "text", label: "Installed models", value: "0 · 0.0 GB" }])
    const none = setup({ "/api/version": reply(200, { version: "0.12.3" }) })
    expect(() => plugin.probe(none)).toThrow("Usage response invalid. Try again later.")
  })

  it("says nothing is loaded with a dash, not English", async () => {
    const plugin = await loadPlugin()
    const ctx = setup({
      "/api/version": reply(200, {}),
      "/api/tags": reply(200, { models: [] }),
      "/api/ps": reply(200, { models: [] }),
    })
    const result = plugin.probe(ctx)
    expect(result.plan).toBeUndefined()
    expect(result.lines[1]).toEqual({ type: "text", label: "Loaded now", value: "—" })
  })
})
