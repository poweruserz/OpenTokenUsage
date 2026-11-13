(function () {
  // The Muse CLI's login: %USERPROFILE%\.config\muse\auth.json on Windows too.
  var AUTH_PATH = "~/.config/muse/auth.json"
  // The only source of the subscription windows. It is Muse's key endpoint: it also hands back the
  // account's standing API key (the same one each call, as far as every tracker has seen), which
  // this plugin never reads or keeps.
  var KEY_URL = "https://api.meta.ai/muse-code/key"
  var NOT_LOGGED_IN = "Not logged in. Run `muse login` to authenticate."
  var SESSION_EXPIRED = "Session expired. Run `muse login` to log in again."
  var UNREADABLE = "Couldn't read Muse Code's auth.json. Check its file permissions or log into Muse Code again."
  var NO_SUBSCRIPTION = "No active Muse Code subscription."
  var UNAVAILABLE = "Muse Code quota data unavailable. Try again later."
  // At most one call per login this often, whatever asks (restart, panel, manual refresh).
  var MIN_READ_GAP_MS = 5 * 60 * 1000
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000
  var DEFAULT_WINDOW_MINS = 300

  // Unix time in seconds (Muse's) or milliseconds, as ms; null unless a positive number.
  function unixMs(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
    return value < 1e12 ? value * 1000 : value
  }

  function loadLogin(ctx) {
    if (!ctx.host.fs.exists(AUTH_PATH)) return null
    var auth = null
    try {
      auth = ctx.util.tryParseJson(ctx.host.fs.readText(AUTH_PATH))
    } catch (e) {
      ctx.host.log.warn("muse auth.json read failed: " + String(e))
    }
    if (!auth || typeof auth !== "object") throw UNREADABLE
    var meta = auth.providers && auth.providers.meta
    if (!meta || typeof meta !== "object") return null
    // A login kept in the OS keychain (`storage: "keychain"`) has no token in the file.
    var token = typeof meta.access_token === "string" ? meta.access_token.trim() : ""
    if (!token) throw UNREADABLE
    return { token: token, expiresAtMs: unixMs(meta.expires_at) }
  }

  // Every probe runs in a fresh runtime, so the last read lives in pluginDataDir, per login (a hash
  // of its token). Only the plan and the windows are kept, never the response.
  function keptPath(ctx) {
    return ctx.app.pluginDataDir + "/last-read.json"
  }

  function loadKept(ctx, account) {
    try {
      var path = keptPath(ctx)
      if (!ctx.host.fs.exists(path)) return null
      var saved = ctx.util.tryParseJson(ctx.host.fs.readText(path))
      return saved && saved.account === account && typeof saved.checkedAt === "number" ? saved : null
    } catch (e) {
      ctx.host.log.warn("muse last read unavailable: " + String(e))
      return null
    }
  }

  function saveKept(ctx, kept) {
    try {
      ctx.host.fs.writeText(keptPath(ctx), JSON.stringify(kept))
      return true
    } catch (e) {
      ctx.host.log.warn("muse last read not saved: " + String(e))
      return false
    }
  }

  function readWindow(raw) {
    if (!raw || typeof raw !== "object") return null
    if (typeof raw.used_percent !== "number" || !Number.isFinite(raw.used_percent)) return null
    var mins = raw.window_duration_mins
    return {
      usedPercent: raw.used_percent,
      resetsAtMs: unixMs(raw.resets_at),
      durationMins: typeof mins === "number" && mins > 0 ? mins : null,
    }
  }

  // Meta leaves `subs_usage` (or one window) out while the 5-hour window is idle, and once left it
  // out for everyone: a skipped window keeps the last reading until that reading's reset (an idle
  // session has none). A session past its reset is a new window nobody has used yet.
  function carryOver(fresh, last, nowMs, idleIsEmpty) {
    if (fresh) return fresh
    if (!last) return null
    if (last.resetsAtMs === null || last.resetsAtMs > nowMs) return last
    return idleIsEmpty ? { usedPercent: 0, resetsAtMs: null, durationMins: last.durationMins } : null
  }

  // The windows as of now: a fresh answer's, or the last ones, each checked against its reset.
  function current(fresh, last, nowMs) {
    return {
      plan: fresh ? fresh.plan : last.plan,
      session: carryOver(fresh && fresh.session, last && last.session, nowMs, true),
      weekly: carryOver(fresh && fresh.weekly, last && last.weekly, nowMs, false),
    }
  }

  function planName(value) {
    if (typeof value !== "string" || !value.trim()) return undefined
    return value.trim().replace(/^Muse Code\s+/i, "")
  }

  function rateLimited(resp) {
    var headers = resp.headers || {}
    var seconds = parseInt(headers["retry-after"] || headers["Retry-After"], 10)
    if (!Number.isFinite(seconds) || seconds <= 0) return "Rate limited by Muse Code, try again later"
    return "Rate limited by Muse Code, retry in ~" + Math.ceil(seconds / 60) + "m"
  }

  function readUsage(ctx, token) {
    var resp
    try {
      resp = ctx.host.http.request({
        method: "POST",
        url: KEY_URL,
        headers: {
          Authorization: "Bearer " + token,
          "x-api-version": "1.0.0",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        // What the Muse CLI sends at every start; `true` is its sign-up flow.
        bodyText: JSON.stringify({ onboard: false }),
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.warn("muse quota request failed: " + String(e))
      throw "Usage request failed. Check your connection."
    }
    if (resp.status === 429) throw rateLimited(resp)
    if (ctx.util.isAuthStatus(resp.status)) throw SESSION_EXPIRED
    if (resp.status < 200 || resp.status >= 300) {
      throw "Usage request failed (HTTP " + resp.status + "). Try again later."
    }
    var body = ctx.util.tryParseJson(resp.bodyText)
    if (!body || typeof body !== "object") throw "Usage response invalid. Try again later."
    // `require_payment`: the subscription's billing was never finished.
    if (body.require_payment === true || body.is_subs_active !== true) throw NO_SUBSCRIPTION
    var subs = body.subs_usage && typeof body.subs_usage === "object" ? body.subs_usage : {}
    return { plan: planName(body.subs_tier_name), session: readWindow(subs.window), weekly: readWindow(subs.weekly) }
  }

  function progressLine(ctx, label, w, periodMs) {
    var line = {
      label: label,
      used: Math.min(100, Math.max(0, w.usedPercent)),
      limit: 100,
      format: { kind: "percent" },
      periodDurationMs: periodMs,
    }
    if (w.resetsAtMs !== null) line.resetsAt = ctx.util.toIso(w.resetsAtMs)
    return ctx.line.progress(line)
  }

  function toOutput(ctx, usage, staleSince) {
    var lines = []
    if (usage.session) {
      var mins = usage.session.durationMins || DEFAULT_WINDOW_MINS
      lines.push(progressLine(ctx, "Session", usage.session, mins * 60 * 1000))
    }
    if (usage.weekly) lines.push(progressLine(ctx, "Weekly", usage.weekly, WEEK_MS))
    if (!lines.length) throw UNAVAILABLE
    var out = { plan: usage.plan, lines: lines }
    if (staleSince !== null) out.staleSince = staleSince
    return out
  }

  function probe(ctx) {
    var login = loadLogin(ctx)
    if (!login) throw NOT_LOGGED_IN
    var nowMs = Date.now()
    // Meta refuses refresh grants: an expired login takes a new `muse login`, so don't ask.
    if (login.expiresAtMs !== null && login.expiresAtMs <= nowMs) throw SESSION_EXPIRED

    var account = ctx.host.crypto.sha256Hex(login.token)
    var kept = loadKept(ctx, account)
    var age = kept ? nowMs - kept.checkedAt : -1
    if (kept && age >= 0 && age < MIN_READ_GAP_MS) {
      if (typeof kept.error === "string") throw kept.error
      if (kept.usage) return toOutput(ctx, current(null, kept.usage, nowMs), kept.usageAt)
      throw UNAVAILABLE
    }

    var last = kept && kept.usage ? kept.usage : null
    var lastAt = last ? kept.usageAt : null
    // Saved before asking, so a request that never answers still counts; unsaved, the limit can't hold.
    if (!saveKept(ctx, { account: account, checkedAt: nowMs, usage: last, usageAt: lastAt })) throw UNAVAILABLE
    var fresh
    try {
      fresh = readUsage(ctx, login.token)
    } catch (e) {
      if (typeof e === "string") {
        saveKept(ctx, { account: account, checkedAt: nowMs, error: e, usage: last, usageAt: lastAt })
      }
      throw e
    }
    var usage = current(fresh, last, nowMs)
    saveKept(ctx, { account: account, checkedAt: nowMs, usage: usage, usageAt: nowMs })
    return toOutput(ctx, usage, null)
  }

  globalThis.__openusage_plugin = { id: "muse", probe: probe }
})()
