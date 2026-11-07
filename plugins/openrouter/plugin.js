(function () {
  var API_URL = "https://openrouter.ai/api/v1"
  var DAY_MS = 24 * 60 * 60 * 1000

  function loadApiKey(ctx) {
    var key = ctx.host.env.get("OPENROUTER_API_KEY")
    return typeof key === "string" && key.trim() ? key.trim() : null
  }

  function getJson(ctx, apiKey, path) {
    return ctx.util.requestJson({
      method: "GET",
      url: API_URL + path,
      headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" },
      timeoutMs: 10000,
    })
  }

  function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null
  }

  // OpenRouter's spend windows are UTC: a day from midnight, a week from Monday, a month from the 1st.
  function spendWindow(reset, nowMs) {
    var now = new Date(nowMs)
    var midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    if (reset === "daily") return { endMs: midnight + DAY_MS, periodMs: DAY_MS }
    if (reset === "weekly") return { endMs: midnight + ((8 - now.getUTCDay()) % 7 || 7) * DAY_MS, periodMs: 7 * DAY_MS }
    if (reset === "monthly") {
      var start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      var end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
      return { endMs: end, periodMs: end - start }
    }
    return null
  }

  // The key's own spending cap (set per key on openrouter.ai), if it has one.
  function keyLimitLine(ctx, key, nowMs) {
    var limit = num(key.limit)
    if (limit === null || limit <= 0) return null
    var reset = typeof key.limit_reset === "string" ? key.limit_reset.toLowerCase() : null
    var remaining = num(key.limit_remaining)
    // Without limit_remaining, the spend of the cap's own window (usage_daily/_weekly/_monthly), else all time.
    var windowSpend = reset ? num(key["usage_" + reset]) : null
    var used = remaining !== null ? limit - Math.min(limit, Math.max(0, remaining)) : windowSpend !== null ? windowSpend : num(key.usage)
    if (used === null) return null

    var opts = { label: "API usage", used: Math.max(0, used), limit: limit, format: { kind: "dollars" } }
    var window = spendWindow(reset, nowMs)
    if (window) {
      opts.resetsAt = ctx.util.toIso(window.endMs)
      opts.periodDurationMs = window.periodMs
    }
    return ctx.line.progress(opts)
  }

  function probe(ctx) {
    var apiKey = loadApiKey(ctx)
    if (!apiKey) throw "No OPENROUTER_API_KEY found. Set up environment variable first."

    var keyResult
    try {
      keyResult = getJson(ctx, apiKey, "/key")
    } catch (e) {
      ctx.host.log.error("key request failed: " + String(e))
      throw "Usage request failed. Check your connection."
    }
    var status = keyResult.resp.status
    if (ctx.util.isAuthStatus(status)) throw "API key invalid. Check your OpenRouter API key."
    if (status < 200 || status >= 300) throw "Usage request failed (HTTP " + status + "). Try again later."
    var key = keyResult.json && keyResult.json.data
    if (!key || typeof key !== "object") throw "Usage response invalid. Try again later."

    var lines = []

    // The account's credit balance. OpenRouter may answer it only for management keys (403 for
    // others), so without it the card still shows the key's own spend.
    var credits = null
    try {
      var creditsResult = getJson(ctx, apiKey, "/credits")
      var creditsStatus = creditsResult.resp.status
      if (creditsStatus >= 200 && creditsStatus < 300 && creditsResult.json) credits = creditsResult.json.data
      else ctx.host.log.info("credits unavailable for this key: HTTP " + creditsStatus)
    } catch (e) {
      ctx.host.log.warn("credits request failed: " + String(e))
    }
    var purchased = credits ? num(credits.total_credits) : null
    var spent = credits ? num(credits.total_usage) : null
    if (purchased !== null && purchased > 0 && spent !== null) {
      lines.push(ctx.line.progress({ label: "Credits", used: Math.max(0, spent), limit: purchased, format: { kind: "dollars" } }))
    }

    var limitLine = keyLimitLine(ctx, key, Date.now())
    if (limitLine) lines.push(limitLine)

    var today = num(key.usage_daily)
    if (today !== null) lines.push(ctx.line.text({ label: "Today", value: "$" + today.toFixed(2) }))
    var month = num(key.usage_monthly)
    if (month !== null) lines.push(ctx.line.text({ label: "Monthly", value: "$" + month.toFixed(2) }))

    return { lines: lines }
  }

  globalThis.__openusage_plugin = { id: "openrouter", probe: probe }
})()
