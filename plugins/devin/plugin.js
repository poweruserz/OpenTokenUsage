(function () {
  var CLOUD_SERVICE = "exa.seat_management_pb.SeatManagementService"
  var DEFAULT_API_SERVER_URL = "https://server.codeium.com"
  var CLOUD_COMPAT_VERSION = "1.108.2"
  // The Devin CLI's login: %APPDATA%\devin on Windows (the host maps the first path there),
  // ~/.local/share/devin in a WSL distro.
  var CREDENTIALS_PATHS = [
    "~/Library/Application Support/devin/credentials.toml",
    "~/.local/share/devin/credentials.toml",
  ]
  var APP_AUTH_SOURCES = [
    {
      source: "Devin app",
      stateDb: "~/Library/Application Support/Devin/User/globalStorage/state.vscdb",
    },
    {
      source: "Devin - Next app",
      stateDb: "~/Library/Application Support/Devin - Next/User/globalStorage/state.vscdb",
    },
  ]
  var LOGIN_HINT = "Run devin auth login or sign in to Devin and try again."
  var QUOTA_HINT = "Devin quota data unavailable. Try again later."
  var DAY_MS = 24 * 60 * 60 * 1000
  var WEEK_MS = 7 * DAY_MS

  function readFiniteNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    if (typeof value !== "string") return null
    var trimmed = value.trim()
    if (!trimmed) return null
    var parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  function clampPercent(value) {
    if (!Number.isFinite(value)) return 0
    if (value < 0) return 0
    if (value > 100) return 100
    return value
  }

  function readTomlString(text, key) {
    var lines = String(text || "").split(/\r?\n/)
    var prefix = new RegExp("^\\s*" + key + "\\s*=\\s*(.*)$")
    for (var i = 0; i < lines.length; i++) {
      var match = prefix.exec(lines[i])
      if (!match) continue
      var value = match[1].trim()
      if (!value) return null
      if (value[0] === '"' || value[0] === "'") {
        var quote = value[0]
        var out = ""
        for (var j = 1; j < value.length; j++) {
          var ch = value[j]
          if (ch === quote && value[j - 1] !== "\\") return out.trim() || null
          out += ch
        }
        return null
      }
      var commentIndex = value.indexOf("#")
      if (commentIndex >= 0) value = value.slice(0, commentIndex).trim()
      return value || null
    }
    return null
  }

  function cleanApiServerUrl(value) {
    if (typeof value !== "string") return null
    var trimmed = value.trim().replace(/\/+$/, "")
    if (!/^https:\/\//.test(trimmed)) return null
    return trimmed
  }

  function effectiveApiServerUrl(auth) {
    return (auth && auth.apiServerUrl) || DEFAULT_API_SERVER_URL
  }

  function hasOwn(obj, key) {
    return Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key))
  }

  function readHost(value) {
    if (typeof value !== "string") return null
    var match = /^https?:\/\/([^/]+)/.exec(value.trim())
    return match ? match[1] : null
  }

  function valueOrMissing(value) {
    return value === null || value === undefined || value === "" ? "missing" : String(value)
  }

  function logQuotaDiagnostics(ctx, auth, userStatus) {
    var planStatus = (userStatus && userStatus.planStatus) || {}
    var planInfo = planStatus.planInfo || {}
    var devinInfo = planInfo.devinInfo || {}
    var apiServerHost = readHost(auth.apiServerUrl || DEFAULT_API_SERVER_URL)
    var webappHost = readHost(devinInfo.webappHost) || devinInfo.webappHost || null
    var devinApiHost = readHost(devinInfo.apiUrl)

    ctx.host.log.info(
      "Devin quota diagnostics" +
        " source=" + auth.source +
        " apiServerHost=" + valueOrMissing(apiServerHost) +
        " planName=" + valueOrMissing(planInfo.planName) +
        " teamsTier=" + valueOrMissing(userStatus && userStatus.teamsTier) +
        " planTeamsTier=" + valueOrMissing(planInfo.teamsTier) +
        " billingStrategy=" + valueOrMissing(planInfo.billingStrategy) +
        " isDevin=" + String(planInfo.isDevin === true) +
        " hideDailyQuota=" + String(planInfo.hideDailyQuota === true) +
        " hasDailyQuotaPercent=" + String(hasOwn(planStatus, "dailyQuotaRemainingPercent")) +
        " hasWeeklyQuotaPercent=" + String(hasOwn(planStatus, "weeklyQuotaRemainingPercent")) +
        " hasOverageBalance=" + String(hasOwn(planStatus, "overageBalanceMicros")) +
        " hasDailyReset=" + String(hasOwn(planStatus, "dailyQuotaResetAtUnix")) +
        " hasWeeklyReset=" + String(hasOwn(planStatus, "weeklyQuotaResetAtUnix")) +
        " hasTopUpStatus=" + String(hasOwn(planStatus, "topUpStatus")) +
        " availablePromptCredits=" + valueOrMissing(planStatus.availablePromptCredits) +
        " canUseCli=" + String(devinInfo.canUseCli === true) +
        " canUseCascade=" + String(devinInfo.canUseCascade === true) +
        " devinReviewEnabled=" + String(devinInfo.devinReviewEnabled === true) +
        " webappHost=" + valueOrMissing(webappHost) +
        " devinApiHost=" + valueOrMissing(devinApiHost)
    )
  }

  function loadCredentialsFile(ctx, path) {
    if (!ctx.host.fs.exists(path)) return null
    try {
      var text = ctx.host.fs.readText(path)
      var apiKey = readTomlString(text, "windsurf_api_key")
      if (!apiKey) {
        ctx.host.log.warn("Devin credentials missing windsurf_api_key")
        return null
      }
      return {
        apiKey: apiKey,
        apiServerUrl: cleanApiServerUrl(readTomlString(text, "api_server_url")),
        source: "credentials.toml",
      }
    } catch (e) {
      ctx.host.log.warn("failed to read Devin credentials: " + String(e))
      return null
    }
  }

  function readAppAuth(ctx, variant) {
    try {
      var rows = ctx.host.sqlite.query(
        variant.stateDb,
        "SELECT value FROM ItemTable WHERE key = 'windsurfAuthStatus' LIMIT 1"
      )
      var parsed = ctx.util.tryParseJson(rows)
      if (!parsed || !parsed.length || !parsed[0].value) return null
      var auth = ctx.util.tryParseJson(parsed[0].value)
      if (!auth || !auth.apiKey) return null
      return {
        apiKey: auth.apiKey,
        apiServerUrl: null,
        source: variant.source,
      }
    } catch (e) {
      ctx.host.log.warn("failed to read " + variant.source + " auth: " + String(e))
      return null
    }
  }

  function callCloud(ctx, auth) {
    var apiServerUrl = effectiveApiServerUrl(auth)
    try {
      var resp = ctx.host.http.request({
        method: "POST",
        url: apiServerUrl + "/" + CLOUD_SERVICE + "/GetUserStatus",
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
        },
        bodyText: JSON.stringify({
          metadata: {
            apiKey: auth.apiKey,
            ideName: "devin",
            ideVersion: CLOUD_COMPAT_VERSION,
            extensionName: "devin",
            extensionVersion: CLOUD_COMPAT_VERSION,
            locale: "en",
          },
        }),
        timeoutMs: 15000,
      })
      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.warn("cloud request returned status " + resp.status + " for " + auth.source)
        if (ctx.util && typeof ctx.util.isAuthStatus === "function" && ctx.util.isAuthStatus(resp.status)) {
          return { __openusageAuthError: true }
        }
        return null
      }
      return ctx.util.tryParseJson(resp.bodyText)
    } catch (e) {
      ctx.host.log.warn("cloud request failed for " + auth.source + ": " + String(e))
      return null
    }
  }

  function tryAuth(ctx, auth) {
    var data = callCloud(ctx, auth)
    if (data && data.__openusageAuthError) {
      return { authFailure: true }
    }
    if (!data || !data.userStatus) return {}

    try {
      logQuotaDiagnostics(ctx, auth, data.userStatus)
      return { output: buildOutput(ctx, data.userStatus) }
    } catch (e) {
      if (e === QUOTA_HINT) {
        ctx.host.log.warn("quota contract unavailable for " + auth.source)
        return {}
      }
      throw e
    }
  }

  function unixSecondsToIso(ctx, value) {
    var seconds = readFiniteNumber(value)
    if (seconds === null) return null
    return ctx.util.toIso(seconds * 1000)
  }

  function formatDollarsFromMicros(value) {
    var micros = readFiniteNumber(value)
    if (micros === null) return null
    if (!Number.isFinite(micros)) return null
    if (micros < 0) micros = 0
    return "$" + (micros / 1000000).toFixed(2)
  }

  // Devin reports quota as percent *remaining*; the tile shows percent *used*, so
  // every quota row flips 100 - remaining — including the weekly-from-daily fallback.
  function buildQuotaLine(ctx, label, remaining, resetsAt, periodDurationMs) {
    if (remaining === null) return null
    var line = {
      label: label,
      used: clampPercent(100 - remaining),
      limit: 100,
      format: { kind: "percent" },
      periodDurationMs: periodDurationMs,
    }
    if (resetsAt) line.resetsAt = resetsAt
    return ctx.line.progress(line)
  }

  function buildOutput(ctx, userStatus) {
    var planStatus = (userStatus && userStatus.planStatus) || {}

    var planInfo = planStatus.planInfo || {}
    var planName = typeof planInfo.planName === "string" && planInfo.planName.trim()
      ? planInfo.planName.trim()
      : "Unknown"

    var hideDailyQuota = planInfo.hideDailyQuota === true
    var dailyRemaining = readFiniteNumber(planStatus.dailyQuotaRemainingPercent)
    var weeklyRemaining = readFiniteNumber(planStatus.weeklyQuotaRemainingPercent)
    var dailyReset = !hideDailyQuota ? unixSecondsToIso(ctx, planStatus.dailyQuotaResetAtUnix) : null
    var weeklyReset = unixSecondsToIso(ctx, planStatus.weeklyQuotaResetAtUnix)
    var extraUsageBalance = formatDollarsFromMicros(planStatus.overageBalanceMicros)

    // A present-but-unparsable weekly percentage is schema drift, not an omitted zero:
    // fail loud instead of letting the exhausted-quota fallback below show 100% used.
    if (hasOwn(planStatus, "weeklyQuotaRemainingPercent") && weeklyRemaining === null) {
      ctx.host.log.warn("Devin weeklyQuotaRemainingPercent is not a number")
      throw QUOTA_HINT
    }
    // Proto3 JSON omits zero values. A weekly reset identifies an existing weekly window.
    if (weeklyRemaining === null && weeklyReset) weeklyRemaining = 0

    var dailyLine = !hideDailyQuota
      ? buildQuotaLine(ctx, "Daily quota", dailyRemaining, dailyReset, DAY_MS)
      : null
    var weeklyLine = weeklyRemaining !== null
      ? buildQuotaLine(ctx, "Weekly quota", weeklyRemaining, weeklyReset, WEEK_MS)
      : hideDailyQuota
        ? buildQuotaLine(ctx, "Weekly quota", dailyRemaining, weeklyReset, WEEK_MS)
        : null

    var lines = []
    if (dailyLine) lines.push(dailyLine)
    if (weeklyLine) lines.push(weeklyLine)
    if (extraUsageBalance) {
      lines.push(ctx.line.text({ label: "Extra usage balance", value: extraUsageBalance }))
    }

    if (!lines.length) throw QUOTA_HINT

    return {
      plan: planName,
      lines: lines,
    }
  }

  function probe(ctx) {
    var sawApiKey = false
    var sawAuthFailure = false
    var attempts = []

    for (var c = 0; c < CREDENTIALS_PATHS.length; c++) {
      var credentials = loadCredentialsFile(ctx, CREDENTIALS_PATHS[c])
      if (!credentials || alreadyAttempted(attempts, credentials)) continue
      sawApiKey = true
      attempts.push(authFingerprint(credentials))
      var credentialsAttempt = tryAuth(ctx, credentials)
      if (credentialsAttempt.output) return credentialsAttempt.output
      if (credentialsAttempt.authFailure) sawAuthFailure = true
    }

    // Walk every app install (stable, then "- Next") and try each token the cloud
    // hasn't already rejected, so a stale token in one install doesn't mask a
    // valid one in another. Read each state DB only when we reach it, so a working
    // earlier source short-circuits before we touch a later install's DB.
    for (var i = 0; i < APP_AUTH_SOURCES.length; i++) {
      var appAuth = readAppAuth(ctx, APP_AUTH_SOURCES[i])
      if (!appAuth) continue
      if (alreadyAttempted(attempts, appAuth)) continue
      sawApiKey = true
      attempts.push(authFingerprint(appAuth))
      var appAttempt = tryAuth(ctx, appAuth)
      if (appAttempt.output) return appAttempt.output
      if (appAttempt.authFailure) sawAuthFailure = true
    }

    // Not LOGIN_HINT: that says nothing is set up, and a new install would leave the card off.
    if (sawAuthFailure) throw "Session expired. Sign in via Devin app or run `devin auth login`."
    if (sawApiKey) throw QUOTA_HINT
    throw LOGIN_HINT
  }

  function authFingerprint(auth) {
    return auth.apiKey + "\n" + effectiveApiServerUrl(auth)
  }

  function alreadyAttempted(attempts, auth) {
    var fingerprint = authFingerprint(auth)
    for (var i = 0; i < attempts.length; i++) {
      if (attempts[i] === fingerprint) return true
    }
    return false
  }

  // Who is signed in, for the WSL same-account check (wsl.rs): the API key probe tries first (the
  // CLI's credentials, then each app install). Local only.
  function accountKey(ctx) {
    var auth = null
    for (var c = 0; !auth && c < CREDENTIALS_PATHS.length; c++) auth = loadCredentialsFile(ctx, CREDENTIALS_PATHS[c])
    for (var i = 0; !auth && i < APP_AUTH_SOURCES.length; i++) auth = readAppAuth(ctx, APP_AUTH_SOURCES[i])
    return auth && auth.apiKey ? auth.apiKey : null
  }

  globalThis.__openusage_plugin = { id: "devin", probe: probe, accountKey: accountKey }
})()
