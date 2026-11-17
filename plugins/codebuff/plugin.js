(function () {
  // Codebuff (codebuff.com): credits and the plan's weekly limit, with the `codebuff login` token or
  // an API key. Endpoints and answer shapes as Pane reads them (github.com/ItsJazii/pane, MIT).
  var USAGE_URL = "https://www.codebuff.com/api/v1/usage"
  var SUBSCRIPTION_URL = "https://www.codebuff.com/api/user/subscription"
  // `codebuff login` keeps the CLI's former name for its folder.
  var CREDENTIALS = "~/.config/manicode/credentials.json"
  var WEEK_MS = 7 * 24 * 3600 * 1000

  // The token and where it came from: a refused API key isn't fixed by `codebuff login`.
  function loadToken(ctx) {
    var key = ctx.host.env.get("CODEBUFF_API_KEY")
    if (typeof key === "string" && key.trim()) return { value: key.trim(), apiKey: true }
    if (!ctx.host.fs.exists(CREDENTIALS)) return null
    var doc = ctx.util.tryParseJson(ctx.host.fs.readText(CREDENTIALS))
    var token = doc && ((doc.default && doc.default.authToken) || doc.authToken)
    return typeof token === "string" && token.trim() ? { value: token.trim(), apiKey: false } : null
  }

  function number(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    if (typeof value === "string" && value.trim()) {
      var parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  function first(values) {
    for (var i = 0; i < values.length; i++) if (values[i] !== undefined && values[i] !== null) return values[i]
    return undefined
  }

  // The plan's name and weekly window; the card stands without them.
  function subscription(ctx, headers) {
    try {
      var result = ctx.util.requestJson({ method: "GET", url: SUBSCRIPTION_URL, headers: headers, timeoutMs: 10000 })
      if (result.resp.status < 200 || result.resp.status >= 300 || !result.json) return null
      return result.json
    } catch (e) {
      ctx.host.log.warn("subscription request failed: " + String(e))
      return null
    }
  }

  function probe(ctx) {
    var token = loadToken(ctx)
    if (!token) throw "Codebuff not logged in. Run `codebuff login`."
    var headers = { Authorization: "Bearer " + token.value, Accept: "application/json" }

    var result
    try {
      result = ctx.util.requestJson({
        method: "POST",
        url: USAGE_URL,
        headers: { Authorization: headers.Authorization, Accept: headers.Accept, "Content-Type": "application/json" },
        bodyText: JSON.stringify({ fingerprintId: "opentokenusage" }),
        timeoutMs: 10000,
      })
    } catch (e) {
      ctx.host.log.error("usage request failed: " + String(e))
      throw "Usage request failed. Check your connection."
    }
    var status = result.resp.status
    if (ctx.util.isAuthStatus(status)) {
      throw token.apiKey ? "API key invalid. Check your Codebuff API key." : "Codebuff auth expired. Run `codebuff login` again."
    }
    if (status < 200 || status >= 300) throw "Usage request failed (HTTP " + status + "). Try again later."
    var usage = result.json
    if (!usage || typeof usage !== "object") throw "Usage response invalid. Try again later."

    var lines = []
    var used = number(first([usage.usage, usage.used]))
    var total = number(first([usage.quota, usage.limit]))
    var remaining = number(first([usage.remainingBalance, usage.remaining]))
    if (total === null && used !== null && remaining !== null) total = used + remaining
    if (used !== null && total !== null && total > 0) {
      lines.push(
        ctx.line.progress({
          label: "Credits",
          used: Math.min(used, total),
          limit: total,
          format: { kind: "count", suffix: "credits" },
          resetsAt: ctx.util.toIso(usage.next_quota_reset) || undefined,
        })
      )
    } else if (remaining !== null) {
      lines.push(ctx.line.text({ label: "Credits", value: String(Math.round(remaining)) }))
    }

    var plan
    var sub = subscription(ctx, headers)
    if (sub) {
      var inner = sub.subscription && typeof sub.subscription === "object" ? sub.subscription : {}
      var name = first([inner.displayName, sub.displayName, inner.tier, sub.tier])
      if (typeof name === "string" && name.trim()) plan = ctx.fmt.planLabel(name)
      var rate = sub.rateLimit && typeof sub.rateLimit === "object" ? sub.rateLimit : {}
      var weekUsed = number(first([rate.weeklyUsed, rate.used]))
      var weekLimit = number(first([rate.weeklyLimit, rate.limit]))
      if (weekUsed !== null && weekLimit !== null && weekLimit > 0) {
        lines.push(
          ctx.line.progress({
            label: "Weekly",
            used: Math.min(100, (weekUsed / weekLimit) * 100),
            limit: 100,
            format: { kind: "percent" },
            resetsAt: ctx.util.toIso(rate.weeklyResetsAt) || undefined,
            periodDurationMs: WEEK_MS,
          })
        )
      }
    }

    if (lines.length === 0) throw "Usage response invalid. Try again later."
    return { plan: plan, lines: lines }
  }

  globalThis.__openusage_plugin = { id: "codebuff", probe: probe }
})()
