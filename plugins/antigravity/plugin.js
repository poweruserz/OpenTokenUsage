(function () {
  var LS_SERVICE = "exa.language_server_pb.LanguageServerService"
  var STATE_DBS = [
    "~/Library/Application Support/Antigravity IDE/User/globalStorage/state.vscdb",
    "~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb",
  ]
  var AGY_KEYCHAIN_SERVICE = "gemini"
  var AGY_KEYCHAIN_ACCOUNT = "antigravity"
  // Production first: daily can answer 200 without the Gemini group (as upstream found too).
  var CLOUD_CODE_URLS = [
    "https://cloudcode-pa.googleapis.com",
    "https://daily-cloudcode-pa.googleapis.com",
  ]
  var LOAD_CODE_ASSIST_PATH = "/v1internal:loadCodeAssist"
  var FETCH_MODELS_PATH = "/v1internal:fetchAvailableModels"
  var RETRIEVE_QUOTA_PATH = "/v1internal:retrieveUserQuota"
  var QUOTA_SUMMARY_PATH = "/v1internal:retrieveUserQuotaSummary"
  var LOGIN_MESSAGE = "Start Antigravity or run `agy` and try again."
  var GOOGLE_OAUTH_URL = "https://oauth2.googleapis.com/token"
  var GOOGLE_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
  var GOOGLE_CLIENT_SECRET = "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"
  var OAUTH_TOKEN_KEY = "antigravityUnifiedStateSync.oauthToken"
  var OAUTH_TOKEN_SENTINEL = "oauthTokenInfoSentinelKey"
  // Each refreshed-token cache is bound to its own source, so neither purges the other.
  var DB_TOKEN_CACHE = "auth.json"
  var AGY_TOKEN_CACHE = "agy-auth.json"
  var CC_MODEL_BLACKLIST = {
    "MODEL_CHAT_20706": true,
    "MODEL_CHAT_23310": true,
    "MODEL_GOOGLE_GEMINI_2_5_FLASH": true,
    "MODEL_GOOGLE_GEMINI_2_5_FLASH_THINKING": true,
    "MODEL_GOOGLE_GEMINI_2_5_FLASH_LITE": true,
    "MODEL_GOOGLE_GEMINI_2_5_PRO": true,
    "MODEL_PLACEHOLDER_M19": true,
    "MODEL_PLACEHOLDER_M9": true,
    "MODEL_PLACEHOLDER_M12": true,
  }
  // --- Protobuf wire-format decoder ---

  function readVarint(s, pos) {
    var v = 0
    var shift = 0
    while (pos < s.length) {
      var b = s.charCodeAt(pos++)
      v += (b & 0x7f) * Math.pow(2, shift)
      if ((b & 0x80) === 0) return { v: v, p: pos }
      shift += 7
    }
    return null
  }

  function readFields(s) {
    var fields = {}
    var pos = 0
    while (pos < s.length) {
      var tag = readVarint(s, pos)
      if (!tag) break
      pos = tag.p
      var fieldNum = Math.floor(tag.v / 8)
      var wireType = tag.v % 8
      if (wireType === 0) {
        var val = readVarint(s, pos)
        if (!val) break
        fields[fieldNum] = { type: 0, value: val.v }
        pos = val.p
      } else if (wireType === 1) {
        if (pos + 8 > s.length) break
        pos += 8
      } else if (wireType === 2) {
        var len = readVarint(s, pos)
        if (!len) break
        pos = len.p
        if (pos + len.v > s.length) break
        fields[fieldNum] = { type: 2, data: s.substring(pos, pos + len.v) }
        pos += len.v
      } else if (wireType === 5) {
        if (pos + 4 > s.length) break
        pos += 4
      } else {
        break
      }
    }
    return fields
  }

  // --- SQLite credential reading ---

  // Antigravity wraps OAuth state in a double-base64 envelope:
  //   b64(outer.f1 = wrapper{ f1=sentinel, f2=payload{ f1=b64(inner proto) } }).
  // The inner base64 layer is the unusual part — it's a UTF-8 string field, not raw bytes.
  function unwrapOAuthSentinel(ctx, base64Text) {
    var trimmed = String(base64Text || "").replace(/^\s+|\s+$/g, "")
    if (!trimmed) return null
    var outer = ctx.base64.decode(trimmed)
    var outerFields = readFields(outer)
    if (!outerFields[1] || outerFields[1].type !== 2) return null
    var wrapper = readFields(outerFields[1].data)
    var sentinel = (wrapper[1] && wrapper[1].type === 2) ? wrapper[1].data : null
    var payload = (wrapper[2] && wrapper[2].type === 2) ? wrapper[2].data : null
    if (sentinel !== OAUTH_TOKEN_SENTINEL || !payload) return null
    var payloadFields = readFields(payload)
    if (!payloadFields[1] || payloadFields[1].type !== 2) return null
    var innerText = payloadFields[1].data.replace(/^\s+|\s+$/g, "")
    if (!innerText) return null
    return ctx.base64.decode(innerText)
  }

  function loadOAuthTokensFromDb(ctx, dbPath) {
    try {
      var rows = ctx.host.sqlite.query(
        dbPath,
        "SELECT value FROM ItemTable WHERE key = '" + OAUTH_TOKEN_KEY + "' LIMIT 1"
      )
      var parsed = ctx.util.tryParseJson(rows)
      if (!parsed || !parsed.length || !parsed[0].value) return null
      var inner = unwrapOAuthSentinel(ctx, parsed[0].value)
      if (!inner) return null
      var fields = readFields(inner)
      var accessToken = (fields[1] && fields[1].type === 2) ? fields[1].data : null
      var refreshToken = (fields[3] && fields[3].type === 2) ? fields[3].data : null
      var expirySeconds = null
      if (fields[4] && fields[4].type === 2) {
        var ts = readFields(fields[4].data)
        if (ts[1] && ts[1].type === 0) expirySeconds = ts[1].value
      }
      if (!accessToken && !refreshToken) return null
      return { accessToken: accessToken, refreshToken: refreshToken, expirySeconds: expirySeconds }
    } catch (e) {
      ctx.host.log.warn("failed to read unified oauth token from " + dbPath + ": " + String(e))
      return null
    }
  }

  function loadOAuthTokenCandidates(ctx) {
    var candidates = []
    for (var i = 0; i < STATE_DBS.length; i++) {
      var tokens = loadOAuthTokensFromDb(ctx, STATE_DBS[i])
      if (tokens) candidates.push(tokens)
    }
    return candidates
  }

  // --- Google OAuth token refresh ---

  function refreshAccessToken(ctx, refreshTokenValue, cacheFile) {
    if (!refreshTokenValue) {
      ctx.host.log.warn("refresh skipped: no refresh token")
      return null
    }
    ctx.host.log.info("attempting Google OAuth token refresh")
    try {
      var resp = ctx.host.http.request({
        method: "POST",
        url: GOOGLE_OAUTH_URL,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        bodyText:
          "client_id=" + encodeURIComponent(GOOGLE_CLIENT_ID) +
          "&client_secret=" + encodeURIComponent(GOOGLE_CLIENT_SECRET) +
          "&refresh_token=" + encodeURIComponent(refreshTokenValue) +
          "&grant_type=refresh_token",
        timeoutMs: 15000,
      })
      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.warn("Google OAuth refresh returned status: " + resp.status)
        return null
      }
      var body = ctx.util.tryParseJson(resp.bodyText)
      if (!body || !body.access_token) {
        ctx.host.log.warn("Google OAuth refresh response missing access_token")
        return null
      }
      var expiresIn = (typeof body.expires_in === "number") ? body.expires_in : 3600
      cacheToken(ctx, body.access_token, expiresIn, refreshTokenValue, cacheFile)
      return body.access_token
    } catch (e) {
      ctx.host.log.warn("Google OAuth refresh failed: " + String(e))
      return null
    }
  }

  // --- Token cache ---
  // The cached access token is derived from a local Antigravity refresh token. It is bound
  // to that minting credential via a SHA-256 fingerprint so a logout / account switch can
  // never keep serving the previous account's token from our cache.

  function credentialFingerprint(ctx, refreshTokenValue) {
    var sha256Hex = ctx.host.crypto && ctx.host.crypto.sha256Hex
    if (typeof sha256Hex !== "function") return null
    var trimmed = trimString(refreshTokenValue)
    if (!trimmed) return null
    return sha256Hex(trimmed)
  }

  // The host fs API has no remove; overwriting with an empty object is the purge.
  function discardCachedToken(ctx, cacheFile) {
    var path = ctx.app.pluginDataDir + "/" + cacheFile
    try {
      if (!ctx.host.fs.exists(path)) return
      ctx.host.fs.writeText(path, "{}")
      ctx.host.log.info("discarded stale cached token")
    } catch (e) {
      ctx.host.log.warn("failed to discard stale cached token: " + String(e))
    }
  }

  // Returns the cached access token only when it was minted by one of the refresh tokens
  // still present locally. No local refresh credentials, a legacy unbound cache, or a
  // fingerprint mismatch all purge the cache — it is never an independent credential.
  function loadCachedToken(ctx, localRefreshTokens, cacheFile) {
    var expected = []
    for (var i = 0; i < (localRefreshTokens || []).length; i++) {
      var fp = credentialFingerprint(ctx, localRefreshTokens[i])
      if (fp && expected.indexOf(fp) === -1) expected.push(fp)
    }
    if (expected.length === 0) {
      discardCachedToken(ctx, cacheFile)
      return null
    }
    var path = ctx.app.pluginDataDir + "/" + cacheFile
    try {
      if (!ctx.host.fs.exists(path)) return null
      var data = ctx.util.tryParseJson(ctx.host.fs.readText(path))
      if (!data || !data.accessToken || !data.expiresAtMs) return null
      if (!data.credentialFingerprint || expected.indexOf(data.credentialFingerprint) === -1) {
        // Includes legacy caches with no fingerprint. Never log the fingerprints themselves.
        ctx.host.log.info("cached token was not minted by a current local credential; discarding it")
        discardCachedToken(ctx, cacheFile)
        return null
      }
      if (data.expiresAtMs <= Date.now()) return null
      return data.accessToken
    } catch (e) {
      ctx.host.log.warn("failed to read cached token: " + String(e))
      return null
    }
  }

  function cacheToken(ctx, accessToken, expiresInSeconds, sourceRefreshToken, cacheFile) {
    var fingerprint = credentialFingerprint(ctx, sourceRefreshToken)
    if (!fingerprint) {
      ctx.host.log.warn("cannot fingerprint the minting credential; not caching the refreshed token")
      return
    }
    var path = ctx.app.pluginDataDir + "/" + cacheFile
    try {
      ctx.host.fs.writeText(path, JSON.stringify({
        accessToken: accessToken,
        expiresAtMs: Date.now() + (expiresInSeconds || 3600) * 1000,
        credentialFingerprint: fingerprint,
      }))
    } catch (e) {
      ctx.host.log.warn("failed to cache refreshed token: " + String(e))
    }
  }

  // --- agy keychain token ---

  function trimString(value) {
    return typeof value === "string" ? value.trim() : ""
  }

  function decodeBase64(ctx, text) {
    try {
      return ctx.base64.decode(text)
    } catch (e) {
      return null
    }
  }

  function unwrapAgyKeychainText(ctx, raw) {
    var text = trimString(raw)
    if (!text) return null
    if (text.indexOf("go-keyring-base64:") === 0) {
      text = trimString(decodeBase64(ctx, text.slice("go-keyring-base64:".length)))
    }
    return text || null
  }

  var ACCESS_TOKEN_KEYS = [
    "access_token",
    "accessToken",
    "token",
    "id_token",
    "idToken",
    "bearerToken",
    "auth_token",
    "authToken",
  ]

  function extractTokenFromObject(obj, directKeys) {
    if (!obj || typeof obj !== "object") return null

    for (var i = 0; i < directKeys.length; i++) {
      var value = obj[directKeys[i]]
      if (typeof value === "string" && value.trim()) return value.trim()
    }

    var nestedKeys = ["token", "tokens", "oauth", "oauth2", "credentials", "auth"]
    for (var j = 0; j < nestedKeys.length; j++) {
      var nested = extractTokenFromObject(obj[nestedKeys[j]], directKeys)
      if (nested) return nested
    }

    return null
  }

  // agy (go-keyring) stores a Go oauth2.Token: { token: { access_token, refresh_token, expiry }, … }.
  // The access token lives ~1 h; agy refreshes it only while it runs, so we refresh it ourselves.
  function extractAgyTokens(ctx, raw) {
    var text = unwrapAgyKeychainText(ctx, raw)
    if (!text) return null

    var parsed = ctx.util.tryParseJson(text)
    if (typeof parsed === "string" && parsed.trim()) return { accessToken: parsed.trim() }
    if (parsed && typeof parsed === "object") {
      var expiryText = extractTokenFromObject(parsed, ["expiry", "expires_at", "expiresAt"])
      // Go writes 7–9 fractional digits, which QuickJS's Date.parse rejects; keep milliseconds.
      var expiryMs = expiryText ? Date.parse(expiryText.replace(/(\.\d{3})\d+/, "$1")) : NaN
      var tokens = {
        accessToken: extractTokenFromObject(parsed, ACCESS_TOKEN_KEYS),
        refreshToken: extractTokenFromObject(parsed, ["refresh_token", "refreshToken"]),
        expirySeconds: Number.isFinite(expiryMs) ? Math.floor(expiryMs / 1000) : null,
      }
      return tokens.accessToken || tokens.refreshToken ? tokens : null
    }

    if (text.indexOf("Bearer ") === 0) {
      var bearer = text.slice("Bearer ".length).trim()
      return bearer ? { accessToken: bearer } : null
    }
    return { accessToken: text }
  }

  function loadAgyKeychainToken(ctx) {
    if (!ctx.host.keychain || typeof ctx.host.keychain.readGenericPassword !== "function") {
      return null
    }
    try {
      var raw = ctx.host.keychain.readGenericPassword(AGY_KEYCHAIN_SERVICE, AGY_KEYCHAIN_ACCOUNT)
      return extractAgyTokens(ctx, raw)
    } catch (e) {
      ctx.host.log.info("agy keychain read failed: " + String(e))
      return null
    }
  }

  // --- LS discovery ---

  function discoverLs(ctx) {
    return ctx.host.ls.discover({
      processName: "language_server",
      markers: ["antigravity", "antigravity-ide"],
      csrfFlag: "--csrf_token",
      portFlag: "--extension_server_port",
    })
  }

  function discoverAgyLs(ctx) {
    return ctx.host.ls.discover({
      processName: "agy",
      markers: [],
      csrfFlag: "",
      portFlag: null,
    })
  }

  function probePort(ctx, scheme, port, csrf) {
    ctx.host.http.request({
      method: "POST",
      url: scheme + "://127.0.0.1:" + port + "/" + LS_SERVICE + "/GetUnleashData",
      headers: {
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
        "x-codeium-csrf-token": csrf,
      },
      bodyText: JSON.stringify({
        context: {
          properties: {
            devMode: "false",
            extensionVersion: "unknown",
            ide: "antigravity",
            ideVersion: "unknown",
            os: "windows",
          },
        },
      }),
      timeoutMs: 5000,
      dangerouslyIgnoreTls: scheme === "https",
    })
    // Any HTTP response means this port is alive (even 400 validation errors).
    return true
  }

  function findWorkingPort(ctx, discovery) {
    var ports = discovery.ports || []
    for (var i = 0; i < ports.length; i++) {
      var port = ports[i]
      // Try HTTPS first (LS may use self-signed cert), then HTTP
      try { if (probePort(ctx, "https", port, discovery.csrf)) return { port: port, scheme: "https" } } catch (e) { /* ignore */ }
      try { if (probePort(ctx, "http", port, discovery.csrf)) return { port: port, scheme: "http" } } catch (e) { /* ignore */ }
      ctx.host.log.info("port " + port + " probe failed on both schemes")
    }
    if (discovery.extensionPort) return { port: discovery.extensionPort, scheme: "http" }
    return null
  }

  function callLs(ctx, port, scheme, csrf, method, body) {
    var resp = ctx.host.http.request({
      method: "POST",
      url: scheme + "://127.0.0.1:" + port + "/" + LS_SERVICE + "/" + method,
      headers: {
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
        "x-codeium-csrf-token": csrf,
      },
      bodyText: JSON.stringify(body || {}),
      timeoutMs: 10000,
      dangerouslyIgnoreTls: scheme === "https",
    })
    if (resp.status < 200 || resp.status >= 300) {
      ctx.host.log.warn("callLs " + method + " returned " + resp.status)
      return null
    }
    return ctx.util.tryParseJson(resp.bodyText)
  }

  // --- Line builders ---

  function normalizeLabel(label) {
    // "Gemini 3 Pro (High)" -> "Gemini 3 Pro"
    return label.replace(/\s*\([^)]*\)\s*$/, "").trim()
  }

  function poolLabel(normalizedLabel) {
    // Pro and Flash draw from one shared pool since Antigravity's 2026-05-19 quota merge,
    // so every Gemini model maps to the single "Session" meter; Claude, GPT-OSS, and any
    // other non-Gemini model share the other pool.
    return normalizedLabel.toLowerCase().indexOf("gemini") !== -1 ? SESSION_LABEL : CLAUDE_LABEL
  }

  // Gemini 4 Argon has a weekly quota of its own (upstream #1395); the per-model quotas carry no
  // window, so it never joins the Gemini pool. M421 and the names were seen in GetUserStatus.
  function isArgonModel(label, modelId) {
    if (modelId === "MODEL_PLACEHOLDER_M421") return true
    var values = [label, modelId || ""]
    for (var i = 0; i < values.length; i++) {
      var normalized = String(values[i]).toLowerCase().replace(/ /g, "-")
      if (normalized === "gemini-4-argon" || normalized.indexOf("gemini-4-argon-") === 0) return true
    }
    return false
  }

  function modelSortKey(label) {
    // The Gemini pool ("Session") before Claude, matching the plugin.json declaration order.
    return label === SESSION_LABEL ? "0_" + label : "1_" + label
  }

  var QUOTA_PERIOD_MS = 5 * 60 * 60 * 1000 // 5 hours
  var WEEKLY_PERIOD_MS = 7 * 24 * 60 * 60 * 1000

  var SESSION_LABEL = "Session"
  var WEEKLY_LABEL = "Weekly"
  var CLAUDE_LABEL = "Claude"
  var CLAUDE_WEEKLY_LABEL = "Claude Weekly"

  function modelLine(ctx, label, remainingFraction, resetTime, periodMs) {
    var clamped = Math.max(0, Math.min(1, remainingFraction))
    var used = Math.round((1 - clamped) * 100)
    return ctx.line.progress({
      label: label,
      used: used,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: resetTime || undefined,
      periodDurationMs: periodMs || QUOTA_PERIOD_MS,
    })
  }

  function buildModelLines(ctx, configs) {
    var deduped = {}
    for (var i = 0; i < configs.length; i++) {
      var c = configs[i]
      var label = (typeof c.label === "string") ? c.label.trim() : ""
      if (!label) continue
      var qi = c.quotaInfo
      var frac = (qi && typeof qi.remainingFraction === "number" && Number.isFinite(qi.remainingFraction))
        ? qi.remainingFraction
        : null
      if (frac === null) {
        // Never fabricate a 100%-used meter from missing quota info — drop the model.
        ctx.host.log.warn("model '" + label + "' has no usable remainingFraction; dropping it")
        continue
      }
      var mid = c.modelId || (c.modelOrAlias && c.modelOrAlias.model)
      if (isArgonModel(label, mid)) {
        ctx.host.log.warn("skipping legacy Argon quota: its pool and period are unavailable")
        continue
      }
      var rtime = (qi && qi.resetTime) || undefined
      var pool = poolLabel(normalizeLabel(label))
      if (!deduped[pool] || frac < deduped[pool].remainingFraction) {
        deduped[pool] = {
          label: pool,
          remainingFraction: frac,
          resetTime: rtime,
        }
      }
    }

    var models = []
    var keys = Object.keys(deduped)
    for (var i = 0; i < keys.length; i++) {
      var m = deduped[keys[i]]
      m.sortKey = modelSortKey(m.label)
      models.push(m)
    }

    models.sort(function (a, b) {
      return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0
    })

    var lines = []
    for (var i = 0; i < models.length; i++) {
      lines.push(modelLine(ctx, models[i].label, models[i].remainingFraction, models[i].resetTime))
    }
    return lines
  }

  // --- RetrieveUserQuotaSummary (the authoritative source) ---

  // The four pool buckets the summary reports, matched by exact bucketId only — a future
  // bucket (e.g. gemini-image-5h) must never silently join a pool, and pool identity is
  // never inferred from displayName/window.
  var SUMMARY_BUCKETS = [
    { bucketId: "gemini-5h", label: SESSION_LABEL, periodMs: QUOTA_PERIOD_MS },
    { bucketId: "gemini-weekly", label: WEEKLY_LABEL, periodMs: WEEKLY_PERIOD_MS },
    { bucketId: "3p-5h", label: CLAUDE_LABEL, periodMs: QUOTA_PERIOD_MS },
    { bucketId: "3p-weekly", label: CLAUDE_WEEKLY_LABEL, periodMs: WEEKLY_PERIOD_MS },
  ]

  // Eligible accounts get a separate Gemini 4 Argon group with its own weekly window (upstream
  // #1395). Its buckets never feed the shared pools, even under a shared bucket id.
  var ARGON_GROUP = "Gemini 4 Argon"
  var ARGON_WEEKLY_LABEL = "Argon Weekly"

  function isSharedBucketId(id) {
    for (var k = 0; k < SUMMARY_BUCKETS.length; k++) {
      if (SUMMARY_BUCKETS[k].bucketId === id) return true
    }
    return false
  }

  // Both envelopes: the LS wraps the payload ({"response":{"groups":…}}), Cloud Code doesn't.
  function summaryGroups(data) {
    if (!data || typeof data !== "object") return null
    if (data.response && Array.isArray(data.response.groups)) return data.response.groups
    if (Array.isArray(data.groups)) return data.groups
    return null
  }

  // The buckets of the shared pools: every group but Argon's.
  function sharedBuckets(groups) {
    var buckets = []
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i]
      if (!group || group.displayName === ARGON_GROUP || !Array.isArray(group.buckets)) continue
      for (var j = 0; j < group.buckets.length; j++) {
        if (group.buckets[j] && typeof group.buckets[j] === "object") buckets.push(group.buckets[j])
      }
    }
    return buckets
  }

  function usableFraction(bucket) {
    return typeof bucket.remainingFraction === "number" && Number.isFinite(bucket.remainingFraction)
  }

  // Whether one body already has a usable value for all four shared pools: under the first-wins
  // merge no other host's answer could change those meters.
  function isCompleteSummary(data) {
    var groups = summaryGroups(data)
    if (!groups) return false
    var usable = {}
    var buckets = sharedBuckets(groups)
    for (var i = 0; i < buckets.length; i++) {
      if (usableFraction(buckets[i])) usable[buckets[i].bucketId] = true
    }
    for (var k = 0; k < SUMMARY_BUCKETS.length; k++) {
      if (!usable[SUMMARY_BUCKETS[k].bucketId]) return false
    }
    return true
  }

  // Argon's line needs exactly one weekly bucket with its own id; a disabled flag that isn't a
  // boolean can't establish access, so the line is dropped.
  function argonWeeklyLine(ctx, groups) {
    var buckets = []
    var found = false
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i]
      if (!group || group.displayName !== ARGON_GROUP) continue
      found = true
      if (Array.isArray(group.buckets)) buckets = buckets.concat(group.buckets)
    }
    if (!found) return null
    var weekly = []
    for (var j = 0; j < buckets.length; j++) {
      var bucket = buckets[j]
      if (!bucket || typeof bucket !== "object") continue
      if (bucket.window !== "weekly") {
        ctx.host.log.warn("Argon quota has unsupported window '" + String(bucket.window) + "'; skipping its bucket")
        continue
      }
      weekly.push(bucket)
    }
    var only = weekly.length === 1 ? weekly[0] : null
    if (!only || typeof only.bucketId !== "string" || !only.bucketId || isSharedBucketId(only.bucketId)) {
      ctx.host.log.warn("Argon quota group has no unambiguous separate weekly bucket; dropping its line")
      return null
    }
    if (only.disabled !== undefined && only.disabled !== null && typeof only.disabled !== "boolean") {
      ctx.host.log.warn("Argon weekly quota has an unusable disabled flag; dropping its line")
      return null
    }
    if (only.disabled === true) return null
    if (!usableFraction(only)) {
      ctx.host.log.warn("Argon weekly quota has no usable remainingFraction; dropping its line")
      return null
    }
    return modelLine(ctx, ARGON_WEEKLY_LABEL, only.remainingFraction, only.resetTime, WEEKLY_PERIOD_MS)
  }

  // RetrieveUserQuotaSummary bodies (one per Cloud Code host, or the LS's one) → up to five meters,
  // ordered Session, Weekly, Argon Weekly, Claude, Claude Weekly. Buckets merge by id, the first
  // usable one winning: one host can omit a whole pool (upstream #1407). Returns null when no body
  // is a summary (the caller may fall back to the legacy endpoints). A non-null result, even an
  // empty one, is authoritative. A bucket with a missing/unusable remainingFraction drops its line
  // instead of fabricating 0% or 100%.
  function parseQuotaSummaries(ctx, bodies) {
    var groupLists = []
    for (var b = 0; b < bodies.length; b++) {
      var groups = summaryGroups(bodies[b])
      if (groups) groupLists.push(groups)
    }
    if (groupLists.length === 0) return null

    var pooled = {}
    for (var g = 0; g < groupLists.length; g++) {
      var buckets = sharedBuckets(groupLists[g])
      for (var j = 0; j < buckets.length; j++) {
        var bucket = buckets[j]
        var id = bucket.bucketId
        if (!isSharedBucketId(id)) {
          ctx.host.log.warn("quota summary: skipping unrecognized bucket id '" + String(id) + "'")
          continue
        }
        if (pooled[id]) continue // duplicate bucket id — first one wins
        if (!usableFraction(bucket)) {
          ctx.host.log.warn("quota summary: bucket '" + id + "' has no usable remainingFraction; dropping its line")
          continue
        }
        pooled[id] = { fraction: bucket.remainingFraction, resetTime: bucket.resetTime || undefined }
      }
    }

    var lines = []
    for (var m = 0; m < SUMMARY_BUCKETS.length; m++) {
      var spec = SUMMARY_BUCKETS[m]
      var entry = pooled[spec.bucketId]
      if (!entry) continue
      lines.push(modelLine(ctx, spec.label, entry.fraction, entry.resetTime, spec.periodMs))
    }

    // Argon is judged per body: two hosts' Argon groups together would read as an ambiguous bucket.
    for (var a = 0; a < groupLists.length; a++) {
      var argon = argonWeeklyLine(ctx, groupLists[a])
      if (!argon) continue
      var at = lines.length
      for (var n = 0; n < lines.length; n++) {
        if (lines[n].label === CLAUDE_LABEL || lines[n].label === CLAUDE_WEEKLY_LABEL) { at = n; break }
      }
      lines.splice(at, 0, argon)
      break
    }
    return lines
  }

  function parseQuotaSummary(ctx, data) {
    return parseQuotaSummaries(ctx, [data])
  }

  // Seen 2026-10-25: both Cloud Code hosts answered with only the Claude group while the per-model
  // quotas still carried every Gemini model. A summary that reports other pools but no Gemini bucket
  // at all gets its Session (Gemini 5h) from those quotas; Gemini's weekly window stays unknown.
  function summaryLacksGemini(bodies, lines) {
    if (lines.length === 0) return false
    for (var b = 0; b < bodies.length; b++) {
      var buckets = sharedBuckets(summaryGroups(bodies[b]) || [])
      for (var j = 0; j < buckets.length; j++) {
        var id = buckets[j].bucketId
        if (id === "gemini-5h" || id === "gemini-weekly") return false
      }
    }
    return true
  }

  function withLegacyGemini(ctx, lines, configs) {
    // Image models have a quota of their own (gemini-image-5h), not the shared Gemini pool.
    var pooled = configs.filter(function (c) { return !/image/i.test(String(c.label)) })
    var legacy = buildModelLines(ctx, pooled)
    for (var i = 0; i < legacy.length; i++) {
      if (legacy[i].label === SESSION_LABEL) return [legacy[i]].concat(lines)
    }
    return lines
  }

  function withCloudGemini(ctx, token, summaries, lines) {
    if (!summaryLacksGemini(summaries, lines)) return lines
    ctx.host.log.warn("quota summary has no Gemini group; Session comes from fetchAvailableModels")
    var models = requestCloudCodeJson(ctx, FETCH_MODELS_PATH, token, "antigravity", {})
    return models && !models._authFailed ? withLegacyGemini(ctx, lines, parseCloudCodeModels(models)) : lines
  }

  function dropBlacklisted(configs) {
    return configs.filter(function (c) {
      var mid = c && c.modelOrAlias && c.modelOrAlias.model
      return !(mid && CC_MODEL_BLACKLIST[mid])
    })
  }

  // --- Cloud Code API ---

  // One Cloud Code host: the JSON body, { _authFailed: true }, or null (unavailable).
  function requestCloudCodeHost(ctx, base, path, token, userAgent, body, timeoutMs) {
    try {
      var resp = ctx.host.http.request({
        method: "POST",
        url: base + path,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          "User-Agent": userAgent || "antigravity",
        },
        bodyText: JSON.stringify(body || {}),
        timeoutMs: timeoutMs || 15000,
      })
      if (!resp || typeof resp.status !== "number" || !Number.isFinite(resp.status)) {
        ctx.host.log.warn("Cloud Code returned invalid response shape (" + base + ")")
        return null
      }
      if (ctx.util.isAuthStatus(resp.status)) return { _authFailed: true }
      if (resp.status >= 200 && resp.status < 300) {
        var json = ctx.util.tryParseJson(resp.bodyText)
        if (!json || typeof json !== "object") {
          ctx.host.log.warn("Cloud Code returned invalid JSON (" + base + ")")
          return null
        }
        return json
      }
    } catch (e) {
      ctx.host.log.warn("Cloud Code request failed (" + base + "): " + String(e))
    }
    return null
  }

  // The first host that answers (or rejects the token) wins.
  function requestCloudCodeJson(ctx, path, token, userAgent, body) {
    for (var i = 0; i < CLOUD_CODE_URLS.length; i++) {
      var json = requestCloudCodeHost(ctx, CLOUD_CODE_URLS[i], path, token, userAgent, body)
      if (json) return json
    }
    return null
  }

  // The quota summary from production, then daily unless production's answer is already complete
  // (upstream #1407: one host can omit a whole pool). The 2xx bodies in host order,
  // { _authFailed: true }, or null.
  function requestQuotaSummaries(ctx, token) {
    var bodies = []
    for (var i = 0; i < CLOUD_CODE_URLS.length; i++) {
      var json = requestCloudCodeHost(ctx, CLOUD_CODE_URLS[i], QUOTA_SUMMARY_PATH, token, "antigravity", {})
      if (json && json._authFailed) return bodies.length ? bodies : json
      if (!json) continue
      bodies.push(json)
      if (isCompleteSummary(json)) break
    }
    return bodies.length ? bodies : null
  }

  // The plan never gates the meters: one short request to production, and a failed loadCodeAssist
  // just leaves the badge blank. The probe has a 30 s deadline, and two 15 s timeouts here would
  // throw away meters already fetched.
  var PLAN_TIMEOUT_MS = 5000
  function loadCloudPlan(ctx, token) {
    var data = requestCloudCodeHost(ctx, CLOUD_CODE_URLS[0], LOAD_CODE_ASSIST_PATH, token, "antigravity", {}, PLAN_TIMEOUT_MS)
    return data && !data._authFailed ? readAgyPlan(data) : null
  }

  // Cloud Code probe for one DB/cached/refreshed token: the quota summary first (the only
  // endpoint reporting the merged pools and weekly windows; authoritative even when empty),
  // then the legacy fetchAvailableModels chain for builds without the RPC.
  // Returns { plan, lines }, { _authFailed: true }, or null (unavailable).
  function probeCloudCodeToken(ctx, token) {
    var summaries = requestQuotaSummaries(ctx, token)
    if (summaries && summaries._authFailed) return summaries
    if (summaries) {
      var summaryLines = parseQuotaSummaries(ctx, summaries)
      if (summaryLines) {
        return { plan: loadCloudPlan(ctx, token), lines: withCloudGemini(ctx, token, summaries, summaryLines) }
      }
      // 2xx but not a summary payload — the parser said so; fall to the legacy chain.
    }

    var data = requestCloudCodeJson(ctx, FETCH_MODELS_PATH, token, "antigravity", {})
    if (!data || data._authFailed) return data
    var lines = buildModelLines(ctx, parseCloudCodeModels(data))
    if (lines.length === 0) return null
    return { plan: loadCloudPlan(ctx, token), lines: lines }
  }

  function parseCloudCodeModels(data) {
    var modelsObj = data && data.models
    if (!modelsObj || typeof modelsObj !== "object") return []
    var keys = Object.keys(modelsObj)
    var configs = []
    for (var i = 0; i < keys.length; i++) {
      var m = modelsObj[keys[i]]
      if (!m || typeof m !== "object") continue
      if (m.isInternal) continue
      var modelId = m.model || keys[i]
      if (CC_MODEL_BLACKLIST[modelId]) continue
      var displayName =
        (typeof m.displayName === "string" && m.displayName.trim()) ||
        (typeof m.label === "string" && m.label.trim()) ||
        ""
      if (!displayName) continue
      // Pass quotaInfo through untouched — buildModelLines drops models without a usable
      // remainingFraction instead of fabricating a value here.
      configs.push({
        label: displayName,
        modelId: modelId,
        quotaInfo: m.quotaInfo,
      })
    }
    return configs
  }

  // Google One tiers by paidTier.id, for a paid tier that comes without a name.
  var PAID_TIER_PLANS = {
    "g1-pro-tier": "Google AI Pro",
    "g1-ultra-tier": "Google AI Ultra",
    "g1-ultra-lite-tier": "Google AI Ultra Lite",
  }

  function readAgyPlan(loadData) {
    var paidTier = loadData && loadData.paidTier
    if (paidTier && typeof paidTier.name === "string" && paidTier.name.trim()) {
      return paidTier.name.trim()
    }
    if (paidTier && typeof paidTier.id === "string" && Object.prototype.hasOwnProperty.call(PAID_TIER_PLANS, paidTier.id)) {
      return PAID_TIER_PLANS[paidTier.id]
    }
    var currentTier = loadData && loadData.currentTier
    if (currentTier && typeof currentTier.name === "string" && currentTier.name.trim()) {
      return currentTier.name.trim()
    }
    return null
  }

  function parseAgyQuotaBuckets(data) {
    var buckets = data && data.buckets
    if (!Array.isArray(buckets)) return []
    var configs = []
    for (var i = 0; i < buckets.length; i++) {
      var bucket = buckets[i]
      if (!bucket || typeof bucket !== "object") continue
      var modelId = (typeof bucket.modelId === "string" && bucket.modelId.trim()) || ""
      if (!modelId) continue
      // No frac default — buildModelLines drops buckets without a usable remainingFraction.
      configs.push({
        label: modelId,
        quotaInfo: { remainingFraction: bucket.remainingFraction, resetTime: bucket.resetTime || undefined },
      })
    }
    return configs
  }

  function probeAgyCloudCode(ctx, token) {
    // Authoritative first: the quota summary. The plan lookup never gates it — a failed
    // loadCodeAssist just leaves the plan blank. User-Agent "agy" gets 403 SUBSCRIPTION_REQUIRED
    // on every quota endpoint (and no paidTier) even for paid accounts; "antigravity" works.
    var summaries = requestQuotaSummaries(ctx, token)
    if (summaries && summaries._authFailed) return summaries
    if (summaries) {
      var summaryLines = parseQuotaSummaries(ctx, summaries)
      if (summaryLines) {
        return { plan: loadCloudPlan(ctx, token), lines: withCloudGemini(ctx, token, summaries, summaryLines) }
      }
    }

    var loadData = requestCloudCodeJson(ctx, LOAD_CODE_ASSIST_PATH, token, "antigravity", {})
    if (!loadData || loadData._authFailed) return loadData

    var project =
      typeof loadData.cloudaicompanionProject === "string" && loadData.cloudaicompanionProject.trim()
        ? loadData.cloudaicompanionProject.trim()
        : null
    var quotaData = null
    if (project) {
      quotaData = requestCloudCodeJson(ctx, RETRIEVE_QUOTA_PATH, token, "antigravity", { project: project })
    }
    if (!quotaData || quotaData._authFailed) {
      quotaData = requestCloudCodeJson(ctx, RETRIEVE_QUOTA_PATH, token, "antigravity", {})
    }
    if (!quotaData || quotaData._authFailed) return quotaData

    var lines = buildModelLines(ctx, parseAgyQuotaBuckets(quotaData))
    if (lines.length === 0) return null
    return { plan: readAgyPlan(loadData), lines: lines }
  }

  // --- LS probe ---

  // Prefer userTier.name (Google's own subscription system) over the legacy
  // planInfo.planName field inherited from Windsurf/Codeium, which always
  // returns "Pro" for all paid tiers including Google AI Ultra.
  function readLsPlan(data) {
    var us = data && data.userStatus
    if (!us) return null
    var ut = us.userTier
    if (ut && typeof ut.name === "string" && ut.name.trim()) return ut.name.trim()
    var ps = us.planStatus || {}
    var pi = ps.planInfo || {}
    return (typeof pi.planName === "string" && pi.planName.trim()) ? pi.planName.trim() : null
  }

  function probeDiscovery(ctx, discovery) {
    if (!discovery) return null

    var found = findWorkingPort(ctx, discovery)
    if (!found) return null

    ctx.host.log.info("using LS at " + found.scheme + "://127.0.0.1:" + found.port)

    var metadata = {
      ideName: "antigravity",
      extensionName: "antigravity",
      ideVersion: "unknown",
      locale: "en",
    }

    // Authoritative first: RetrieveUserQuotaSummary (merged pools + weekly windows). A
    // parsed summary — even with zero usable buckets — is the answer and never falls
    // through to the legacy endpoints, which would fabricate lines from partial data.
    // Builds without the RPC return non-2xx (callLs logs it) and use the legacy chain.
    var summaryData = null
    try {
      summaryData = callLs(ctx, found.port, found.scheme, discovery.csrf, "RetrieveUserQuotaSummary", { metadata: metadata })
    } catch (e) {
      ctx.host.log.warn("RetrieveUserQuotaSummary threw: " + String(e))
    }
    if (summaryData) {
      var summaryLines = parseQuotaSummary(ctx, summaryData)
      if (summaryLines) {
        // The plan comes from an independent GetUserStatus call; a failed plan lookup
        // just leaves the plan blank.
        var statusData = null
        try {
          statusData = callLs(ctx, found.port, found.scheme, discovery.csrf, "GetUserStatus", { metadata: metadata })
        } catch (e) {
          ctx.host.log.warn("GetUserStatus threw: " + String(e))
        }
        if (summaryLacksGemini([summaryData], summaryLines)) {
          ctx.host.log.warn("quota summary has no Gemini group; Session comes from GetUserStatus")
          var statusConfigs = statusData && statusData.userStatus &&
            (statusData.userStatus.cascadeModelConfigData || {}).clientModelConfigs
          summaryLines = withLegacyGemini(ctx, summaryLines, dropBlacklisted(statusConfigs || []))
        }
        return { plan: readLsPlan(statusData), lines: summaryLines }
      }
      // 2xx but not a summary payload — fall to the legacy flow.
    }

    // Try GetUserStatus first, fall back to GetCommandModelConfigs
    var data = null
    try {
      data = callLs(ctx, found.port, found.scheme, discovery.csrf, "GetUserStatus", { metadata: metadata })
    } catch (e) {
      ctx.host.log.warn("GetUserStatus threw: " + String(e))
    }
    var hasUserStatus = data && data.userStatus

    if (!hasUserStatus) {
      ctx.host.log.warn("GetUserStatus failed, trying GetCommandModelConfigs")
      data = callLs(ctx, found.port, found.scheme, discovery.csrf, "GetCommandModelConfigs", { metadata: metadata })
    }

    // Parse model configs
    var configs
    if (hasUserStatus) {
      configs = (data.userStatus.cascadeModelConfigData || {}).clientModelConfigs || []
    } else if (data && data.clientModelConfigs) {
      configs = data.clientModelConfigs
    } else {
      return null
    }

    var lines = buildModelLines(ctx, dropBlacklisted(configs))
    if (lines.length === 0) return null

    var plan = hasUserStatus ? readLsPlan(data) : null

    return { plan: plan, lines: lines }
  }

  function probeLs(ctx) {
    return probeDiscovery(ctx, discoverLs(ctx))
  }

  function probeAgyLs(ctx) {
    return probeDiscovery(ctx, discoverAgyLs(ctx))
  }

  // Same order as the SQLite path: the stored token while it has a minute left, then our
  // cached refresh of it, then a Google refresh — only on an auth failure or with nothing to try.
  function probeAgyKeychain(ctx, agy, nowSec) {
    var tokens = []
    if (agy.accessToken && (!agy.expirySeconds || agy.expirySeconds > nowSec + 60)) {
      tokens.push(agy.accessToken)
    }
    var cached = loadCachedToken(ctx, agy.refreshToken ? [agy.refreshToken] : [], AGY_TOKEN_CACHE)
    if (cached && tokens.indexOf(cached) === -1) tokens.push(cached)

    var sawAuthFailure = false
    for (var i = 0; i < tokens.length; i++) {
      var result = probeAgyCloudCode(ctx, tokens[i])
      if (result && !result._authFailed) return result
      if (result && result._authFailed) sawAuthFailure = true
    }
    if ((sawAuthFailure || tokens.length === 0) && agy.refreshToken) {
      var refreshed = refreshAccessToken(ctx, agy.refreshToken, AGY_TOKEN_CACHE)
      if (refreshed) return probeAgyCloudCode(ctx, refreshed)
    }
    return sawAuthFailure ? { _authFailed: true } : null
  }

  // --- Probe ---

  function probe(ctx) {
    var lsResult = probeLs(ctx)
    if (lsResult) return lsResult

    var agyLsResult = probeAgyLs(ctx)
    if (agyLsResult) return agyLsResult

    var dbTokenCandidates = loadOAuthTokenCandidates(ctx)

    var tokens = []
    var refreshTokens = []
    var nowSec = Math.floor(Date.now() / 1000)
    for (var i = 0; i < dbTokenCandidates.length; i++) {
      var dbTokens = dbTokenCandidates[i]
      if (dbTokens.accessToken && (!dbTokens.expirySeconds || dbTokens.expirySeconds > nowSec)) {
        if (tokens.indexOf(dbTokens.accessToken) === -1) tokens.push(dbTokens.accessToken)
      }
      if (dbTokens.refreshToken && refreshTokens.indexOf(dbTokens.refreshToken) === -1) {
        refreshTokens.push(dbTokens.refreshToken)
      }
    }

    // The cache only yields a token minted by a refresh token that is still present locally.
    var cached = loadCachedToken(ctx, refreshTokens, DB_TOKEN_CACHE)
    if (cached && tokens.indexOf(cached) === -1) tokens.push(cached)

    var ccResult = null
    var sawAuthFailure = false
    for (var i = 0; i < tokens.length; i++) {
      var nextResult = probeCloudCodeToken(ctx, tokens[i])
      if (nextResult && !nextResult._authFailed) {
        ccResult = nextResult
        break
      }
      if (nextResult && nextResult._authFailed) sawAuthFailure = true
    }

    // Only refresh on evidence of an auth failure, or when there were no tokens to try.
    // probeCloudCodeToken returns null for transient failures (5xx/timeouts); without this
    // guard a Cloud Code incident would trigger a Google OAuth refresh every probe cycle
    // instead of ~once per token lifetime — risking refresh-token throttling or rotation.
    if (!ccResult && (sawAuthFailure || tokens.length === 0)) {
      for (var k = 0; k < refreshTokens.length; k++) {
        var refreshed = refreshAccessToken(ctx, refreshTokens[k], DB_TOKEN_CACHE)
        if (!refreshed) continue
        var refreshedResult = probeCloudCodeToken(ctx, refreshed)
        if (refreshedResult && !refreshedResult._authFailed) {
          ccResult = refreshedResult
          break
        }
        if (refreshedResult && refreshedResult._authFailed) ccResult = refreshedResult
      }
    }

    if (!ccResult || ccResult._authFailed) {
      var agy = loadAgyKeychainToken(ctx)
      if (agy) {
        var agyResult = probeAgyKeychain(ctx, agy, nowSec)
        if (agyResult && !agyResult._authFailed) return agyResult
        if (agyResult && agyResult._authFailed) ccResult = agyResult
      }
    }

    if (ccResult && !ccResult._authFailed) return ccResult

    throw LOGIN_MESSAGE
  }

  globalThis.__openusage_plugin = { id: "antigravity", probe: probe }
})()
