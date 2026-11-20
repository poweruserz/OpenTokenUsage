(function () {
  // Balances of the accounts set in Settings → Providers → Custom balances (`balances` in the app
  // data folder's config.json; each key comes from the environment variable it names). Presets as
  // token-monitor (github.com/Javis603/token-monitor, MIT) reads them: New API (account or key),
  // Sub2API, or one GET endpoint whose numbers sit at dot paths.
  var MAX = 5
  // New API counts quota in units; /api/status says how many make a dollar.
  var NEWAPI_UNIT = 500000

  function amount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    if (typeof value === "string" && value.trim()) {
      var parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  // A plain dot path through own properties only ("data.balance").
  function at(root, path) {
    if (!path) return undefined
    var value = root
    var parts = path.split(".")
    for (var i = 0; i < parts.length; i++) {
      if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, parts[i])) return undefined
      value = value[parts[i]]
    }
    return value
  }

  function baseOf(account) {
    var base = String(account.baseUrl || "").replace(/\/+$/, "")
    // A pasted API base ("…/v1") still finds the panel's own routes.
    return account.preset === "custom" ? base : base.replace(/\/v1$/, "")
  }

  function get(ctx, url, headers) {
    var result = ctx.util.requestJson({ method: "GET", url: url, headers: headers, timeoutMs: 8000 })
    var status = result.resp.status
    if (status < 200 || status >= 300) throw "HTTP " + status
    if (!result.json || typeof result.json !== "object") throw "invalid"
    return result.json
  }

  function quotaUnit(ctx, base) {
    try {
      var status = get(ctx, base + "/api/status", { Accept: "application/json" })
      var unit = amount(status.data && status.data.quota_per_unit)
      return unit && unit > 0 ? unit : NEWAPI_UNIT
    } catch (e) {
      return NEWAPI_UNIT
    }
  }

  // { left, used, total, currency } in the account's own money, or { unlimited: true }.
  function read(ctx, account, token) {
    var base = baseOf(account)
    var bearer = { Authorization: "Bearer " + token, Accept: "application/json" }
    if (account.preset === "newapi") {
      var headers = Object.assign({}, bearer)
      if (account.userId) headers["New-Api-User"] = account.userId
      var self = get(ctx, base + "/api/user/self", headers).data || {}
      var quota = amount(self.quota)
      if (self.unlimited_quota === true || quota === -1) return { unlimited: true }
      var unit = quotaUnit(ctx, base)
      var usedQuota = amount(self.used_quota)
      if (quota === null) throw "invalid"
      return { left: Math.max(0, quota) / unit, used: usedQuota === null ? null : Math.max(0, usedQuota) / unit, currency: "USD" }
    }
    if (account.preset === "newapi-token") {
      var usage = get(ctx, base + "/api/usage/token/", bearer).data || {}
      if (usage.unlimited_quota === true) return { unlimited: true }
      var available = amount(usage.total_available)
      if (available === null) throw "invalid"
      var tokenUnit = quotaUnit(ctx, base)
      var spent = amount(usage.total_used)
      return { left: Math.max(0, available) / tokenUnit, used: spent === null ? null : Math.max(0, spent) / tokenUnit, currency: "USD" }
    }
    if (account.preset === "sub2api") {
      var me = get(ctx, base + "/api/v1/auth/me", bearer)
      var balance = me.code === 0 && me.data ? amount(me.data.balance) : null
      if (balance === null) throw "invalid"
      return { left: balance, used: null, currency: "USD" }
    }
    var auth = account.auth === "x-api-key" ? { "x-api-key": token, Accept: "application/json" } : bearer
    var body = get(ctx, base + account.path, auth)
    if (body.success === false || body.code === false) throw "invalid"
    var divisor = amount(account.divisor) || 1
    var scaled = function (path) {
      var value = amount(at(body, path))
      return value === null ? null : value / divisor
    }
    var left = scaled(account.remaining)
    if (left === null) throw "invalid"
    var used = scaled(account.used)
    var total = scaled(account.total)
    if (total !== null && total < left) throw "invalid"
    return { left: left, used: used, total: total, currency: account.currency || "USD" }
  }

  function money(value, currency) {
    return currency === "USD" ? "$" + value.toFixed(2) : value.toFixed(2) + " " + currency
  }

  // What's left, then out of how much when known: no words, so no language to pick.
  function describe(name, result) {
    if (result.unlimited) return name + ": ∞"
    var text = name + ": " + money(result.left, result.currency)
    var total = result.total != null ? result.total : result.used != null ? result.left + result.used : null
    if (total != null && total > 0) text += " / " + money(total, result.currency)
    return text
  }

  function probe(ctx) {
    var path = ctx.app.appDataDir + "/config.json"
    // 0.9.2's file while the host couldn't move it (config.rs `in_use` picks the same way).
    if (!ctx.host.fs.exists(path)) path = "~/.openusage/config.json"
    var config = ctx.host.fs.exists(path) ? ctx.util.tryParseJson(ctx.host.fs.readText(path)) : null
    var accounts = config && Array.isArray(config.balances) ? config.balances.slice(0, MAX) : []
    if (accounts.length === 0) throw "No custom balance set up. Add one in Settings."

    // A failed account says why in its red line without words, so in every language: its variable
    // with ✕ when unset, the HTTP status, ? for an answer without the numbers, ✕ for no answer.
    var lines = []
    var missing = 0
    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i] || {}
      var name = String(account.name || "Balance").slice(0, 40)
      var label = i === 0 ? "Balance" : "Balance " + (i + 1)
      var token = account.tokenEnv ? ctx.host.env.get(account.tokenEnv) : null
      token = typeof token === "string" ? token.trim() : ""
      var line
      if (!token) {
        line = { label: label, value: name + ": " + account.tokenEnv + " ✕", color: "#ef4444" }
        missing += 1
      } else {
        try {
          var result = read(ctx, account, token)
          line = { label: label, value: describe(name, result) }
          if (!result.unlimited && result.left <= 0) line.color = "#ef4444"
        } catch (e) {
          var why = e === "invalid" ? "?" : typeof e === "string" && e.indexOf("HTTP ") === 0 ? e : "✕"
          ctx.host.log.warn("custom balance " + (i + 1) + " failed: " + why)
          line = { label: label, value: name + ": " + why, color: "#ef4444" }
        }
      }
      lines.push(ctx.line.text(line))
    }
    if (accounts.length === 1 && missing === 1) {
      throw "No " + accounts[0].tokenEnv + " found. Set up environment variable first."
    }
    return { lines: lines }
  }

  globalThis.__openusage_plugin = { id: "custom-balance", probe: probe }
})()
