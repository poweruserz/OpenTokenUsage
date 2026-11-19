(function () {
  const AUTH_V2_PATH = "~/.factory/auth.v2.file"
  const AUTH_V2_KEY_PATH = "~/.factory/auth.v2.key"
  const AUTH_V2_KEYRING_PATH = "~/.factory/auth.v2.keyring"
  const KEYRING_SERVICE = "Factory CLI"
  const KEYRING_ACCOUNT = "auth-encryption-key"
  const AUTH_PATHS = ["~/.factory/auth.encrypted", "~/.factory/auth.json"]
  const KEYCHAIN_SERVICES = ["Factory Token", "Factory token", "Factory Auth", "Droid Auth"]
  const WORKOS_CLIENT_ID = "client_01HNM792M5G5G1A2THWPXKFMXB"
  const WORKOS_AUTH_URL = "https://api.workos.com/user_management/authenticate"
  const USAGE_URL = "https://api.factory.ai/api/billing/limits"
  const FIVE_HOUR_MS = 5 * 60 * 60 * 1000
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000
  const TOKEN_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours before expiry

  function decodeHexUtf8(hex) {
    try {
      const bytes = []
      for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.slice(i, i + 2), 16))
      }

      if (typeof TextDecoder !== "undefined") {
        try {
          return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes))
        } catch {}
      }

      let escaped = ""
      for (const b of bytes) {
        const h = b.toString(16)
        escaped += "%" + (h.length === 1 ? "0" + h : h)
      }
      return decodeURIComponent(escaped)
    } catch {
      return null
    }
  }

  function tryParseAuthJson(ctx, text) {
    if (!text) return null
    const parsed = ctx.util.tryParseJson(text)
    if (parsed !== null) return parsed

    // Some keychain payloads can be returned as hex-encoded UTF-8 bytes.
    let hex = String(text).trim()
    if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2)
    if (!hex || hex.length % 2 !== 0) return null
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null

    const decoded = decodeHexUtf8(hex)
    if (!decoded) return null
    return ctx.util.tryParseJson(decoded)
  }

  function looksLikeJwt(value) {
    return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(value)
  }

  function normalizeAuthPayload(raw, opts) {
    const allowPartial = Boolean(opts && opts.allowPartial)
    if (!raw || typeof raw !== "object") return null

    const accessToken =
      raw.access_token ||
      raw.accessToken ||
      (raw.tokens && (raw.tokens.access_token || raw.tokens.accessToken))

    const refreshToken =
      raw.refresh_token ||
      raw.refreshToken ||
      (raw.tokens && (raw.tokens.refresh_token || raw.tokens.refreshToken))

    const hasAccess = typeof accessToken === "string" && accessToken
    const hasRefresh = typeof refreshToken === "string" && refreshToken
    if (!hasAccess && !(allowPartial && hasRefresh)) return null

    return {
      access_token: hasAccess ? accessToken : null,
      refresh_token: hasRefresh ? refreshToken : null,
    }
  }

  function parseAuthPayload(ctx, rawText, opts) {
    const parsed = tryParseAuthJson(ctx, rawText)
    const normalized = normalizeAuthPayload(parsed, opts)
    if (normalized) return normalized

    if (typeof parsed === "string" && looksLikeJwt(parsed)) {
      return { access_token: parsed, refresh_token: null }
    }

    const direct = String(rawText || "").trim()
    if (looksLikeJwt(direct)) {
      return { access_token: direct, refresh_token: null }
    }

    return null
  }

  function hasDecryptHelper(ctx) {
    return Boolean(ctx.host.crypto) && typeof ctx.host.crypto.decryptAes256Gcm === "function"
  }

  function decryptV2(ctx, authPath, key, source) {
    try {
      const envelope = ctx.host.fs.readText(authPath)
      const decrypted = ctx.host.crypto.decryptAes256Gcm(envelope, key)
      const auth = parseAuthPayload(ctx, decrypted, { allowPartial: true })
      if (!auth) {
        ctx.host.log.warn("auth file exists but has no valid auth payload: " + authPath)
        return null
      }
      const parsed = ctx.util.tryParseJson(decrypted)
      const raw = parsed && typeof parsed === "object" ? parsed : null
      ctx.host.log.info("auth loaded from file: " + authPath)
      return { auth, raw, source, authPath, authKey: key, keychainService: null }
    } catch (e) {
      ctx.host.log.warn("auth file read failed: " + String(e))
      return null
    }
  }

  function loadAuthFromV2File(ctx) {
    if (!hasDecryptHelper(ctx)) return null
    if (!ctx.host.fs.exists(AUTH_V2_PATH) || !ctx.host.fs.exists(AUTH_V2_KEY_PATH)) {
      return null
    }

    let key
    try {
      key = ctx.host.fs.readText(AUTH_V2_KEY_PATH)
    } catch (e) {
      ctx.host.log.warn("auth file read failed: " + String(e))
      return null
    }
    return decryptV2(ctx, AUTH_V2_PATH, key, "file-v2")
  }

  function loadAuthFromV2Keyring(ctx) {
    if (!hasDecryptHelper(ctx)) return null
    if (!ctx.host.fs.exists(AUTH_V2_KEYRING_PATH)) return null
    if (!ctx.host.keychain || typeof ctx.host.keychain.readGenericPassword !== "function") {
      return null
    }

    let key
    try {
      key = ctx.host.keychain.readGenericPassword(KEYRING_SERVICE, KEYRING_ACCOUNT)
    } catch (e) {
      ctx.host.log.warn("auth keyring key unavailable: " + String(e))
      return null
    }
    if (!key) return null
    return decryptV2(ctx, AUTH_V2_KEYRING_PATH, key, "keyring-v2")
  }

  function loadAuthFromFiles(ctx) {
    const keyringAuth = loadAuthFromV2Keyring(ctx)
    if (keyringAuth) return keyringAuth

    const v2Auth = loadAuthFromV2File(ctx)
    if (v2Auth) return v2Auth

    for (const authPath of AUTH_PATHS) {
      if (!ctx.host.fs.exists(authPath)) continue

      try {
        const text = ctx.host.fs.readText(authPath)
        const auth = parseAuthPayload(ctx, text, { allowPartial: true })
        if (!auth) {
          ctx.host.log.warn("auth file exists but has no valid auth payload: " + authPath)
          continue
        }
        ctx.host.log.info("auth loaded from file: " + authPath)
        return { auth, source: "file", authPath, keychainService: null }
      } catch (e) {
        ctx.host.log.warn("auth file read failed: " + String(e))
      }
    }

    return null
  }

  function loadAuthFromKeychain(ctx) {
    if (!ctx.host.keychain || typeof ctx.host.keychain.readGenericPassword !== "function") {
      return null
    }

    for (const service of KEYCHAIN_SERVICES) {
      try {
        const value = ctx.host.keychain.readGenericPassword(service)
        if (!value) continue

        const auth = parseAuthPayload(ctx, value)
        if (!auth) {
          ctx.host.log.warn("keychain has data but no valid auth payload: " + service)
          continue
        }

        ctx.host.log.info("auth loaded from keychain: " + service)
        return { auth, source: "keychain", authPath: null, keychainService: service }
      } catch (e) {
        ctx.host.log.info("keychain read failed (may not exist): " + String(e))
      }
    }

    return null
  }

  function loadAuth(ctx) {
    const fileAuth = loadAuthFromFiles(ctx)
    if (fileAuth) return fileAuth

    const keychainAuth = loadAuthFromKeychain(ctx)
    if (keychainAuth) return keychainAuth

    if (!ctx.host.fs.exists(AUTH_V2_KEYRING_PATH)) {
      ctx.host.log.warn("auth file not found: " + AUTH_V2_KEYRING_PATH)
    }
    if (!ctx.host.fs.exists(AUTH_V2_PATH)) {
      ctx.host.log.warn("auth file not found: " + AUTH_V2_PATH)
    }
    if (!ctx.host.fs.exists(AUTH_V2_KEY_PATH)) {
      ctx.host.log.warn("auth file not found: " + AUTH_V2_KEY_PATH)
    }
    for (const authPath of AUTH_PATHS) {
      if (!ctx.host.fs.exists(authPath)) {
        ctx.host.log.warn("auth file not found: " + authPath)
      }
    }

    return null
  }

  function saveAuth(ctx, authState) {
    const auth = authState && authState.auth ? authState.auth : null
    if (!auth) return false

    try {
      if (
        (authState.source === "file-v2" || authState.source === "keyring-v2") &&
        authState.authPath &&
        authState.authKey
      ) {
        if (!ctx.host.crypto || typeof ctx.host.crypto.encryptAes256Gcm !== "function") {
          ctx.host.log.warn("auth persistence skipped: unsupported source " + authState.source)
          return false
        }
        const payload = authState.raw ? Object.assign({}, authState.raw, auth) : auth
        const envelope = ctx.host.crypto.encryptAes256Gcm(JSON.stringify(payload, null, 2), authState.authKey)
        ctx.host.fs.writeText(authState.authPath, envelope)
        ctx.host.log.info("auth file updated: " + authState.authPath)
        return true
      }

      if (authState.source === "file" && authState.authPath) {
        ctx.host.fs.writeText(authState.authPath, JSON.stringify(auth, null, 2))
        ctx.host.log.info("auth file updated: " + authState.authPath)
        return true
      }

      if (
        authState.source === "keychain" &&
        authState.keychainService &&
        ctx.host.keychain &&
        typeof ctx.host.keychain.writeGenericPassword === "function"
      ) {
        ctx.host.keychain.writeGenericPassword(authState.keychainService, JSON.stringify(auth))
        ctx.host.log.info("auth keychain item updated: " + authState.keychainService)
        return true
      }

      ctx.host.log.warn("auth persistence skipped: unsupported source")
      return false
    } catch (e) {
      ctx.host.log.warn("failed to save auth: " + String(e))
      return false
    }
  }

  function getAccessTokenExpiryMs(ctx, accessToken) {
    const payload = ctx.jwt.decodePayload(accessToken)
    return payload && typeof payload.exp === "number" ? payload.exp * 1000 : null
  }

  function needsRefresh(ctx, accessToken, nowMs) {
    return ctx.util.needsRefreshByExpiry({
      nowMs,
      expiresAtMs: getAccessTokenExpiryMs(ctx, accessToken),
      bufferMs: TOKEN_REFRESH_THRESHOLD_MS,
    })
  }

  function canUseExistingAccessToken(ctx, accessToken, nowMs) {
    const expiresAtMs = getAccessTokenExpiryMs(ctx, accessToken)
    return typeof expiresAtMs === "number" && nowMs < expiresAtMs
  }

  function refreshToken(ctx, authState) {
    const auth = authState.auth
    if (!auth.refresh_token) {
      ctx.host.log.warn("refresh skipped: no refresh token")
      return null
    }

    ctx.host.log.info("attempting token refresh via WorkOS")
    try {
      const resp = ctx.util.request({
        method: "POST",
        url: WORKOS_AUTH_URL,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        bodyText:
          "grant_type=refresh_token" +
          "&refresh_token=" + encodeURIComponent(auth.refresh_token) +
          "&client_id=" + encodeURIComponent(WORKOS_CLIENT_ID),
        timeoutMs: 15000,
      })

      if (resp.status === 400 || resp.status === 401) {
        ctx.host.log.error("refresh failed: status=" + resp.status)
        throw "Session expired. Run `droid` to log in again."
      }
      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.warn("refresh returned unexpected status: " + resp.status)
        return null
      }

      const body = ctx.util.tryParseJson(resp.bodyText)
      if (!body) {
        ctx.host.log.warn("refresh response not valid JSON")
        return null
      }
      const newAccessToken = body.access_token
      if (!newAccessToken) {
        ctx.host.log.warn("refresh response missing access_token")
        return null
      }

      // Update auth object with new tokens
      auth.access_token = newAccessToken
      if (body.refresh_token) {
        auth.refresh_token = body.refresh_token
      }

      // Save updated auth
      saveAuth(ctx, authState)
      ctx.host.log.info("refresh succeeded")

      return newAccessToken
    } catch (e) {
      if (typeof e === "string") throw e
      ctx.host.log.error("refresh exception: " + String(e))
      return null
    }
  }

  function fetchUsage(ctx, accessToken) {
    return ctx.util.request({
      method: "GET",
      url: USAGE_URL,
      headers: {
        Authorization: "Bearer " + accessToken,
        Accept: "application/json",
        "User-Agent": "OpenUsage",
      },
      timeoutMs: 10000,
    })
  }

  // A bucket with no window, or one that has ended, has no usage yet (droid shows "Use Droid to start").
  function bucketLine(ctx, label, bucket, periodMs, nowMs) {
    const windowEndMs = typeof bucket.windowEnd === "string" ? Date.parse(bucket.windowEnd) : NaN
    const active = Number.isFinite(windowEndMs) && windowEndMs > nowMs
    const used = active && typeof bucket.usedPercent === "number" ? bucket.usedPercent : 0
    const line = { label, used, limit: 100, format: { kind: "percent" } }
    if (active) {
      line.resetsAt = ctx.util.toIso(windowEndMs)
      line.periodDurationMs = periodMs === "month" ? monthPeriodMs(windowEndMs) : periodMs
    }
    return ctx.line.progress(line)
  }

  // One calendar month before the reset, the day clamped to that month's end (Mar 31 → Feb 28, not Mar 3).
  function monthPeriodMs(windowEndMs) {
    const start = new Date(windowEndMs)
    const day = start.getUTCDate()
    start.setUTCDate(1)
    start.setUTCMonth(start.getUTCMonth() - 1)
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
    start.setUTCDate(Math.min(day, lastDay))
    return windowEndMs - start.getTime()
  }

  function pushBucketLines(ctx, lines, group, nowMs) {
    const buckets = [
      [group.fiveHour, "Session", FIVE_HOUR_MS],
      [group.weekly, "Weekly", WEEK_MS],
      [group.monthly, "Monthly", "month"],
    ]
    for (const [bucket, label, periodMs] of buckets) {
      if (!bucket || bucket.unlimited === true) continue
      lines.push(bucketLine(ctx, label, bucket, periodMs, nowMs))
    }
  }

  function probe(ctx) {
    const authState = loadAuth(ctx)
    if (!authState) {
      ctx.host.log.error("probe failed: not logged in")
      throw "Not logged in. Run `droid` to authenticate."
    }

    const auth = authState.auth
    if (!auth.access_token) {
      ctx.host.log.error("probe failed: no access_token in auth data")
      throw "Invalid auth file. Run `droid` to authenticate."
    }

    let accessToken = auth.access_token

    // Check if token needs refresh
    const nowMs = Date.now()
    if (needsRefresh(ctx, accessToken, nowMs)) {
      ctx.host.log.info("token near expiry, refreshing")
      try {
        const refreshed = refreshToken(ctx, authState)
        if (refreshed) {
          accessToken = refreshed
        } else {
          ctx.host.log.warn("proactive refresh failed, trying with existing token")
        }
      } catch (e) {
        if (!canUseExistingAccessToken(ctx, accessToken, nowMs)) throw e
        ctx.host.log.warn("proactive refresh failed but access token is still valid, trying existing token")
      }
    }

    let resp
    let didRefresh = false
    try {
      resp = ctx.util.retryOnceOnAuth({
        request: (token) => {
          try {
            return fetchUsage(ctx, token || accessToken)
          } catch (e) {
            ctx.host.log.error("usage request exception: " + String(e))
            if (didRefresh) {
              throw "Usage request failed after refresh. Try again."
            }
            throw "Usage request failed. Check your connection."
          }
        },
        refresh: () => {
          ctx.host.log.info("usage returned 401, attempting refresh")
          didRefresh = true
          return refreshToken(ctx, authState)
        },
      })
    } catch (e) {
      if (typeof e === "string") throw e
      ctx.host.log.error("usage request failed: " + String(e))
      throw "Usage request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      ctx.host.log.error("usage returned auth error after all retries: status=" + resp.status)
      throw "Token expired. Run `droid` to log in again."
    }

    if (resp.status < 200 || resp.status >= 300) {
      ctx.host.log.error("usage returned error: status=" + resp.status)
      throw "Usage request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    ctx.host.log.info("usage fetch succeeded")

    const data = ctx.util.tryParseJson(resp.bodyText)
    if (data === null) {
      throw "Usage response invalid. Try again later."
    }

    const limits = data.limits
    const standard = limits && limits.standard
    if (!standard) {
      if (data.hasActiveSubscription === false) {
        return {
          lines: [ctx.line.badge({ label: "Status", text: "No usage data", color: "#a3a3a3" })],
        }
      }
      throw "Usage response missing data. Try again later."
    }

    const lines = []
    pushBucketLines(ctx, lines, standard, nowMs)

    if (lines.length === 0) {
      lines.push(ctx.line.badge({ label: "Status", text: "No usage data", color: "#a3a3a3" }))
    }

    return { lines: lines }
  }

  // Who is signed in, for the WSL same-account check (wsl.rs): the access token's subject. Local only.
  function accountKey(ctx) {
    const state = loadAuth(ctx)
    const token = state && state.auth && state.auth.access_token
    const payload = typeof token === "string" ? ctx.jwt.decodePayload(token) : null
    return payload && typeof payload.sub === "string" && payload.sub ? payload.sub : null
  }

  globalThis.__openusage_plugin = { id: "factory", probe, accountKey }
})()
