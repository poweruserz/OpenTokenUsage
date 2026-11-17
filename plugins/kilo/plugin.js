(function () {
  // Kilo (kilo.ai): credit blocks and the Kilo Pass month, with the Kilo CLI's login or an API key.
  // One tRPC batch call, as Pane reads it (github.com/ItsJazii/pane, MIT).
  var URL =
    "https://app.kilo.ai/api/trpc/user.getCreditBlocks,kiloPass.getState?batch=1&input=" +
    encodeURIComponent(JSON.stringify({ 0: { json: null }, 1: { json: null } }))
  var AUTH_FILE = "~/.local/share/kilo/auth.json"
  var MONTH_MS = 30 * 24 * 3600 * 1000
  var TIERS = { tier_19: "Starter", tier_49: "Pro", tier_199: "Expert" }
  var LIVE_PASS = ["active", "past_due", "trialing"]

  function loadToken(ctx) {
    var key = ctx.host.env.get("KILO_API_KEY")
    if (typeof key === "string" && key.trim()) return key.trim()
    if (!ctx.host.fs.exists(AUTH_FILE)) return null
    var doc = ctx.util.tryParseJson(ctx.host.fs.readText(AUTH_FILE))
    var token = doc && doc.kilo && doc.kilo.access
    return typeof token === "string" && token.trim() ? token.trim() : null
  }

  function number(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null
  }

  // A batch entry's payload: result.data.json, or one of its shorter spellings.
  function unwrap(entry) {
    var result = entry && entry.result
    if (!result) return null
    if (result.data && result.data.json !== undefined) return result.data.json
    if (result.data !== undefined) return result.data
    return result.json !== undefined ? result.json : null
  }

  function sum(rows, key) {
    var total = 0
    rows.forEach(function (row) {
      var value = row && number(row[key])
      if (value !== null) total += value
    })
    return total
  }

  function probe(ctx) {
    var token = loadToken(ctx)
    if (!token) throw "No KILO_API_KEY found. Set up environment variable first."

    var result
    try {
      result = ctx.util.requestJson({
        method: "GET",
        url: URL,
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        timeoutMs: 10000,
      })
    } catch (e) {
      ctx.host.log.error("credit request failed: " + String(e))
      throw "Usage request failed. Check your connection."
    }
    var status = result.resp.status
    if (ctx.util.isAuthStatus(status)) throw "API key invalid or expired. Check your Kilo API key."
    if (status < 200 || status >= 300) throw "Usage request failed (HTTP " + status + "). Try again later."
    if (!Array.isArray(result.json)) throw "Usage response invalid. Try again later."

    var lines = []
    var plan
    // [0] user.getCreditBlocks: amounts in millionths of a dollar.
    var blocks = unwrap(result.json[0])
    var rows = blocks && Array.isArray(blocks.creditBlocks) ? blocks.creditBlocks : Array.isArray(blocks) ? blocks : []
    var total = sum(rows, "amount_mUsd") / 1e6
    var left = sum(rows, "balance_mUsd") / 1e6
    if (total > 0) {
      lines.push(
        ctx.line.progress({ label: "Credits", used: Math.max(0, total - left), limit: total, format: { kind: "dollars" } })
      )
    }

    // [1] kiloPass.getState: the Pass month in dollars; `subscription` is null without a Pass. A
    // cancelled one comes back whole, so only these states count (as Kilo's own client reads it).
    var pass = unwrap(result.json[1])
    var sub = pass && pass.subscription && typeof pass.subscription === "object" ? pass.subscription : null
    if (sub && typeof sub.status === "string" && LIVE_PASS.indexOf(sub.status) === -1) sub = null
    if (sub) {
      var used = number(sub.currentPeriodUsageUsd)
      var limit = (number(sub.currentPeriodBaseCreditsUsd) || 0) + (number(sub.currentPeriodBonusCreditsUsd) || 0)
      if (used !== null && limit > 0) {
        lines.push(
          ctx.line.progress({
            label: "Kilo Pass",
            used: Math.min(used, limit),
            limit: limit,
            format: { kind: "dollars" },
            resetsAt: ctx.util.toIso(sub.nextBillingAt || sub.nextRenewalAt || sub.renewsAt || sub.renewAt) || undefined,
            periodDurationMs: MONTH_MS,
          })
        )
      }
      plan = TIERS[sub.tier] || (typeof sub.tier === "string" && sub.tier ? sub.tier : "Kilo Pass")
    }

    // A fresh account: no blocks and no Pass. A balance of nothing, not an error.
    if (lines.length === 0 && blocks && typeof blocks === "object") {
      var balance = (number(blocks.totalBalance_mUsd) || 0) / 1e6
      lines.push(ctx.line.text({ label: "Credits", value: "$" + balance.toFixed(2) }))
    }
    if (lines.length === 0) throw "Usage response invalid. Try again later."
    return { plan: plan, lines: lines }
  }

  globalThis.__openusage_plugin = { id: "kilo", probe: probe }
})()
