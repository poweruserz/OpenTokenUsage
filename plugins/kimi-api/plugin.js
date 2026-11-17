(function () {
  // The pay-as-you-go wallet of a Moonshot (Kimi) platform API key; the Kimi Code plan is the kimi
  // plugin. Endpoints as Pane reads them (github.com/ItsJazii/pane, MIT): the global platform first,
  // mainland China second, since a key from one is rejected by the other.
  var ENDPOINTS = [
    { url: "https://api.moonshot.ai/v1/users/me/balance", sign: "$" },
    { url: "https://api.moonshot.cn/v1/users/me/balance", sign: "¥" },
  ]
  // Not KIMI_API_KEY: the Kimi CLI reads that one for its Kimi Code key, which this endpoint refuses.
  var KEY_VAR = "MOONSHOT_API_KEY"

  function amount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    if (typeof value === "string" && value.trim()) {
      var parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  function probe(ctx) {
    var key = ctx.host.env.get(KEY_VAR)
    var apiKey = typeof key === "string" && key.trim() ? key.trim() : null
    if (!apiKey) throw "No MOONSHOT_API_KEY found. Set up environment variable first."

    // The key is called invalid only when every platform refused it: a platform that didn't answer
    // may be the key's own.
    var refused = 0
    var failure = "Usage request failed. Check your connection."
    for (var i = 0; i < ENDPOINTS.length; i++) {
      var endpoint = ENDPOINTS[i]
      var result
      try {
        result = ctx.util.requestJson({
          method: "GET",
          url: endpoint.url,
          headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" },
          timeoutMs: 8000,
        })
      } catch (e) {
        ctx.host.log.warn("balance request failed: " + String(e))
        continue
      }
      var status = result.resp.status
      if (ctx.util.isAuthStatus(status)) {
        refused += 1
        continue
      }
      if (status < 200 || status >= 300) {
        failure = "Usage request failed (HTTP " + status + "). Try again later."
        continue
      }
      var data = result.json && (result.json.data || result.json)
      var available = data ? amount(data.available_balance) : null
      if (available === null) {
        failure = "Usage response invalid. Try again later."
        continue
      }
      var money = function (value) {
        return endpoint.sign + value.toFixed(2)
      }
      var balance = { label: "Balance", value: money(available) }
      // Calls stop once nothing is left to cover them.
      if (available <= 0) balance.color = "#ef4444"
      var lines = [ctx.line.text(balance)]
      var vouchers = amount(data.voucher_balance)
      if (vouchers !== null && vouchers > 0) lines.push(ctx.line.text({ label: "Vouchers", value: money(vouchers) }))
      var cash = amount(data.cash_balance)
      if (cash !== null) lines.push(ctx.line.text({ label: "Cash", value: money(cash) }))
      return { lines: lines }
    }
    if (refused === ENDPOINTS.length) throw "API key invalid. Check your Kimi API key."
    throw failure
  }

  globalThis.__openusage_plugin = { id: "kimi-api", probe: probe }
})()
