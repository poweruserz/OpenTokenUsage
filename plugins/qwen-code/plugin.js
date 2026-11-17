(function () {
  // Qwen Code: requests today and this month from the CLI's own ledger, one JSON line per request.
  // Alibaba's quota console takes no API key (it answers ConsoleNeedLogin), so nothing is fetched.
  // Ledger and Token Plan detection as Pane reads them (github.com/ItsJazii/pane, MIT).
  var HOME = "~/.qwen"
  var SETTINGS = HOME + "/settings.json"

  // The active model's endpoint decides; providerMetadata can keep a Token Plan entry after a switch.
  function usesTokenPlan(ctx) {
    if (!ctx.host.fs.exists(SETTINGS)) return false
    var doc = ctx.util.tryParseJson(ctx.host.fs.readText(SETTINGS))
    if (!doc || typeof doc !== "object") return false
    var base = doc.model && doc.model.baseUrl
    if (typeof base === "string" && base) return base.toLowerCase().indexOf("token-plan") !== -1
    return !!(doc.providerMetadata && typeof doc.providerMetadata === "object" && doc.providerMetadata["token-plan"])
  }

  function probe(ctx) {
    if (!ctx.host.fs.exists(HOME)) throw "Qwen Code not installed. Install Qwen Code to get started."

    var today = ctx.localDate
    var ledger = HOME + "/usage/token-usage-" + today.slice(0, 7) + ".jsonl"
    var day = 0
    var month = 0
    if (ctx.host.fs.exists(ledger)) {
      ctx.host.fs
        .readText(ledger)
        .split("\n")
        .forEach(function (line) {
          var row = line.trim() ? ctx.util.tryParseJson(line) : null
          // A row without tokens is a request that failed before the model answered.
          if (!row || !(typeof row.totalTokens === "number" && row.totalTokens > 0)) return
          month += 1
          if (row.localDate === today) day += 1
        })
    }

    return {
      plan: usesTokenPlan(ctx) ? "Token Plan" : undefined,
      lines: [
        ctx.line.text({ label: "Requests today", value: String(day) }),
        ctx.line.text({ label: "Requests this month", value: String(month) }),
      ],
    }
  }

  globalThis.__openusage_plugin = { id: "qwen-code", probe: probe }
})()
