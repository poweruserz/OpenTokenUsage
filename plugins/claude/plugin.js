(function () {
  const DEFAULT_CLAUDE_HOME = "~/.claude"
  const CRED_FILE_NAME = ".credentials.json"
  const KEYCHAIN_SERVICE_PREFIX = "Claude Code"
  const PROD_BASE_API_URL = "https://api.anthropic.com"
  const PROD_REFRESH_URL = "https://platform.claude.com/v1/oauth/token"
  const PROD_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
  const NON_PROD_CLIENT_ID = "22422756-60c9-4084-8eb7-27705fd5cf9a"
  const SCOPES =
    "user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload"
  // Claude Code renews this login itself, ahead of expiry while it runs, and its refresh tokens are
  // single-use: if both refresh at once, one is rejected and Claude Code can end up signed out
  // (upstream #1417; seen here as `invalid_grant`). So refresh only once the token has expired.
  const REFRESH_BUFFER_MS = 0
  // NOTE: the host runs every probe in a fresh runtime, so nothing at module scope survives
  // between probes. The host remembers 429s (answering them without a network call); anything
  // else that must persist lives in pluginDataDir.

  function utf8DecodeBytes(bytes) {
    // Prefer native TextDecoder when available (QuickJS may not expose it).
    if (typeof TextDecoder !== "undefined") {
      try {
        return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes))
      } catch {}
    }

    // Minimal UTF-8 decoder (replacement char on invalid sequences).
    let out = ""
    for (let i = 0; i < bytes.length; ) {
      const b0 = bytes[i] & 0xff
      if (b0 < 0x80) {
        out += String.fromCharCode(b0)
        i += 1
        continue
      }

      // 2-byte
      if (b0 >= 0xc2 && b0 <= 0xdf) {
        if (i + 1 >= bytes.length) {
          out += "\ufffd"
          break
        }
        const b1 = bytes[i + 1] & 0xff
        if ((b1 & 0xc0) !== 0x80) {
          out += "\ufffd"
          i += 1
          continue
        }
        const cp = ((b0 & 0x1f) << 6) | (b1 & 0x3f)
        out += String.fromCharCode(cp)
        i += 2
        continue
      }

      // 3-byte
      if (b0 >= 0xe0 && b0 <= 0xef) {
        if (i + 2 >= bytes.length) {
          out += "\ufffd"
          break
        }
        const b1 = bytes[i + 1] & 0xff
        const b2 = bytes[i + 2] & 0xff
        const validCont = (b1 & 0xc0) === 0x80 && (b2 & 0xc0) === 0x80
        const notOverlong = !(b0 === 0xe0 && b1 < 0xa0)
        const notSurrogate = !(b0 === 0xed && b1 >= 0xa0)
        if (!validCont || !notOverlong || !notSurrogate) {
          out += "\ufffd"
          i += 1
          continue
        }
        const cp = ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f)
        out += String.fromCharCode(cp)
        i += 3
        continue
      }

      // 4-byte
      if (b0 >= 0xf0 && b0 <= 0xf4) {
        if (i + 3 >= bytes.length) {
          out += "\ufffd"
          break
        }
        const b1 = bytes[i + 1] & 0xff
        const b2 = bytes[i + 2] & 0xff
        const b3 = bytes[i + 3] & 0xff
        const validCont = (b1 & 0xc0) === 0x80 && (b2 & 0xc0) === 0x80 && (b3 & 0xc0) === 0x80
        const notOverlong = !(b0 === 0xf0 && b1 < 0x90)
        const notTooHigh = !(b0 === 0xf4 && b1 > 0x8f)
        if (!validCont || !notOverlong || !notTooHigh) {
          out += "\ufffd"
          i += 1
          continue
        }
        const cp =
          ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)
        const n = cp - 0x10000
        out += String.fromCharCode(0xd800 + ((n >> 10) & 0x3ff), 0xdc00 + (n & 0x3ff))
        i += 4
        continue
      }

      out += "\ufffd"
      i += 1
    }
    return out
  }

  function tryParseCredentialJSON(ctx, text) {
    if (!text) return null
    const parsed = ctx.util.tryParseJson(text)
    if (parsed) return parsed

    // Some macOS keychain items are returned by `security ... -w` as hex-encoded UTF-8 bytes.
    // Example prefix: "7b0a" ( "{\\n" ).
    // Support both plain hex and "0x..." forms.
    let hex = String(text).trim()
    if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2)
    if (!hex || hex.length % 2 !== 0) return null
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null
    try {
      const bytes = []
      for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.slice(i, i + 2), 16))
      }
      const decoded = utf8DecodeBytes(bytes)
      const decodedParsed = ctx.util.tryParseJson(decoded)
      if (decodedParsed) return decodedParsed
    } catch {}

    return null
  }

  function readEnvText(ctx, name) {
    try {
      const value = ctx.host.env.get(name)
      if (value === null || value === undefined) return null
      const text = String(value).trim()
      return text || null
    } catch {
      return null
    }
  }

  function readEnvFlag(ctx, name) {
    const value = readEnvText(ctx, name)
    if (!value) return false
    const lower = value.toLowerCase()
    return lower !== "0" && lower !== "false" && lower !== "no" && lower !== "off"
  }

  function getClaudeHomePath(ctx) {
    return readEnvText(ctx, "CLAUDE_CONFIG_DIR") || DEFAULT_CLAUDE_HOME
  }

  function getClaudeHomeOverride(ctx) {
    return readEnvText(ctx, "CLAUDE_CONFIG_DIR")
  }

  function getClaudeCredentialsPath(ctx) {
    return getClaudeHomePath(ctx) + "/" + CRED_FILE_NAME
  }

  function getOauthConfig(ctx) {
    let baseApiUrl = PROD_BASE_API_URL
    let refreshUrl = PROD_REFRESH_URL
    let clientId = PROD_CLIENT_ID
    let oauthFileSuffix = ""

    const isAntUser = readEnvText(ctx, "USER_TYPE") === "ant"
    if (isAntUser && readEnvFlag(ctx, "USE_LOCAL_OAUTH")) {
      const localApiBase = readEnvText(ctx, "CLAUDE_LOCAL_OAUTH_API_BASE")
      baseApiUrl = (localApiBase || "http://localhost:8000").replace(/\/+$/, "")
      refreshUrl = baseApiUrl + "/v1/oauth/token"
      clientId = NON_PROD_CLIENT_ID
      oauthFileSuffix = "-local-oauth"
    } else if (isAntUser && readEnvFlag(ctx, "USE_STAGING_OAUTH")) {
      baseApiUrl = "https://api-staging.anthropic.com"
      refreshUrl = "https://platform.staging.ant.dev/v1/oauth/token"
      clientId = NON_PROD_CLIENT_ID
      oauthFileSuffix = "-staging-oauth"
    }

    const customOauthBase = readEnvText(ctx, "CLAUDE_CODE_CUSTOM_OAUTH_URL")
    if (customOauthBase) {
      const base = customOauthBase.replace(/\/+$/, "")
      baseApiUrl = base
      refreshUrl = base + "/v1/oauth/token"
      oauthFileSuffix = "-custom-oauth"
    }

    const clientIdOverride = readEnvText(ctx, "CLAUDE_CODE_OAUTH_CLIENT_ID")
    if (clientIdOverride) {
      clientId = clientIdOverride
    }

    return {
      baseApiUrl: baseApiUrl,
      usageUrl: baseApiUrl + "/api/oauth/usage",
      // Claude Code's own reset-grants request: cedar_ember=1 opts in to the grants block (null
      // without it, upstream #1290); see resolveResetGrants for how often it's sent.
      grantsUrl: baseApiUrl + "/api/oauth/usage?cedar_ember=1&skip_spend=1",
      profileUrl: baseApiUrl + "/api/oauth/profile",
      refreshUrl: refreshUrl,
      clientId: clientId,
      oauthFileSuffix: oauthFileSuffix,
    }
  }

  function buildClaudeBaseKeychainService(ctx) {
    return KEYCHAIN_SERVICE_PREFIX + getOauthConfig(ctx).oauthFileSuffix + "-credentials"
  }

  function computeKeychainHashSuffix(ctx) {
    // Mirrors upstream Claude Code (decompiled from the binary):
    //   const suffix = !process.env.CLAUDE_CONFIG_DIR
    //     ? ""
    //     : "-" + sha256(CLAUDE_CONFIG_DIR.normalize("NFC")).slice(0, 8)
    // The hash is ONLY appended when CLAUDE_CONFIG_DIR is explicitly set;
    // when unset, upstream uses the legacy unhashed service name.
    const explicitConfigDir = readEnvText(ctx, "CLAUDE_CONFIG_DIR")
    if (!explicitConfigDir) return null
    const sha256Hex = ctx.host && ctx.host.crypto && ctx.host.crypto.sha256Hex
    if (typeof sha256Hex !== "function") return null
    // Match upstream's `.normalize("NFC")` exactly.
    const normalized =
      typeof explicitConfigDir.normalize === "function"
        ? explicitConfigDir.normalize("NFC")
        : explicitConfigDir
    const digest = sha256Hex(normalized)
    if (typeof digest !== "string" || digest.length < 8) return null
    return digest.slice(0, 8)
  }

  function getClaudeKeychainServiceCandidates(ctx) {
    const base = buildClaudeBaseKeychainService(ctx)
    const candidates = []
    const hash = computeKeychainHashSuffix(ctx)
    if (hash) candidates.push(base + "-" + hash)  // hashed (CLAUDE_CONFIG_DIR set)
    candidates.push(base)                          // legacy / default
    return candidates
  }

  function readKeychainCredentialText(ctx, service) {
    const keychain = ctx.host.keychain
    if (!keychain) return null

    if (typeof keychain.readGenericPasswordForCurrentUser === "function") {
      try {
        const value = keychain.readGenericPasswordForCurrentUser(service)
        if (value) {
          return { value, source: "keychain-current-user" }
        }
      } catch (e) {
        ctx.host.log.info("current-user keychain read failed, trying legacy lookup: " + String(e))
      }
    }

    if (typeof keychain.readGenericPassword !== "function") return null

    try {
      const value = keychain.readGenericPassword(service)
      if (value) {
        return { value, source: "keychain-legacy" }
      }
    } catch (e) {
      ctx.host.log.info("keychain read failed (may not exist): " + String(e))
    }

    return null
  }

  function loadFileCredentials(ctx) {
    const credFile = getClaudeCredentialsPath(ctx)
    if (ctx.host.fs.exists(credFile)) {
      try {
        const text = ctx.host.fs.readText(credFile)
        const parsed = tryParseCredentialJSON(ctx, text)
        if (parsed) {
          const oauth = parsed.claudeAiOauth
          if (oauth && oauth.accessToken) {
            ctx.host.log.info("credentials loaded from file")
            return { oauth, source: "file", fullData: parsed }
          }
        }
        ctx.host.log.warn("credentials file exists but no valid oauth data")
      } catch (e) {
        ctx.host.log.warn("credentials file read failed: " + String(e))
      }
    }

    return null
  }

  function loadKeychainCredentials(ctx) {
    // Iterate hashed-then-legacy service names.
    for (const service of getClaudeKeychainServiceCandidates(ctx)) {
      const keychainResult = readKeychainCredentialText(ctx, service)
      if (keychainResult && keychainResult.value) {
        const parsed = tryParseCredentialJSON(ctx, keychainResult.value)
        if (parsed) {
          const oauth = parsed.claudeAiOauth
          if (oauth && oauth.accessToken) {
            ctx.host.log.info("credentials loaded from keychain (service=" + service + ")")
            return { oauth, source: keychainResult.source, serviceName: service, fullData: parsed }
          }
        }
        ctx.host.log.warn("keychain has data for " + service + " but no valid oauth")
        // Continue: a stale legacy entry shouldn't shadow a valid hashed one.
      }
    }

    return null
  }

  function loadStoredCredentials(ctx, suppressMissingWarn) {
    // Recent Claude Code versions keep the current macOS session in Keychain and
    // can leave a stale credentials file behind, so Keychain must win when valid —
    // and the file is not even read then (a stale file must not trigger refreshes).
    const keychainCredentials = loadKeychainCredentials(ctx)
    if (keychainCredentials) return keychainCredentials

    const fileCredentials = loadFileCredentials(ctx)
    if (fileCredentials) return fileCredentials

    if (!suppressMissingWarn) {
      ctx.host.log.warn("no credentials found")
    }
    return null
  }

  function loadCredentials(ctx) {
    const envAccessToken = readEnvText(ctx, "CLAUDE_CODE_OAUTH_TOKEN")
    if (!envAccessToken) {
      return loadStoredCredentials(ctx, false)
    }

    // CLAUDE_CODE_OAUTH_TOKEN is inference-only (typically a `claude setup-token` token) and
    // cannot read the usage endpoint. It also reaches us when merely ambiently exported, so it
    // must not shadow a stored profile-scoped login that CAN fetch live usage. Every stored
    // candidate is considered: a profile-scoped file login must not be shadowed by a
    // scope-less keychain entry, so the file is consulted when the keychain candidate
    // cannot fetch live usage (upstream #865).
    const keychainCredentials = loadKeychainCredentials(ctx)
    if (hasProfileScope(keychainCredentials)) {
      ctx.host.log.info("preferring stored profile-scoped login over CLAUDE_CODE_OAUTH_TOKEN")
      return keychainCredentials
    }
    const fileCredentials = loadFileCredentials(ctx)
    if (hasProfileScope(fileCredentials)) {
      ctx.host.log.info("preferring stored profile-scoped login over CLAUDE_CODE_OAUTH_TOKEN")
      return fileCredentials
    }
    const stored = keychainCredentials || fileCredentials

    const oauth = stored && stored.oauth ? Object.assign({}, stored.oauth) : {}
    oauth.accessToken = envAccessToken
    return {
      oauth: oauth,
      source: stored ? stored.source : null,
      serviceName: stored ? stored.serviceName : null,
      fullData: stored ? stored.fullData : null,
      inferenceOnly: true,
    }
  }

  function hasProfileScope(creds) {
    if (!creds || creds.inferenceOnly) {
      return false
    }
    const scopes = creds.oauth && creds.oauth.scopes
    if (Array.isArray(scopes) && scopes.length > 0) {
      return scopes.indexOf("user:profile") !== -1
    }
    return true
  }

  // The fingerprint is written to live-plan.json, so without a hash there is none (null):
  // the raw token pair must never reach disk.
  function credentialFingerprint(ctx, creds) {
    const oauth = (creds && creds.oauth) || {}
    const raw = String(oauth.accessToken || "") + "\n" + String(oauth.refreshToken || "")
    const sha256Hex = ctx.host && ctx.host.crypto && ctx.host.crypto.sha256Hex
    if (typeof sha256Hex !== "function") return null
    try {
      return sha256Hex(raw)
    } catch (e) {
      ctx.host.log.error("credential fingerprint hashing failed: " + String(e))
      return null
    }
  }

  function saveCredentials(ctx, source, serviceName, fullData) {
    // MUST use minified JSON - macOS `security -w` hex-encodes values with newlines,
    // which Claude Code can't read back, causing it to invalidate the session.
    const text = JSON.stringify(fullData)
    if (source === "file") {
      try {
        ctx.host.fs.writeText(getClaudeCredentialsPath(ctx), text)
      } catch (e) {
        ctx.host.log.error("Failed to write Claude credentials file: " + String(e))
      }
      return
    }
    if (!serviceName) {
      ctx.host.log.error("Refusing keychain write: missing service name (source=" + source + ")")
      return
    }
    if (source === "keychain-current-user") {
      try {
        if (typeof ctx.host.keychain.writeGenericPasswordForCurrentUser === "function") {
          ctx.host.keychain.writeGenericPasswordForCurrentUser(serviceName, text)
        } else {
          ctx.host.keychain.writeGenericPassword(serviceName, text)
        }
      } catch (e) {
        ctx.host.log.error("Failed to write Claude credentials keychain: " + String(e))
      }
    } else if (source === "keychain-legacy" || source === "keychain") {
      try {
        ctx.host.keychain.writeGenericPassword(serviceName, text)
      } catch (e) {
        ctx.host.log.error("Failed to write Claude credentials keychain: " + String(e))
      }
    }
  }

  function needsRefresh(ctx, oauth, nowMs) {
    return ctx.util.needsRefreshByExpiry({
      nowMs,
      expiresAtMs: oauth.expiresAt,
      bufferMs: REFRESH_BUFFER_MS,
    })
  }

  // A newer login than ours that Claude Code stored meanwhile: taken over (creds updated in place)
  // instead of refreshing. Null when the stored login is ours, missing, or expired too.
  function adoptStoredLogin(ctx, creds) {
    const stored = loadStoredCredentials(ctx, true)
    const oauth = stored && stored.oauth
    if (!oauth || !oauth.accessToken || oauth.accessToken === creds.oauth.accessToken) return null
    if (needsRefresh(ctx, oauth, Date.now())) return null
    ctx.host.log.info("using the login Claude Code renewed meanwhile")
    Object.assign(creds, stored)
    return oauth.accessToken
  }

  function refreshToken(ctx, creds) {
    const adopted = adoptStoredLogin(ctx, creds)
    if (adopted) return adopted
    const { oauth, source, fullData } = creds
    if (!oauth.refreshToken) {
      ctx.host.log.warn("refresh skipped: no refresh token")
      return null
    }

    const oauthConfig = getOauthConfig(ctx)
    ctx.host.log.info("attempting token refresh")
    try {
      const resp = ctx.util.request({
        method: "POST",
        url: oauthConfig.refreshUrl,
        headers: { "Content-Type": "application/json" },
        bodyText: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: oauth.refreshToken,
          client_id: oauthConfig.clientId,
          scope: SCOPES,
        }),
        timeoutMs: 15000,
      })

      if (resp.status === 400 || resp.status === 401) {
        let errorCode = null
        const body = ctx.util.tryParseJson(resp.bodyText)
        if (body) errorCode = body.error || body.error_description
        ctx.host.log.error("refresh failed: status=" + resp.status + " error=" + String(errorCode))
        if (errorCode === "invalid_grant") {
          // Claude Code may have used this refresh token first; then its new login is stored.
          const renewed = adoptStoredLogin(ctx, creds)
          if (renewed) return renewed
          throw "Session expired. Run `claude` to log in again."
        }
        throw "Token expired. Run `claude` to log in again."
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

      // Update oauth credentials
      oauth.accessToken = newAccessToken
      if (body.refresh_token) oauth.refreshToken = body.refresh_token
      if (typeof body.expires_in === "number") {
        oauth.expiresAt = Date.now() + body.expires_in * 1000
      }

      // Persist updated credentials back to the same source we read from.
      fullData.claudeAiOauth = oauth
      saveCredentials(ctx, source, creds.serviceName, fullData)

      ctx.host.log.info("refresh succeeded, new token expires in " + (body.expires_in || "unknown") + "s")
      return newAccessToken
    } catch (e) {
      if (typeof e === "string") throw e
      ctx.host.log.error("refresh exception: " + String(e))
      return null
    }
  }

  function fetchUsage(ctx, accessToken, url, gateScope) {
    const oauthConfig = getOauthConfig(ctx)
    return ctx.util.request({
      method: "GET",
      url: url || oauthConfig.usageUrl,
      gateScope: gateScope,
      headers: {
        Authorization: "Bearer " + accessToken.trim(),
        Accept: "application/json",
        "Content-Type": "application/json",
        "anthropic-beta": "oauth-2025-04-20",
        // Claude Code's own UA format: Anthropic gates reset-grant eligibility by client surface,
        // and the old `claude-code/2.1.69` came back `ineligible_reason: "surface"` (upstream #1290).
        "User-Agent": "claude-cli/2.1.294 (external, cli)",
      },
      timeoutMs: 10000,
    })
  }

  function formatPlan(ctx, subscriptionType, rateLimitTier) {
    const basePlan = subscriptionType ? ctx.fmt.planLabel(subscriptionType) : ""
    if (!basePlan) return null
    const tierMatch = String(rateLimitTier || "").match(/(\d+)x/)
    return tierMatch ? basePlan + " " + tierMatch[1] + "x" : basePlan
  }

  // Claude Code stamps subscriptionType/rateLimitTier into the login at sign-in and never updates
  // them, so a Max 5x -> 20x upgrade kept the stale badge until re-login (upstream #1258). Read the
  // live plan from /api/oauth/profile at most once per token pair (failures included), only after a
  // successful usage fetch. A failure keeps the stored plan and never touches the usage lines.
  // The host runs every probe in a fresh runtime, so the result lives in pluginDataDir, not memory.
  function livePlanPath(ctx) {
    return ctx.app.pluginDataDir + "/live-plan.json"
  }

  function loadLivePlan(ctx) {
    const path = livePlanPath(ctx)
    try {
      if (!ctx.host.fs.exists(path)) return null
      const data = ctx.util.tryParseJson(ctx.host.fs.readText(path))
      return data && typeof data.fingerprint === "string" ? data : null
    } catch (e) {
      ctx.host.log.warn("live plan cache read failed: " + String(e))
      return null
    }
  }

  // Returns the plan for this token pair, or null when unknown (lookup failed or not yet done).
  function resolveLivePlan(ctx, creds, fingerprint, usageFetched) {
    if (!fingerprint) return null
    const cached = loadLivePlan(ctx)
    if (cached && cached.fingerprint === fingerprint) return cached.plan
    if (!usageFetched) return null
    const livePlan = { fingerprint: fingerprint, plan: lookupLivePlan(ctx, creds) }
    try {
      ctx.host.fs.writeText(livePlanPath(ctx), JSON.stringify(livePlan))
    } catch (e) {
      ctx.host.log.warn("live plan cache write failed: " + String(e))
    }
    return livePlan.plan
  }

  function lookupLivePlan(ctx, creds) {
    let body = null
    try {
      const resp = ctx.util.request({
        method: "GET",
        url: getOauthConfig(ctx).profileUrl,
        headers: {
          Authorization: "Bearer " + creds.oauth.accessToken.trim(),
          Accept: "application/json",
          "anthropic-beta": "oauth-2025-04-20",
        },
        timeoutMs: 10000,
      })
      if (resp.status >= 200 && resp.status < 300) body = ctx.util.tryParseJson(resp.bodyText)
      if (!body) ctx.host.log.warn("live plan lookup failed (status=" + resp.status + "); showing stored plan")
    } catch (e) {
      ctx.host.log.warn("live plan lookup failed: " + String(e) + "; showing stored plan")
    }
    const org = body && body.organization
    if (!org || typeof org !== "object") return null
    // organization_type arrives as `claude_max` / `claude_pro`; omitted fields fall back to the login.
    const orgType = typeof org.organization_type === "string" ? org.organization_type.replace(/^claude_/, "") : null
    return formatPlan(
      ctx,
      orgType || creds.oauth.subscriptionType,
      org.rate_limit_tier || creds.oauth.rateLimitTier
    )
  }

  // Claude Code reads plain /api/oauth/usage and asks for reset grants only now and then; sending
  // the grants request on every refresh drew 429s with a ~50 min Retry-After (upstream #1367). So
  // it goes out at most hourly per account, and a failed check keeps the last answer until the next
  // hour. Grants past their deadline still drop off, when the row is built.
  const RESET_GRANTS_INTERVAL_MS = 60 * 60 * 1000

  function resetGrantsPath(ctx) {
    return ctx.app.pluginDataDir + "/reset-grants.json"
  }

  function resolveResetGrants(ctx, accessToken) {
    const path = resetGrantsPath(ctx)
    let account
    try {
      account = accountKey(ctx) || ""
    } catch (e) {
      // Without the account, a cached answer could be another login's; the bars matter more.
      ctx.host.log.warn("reset grants skipped: account lookup failed: " + String(e))
      return null
    }
    let cached = null
    try {
      const data = ctx.host.fs.exists(path) ? ctx.util.tryParseJson(ctx.host.fs.readText(path)) : null
      if (data && typeof data.checkedAt === "number" && data.account === account) cached = data
    } catch (e) {
      ctx.host.log.warn("reset grants cache read failed: " + String(e))
    }
    const nowMs = Date.now()
    if (cached && nowMs - cached.checkedAt < RESET_GRANTS_INTERVAL_MS) return cached.block

    let block = cached ? cached.block : null
    try {
      // Its own 429 gate: the host's gate ignores the query, so a 429 here would hold the plain
      // usage poll too.
      const resp = fetchUsage(ctx, accessToken, getOauthConfig(ctx).grantsUrl, "reset-grants")
      const data = resp.status >= 200 && resp.status < 300 ? ctx.util.tryParseJson(resp.bodyText) : null
      if (data) block = data.cedar_ember ?? null
      else ctx.host.log.warn("reset grants check failed (status=" + resp.status + "); keeping the last answer")
    } catch (e) {
      ctx.host.log.warn("reset grants check failed: " + String(e) + "; keeping the last answer")
    }
    try {
      ctx.host.fs.writeText(path, JSON.stringify({ account: account, checkedAt: nowMs, block: block }))
    } catch (e) {
      ctx.host.log.warn("reset grants cache write failed: " + String(e))
    }
    return block
  }

  function parseRetryAfterSeconds(headers) {
    if (!headers) return null
    const raw = headers["retry-after"] ?? headers["Retry-After"]
    if (raw === undefined || raw === null) return null
    const str = String(raw).trim()
    if (!str) return null
    // Retry-After can be a delay-seconds or HTTP-date (RFC 7231).
    // 0 means "retry immediately" — return 0 as a valid value.
    const seconds = parseInt(str, 10)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds
    const dateMs = Date.parse(str)
    if (Number.isFinite(dateMs)) {
      const delay = Math.ceil((dateMs - Date.now()) / 1000)
      return delay > 0 ? delay : 0
    }
    return null
  }

  function rateLimitedMessage(retryAfterSeconds) {
    if (retryAfterSeconds === null || retryAfterSeconds <= 0) {
      return "Rate limited by Anthropic, try again later"
    }
    return "Rate limited by Anthropic, retry in ~" + Math.ceil(retryAfterSeconds / 60) + "m"
  }

  function queryTokenUsage(ctx, homePath) {
    const since = new Date()
    // Inclusive range: today + previous 30 days = 31 calendar days.
    since.setDate(since.getDate() - 30)
    const y = since.getFullYear()
    const m = since.getMonth() + 1
    const d = since.getDate()
    const sinceStr = "" + y + (m < 10 ? "0" : "") + m + (d < 10 ? "0" : "") + d

    const queryOpts = { since: sinceStr }
    if (homePath) {
      queryOpts.homePath = homePath
    }

    const result = ctx.host.ccusage.query(queryOpts)
    if (!result || typeof result !== "object" || typeof result.status !== "string") {
      return { status: "runner_failed", data: null }
    }
    if (result.status !== "ok") {
      return { status: result.status, data: null }
    }
    if (!result.data || !Array.isArray(result.data.daily)) {
      return { status: "runner_failed", data: null }
    }
    return { status: "ok", data: result.data }
  }

  function fmtTokens(n) {
    const abs = Math.abs(n)
    const sign = n < 0 ? "-" : ""
    const units = [
      { threshold: 1e9, divisor: 1e9, suffix: "B" },
      { threshold: 1e6, divisor: 1e6, suffix: "M" },
      { threshold: 1e3, divisor: 1e3, suffix: "K" },
    ]
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]
      if (abs >= unit.threshold) {
        const scaled = abs / unit.divisor
        const formatted = scaled >= 10
          ? Math.round(scaled).toString()
          : scaled.toFixed(1).replace(/\.0$/, "")
        return sign + formatted + unit.suffix
      }
    }
    return sign + Math.round(abs).toString()
  }

  function dayKeyFromDate(date) {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    return year + "-" + (month < 10 ? "0" : "") + month + "-" + (day < 10 ? "0" : "") + day
  }

  function dayKeyFromUsageDate(rawDate) {
    if (typeof rawDate !== "string") return null
    const value = rawDate.trim()
    if (!value) return null

    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoMatch) {
      return isoMatch[1] + "-" + isoMatch[2] + "-" + isoMatch[3]
    }

    const isoDatePrefixMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[Tt\s]|$)/)
    if (isoDatePrefixMatch) {
      return isoDatePrefixMatch[1] + "-" + isoDatePrefixMatch[2] + "-" + isoDatePrefixMatch[3]
    }

    const compactMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/)
    if (compactMatch) {
      return compactMatch[1] + "-" + compactMatch[2] + "-" + compactMatch[3]
    }

    const ms = Date.parse(value)
    if (!Number.isFinite(ms)) return null
    return dayKeyFromDate(new Date(ms))
  }

  function usageCostUsd(day) {
    if (!day || typeof day !== "object") return null

    if (day.totalCost != null) {
      const totalCost = Number(day.totalCost)
      if (Number.isFinite(totalCost)) return totalCost
    }

    if (day.costUSD != null) {
      const costUSD = Number(day.costUSD)
      if (Number.isFinite(costUSD)) return costUSD
    }

    return null
  }

  function costAndTokensLabel(data, opts) {
    const includeZeroTokens = !!(opts && opts.includeZeroTokens)
    const parts = []
    if (data.costUSD != null) parts.push("$" + data.costUSD.toFixed(2))
    if (data.tokens > 0 || (includeZeroTokens && data.tokens === 0)) {
      parts.push(fmtTokens(data.tokens) + " tokens")
    }
    return parts.join(" \u00b7 ")
  }

  function modelTokenCount(modelUsage) {
    if (!modelUsage || typeof modelUsage !== "object") return 0
    const total = Number(modelUsage.totalTokens)
    if (Number.isFinite(total) && total > 0) return total

    const fields = [
      "inputTokens",
      "cachedInputTokens",
      "cacheCreationTokens",
      "cacheReadTokens",
      "outputTokens",
      "reasoningOutputTokens",
    ]
    let sum = 0
    for (let i = 0; i < fields.length; i++) {
      const n = Number(modelUsage[fields[i]])
      if (Number.isFinite(n) && n > 0) sum += n
    }
    return sum
  }

  function collectModelUsage(daily) {
    const totals = {}
    let totalTokens = 0
    for (let i = 0; i < daily.length; i++) {
      const day = daily[i]
      const models = day && day.models
      if (models && typeof models === "object") {
        const names = Object.keys(models)
        for (let j = 0; j < names.length; j++) {
          const name = names[j]
          const tokens = modelTokenCount(models[name])
          if (tokens <= 0) continue
          totals[name] = (totals[name] || 0) + tokens
          totalTokens += tokens
        }
      }

      const breakdowns = day && day.modelBreakdowns
      if (Array.isArray(breakdowns)) {
        for (let j = 0; j < breakdowns.length; j++) {
          const breakdown = breakdowns[j]
          const name = String(
            (breakdown && (breakdown.modelName || breakdown.name || breakdown.model)) || ""
          ).trim()
          if (!name) continue
          const tokens = modelTokenCount(breakdown)
          if (tokens <= 0) continue
          totals[name] = (totals[name] || 0) + tokens
          totalTokens += tokens
        }
      }
    }

    if (totalTokens <= 0) return []
    return Object.keys(totals)
      .map((name) => ({ name, tokens: totals[name], percent: (totals[name] / totalTokens) * 100 }))
      .sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))
  }

  function percentLabel(value) {
    if (value > 0 && value < 0.1) return "<0.1%"
    const rounded = Math.round(value * 10) / 10
    return (rounded % 1 === 0 ? String(Math.round(rounded)) : String(rounded)) + "%"
  }

  function pushModelUsageLines(lines, ctx, daily) {
    const models = collectModelUsage(daily)
    for (let i = 0; i < models.length; i++) {
      const model = models[i]
      lines.push(ctx.line.text({
        label: model.name,
        value: percentLabel(model.percent),
      }))
    }
  }

  function usageDayLabel(rawDate) {
    const key = dayKeyFromUsageDate(rawDate)
    if (!key) return String(rawDate || "").slice(0, 10) || "Usage"
    const month = Number(key.slice(5, 7))
    const day = Number(key.slice(8, 10))
    return month + "/" + day
  }

  function collectUsageChartPoints(daily) {
    const points = []
    for (let i = 0; i < daily.length; i++) {
      const day = daily[i]
      const tokens = Number(day && day.totalTokens)
      if (!Number.isFinite(tokens) || tokens < 0) continue
      const key = dayKeyFromUsageDate(day.date)
      if (!key) continue
      points.push({
        key: key,
        label: usageDayLabel(day.date),
        value: tokens,
        valueLabel: fmtTokens(tokens) + " tokens",
      })
    }
    return points
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-31)
      .map((point) => ({
        label: point.label,
        value: point.value,
        valueLabel: point.valueLabel,
      }))
  }

  function pushUsageChartLine(lines, ctx, daily) {
    const points = collectUsageChartPoints(daily)
    if (points.length === 0) return
    lines.push(ctx.line.barChart({
      label: "Usage Trend",
      points: points,
      note: "Estimated from local Claude logs at API rates.",
      color: "#DE7356",
    }))
  }

  function pushDayUsageLine(lines, ctx, label, dayEntry) {
    if (!dayEntry) {
      // ccusage omits days it hasn't reported (idle, or lagging a CLI format change), so an
      // absent day is unknown — render "No data" instead of a fabricated "$0.00 · 0 tokens"
      // that would contradict a live session meter. A present all-zero entry stays a real,
      // measured "$0.00 · 0 tokens".
      lines.push(ctx.line.text({ label: label, value: "No data" }))
      return
    }

    const tokens = Number(dayEntry.totalTokens) || 0
    const cost = usageCostUsd(dayEntry)
    if (tokens > 0) {
      lines.push(ctx.line.text({
        label: label,
        value: costAndTokensLabel({ tokens: tokens, costUSD: cost })
      }))
      return
    }

    lines.push(ctx.line.text({
      label: label,
      value: costAndTokensLabel({ tokens: 0, costUSD: 0 }, { includeZeroTokens: true })
    }))
  }

  // The API may serialize numbers as numeric strings — accept both, like upstream's
  // ProviderParse.number.
  function parseNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    if (typeof value !== "string" || value.trim() === "") return null
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }

  // Anthropic's one-off usage-limit reset grants (`cedar_ember`, e.g. a model-launch reset for
  // Pro/Max), read-only like Codex's Rate Limit Resets row (upstream #1290). Grants past their
  // `ends_at` deadline or with no resets left are skipped; an ineligible account reads
  // "0 available"; a missing/null block (plans outside the program) emits no row.
  function pushResetGrantsLine(lines, ctx, block) {
    if (!block || typeof block !== "object") return
    let count = 0
    const inventory = []
    if (block.eligible === true && Array.isArray(block.grants)) {
      const nowMs = Date.now()
      for (const grant of block.grants) {
        const left = grant ? parseNumber(grant.resets_left) : null
        if (left === null || left < 1 || grant.paused === true || grant.usable_now === false) continue
        const endsAtMs = ctx.util.parseDateMs(ctx.util.toIso(grant.ends_at))
        if (endsAtMs !== null && endsAtMs <= nowMs) continue
        count += Math.floor(left)
        inventory.push({ count: Math.floor(left), expiresAt: ctx.util.toIso(grant.ends_at) || undefined })
      }
    }
    lines.push(ctx.line.text({ label: "Rate Limit Resets", value: count + " available", resetCredits: inventory }))
  }

  // A model-scoped weekly limit from the `limits` array — `kind: "weekly_scoped"` with
  // `scope.model.display_name` naming the model (e.g. "Fable"). Anthropic moved the per-model
  // weekly windows off the legacy top-level `seven_day_<model>` keys (which now come back null)
  // and into this array, so each scoped row is read by display name. `percent` is 0-100.
  // A versioned name ("Sonnet 5.5") counts as the family ("Sonnet").
  function pushScopedWeeklyLimitLine(lines, ctx, limits, modelName, label) {
    if (!Array.isArray(limits)) return
    for (let i = 0; i < limits.length; i++) {
      const entry = limits[i]
      if (!entry || typeof entry !== "object") continue
      if (entry.kind !== "weekly_scoped") continue
      const model = entry.scope && entry.scope.model
      const name = model && typeof model.display_name === "string" ? model.display_name : ""
      if (name !== modelName && name.indexOf(modelName + " ") !== 0) continue
      const percent = parseNumber(entry.percent)
      if (percent === null) continue
      lines.push(ctx.line.progress({
        label: label,
        used: percent,
        limit: 100,
        format: { kind: "percent" },
        resetsAt: ctx.util.toIso(entry.resets_at),
        periodDurationMs: 7 * 24 * 60 * 60 * 1000 // 7 days
      }))
      return
    }
  }

  function pushLocalUsageLines(lines, ctx, usage) {
    const now = new Date()
    const todayKey = dayKeyFromDate(now)
    const yesterday = new Date(now.getTime())
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayKey = dayKeyFromDate(yesterday)

    let todayEntry = null
    let yesterdayEntry = null
    for (let i = 0; i < usage.daily.length; i++) {
      const usageDayKey = dayKeyFromUsageDate(usage.daily[i].date)
      if (usageDayKey === todayKey) {
        todayEntry = usage.daily[i]
        continue
      }
      if (usageDayKey === yesterdayKey) {
        yesterdayEntry = usage.daily[i]
      }
    }

    pushDayUsageLine(lines, ctx, "Today", todayEntry)
    pushDayUsageLine(lines, ctx, "Yesterday", yesterdayEntry)

    let totalTokens = 0
    let totalCostNanos = 0
    let hasCost = false
    for (let i = 0; i < usage.daily.length; i++) {
      const day = usage.daily[i]
      const dayTokens = Number(day.totalTokens)
      if (Number.isFinite(dayTokens)) {
        totalTokens += dayTokens
      }
      const dayCost = usageCostUsd(day)
      if (dayCost != null) {
        totalCostNanos += Math.round(dayCost * 1e9)
        hasCost = true
      }
    }
    if (totalTokens > 0) {
      lines.push(ctx.line.text({
        label: "Last 30 Days",
        value: costAndTokensLabel({ tokens: totalTokens, costUSD: hasCost ? totalCostNanos / 1e9 : null })
      }))
    }

    pushUsageChartLine(lines, ctx, usage.daily)
    pushModelUsageLines(lines, ctx, usage.daily)
  }

  function probe(ctx) {
    const creds = loadCredentials(ctx)
    if (!creds || !creds.oauth || !creds.oauth.accessToken || !creds.oauth.accessToken.trim()) {
      // Local spend comes from ccusage and needs no OAuth login (e.g. Claude Code on an API-key
      // gateway), so show it under a "Not logged in" badge instead of an error card
      // (upstream #1138). No recorded spend at all stays the plain auth error.
      const usageResult = queryTokenUsage(ctx, getClaudeHomeOverride(ctx))
      const hasSpend = (day) => Number(day && day.totalTokens) > 0 || (usageCostUsd(day) || 0) > 0
      if (usageResult.status === "ok" && usageResult.data.daily.some(hasSpend)) {
        ctx.host.log.info("not logged in; showing local spend only")
        const lines = [ctx.line.badge({ label: "Status", text: "Not logged in", color: "#f59e0b" })]
        pushLocalUsageLines(lines, ctx, usageResult.data)
        return { plan: null, lines: lines }
      }
      ctx.host.log.error("probe failed: not logged in")
      throw "Not logged in. Run `claude` to authenticate."
    }

    const nowMs = Date.now()
    let accessToken = creds.oauth.accessToken
    const homePath = getClaudeHomeOverride(ctx)
    const canFetchLiveUsage = hasProfileScope(creds)

    let data = null
    let lines = []
    let usageFetched = false
    if (canFetchLiveUsage) {
      // Proactively refresh if token is expired or about to expire
      if (needsRefresh(ctx, creds.oauth, nowMs)) {
        ctx.host.log.info("token needs refresh (expired or expiring soon)")
        const refreshed = refreshToken(ctx, creds)
        if (refreshed) {
          accessToken = refreshed
        } else {
          ctx.host.log.warn("proactive refresh failed, trying with existing token")
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
            return refreshToken(ctx, creds)
          },
        })
      } catch (e) {
        if (typeof e === "string") throw e
        ctx.host.log.error("usage request failed: " + String(e))
        throw "Usage request failed. Check your connection."
      }

      if (ctx.util.isAuthStatus(resp.status)) {
        ctx.host.log.error("usage returned auth error after all retries: status=" + resp.status)
        throw "Token expired. Run `claude` to log in again."
      }

      if (resp.status === 429) {
        // Throw so the app keeps showing the last good bars under this message. The host holds
        // further requests to this URL until Retry-After passes (synthetic 429, no network).
        const message = rateLimitedMessage(parseRetryAfterSeconds(resp.headers))
        ctx.host.log.warn("usage rate limited (429): " + message)
        throw message
      }
      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.error("usage returned error: status=" + resp.status)
        throw "Usage request failed (HTTP " + String(resp.status) + "). Try again later."
      }
      ctx.host.log.info("usage fetch succeeded")
      data = ctx.util.tryParseJson(resp.bodyText)
      if (data === null) {
        throw "Usage response invalid. Try again later."
      }
      usageFetched = true
    } else {
      ctx.host.log.info("skipping live usage fetch for inference-only token")
    }

    // Fingerprint after any refresh above, so the live plan is keyed to the pair now on disk.
    const fingerprint = credentialFingerprint(ctx, creds)
    const knownLivePlan = resolveLivePlan(ctx, creds, fingerprint, usageFetched)
    const plan =
      knownLivePlan || formatPlan(ctx, creds.oauth.subscriptionType, creds.oauth.rateLimitTier)

    if (data) {
      if (data.five_hour && typeof data.five_hour.utilization === "number") {
        lines.push(ctx.line.progress({
          label: "Session",
          used: data.five_hour.utilization,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: ctx.util.toIso(data.five_hour.resets_at),
          periodDurationMs: 5 * 60 * 60 * 1000 // 5 hours
        }))
      }
      if (data.seven_day && typeof data.seven_day.utilization === "number") {
        lines.push(ctx.line.progress({
          label: "Weekly",
          used: data.seven_day.utilization,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: ctx.util.toIso(data.seven_day.resets_at),
          periodDurationMs: 7 * 24 * 60 * 60 * 1000 // 7 days
        }))
      }
      // Fable sits directly below Weekly (upstream #1141).
      pushScopedWeeklyLimitLine(lines, ctx, data.limits, "Fable", "Fable")
      if (data.seven_day_sonnet && typeof data.seven_day_sonnet.utilization === "number") {
        lines.push(ctx.line.progress({
          label: "Sonnet",
          used: data.seven_day_sonnet.utilization,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: ctx.util.toIso(data.seven_day_sonnet.resets_at),
          periodDurationMs: 7 * 24 * 60 * 60 * 1000 // 7 days
        }))
      } else {
        // Once Sonnet's window moves into `limits` like Fable's did, the legacy key comes back null.
        pushScopedWeeklyLimitLine(lines, ctx, data.limits, "Sonnet", "Sonnet")
      }
      if (data.seven_day_omelette && typeof data.seven_day_omelette.utilization === "number") {
        lines.push(ctx.line.progress({
          label: "Claude Design",
          used: data.seven_day_omelette.utilization,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: ctx.util.toIso(data.seven_day_omelette.resets_at),
          periodDurationMs: 7 * 24 * 60 * 60 * 1000 // 7 days
        }))
      }

      if (data.extra_usage && data.extra_usage.is_enabled) {
        const used = data.extra_usage.used_credits
        const limit = data.extra_usage.monthly_limit
        if (typeof used === "number" && typeof limit === "number" && limit > 0) {
          lines.push(ctx.line.progress({
            label: "Extra usage spent",
            used: ctx.fmt.dollars(used),
            limit: ctx.fmt.dollars(limit),
            format: { kind: "dollars" }
          }))
        } else if (typeof used === "number" && used > 0) {
          lines.push(ctx.line.text({ label: "Extra usage spent", value: "$" + String(ctx.fmt.dollars(used)) }))
        }
      }
      // A refresh inside the usage request leaves the new token in creds.
      pushResetGrantsLine(lines, ctx, resolveResetGrants(ctx, creds.oauth.accessToken))
    }

    const usageResult = queryTokenUsage(ctx, homePath)
    if (usageResult.status === "ok") {
      pushLocalUsageLines(lines, ctx, usageResult.data)
    }

    if (lines.length === 0) {
      lines.push(ctx.line.badge({ label: "Status", text: "No usage data", color: "#a3a3a3" }))
    }

    return { plan: plan, lines: lines }
  }

  // Who is signed in, for the WSL same-account check (wsl.rs). Claude Code keeps the account in
  // `.claude.json`: inside CLAUDE_CONFIG_DIR when that is set, else in the home folder. Local only.
  function accountKey(ctx) {
    const override = getClaudeHomeOverride(ctx)
    const path = override ? override.replace(/[\\/]+$/, "") + "/.claude.json" : "~/.claude.json"
    if (!ctx.host.fs.exists(path)) return null
    const data = ctx.util.tryParseJson(ctx.host.fs.readText(path))
    const id = data && data.oauthAccount && data.oauthAccount.accountUuid
    return typeof id === "string" && id.trim() ? id.trim() : null
  }

  globalThis.__openusage_plugin = { id: "claude", probe, accountKey }
})()
