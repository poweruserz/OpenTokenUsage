(function () {
  // Ollama's own server on this PC: no account, no key, no quota. The card shows what it has and
  // what is loaded now. Endpoints as Pane reads them (github.com/ItsJazii/pane, MIT).
  var BASE = "http://127.0.0.1:11434"
  // Ollama keeps its models here; looked at before any request, so a PC without it stays quiet.
  var HOME = "~/.ollama"

  function getJson(ctx, path) {
    var result = ctx.util.requestJson({ method: "GET", url: BASE + path, timeoutMs: 5000 })
    var status = result.resp.status
    if (status < 200 || status >= 300) throw "Request failed (HTTP " + status + "). Try again later."
    return result.json
  }

  // A model list that didn't come is left off the card rather than failing it.
  function tryJson(ctx, path) {
    try {
      return getJson(ctx, path)
    } catch (e) {
      ctx.host.log.warn(path + " failed: " + String(e))
      return null
    }
  }

  function probe(ctx) {
    if (!ctx.host.fs.exists(HOME)) throw "Ollama not installed. Install Ollama to get started."
    var version
    try {
      version = getJson(ctx, "/api/version")
    } catch (e) {
      ctx.host.log.warn("server not answering: " + String(e))
      throw "Start Ollama or run `ollama serve` and try again."
    }

    var lines = []
    var tags = tryJson(ctx, "/api/tags")
    if (tags && Array.isArray(tags.models)) {
      var bytes = 0
      tags.models.forEach(function (model) {
        if (model && typeof model.size === "number" && model.size > 0) bytes += model.size
      })
      lines.push(ctx.line.text({ label: "Installed models", value: tags.models.length + " · " + (bytes / 1e9).toFixed(1) + " GB" }))
    }
    var running = tryJson(ctx, "/api/ps")
    if (running && Array.isArray(running.models)) {
      var names = running.models
        .map(function (model) {
          return model && typeof model.name === "string" ? model.name : null
        })
        .filter(Boolean)
      lines.push(ctx.line.text({ label: "Loaded now", value: names.length ? names.join(", ") : "—" }))
    }
    if (lines.length === 0) throw "Usage response invalid. Try again later."
    var plan = version && typeof version.version === "string" && version.version ? "v" + version.version : undefined
    return { plan: plan, lines: lines }
  }

  globalThis.__openusage_plugin = { id: "ollama", probe: probe }
})()
