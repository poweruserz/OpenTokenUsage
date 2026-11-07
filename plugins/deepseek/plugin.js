(function () {
  var BALANCE_URL = "https://api.deepseek.com/user/balance"
  var SYMBOLS = { USD: "$", CNY: "¥" }

  function loadApiKey(ctx) {
    var key = ctx.host.env.get("DEEPSEEK_API_KEY")
    return typeof key === "string" && key.trim() ? key.trim() : null
  }

  // Balances come as decimal strings ("110.00").
  function amount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    if (typeof value !== "string" || !value.trim()) return null
    var parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  // One balance per currency: one with money in it first, dollars first (the app's currency
  // setting converts dollar amounts).
  function pickBalance(infos) {
    var rank = function (info) {
      return (amount(info.total_balance) > 0 ? 0 : 2) + (info.currency === "USD" ? 0 : 1)
    }
    var usable = infos.filter(function (info) {
      return info && typeof info === "object" && amount(info.total_balance) !== null
    })
    usable.sort(function (a, b) {
      return rank(a) - rank(b)
    })
    return usable[0] || null
  }

  function probe(ctx) {
    var apiKey = loadApiKey(ctx)
    if (!apiKey) throw "No DEEPSEEK_API_KEY found. Set up environment variable first."

    var result
    try {
      result = ctx.util.requestJson({
        method: "GET",
        url: BALANCE_URL,
        headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" },
        timeoutMs: 10000,
      })
    } catch (e) {
      ctx.host.log.error("balance request failed: " + String(e))
      throw "Usage request failed. Check your connection."
    }
    var status = result.resp.status
    if (ctx.util.isAuthStatus(status)) throw "API key invalid. Check your DeepSeek API key."
    if (status < 200 || status >= 300) throw "Usage request failed (HTTP " + status + "). Try again later."
    var infos = result.json && result.json.balance_infos
    if (!Array.isArray(infos)) throw "Usage response invalid. Try again later."
    var info = pickBalance(infos)
    // No balance in any currency (an account that never topped up) is a balance of nothing.
    if (!info && infos.length > 0) throw "Usage response invalid. Try again later."

    var currency = info && typeof info.currency === "string" ? info.currency : ""
    var symbol = SYMBOLS[currency] || (currency ? currency + " " : "")
    var line = { label: "Balance", value: symbol + (info ? amount(info.total_balance) : 0).toFixed(2) }
    // DeepSeek refuses API calls once the balance can't cover them.
    if (result.json.is_available === false) line.color = "#ef4444"
    return { lines: [ctx.line.text(line)] }
  }

  globalThis.__openusage_plugin = { id: "deepseek", probe: probe }
})()
