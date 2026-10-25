import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const OAUTH_TOKEN_KEY = "antigravityUnifiedStateSync.oauthToken"
const OAUTH_TOKEN_SENTINEL = "oauthTokenInfoSentinelKey"
const STATE_DB_V2 = "~/Library/Application Support/Antigravity IDE/User/globalStorage/state.vscdb"
const STATE_DB_V1 = "~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb"
const LOGIN_MESSAGE = "Start Antigravity or run `agy` and try again."

// --- Fixtures ---

function makeDiscovery(overrides) {
  return Object.assign(
    { pid: 12345, csrf: "test-csrf-token", ports: [42001, 42002], extensionPort: null },
    overrides
  )
}

function makeUserStatusResponse(overrides) {
  var base = {
    userStatus: {
      planStatus: {
        planInfo: {
          planName: "Pro",
          monthlyPromptCredits: 50000,
          monthlyFlowCredits: 150000,
          monthlyFlexCreditPurchaseAmount: 25000,
        },
        availablePromptCredits: 500,
        availableFlowCredits: 100,
        usedFlexCredits: 5000,
      },
      cascadeModelConfigData: {
        clientModelConfigs: [
          {
            label: "Gemini 3.1 Pro (High)",
            modelOrAlias: { model: "MODEL_PLACEHOLDER_M37" },
            quotaInfo: { remainingFraction: 0.8, resetTime: "2026-02-08T09:10:56Z" },
          },
          {
            label: "Gemini 3.1 Pro (Low)",
            modelOrAlias: { model: "MODEL_PLACEHOLDER_M36" },
            quotaInfo: { remainingFraction: 0.8, resetTime: "2026-02-08T09:10:56Z" },
          },
          {
            label: "Gemini 3 Flash",
            modelOrAlias: { model: "MODEL_PLACEHOLDER_M18" },
            quotaInfo: { remainingFraction: 1.0, resetTime: "2026-02-08T09:10:56Z" },
          },
          {
            label: "Claude Sonnet 4.6 (Thinking)",
            modelOrAlias: { model: "MODEL_PLACEHOLDER_M35" },
            quotaInfo: { remainingFraction: 0.4, resetTime: "2026-02-26T15:23:41Z" },
          },
          {
            label: "Claude Opus 4.6 (Thinking)",
            modelOrAlias: { model: "MODEL_PLACEHOLDER_M26" },
            quotaInfo: { remainingFraction: 0.6, resetTime: "2026-02-26T15:23:41Z" },
          },
          {
            label: "GPT-OSS 120B (Medium)",
            modelOrAlias: { model: "MODEL_OPENAI_GPT_OSS_120B_MEDIUM" },
            quotaInfo: { remainingFraction: 0.9, resetTime: "2026-02-26T15:23:41Z" },
          },
        ],
      },
    },
  }
  if (overrides) {
    if (overrides.planName !== undefined) base.userStatus.planStatus.planInfo.planName = overrides.planName
    if (overrides.configs !== undefined) base.userStatus.cascadeModelConfigData.clientModelConfigs = overrides.configs
    if (overrides.planStatus !== undefined) base.userStatus.planStatus = overrides.planStatus
    if (overrides.userTier !== undefined) base.userStatus.userTier = overrides.userTier
  }
  return base
}

function makeCloudCodeResponse(overrides) {
  return Object.assign(
    {
      models: {
        "gemini-3-pro": {
          displayName: "Gemini 3 Pro",
          model: "gemini-3-pro",
          quotaInfo: { remainingFraction: 0.8, resetTime: "2026-02-08T10:00:00Z" },
        },
        "claude-sonnet-4.5": {
          displayName: "Claude Sonnet 4.5",
          model: "claude-sonnet-4.5",
          quotaInfo: { remainingFraction: 0.6, resetTime: "2026-02-08T10:00:00Z" },
        },
      },
    },
    overrides
  )
}

function makeAgyLoadResponse(overrides) {
  return Object.assign(
    {
      paidTier: { name: "Google AI Pro" },
      cloudaicompanionProject: "projects/openusage-agy",
    },
    overrides
  )
}

function makeAgyQuotaResponse(overrides) {
  return Object.assign(
    {
      buckets: [
        { modelId: "gemini-3-pro", remainingFraction: 0.8, resetTime: "2026-02-08T10:00:00Z" },
        { modelId: "gemini-3-flash", remainingFraction: 0.6, resetTime: "2026-02-08T10:00:00Z" },
        { modelId: "claude-sonnet-4.5", remainingFraction: 0.4, resetTime: "2026-02-08T10:00:00Z" },
      ],
    },
    overrides
  )
}

// All four RetrieveUserQuotaSummary buckets, in scrambled group order, with the shapes
// seen in live probes. Session used 25, Weekly used 10, Claude used 60, Claude Weekly used 0.
function makeQuotaSummaryPayload() {
  return {
    groups: [
      {
        displayName: "Claude and other models",
        buckets: [
          { bucketId: "3p-weekly", displayName: "Weekly", window: "weekly", remainingFraction: 1, resetTime: "2026-07-06T07:00:00Z" },
          { bucketId: "3p-5h", displayName: "5-hour", window: "5h", remainingFraction: 0.4, resetTime: "2026-07-02T15:30:00Z" },
        ],
      },
      {
        displayName: "Gemini models",
        buckets: [
          { bucketId: "gemini-5h", displayName: "5-hour", window: "5h", remainingFraction: 0.75, resetTime: "2026-07-02T16:00:00Z" },
          { bucketId: "gemini-weekly", displayName: "Weekly", window: "weekly", remainingFraction: 0.9, resetTime: "2026-07-06T07:00:00Z" },
        ],
      },
    ],
  }
}

function fingerprintOf(ctx, refreshToken) {
  return ctx.host.crypto.sha256Hex(refreshToken)
}

// Write our derived-token cache the way the plugin does: bound to the minting refresh token.
function writeCachedToken(ctx, opts) {
  const entry = { accessToken: opts.accessToken, expiresAtMs: opts.expiresAtMs }
  if (opts.refreshToken) entry.credentialFingerprint = fingerprintOf(ctx, opts.refreshToken)
  ctx.host.fs.writeText(ctx.app.pluginDataDir + "/auth.json", JSON.stringify(entry))
}

function setupLsMock(ctx, discovery, responseBody) {
  ctx.host.ls.discover.mockReturnValue(discovery)
  ctx.host.http.request.mockImplementation((opts) => {
    if (String(opts.url).includes("GetUnleashData")) {
      return { status: 200, bodyText: "{}" }
    }
    return { status: 200, bodyText: JSON.stringify(responseBody) }
  })
}

function setupSqliteMock(ctx, oauthEnvelopeB64) {
  ctx.host.sqlite.query.mockImplementation((db, sql) => {
    if (sql.includes(OAUTH_TOKEN_KEY) && oauthEnvelopeB64) {
      return JSON.stringify([{ value: oauthEnvelopeB64 }])
    }
    return "[]"
  })
}

function setupSqliteByPath(ctx, valuesByPath) {
  ctx.host.sqlite.query.mockImplementation((db, sql) => {
    if (!sql.includes(OAUTH_TOKEN_KEY)) return "[]"
    var value = valuesByPath[String(db)]
    if (value instanceof Error) throw value
    if (value) return JSON.stringify([{ value: value }])
    return "[]"
  })
}

function encodeVarint(n) {
  var bytes = ""
  while (n > 0x7f) {
    bytes += String.fromCharCode((n & 0x7f) | 0x80)
    n = Math.floor(n / 128)
  }
  bytes += String.fromCharCode(n & 0x7f)
  return bytes
}

function encodeField(fieldNum, wireType, data) {
  var tag = encodeVarint(fieldNum * 8 + wireType)
  if (wireType === 2) return tag + encodeVarint(data.length) + data
  if (wireType === 0) return tag + encodeVarint(data)
  return ""
}

function makeOAuthSentinelB64(ctx, opts) {
  opts = opts || {}
  var inner = ""
  if (opts.accessToken) inner += encodeField(1, 2, opts.accessToken)
  if (opts.refreshToken) inner += encodeField(3, 2, opts.refreshToken)
  if (opts.expirySeconds !== null && opts.expirySeconds !== undefined) {
    var tsMsg = encodeField(1, 0, opts.expirySeconds)
    inner += encodeField(4, 2, tsMsg)
  }
  var innerB64 = ctx.base64.encode(inner)
  var payload = encodeField(1, 2, innerB64)
  var wrapper = encodeField(1, 2, OAUTH_TOKEN_SENTINEL) + encodeField(2, 2, payload)
  var outer = encodeField(1, 2, wrapper)
  return ctx.base64.encode(outer)
}

// --- Tests ---

describe("antigravity plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when LS not found and no DB credentials", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(null)
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
  })

  it("throws when no working port found and no DB credentials", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    ctx.host.http.request.mockImplementation(() => {
      throw new Error("connection refused")
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
  })

  it("throws when both GetUserStatus and GetCommandModelConfigs fail", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetUnleashData")) {
        return { status: 200, bodyText: "{}" }
      }
      return { status: 500, bodyText: "" }
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
  })

  it("discovers new Antigravity process names and agy fallback", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(null)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)

    expect(ctx.host.ls.discover).toHaveBeenNthCalledWith(1, expect.objectContaining({
      processName: "language_server",
      markers: ["antigravity", "antigravity-ide"],
      csrfFlag: "--csrf_token",
    }))
    expect(ctx.host.ls.discover).toHaveBeenNthCalledWith(2, expect.objectContaining({
      processName: "agy",
      markers: [],
      csrfFlag: "",
    }))
  })

  it("returns models from the agy local server when Antigravity is not running", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockImplementation((opts) => {
      if (opts.processName === "agy") return makeDiscovery({ csrf: "", ports: [43001] })
      return null
    })

    let capturedCsrf = null
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) {
        capturedCsrf = opts.headers["x-codeium-csrf-token"]
        return { status: 200, bodyText: "{}" }
      }
      if (url.includes("GetUserStatus")) {
        return {
          status: 200,
          bodyText: JSON.stringify(makeUserStatusResponse({
            userTier: { name: "Google AI Pro" },
          })),
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(capturedCsrf).toBe("")
    expect(result.plan).toBe("Google AI Pro")
    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Claude"])
  })

  it("returns models + plan from GetUserStatus", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse()
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    // No userTier in default fixture → falls back to planInfo.planName
    expect(result.plan).toBe("Pro")

    // Model lines exist — 3 pool lines
    const labels = result.lines.map((l) => l.label)
    expect(labels).toEqual(["Session", "Claude"])
  })

  it("deduplicates models by normalized label (keeps worst-case fraction)", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse()
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    // Both Gemini 3.1 Pro variants have frac=0.8 → used = 20%
    const pro = result.lines.find((l) => l.label === "Session")
    expect(pro).toBeTruthy()
    expect(pro.used).toBe(20) // (1 - 0.8) * 100
  })

  it("orders: Gemini (Pro, Flash), Claude (Opus, Sonnet), then others", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse()
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const labels = result.lines.map((l) => l.label)

    expect(labels).toEqual(["Session", "Claude"])
  })

  it("falls back to GetCommandModelConfigs when GetUserStatus fails", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetUnleashData")) {
        return { status: 200, bodyText: "{}" }
      }
      if (String(opts.url).includes("GetUserStatus")) {
        return { status: 500, bodyText: "" }
      }
      if (String(opts.url).includes("GetCommandModelConfigs")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            clientModelConfigs: [
              {
                label: "Gemini 3 Pro (High)",
                modelOrAlias: { model: "M7" },
                quotaInfo: { remainingFraction: 0.6, resetTime: "2026-02-08T09:10:56Z" },
              },
            ],
          }),
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBeNull()

    // Model lines present
    const pro = result.lines.find((l) => l.label === "Session")
    expect(pro).toBeTruthy()
    expect(pro.used).toBe(40) // (1 - 0.6) * 100
  })

  it("uses extension port as fallback when all ports fail probing", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery({ ports: [99999], extensionPort: 42010 }))

    let usedPort = null
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData") && url.includes("99999")) {
        throw new Error("refused")
      }
      if (url.includes("GetUserStatus")) {
        usedPort = parseInt(url.match(/:(\d+)\//)[1])
        return {
          status: 200,
          bodyText: JSON.stringify(makeUserStatusResponse()),
        }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(usedPort).toBe(42010)
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it("drops models with no quotaInfo instead of fabricating 100% used", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse({
      configs: [
        { label: "Gemini 3 Pro (High)", modelOrAlias: { model: "M7" }, quotaInfo: { remainingFraction: 0.5, resetTime: "2026-02-08T09:10:56Z" } },
        { label: "Claude Opus 4.6 (Thinking)", modelOrAlias: { model: "M26" } },
      ],
    })
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.map((l) => l.label)).toEqual(["Session"])
    expect(result.lines[0].used).toBe(50)
  })

  it("dedup ignores a sibling with no quotaInfo (never counts it as depleted)", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse({
      configs: [
        { label: "Gemini 3 Pro (High)", modelOrAlias: { model: "M7" }, quotaInfo: { remainingFraction: 0.75, resetTime: "2026-02-08T09:10:56Z" } },
        { label: "Gemini 3 Pro (Low)", modelOrAlias: { model: "M8" } },
      ],
    })
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const pro = result.lines.find((l) => l.label === "Session")
    expect(pro).toBeTruthy()
    expect(pro.used).toBe(25)
    expect(pro.resetsAt).toBe("2026-02-08T09:10:56Z")
  })

  it("throws when every model lacks quotaInfo (no fabricated lines)", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse({
      configs: [
        { label: "Gemini 3 Pro (High)", modelOrAlias: { model: "M7" } },
        { label: "Claude Opus 4.6 (Thinking)", modelOrAlias: { model: "M26" } },
      ],
    })
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
  })

  it("skips configs with missing or empty labels", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse({
      configs: [
        { label: "Gemini 3 Pro (High)", modelOrAlias: { model: "M7" }, quotaInfo: { remainingFraction: 0.5, resetTime: "2026-02-08T09:10:56Z" } },
        { label: "", modelOrAlias: { model: "M99" }, quotaInfo: { remainingFraction: 0.8, resetTime: "2026-02-08T09:10:56Z" } },
        { modelOrAlias: { model: "M100" }, quotaInfo: { remainingFraction: 0.9, resetTime: "2026-02-08T09:10:56Z" } },
      ],
    })
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.length).toBe(1)
    expect(result.lines[0].label).toBe("Session")
  })

  it("includes resetsAt on model lines", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse()
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const pro = result.lines.find((l) => l.label === "Session")
    expect(pro.resetsAt).toBe("2026-02-08T09:10:56Z")
  })

  it("clamps remainingFraction outside 0-1 range", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse({
      configs: [
        { label: "Gemini Pro (Over)", modelOrAlias: { model: "M1" }, quotaInfo: { remainingFraction: 1.5, resetTime: "2026-02-08T09:10:56Z" } },
        { label: "Claude Sonnet (Neg)", modelOrAlias: { model: "M2" }, quotaInfo: { remainingFraction: -0.3, resetTime: "2026-02-08T09:10:56Z" } },
      ],
    })
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const over = result.lines.find((l) => l.label === "Session")
    const neg = result.lines.find((l) => l.label === "Claude")
    expect(over.used).toBe(0) // clamped to 1.0 → 0% used
    expect(neg.used).toBe(100) // clamped to 0.0 → 100% used
  })

  it("handles missing resetTime gracefully", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse({
      configs: [
        { label: "Gemini Pro (No Reset)", modelOrAlias: { model: "M1" }, quotaInfo: { remainingFraction: 0.5 } },
      ],
    })
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const line = result.lines.find((l) => l.label === "Session")
    expect(line).toBeTruthy()
    expect(line.used).toBe(50)
    expect(line.resetsAt).toBeUndefined()
  })

  it("probes ports with HTTPS first, then HTTP, picks first success", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery({ ports: [10001, 10002] }))

    const probed = []
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) {
        const port = parseInt(url.match(/:(\d+)\//)[1])
        const scheme = url.startsWith("https") ? "https" : "http"
        probed.push({ port, scheme })
        // Port 10001 refuses both, port 10002 accepts HTTPS
        if (port === 10002 && scheme === "https") return { status: 200, bodyText: "{}" }
        throw new Error("refused")
      }
      return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse()) }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)
    // Should try HTTPS then HTTP on 10001 (both fail), then HTTPS on 10002 (success)
    expect(probed).toEqual([
      { port: 10001, scheme: "https" },
      { port: 10001, scheme: "http" },
      { port: 10002, scheme: "https" },
    ])
  })

  it("never sends apiKey in LS metadata (unified schema has no apiKey)", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse()
    setupLsMock(ctx, discovery, response)

    let capturedMetadata = null
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) {
        return { status: 200, bodyText: "{}" }
      }
      if (url.includes("GetUserStatus")) {
        const body = JSON.parse(opts.bodyText)
        capturedMetadata = body.metadata
        return { status: 200, bodyText: JSON.stringify(response) }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.length).toBeGreaterThan(0)
    expect(capturedMetadata).toBeTruthy()
    expect(capturedMetadata.apiKey).toBeUndefined()
  })

  it("falls back to Cloud Code API when LS is not available", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("fetchAvailableModels")) {
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBeNull()
    const labels = result.lines.map((l) => l.label)
    expect(labels).toContain("Session")
    expect(labels).toContain("Claude")
  })

  it("tries Antigravity IDE SQLite credentials before legacy Antigravity credentials", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteByPath(ctx, {
      [STATE_DB_V2]: makeOAuthSentinelB64(ctx, { accessToken: "ya29.v2-token", refreshToken: "1//v2", expirySeconds: futureExpiry }),
      [STATE_DB_V1]: makeOAuthSentinelB64(ctx, { accessToken: "ya29.v1-token", refreshToken: "1//v1", expirySeconds: futureExpiry }),
    })
    ctx.host.ls.discover.mockReturnValue(null)

    const capturedAuths = []
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        capturedAuths.push(opts.headers.Authorization)
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.sqlite.query.mock.calls.map((call) => call[0])).toEqual([STATE_DB_V2, STATE_DB_V1])
    expect(capturedAuths[0]).toBe("Bearer ya29.v2-token")
  })

  it("falls back to legacy SQLite credentials when the new path has no usable token", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteByPath(ctx, {
      [STATE_DB_V2]: "not-valid-protobuf!!!",
      [STATE_DB_V1]: makeOAuthSentinelB64(ctx, { accessToken: "ya29.v1-token", refreshToken: "1//v1", expirySeconds: futureExpiry }),
    })
    ctx.host.ls.discover.mockReturnValue(null)

    let capturedAuth = null
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        capturedAuth = opts.headers.Authorization
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(capturedAuth).toBe("Bearer ya29.v1-token")
  })

  it("uses the agy keychain account when no local server or SQLite credentials work", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, null)
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.keychain.readGenericPassword.mockImplementation((service, account) => {
      if (service === "gemini" && account === "antigravity") {
        return "go-keyring-base64:" + ctx.base64.encode(JSON.stringify({
          tokens: { access_token: "agy-keychain-token" },
        }))
      }
      throw new Error("unexpected keychain lookup")
    })

    const called = []
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      called.push({ url, auth: opts.headers.Authorization, userAgent: opts.headers["User-Agent"], body: opts.bodyText })
      if (url.includes("retrieveUserQuotaSummary")) {
        return { status: 404, bodyText: "" }
      }
      if (url.includes("loadCodeAssist")) {
        return { status: 200, bodyText: JSON.stringify(makeAgyLoadResponse()) }
      }
      if (url.includes("retrieveUserQuota")) {
        return { status: 200, bodyText: JSON.stringify(makeAgyQuotaResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.keychain.readGenericPassword).toHaveBeenCalledWith("gemini", "antigravity")
    expect(called.every((call) => call.auth === "Bearer agy-keychain-token")).toBe(true)
    expect(called.every((call) => call.userAgent === "antigravity")).toBe(true)
    expect(called.map((call) => call.url)).toEqual([
      "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
      "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
      "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
      "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
    ])
    expect(result.plan).toBe("Google AI Pro")
    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Claude"])
  })

  it("tries agy Cloud Code even when the keychain token matches a SQLite token", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "same-token", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.keychain.readGenericPassword.mockImplementation((service, account) => {
      if (service === "gemini" && account === "antigravity") {
        return "go-keyring-base64:" + ctx.base64.encode(JSON.stringify({
          tokens: { access_token: "same-token" },
        }))
      }
      return null
    })

    let agyCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("retrieveUserQuotaSummary")) return { status: 404, bodyText: "" }
      if (url.includes("fetchAvailableModels")) return { status: 500, bodyText: "" }
      if (url.includes("loadCodeAssist")) {
        agyCalls += 1
        return { status: 200, bodyText: JSON.stringify(makeAgyLoadResponse()) }
      }
      if (url.includes("retrieveUserQuota")) {
        agyCalls += 1
        return { status: 200, bodyText: JSON.stringify(makeAgyQuotaResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Google AI Pro")
    expect(agyCalls).toBe(2)
  })

  it("refreshes an expired agy keychain token, then reuses the refreshed token", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, null)
    ctx.host.ls.discover.mockReturnValue(null)
    // The real agy item (Windows Credential Manager holds plain JSON, no go-keyring prefix).
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({
      token: {
        access_token: "ya29.expired",
        token_type: "Bearer",
        refresh_token: "1//agy-refresh",
        expiry: new Date(Date.now() - 3600000).toISOString().replace("Z", "4567+00:00"), // Go format
      },
      auth_method: "consumer",
    }))

    const auths = []
    let refreshes = 0
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        refreshes += 1
        expect(opts.bodyText).toContain("refresh_token=" + encodeURIComponent("1//agy-refresh"))
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.agy-refreshed", expires_in: 3600 }) }
      }
      auths.push(opts.headers.Authorization)
      if (url.includes("retrieveUserQuotaSummary")) return { status: 404, bodyText: "" }
      if (url.includes("loadCodeAssist")) return { status: 200, bodyText: JSON.stringify(makeAgyLoadResponse()) }
      if (url.includes("retrieveUserQuota")) return { status: 200, bodyText: JSON.stringify(makeAgyQuotaResponse()) }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const first = plugin.probe(ctx)
    const second = plugin.probe(ctx)

    expect(first.plan).toBe("Google AI Pro")
    expect(second.lines.map((l) => l.label)).toEqual(["Session", "Claude"])
    expect(refreshes).toBe(1)
    expect(auths.every((a) => a === "Bearer ya29.agy-refreshed")).toBe(true)
    const cached = JSON.parse(ctx.host.fs.readText(ctx.app.pluginDataDir + "/agy-auth.json"))
    expect(cached.credentialFingerprint).toBe(fingerprintOf(ctx, "1//agy-refresh"))
  })

  it("Cloud Code sends correct Authorization header with DB token", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.proto-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    let capturedHeaders = null
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("fetchAvailableModels")) {
        capturedHeaders = opts.headers
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(capturedHeaders).toBeTruthy()
    expect(capturedHeaders.Authorization).toBe("Bearer ya29.proto-token")
    expect(capturedHeaders["User-Agent"]).toBe("antigravity")
  })

  it("Cloud Code returns null on 401/403 (invalid token, no refresh)", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.bad-token", refreshToken: null, expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("fetchAvailableModels")) {
        return { status: 401, bodyText: '{"error":"unauthorized"}' }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
  })

  it("Cloud Code tries multiple base URLs", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    const calledUrls = []
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("fetchAvailableModels")) {
        calledUrls.push(url)
        if (!url.includes("daily-cloudcode")) {
          throw new Error("network error")
        }
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(calledUrls).toEqual([
      "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
      "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    ])
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it("Cloud Code correctly parses model quota response", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            models: {
              "gemini-3-pro-high": {
                displayName: "Gemini 3 Pro (High)",
                quotaInfo: { remainingFraction: 0.7, resetTime: "2026-02-08T12:00:00Z" },
              },
              "gemini-3-pro-low": {
                displayName: "Gemini 3 Pro (Low)",
                quotaInfo: { remainingFraction: 0.9, resetTime: "2026-02-08T12:00:00Z" },
              },
            },
          }),
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const pro = result.lines.find((l) => l.label === "Session")
    expect(pro).toBeTruthy()
    expect(pro.used).toBe(30)
  })

  it("skips Cloud Code when no credentials available", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(null)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("LS takes priority over Cloud Code when both available", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse()
    setupLsMock(ctx, discovery, response)
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    // No userTier in default fixture → falls back to planInfo.planName
    expect(result.plan).toBe("Pro")
    const calls = ctx.host.http.request.mock.calls.map((c) => String(c[0].url))
    const ccCalls = calls.filter((u) => u.includes("fetchAvailableModels"))
    expect(ccCalls.length).toBe(0)
  })

  it("Cloud Code drops models without quotaInfo instead of fabricating 100% used", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            models: {
              "valid-model": {
                displayName: "Gemini 3 Pro",
                quotaInfo: { remainingFraction: 0.5, resetTime: "2026-02-08T12:00:00Z" },
              },
              "no-quota": {
                displayName: "Claude Sonnet (No Quota)",
              },
            },
          }),
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    // No fabricated Claude meter — only the pool with real quota data survives.
    expect(result.lines.map((l) => l.label)).toEqual(["Session"])
    expect(result.lines[0].used).toBe(50)
  })

  it("decodes protobuf tokens from SQLite", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    const protoB64 = makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-access", refreshToken: "1//refresh-token", expirySeconds: futureExpiry })
    setupSqliteMock(ctx, protoB64)
    ctx.host.ls.discover.mockReturnValue(null)

    let capturedAuth = null
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("fetchAvailableModels")) {
        capturedAuth = opts.headers.Authorization
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(capturedAuth).toBe("Bearer ya29.test-access")
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it("throws when unified oauth envelope is missing and no cache", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, null)
    ctx.host.ls.discover.mockReturnValue(null)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("throws when unified oauth envelope is corrupt and no cache", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, "not-valid-protobuf!!!")
    ctx.host.ls.discover.mockReturnValue(null)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("handles protobuf with no refresh_token or expiry", async () => {
    const ctx = makeCtx()
    const protoB64 = makeOAuthSentinelB64(ctx, { accessToken: "ya29.access-only", refreshToken: null, expirySeconds: null })
    setupSqliteMock(ctx, protoB64)
    ctx.host.ls.discover.mockReturnValue(null)

    let capturedAuth = null
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        capturedAuth = opts.headers.Authorization
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(capturedAuth).toBe("Bearer ya29.access-only")
  })

  it("sends correct form-urlencoded POST to Google OAuth", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    const protoB64 = makeOAuthSentinelB64(ctx, { accessToken: "ya29.expired", refreshToken: "1//my-refresh", expirySeconds: futureExpiry })
    setupSqliteMock(ctx, protoB64)
    ctx.host.ls.discover.mockReturnValue(null)

    let oauthBody = null
    let oauthHeaders = null
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        oauthBody = opts.bodyText
        oauthHeaders = opts.headers
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.refreshed-token" }) }
      }
      if (url.includes("fetchAvailableModels")) {
        if (opts.headers.Authorization === "Bearer ya29.refreshed-token") {
          return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
        }
        return { status: 401, bodyText: '{"error":"unauthorized"}' }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(oauthHeaders["Content-Type"]).toBe("application/x-www-form-urlencoded")
    expect(oauthBody).toContain("client_id=")
    expect(oauthBody).toContain("client_secret=")
    expect(oauthBody).toContain("refresh_token=" + encodeURIComponent("1//my-refresh"))
    expect(oauthBody).toContain("grant_type=refresh_token")
  })

  it("throws when all tokens fail and refresh returns invalid_grant", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    const protoB64 = makeOAuthSentinelB64(ctx, { accessToken: "ya29.expired", refreshToken: "1//bad-refresh", expirySeconds: futureExpiry })
    setupSqliteMock(ctx, protoB64)
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        return { status: 400, bodyText: '{"error":"invalid_grant"}' }
      }
      if (url.includes("fetchAvailableModels")) {
        return { status: 401, bodyText: '{"error":"unauthorized"}' }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
  })

  it("tries DB token first, then cached on auth failure", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    const protoB64 = makeOAuthSentinelB64(ctx, { accessToken: "ya29.proto-first", refreshToken: "1//refresh", expirySeconds: futureExpiry })
    setupSqliteMock(ctx, protoB64)
    ctx.host.ls.discover.mockReturnValue(null)

    writeCachedToken(ctx, { accessToken: "ya29.cached", expiresAtMs: Date.now() + 3600000, refreshToken: "1//refresh" })

    const capturedTokens = []
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("fetchAvailableModels")) {
        capturedTokens.push(opts.headers.Authorization)
        if (opts.headers.Authorization === "Bearer ya29.proto-first") {
          return { status: 401, bodyText: '{"error":"unauthorized"}' }
        }
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(capturedTokens[0]).toBe("Bearer ya29.proto-first")
    expect(capturedTokens[capturedTokens.length - 1]).toBe("Bearer ya29.cached")
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it("tries both tokens before refreshing", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    const protoB64 = makeOAuthSentinelB64(ctx, { accessToken: "ya29.both-fail", refreshToken: "1//refresh", expirySeconds: futureExpiry })
    setupSqliteMock(ctx, protoB64)
    ctx.host.ls.discover.mockReturnValue(null)

    writeCachedToken(ctx, { accessToken: "ya29.cached-also-bad", expiresAtMs: Date.now() + 3600000, refreshToken: "1//refresh" })

    const capturedTokens = []
    let refreshCalled = false
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        refreshCalled = true
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.refreshed" }) }
      }
      if (url.includes("fetchAvailableModels")) {
        capturedTokens.push(opts.headers.Authorization)
        if (opts.headers.Authorization === "Bearer ya29.refreshed") {
          return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
        }
        return { status: 401, bodyText: '{"error":"unauthorized"}' }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(refreshCalled).toBe(true)
    expect(capturedTokens.filter((t) => t === "Bearer ya29.both-fail").length).toBeGreaterThan(0)
    expect(capturedTokens.filter((t) => t === "Bearer ya29.cached-also-bad").length).toBeGreaterThan(0)
    expect(capturedTokens[capturedTokens.length - 1]).toBe("Bearer ya29.refreshed")
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it("deduplicates DB access token and identical cached token", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    const protoB64 = makeOAuthSentinelB64(ctx, { accessToken: "ya29.same-token", refreshToken: "1//refresh", expirySeconds: futureExpiry })
    setupSqliteMock(ctx, protoB64)
    ctx.host.ls.discover.mockReturnValue(null)

    writeCachedToken(ctx, { accessToken: "ya29.same-token", expiresAtMs: Date.now() + 3600000, refreshToken: "1//refresh" })

    const capturedTokens = []
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.refreshed" }) }
      }
      if (url.includes("fetchAvailableModels")) {
        capturedTokens.push(opts.headers.Authorization)
        if (opts.headers.Authorization === "Bearer ya29.same-token") {
          return { status: 401, bodyText: '{"error":"unauthorized"}' }
        }
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const sameTokenCalls = capturedTokens.filter((t) => t === "Bearer ya29.same-token")
    expect(sameTokenCalls.length).toBe(1)
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it("caches refreshed token to pluginDataDir", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    const protoB64 = makeOAuthSentinelB64(ctx, { accessToken: "ya29.will-fail", refreshToken: "1//refresh", expirySeconds: futureExpiry })
    setupSqliteMock(ctx, protoB64)
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.refreshed", expires_in: 3599 }) }
      }
      if (url.includes("fetchAvailableModels")) {
        if (opts.headers.Authorization === "Bearer ya29.refreshed") {
          return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
        }
        return { status: 401, bodyText: '{"error":"unauthorized"}' }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const cachePath = ctx.app.pluginDataDir + "/auth.json"
    expect(ctx.host.fs.writeText).toHaveBeenCalledWith(cachePath, expect.any(String))
    const cached = JSON.parse(ctx.host.fs.writeText.mock.calls.find((c) => c[0] === cachePath)[1])
    expect(cached.accessToken).toBe("ya29.refreshed")
    expect(cached.expiresAtMs).toBeGreaterThan(Date.now())
    // The cache is bound to the refresh token that minted it.
    expect(cached.credentialFingerprint).toBe(fingerprintOf(ctx, "1//refresh"))
  })

  // --- Regression tests: the derived-token cache is bound to the minting credential ---

  it("rejects and purges the cached token when no local credentials remain", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, null)
    ctx.host.ls.discover.mockReturnValue(null)

    const cachePath = ctx.app.pluginDataDir + "/auth.json"
    writeCachedToken(ctx, { accessToken: "ya29.cached-token", expiresAtMs: Date.now() + 3600000, refreshToken: "1//gone" })
    ctx.host.fs.writeText.mockClear()

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)

    // The still-valid derived token must never be sent nor survive on disk.
    expect(ctx.host.http.request).not.toHaveBeenCalled()
    expect(ctx.host.fs.writeText).toHaveBeenCalledWith(cachePath, "{}")
  })

  it("rejects and purges a cached token minted by a different credential", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.new-account", refreshToken: "1//new-account", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    const cachePath = ctx.app.pluginDataDir + "/auth.json"
    writeCachedToken(ctx, { accessToken: "ya29.old-account-cache", expiresAtMs: Date.now() + 3600000, refreshToken: "1//old-account" })
    ctx.host.fs.writeText.mockClear()

    const capturedTokens = []
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        capturedTokens.push(opts.headers.Authorization)
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(capturedTokens).not.toContain("Bearer ya29.old-account-cache")
    expect(ctx.host.fs.writeText).toHaveBeenCalledWith(cachePath, "{}")
  })

  it("rejects a legacy cache entry without a fingerprint", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.db-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    const cachePath = ctx.app.pluginDataDir + "/auth.json"
    ctx.host.fs.writeText(cachePath, JSON.stringify({
      accessToken: "ya29.legacy-cache",
      expiresAtMs: Date.now() + 3600000,
    }))
    ctx.host.fs.writeText.mockClear()

    const capturedTokens = []
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        capturedTokens.push(opts.headers.Authorization)
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(capturedTokens).not.toContain("Bearer ya29.legacy-cache")
    expect(ctx.host.fs.writeText).toHaveBeenCalledWith(cachePath, "{}")
  })

  it("uses cached token bound to a still-present refresh token when no DB access token", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: null, refreshToken: "1//refresh", expirySeconds: null }))
    ctx.host.ls.discover.mockReturnValue(null)

    writeCachedToken(ctx, { accessToken: "ya29.cached-token", expiresAtMs: Date.now() + 3600000, refreshToken: "1//refresh" })

    const capturedTokens = []
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        capturedTokens.push(opts.headers.Authorization)
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(capturedTokens[0]).toBe("Bearer ya29.cached-token")
  })

  it("throws when cached token is expired and no DB tokens", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, null)
    ctx.host.ls.discover.mockReturnValue(null)

    const cachePath = ctx.app.pluginDataDir + "/auth.json"
    ctx.host.fs.writeText(cachePath, JSON.stringify({
      accessToken: "ya29.expired-cache",
      expiresAtMs: Date.now() - 1000,
    }))

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("skips expired DB access token and falls through to refresh", async () => {
    const ctx = makeCtx()
    const pastExpiry = Math.floor(Date.now() / 1000) - 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.expired-proto-token", refreshToken: "1//refresh", expirySeconds: pastExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    const capturedAuths = []
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.refreshed" }) }
      }
      if (url.includes("fetchAvailableModels")) {
        capturedAuths.push(opts.headers.Authorization)
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    // Expired DB token must NOT be sent. The refreshed token is used instead.
    expect(capturedAuths).not.toContain("Bearer ya29.expired-proto-token")
    expect(capturedAuths[0]).toBe("Bearer ya29.refreshed")
  })

  it("throws when cache file is corrupt and no DB tokens", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, null)
    ctx.host.ls.discover.mockReturnValue(null)

    const cachePath = ctx.app.pluginDataDir + "/auth.json"
    ctx.host.fs.writeText(cachePath, "{bad json")

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("Cloud Code skips models with isInternal flag", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test", refreshToken: "1//r", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            models: {
              "chat_20706": {
                model: "MODEL_CHAT_20706",
                isInternal: true,
                quotaInfo: { remainingFraction: 1, resetTime: "2026-02-08T10:00:00Z" },
              },
              "gemini-3-flash": {
                displayName: "Gemini 3 Flash",
                model: "MODEL_PLACEHOLDER_M18",
                quotaInfo: { remainingFraction: 0.9, resetTime: "2026-02-08T10:00:00Z" },
              },
            },
          }),
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const labels = result.lines.map((l) => l.label)
    expect(labels).toContain("Session")
    expect(labels).not.toContain("chat_20706")
    expect(labels).not.toContain("MODEL_CHAT_20706")
  })

  it("Cloud Code skips models with empty or missing displayName", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test", refreshToken: "1//r", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            models: {
              "tab_flash_lite": {
                displayName: "",
                model: "SOME_MODEL",
                quotaInfo: { remainingFraction: 1, resetTime: "2026-02-08T10:00:00Z" },
              },
              "no_display_name": {
                model: "ANOTHER_MODEL",
                quotaInfo: { remainingFraction: 1, resetTime: "2026-02-08T10:00:00Z" },
              },
              "gemini-3-pro": {
                displayName: "Gemini 3 Pro",
                model: "MODEL_PLACEHOLDER_M8",
                quotaInfo: { remainingFraction: 0.5, resetTime: "2026-02-08T10:00:00Z" },
              },
            },
          }),
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const labels = result.lines.map((l) => l.label)
    expect(labels).toEqual(["Session"])
  })

  it("Cloud Code skips blacklisted model IDs", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test", refreshToken: "1//r", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            models: {
              "gemini-2.5-flash": {
                displayName: "Gemini 2.5 Flash",
                model: "MODEL_GOOGLE_GEMINI_2_5_FLASH",
                quotaInfo: { remainingFraction: 1, resetTime: "2026-02-08T10:00:00Z" },
              },
              "gemini-2.5-pro": {
                displayName: "Gemini 2.5 Pro",
                model: "MODEL_GOOGLE_GEMINI_2_5_PRO",
                quotaInfo: { remainingFraction: 0.8, resetTime: "2026-02-08T10:00:00Z" },
              },
              "claude-sonnet-4.5": {
                displayName: "Claude Sonnet 4.5",
                model: "MODEL_CLAUDE_4_5_SONNET",
                quotaInfo: { remainingFraction: 0.6, resetTime: "2026-02-08T10:00:00Z" },
              },
            },
          }),
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const labels = result.lines.map((l) => l.label)
    expect(labels).toEqual(["Claude"])
  })

  it("Cloud Code keeps non-blacklisted models with valid displayName", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test", refreshToken: "1//r", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            models: {
              "gemini-3-pro-high": {
                displayName: "Gemini 3 Pro (High)",
                model: "MODEL_PLACEHOLDER_M8",
                quotaInfo: { remainingFraction: 0.7, resetTime: "2026-02-08T10:00:00Z" },
              },
              "claude-opus-4-6-thinking": {
                displayName: "Claude Opus 4.6 (Thinking)",
                model: "MODEL_PLACEHOLDER_M26",
                quotaInfo: { remainingFraction: 1, resetTime: "2026-02-08T10:00:00Z" },
              },
              "gpt-oss-120b": {
                displayName: "GPT-OSS 120B (Medium)",
                model: "MODEL_OPENAI_GPT_OSS_120B_MEDIUM",
                quotaInfo: { remainingFraction: 0.9, resetTime: "2026-02-08T10:00:00Z" },
              },
            },
          }),
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const labels = result.lines.map((l) => l.label)
    expect(labels).toEqual(["Session", "Claude"])
  })

  it("LS filters out blacklisted model IDs (Claude Opus 4.5)", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse({
      configs: [
        {
          label: "Gemini 3 Pro (High)",
          modelOrAlias: { model: "MODEL_PLACEHOLDER_M8" },
          quotaInfo: { remainingFraction: 0.75, resetTime: "2026-02-08T09:10:56Z" },
        },
        {
          label: "Claude Opus 4.5 (Thinking)",
          modelOrAlias: { model: "MODEL_PLACEHOLDER_M12" },
          quotaInfo: { remainingFraction: 0.8, resetTime: "2026-02-08T09:10:56Z" },
        },
        {
          label: "Claude Opus 4.6 (Thinking)",
          modelOrAlias: { model: "MODEL_PLACEHOLDER_M26" },
          quotaInfo: { remainingFraction: 0.6, resetTime: "2026-02-08T09:10:56Z" },
        },
      ],
    })
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const labels = result.lines.map((l) => l.label)
    expect(labels).toEqual(["Session", "Claude"])
  })

  it("LS still takes priority over Cloud Code with DB tokens (no regression)", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    const protoB64 = makeOAuthSentinelB64(ctx, { accessToken: "ya29.proto-token", refreshToken: "1//refresh", expirySeconds: futureExpiry })
    setupSqliteMock(ctx, protoB64)
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse()
    setupLsMock(ctx, discovery, response)
    setupSqliteMock(ctx, protoB64)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    // No userTier in default fixture → falls back to planInfo.planName
    expect(result.plan).toBe("Pro")
    const calls = ctx.host.http.request.mock.calls.map((c) => String(c[0].url))
    expect(calls.filter((u) => u.includes("fetchAvailableModels")).length).toBe(0)
    expect(calls.filter((u) => u.includes("oauth2.googleapis.com")).length).toBe(0)
  })

  it("throws when Cloud Code returns no models", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        return { status: 200, bodyText: JSON.stringify({}) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
  })

  it("handles refresh response missing access_token", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.will-fail", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    let oauthCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        oauthCalls += 1
        return { status: 200, bodyText: JSON.stringify({ expires_in: 3600 }) }
      }
      if (url.includes("fetchAvailableModels")) {
        return { status: 401, bodyText: '{"error":"unauthorized"}' }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
    expect(oauthCalls).toBe(1)
  })

  it("continues to next Cloud Code base URL after non-2xx response", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    let ccCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        ccCalls += 1
        if (ccCalls === 1) return { status: 500, bodyText: "{}" }
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.length).toBeGreaterThan(0)
    expect(ccCalls).toBe(2)
  })

  it("continues to next Cloud Code base URL after a 200 with invalid JSON", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    let ccCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        ccCalls += 1
        if (ccCalls === 1) return { status: 200, bodyText: "{bad json" }
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.length).toBeGreaterThan(0)
    expect(ccCalls).toBe(2)
  })

  it("prefers userTier.name over legacy planInfo.planName for Ultra subscribers", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse({
      userTier: {
        id: "g1-ultra-tier",
        name: "Google AI Ultra",
        description: "Google AI Ultra",
        upgradeSubscriptionText: "You are subscribed to the best plan.",
      },
    })
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Google AI Ultra")
    const labels = result.lines.map((l) => l.label)
    expect(labels).toEqual(["Session", "Claude"])
  })

  it("falls back to planInfo.planName when userTier is absent", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse()  // no userTier override
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
  })

  it("falls back to planInfo.planName when userTier.name is empty", async () => {
    const ctx = makeCtx()
    const discovery = makeDiscovery()
    const response = makeUserStatusResponse({
      userTier: { id: "g1-pro-tier", name: "" },
    })
    setupLsMock(ctx, discovery, response)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
  })

  // --- Regression tests for unified-schema bug fixes ---

  it("refresh-token-only state (no access token, no cache) refreshes and succeeds", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: null, refreshToken: "1//only-refresh", expirySeconds: null }))
    ctx.host.ls.discover.mockReturnValue(null)

    const capturedAuths = []
    let refreshCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        refreshCalls += 1
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.from-refresh", expires_in: 3600 }) }
      }
      if (url.includes("fetchAvailableModels")) {
        capturedAuths.push(opts.headers.Authorization)
        if (opts.headers.Authorization === "Bearer ya29.from-refresh") {
          return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
        }
        return { status: 401, bodyText: '{"error":"unauthorized"}' }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(refreshCalls).toBe(1)
    expect(capturedAuths[capturedAuths.length - 1]).toBe("Bearer ya29.from-refresh")
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it("expired access token + valid refresh token: refresh is called exactly once with the refreshed token", async () => {
    const ctx = makeCtx()
    const pastExpiry = Math.floor(Date.now() / 1000) - 60
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.expired", refreshToken: "1//refresh", expirySeconds: pastExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    let refreshCalls = 0
    const ccCallTokens = []
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        refreshCalls += 1
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.new", expires_in: 3600 }) }
      }
      if (url.includes("fetchAvailableModels")) {
        ccCallTokens.push(opts.headers.Authorization)
        if (opts.headers.Authorization === "Bearer ya29.new") {
          return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
        }
        return { status: 401, bodyText: '{"error":"unauthorized"}' }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(refreshCalls).toBe(1)
    // The expired token must never be sent, and Cloud Code is called exactly once with the refreshed token.
    expect(ccCallTokens).toEqual(["Bearer ya29.new"])
  })

  it("DB access token equals cached token: Cloud Code is called exactly once", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.shared", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    writeCachedToken(ctx, { accessToken: "ya29.shared", expiresAtMs: Date.now() + 3600000, refreshToken: "1//refresh" })

    let ccCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        ccCalls += 1
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ccCalls).toBe(1)
  })

  it("does not refresh when Cloud Code returns 5xx (transient, not auth)", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.valid", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    let refreshCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        refreshCalls += 1
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.new" }) }
      }
      if (url.includes("fetchAvailableModels")) {
        return { status: 500, bodyText: "" }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
    expect(refreshCalls).toBe(0)
  })

  it("does not refresh when Cloud Code calls all throw (timeouts)", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.valid", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    writeCachedToken(ctx, { accessToken: "ya29.cached", expiresAtMs: Date.now() + 3600000, refreshToken: "1//refresh" })

    let refreshCalls = 0
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        refreshCalls += 1
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.new" }) }
      }
      if (url.includes("fetchAvailableModels")) {
        throw new Error("timeout")
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(LOGIN_MESSAGE)
    expect(refreshCalls).toBe(0)
  })

  // --- Regression tests: RetrieveUserQuotaSummary (merged Gemini pool + weekly limits) ---

  const SESSION_MS = 5 * 60 * 60 * 1000
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000

  it("LS quota summary (wrapped envelope) wins over legacy endpoints and takes plan from GetUserStatus", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      if (url.includes("RetrieveUserQuotaSummary")) {
        // The LS wraps the payload in {"response": ...}.
        return { status: 200, bodyText: JSON.stringify({ response: makeQuotaSummaryPayload() }) }
      }
      if (url.includes("GetUserStatus")) {
        return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse({ userTier: { name: "Google AI Pro" } })) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Google AI Pro")
    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Weekly", "Claude", "Claude Weekly"])
    expect(result.lines.map((l) => l.used)).toEqual([25, 10, 60, 0])
    expect(result.lines.map((l) => l.periodDurationMs)).toEqual([SESSION_MS, WEEK_MS, SESSION_MS, WEEK_MS])
    expect(result.lines[0].resetsAt).toBe("2026-07-02T16:00:00Z")
    expect(result.lines[2].resetsAt).toBe("2026-07-02T15:30:00Z")

    const calls = ctx.host.http.request.mock.calls.map((c) => String(c[0].url))
    expect(calls.filter((u) => u.includes("GetCommandModelConfigs")).length).toBe(0)
    expect(calls.filter((u) => u.includes("fetchAvailableModels")).length).toBe(0)
  })

  it("summary bucket without remainingFraction drops its line only (never fabricated)", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      if (url.includes("RetrieveUserQuotaSummary")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            response: {
              groups: [{ buckets: [
                { bucketId: "gemini-5h", resetTime: "2026-07-02T16:00:00Z" },
                { bucketId: "gemini-weekly", remainingFraction: 0.5, resetTime: "2026-07-06T07:00:00Z" },
              ] }],
            },
          }),
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.map((l) => l.label)).toEqual(["Weekly"])
    expect(result.lines[0].used).toBe(50)
  })

  it("summary matches buckets by exact bucketId only (unknown ids are skipped)", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      if (url.includes("RetrieveUserQuotaSummary")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            response: {
              groups: [{ buckets: [
                { bucketId: "gemini-image-5h", displayName: "Session", window: "5h", remainingFraction: 0.1 },
                { displayName: "Session", window: "5h", remainingFraction: 0.2 },
                { bucketId: "gemini-5h", remainingFraction: 0.75 },
              ] }],
            },
          }),
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.map((l) => l.label)).toEqual(["Session"])
    expect(result.lines[0].used).toBe(25)
  })

  it("authoritative empty summary returns no lines and never falls into the legacy chain", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      if (url.includes("RetrieveUserQuotaSummary")) {
        return { status: 200, bodyText: JSON.stringify({ response: { groups: [] } }) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines).toEqual([])
    expect(result.plan).toBeNull()
    const calls = ctx.host.http.request.mock.calls.map((c) => String(c[0].url))
    expect(calls.filter((u) => u.includes("GetCommandModelConfigs")).length).toBe(0)
    expect(calls.filter((u) => u.includes("fetchAvailableModels")).length).toBe(0)
  })

  it("summary 404 falls back to the legacy merged 5h pools", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      if (url.includes("RetrieveUserQuotaSummary")) return { status: 404, bodyText: "" }
      if (url.includes("GetUserStatus")) {
        return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse({ userTier: { name: "Google AI Pro" } })) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Google AI Pro")
    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Claude"])
    expect(result.lines.map((l) => l.periodDurationMs)).toEqual([SESSION_MS, SESSION_MS])
  })

  it("Cloud Code quota summary (bare payload) wins over fetchAvailableModels", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("retrieveUserQuotaSummary")) {
        // The remote endpoint returns the payload bare (no "response" wrapper).
        return { status: 200, bodyText: JSON.stringify(makeQuotaSummaryPayload()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Weekly", "Claude", "Claude Weekly"])
    expect(result.lines.map((l) => l.used)).toEqual([25, 10, 60, 0])
    const calls = ctx.host.http.request.mock.calls.map((c) => String(c[0].url))
    expect(calls.filter((u) => u.includes("fetchAvailableModels")).length).toBe(0)
  })

  // Seen 2026-10-17: daily-cloudcode-pa answered 200 with only the Claude group; production had both.
  it("Cloud Code quota summary comes from production, which keeps the Gemini group", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("retrieveUserQuotaSummary")) {
        const payload = makeQuotaSummaryPayload()
        if (url.includes("daily-cloudcode")) payload.groups = payload.groups.slice(0, 1)
        return { status: 200, bodyText: JSON.stringify(payload) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Weekly", "Claude", "Claude Weekly"])
  })

  it("agy Cloud Code tries the quota summary first and takes the plan from loadCodeAssist", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, null)
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.keychain.readGenericPassword.mockImplementation((service, account) => {
      if (service === "gemini" && account === "antigravity") {
        return "go-keyring-base64:" + ctx.base64.encode(JSON.stringify({
          tokens: { access_token: "agy-keychain-token" },
        }))
      }
      return null
    })

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("retrieveUserQuotaSummary")) {
        return { status: 200, bodyText: JSON.stringify(makeQuotaSummaryPayload()) }
      }
      if (url.includes("loadCodeAssist")) {
        return { status: 200, bodyText: JSON.stringify(makeAgyLoadResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Google AI Pro")
    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Weekly", "Claude", "Claude Weekly"])
    const calls = ctx.host.http.request.mock.calls.map((c) => String(c[0].url))
    expect(calls.filter((u) => u.includes("retrieveUserQuota") && !u.includes("retrieveUserQuotaSummary")).length).toBe(0)
  })

  // Seen 2026-10-25: both Cloud Code hosts answered the summary with only the Claude group, while
  // fetchAvailableModels still carried every Gemini model's 5h quota. The tray's Session read "--".
  function claudeOnlySummary() {
    const payload = makeQuotaSummaryPayload()
    payload.groups = payload.groups.slice(0, 1)
    return payload
  }

  it("fills Session from the per-model quotas when the Cloud Code summary has no Gemini group", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)

    const models = makeCloudCodeResponse()
    // Image models have their own quota (gemini-image-5h): one running out must not fill Session.
    models.models["gemini-3.1-flash-image"] = {
      displayName: "Gemini 3.1 Flash Image",
      model: "gemini-3.1-flash-image",
      quotaInfo: { remainingFraction: 0, resetTime: "2026-02-08T10:00:00Z" },
    }
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("retrieveUserQuotaSummary")) return { status: 200, bodyText: JSON.stringify(claudeOnlySummary()) }
      if (url.includes("fetchAvailableModels")) return { status: 200, bodyText: JSON.stringify(models) }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Claude", "Claude Weekly"])
    expect(result.lines.map((l) => l.used)).toEqual([20, 60, 0])
    expect(result.lines[0].periodDurationMs).toBe(SESSION_MS)
    expect(result.lines[0].resetsAt).toBe("2026-02-08T10:00:00Z")
  })

  it("fills Session from GetUserStatus when the LS summary has no Gemini group", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      if (url.includes("RetrieveUserQuotaSummary")) {
        return { status: 200, bodyText: JSON.stringify({ response: claudeOnlySummary() }) }
      }
      if (url.includes("GetUserStatus")) {
        return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse({ userTier: { name: "Google AI Ultra" } })) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Google AI Ultra")
    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Claude", "Claude Weekly"])
    expect(result.lines.map((l) => l.used)).toEqual([20, 60, 0])
  })

  it("fills Session for the agy login when its summary has no Gemini group", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, null)
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.keychain.readGenericPassword.mockImplementation((service, account) => {
      if (service === "gemini" && account === "antigravity") {
        return "go-keyring-base64:" + ctx.base64.encode(JSON.stringify({
          tokens: { access_token: "agy-keychain-token" },
        }))
      }
      return null
    })

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("retrieveUserQuotaSummary")) return { status: 200, bodyText: JSON.stringify(claudeOnlySummary()) }
      if (url.includes("fetchAvailableModels")) return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      if (url.includes("loadCodeAssist")) return { status: 200, bodyText: JSON.stringify(makeAgyLoadResponse()) }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Google AI Pro")
    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Claude", "Claude Weekly"])
    expect(result.lines.map((l) => l.used)).toEqual([20, 60, 0])
  })

  // --- Ported from upstream OpenUsage #1407 (merge hosts, plan from loadCodeAssist) and #1395 (Argon) ---

  function setupDbToken(ctx) {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeOAuthSentinelB64(ctx, { accessToken: "ya29.test-token", refreshToken: "1//refresh", expirySeconds: futureExpiry }))
    ctx.host.ls.discover.mockReturnValue(null)
  }

  function summaryCalls(ctx) {
    return ctx.host.http.request.mock.calls
      .map((c) => String(c[0].url))
      .filter((u) => u.includes("retrieveUserQuotaSummary"))
  }

  it("merges the summary from both Cloud Code hosts when production lacks a pool", async () => {
    const ctx = makeCtx()
    setupDbToken(ctx)
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("retrieveUserQuotaSummary")) {
        const payload = url.includes("daily-cloudcode") ? makeQuotaSummaryPayload() : claudeOnlySummary()
        return { status: 200, bodyText: JSON.stringify(payload) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Weekly", "Claude", "Claude Weekly"])
    expect(result.lines.map((l) => l.used)).toEqual([25, 10, 60, 0])
    expect(summaryCalls(ctx)).toHaveLength(2)
    const calls = ctx.host.http.request.mock.calls.map((c) => String(c[0].url))
    expect(calls.filter((u) => u.includes("fetchAvailableModels")).length).toBe(0)
  })

  it("asks only production when its summary already has all four pools", async () => {
    const ctx = makeCtx()
    setupDbToken(ctx)
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("retrieveUserQuotaSummary")) return { status: 200, bodyText: JSON.stringify(makeQuotaSummaryPayload()) }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(summaryCalls(ctx)).toEqual(["https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary"])
  })

  function withArgon(payload, buckets) {
    payload.groups.push({ displayName: "Gemini 4 Argon", buckets })
    return payload
  }

  function probeSummary(ctx, payload) {
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("retrieveUserQuotaSummary")) return { status: 200, bodyText: JSON.stringify(payload) }
      return { status: 500, bodyText: "" }
    })
  }

  it("shows Argon Weekly from its own group, before the Claude meters", async () => {
    const ctx = makeCtx()
    setupDbToken(ctx)
    probeSummary(ctx, withArgon(makeQuotaSummaryPayload(), [
      { bucketId: "argon-weekly", window: "weekly", remainingFraction: 0.3, resetTime: "2026-07-06T07:00:00Z" },
    ]))

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Weekly", "Argon Weekly", "Claude", "Claude Weekly"])
    const argon = result.lines[2]
    expect(argon.used).toBe(70)
    expect(argon.periodDurationMs).toBe(WEEK_MS)
    expect(argon.resetsAt).toBe("2026-07-06T07:00:00Z")
  })

  it("drops an Argon quota that is disabled, ambiguous or not weekly", async () => {
    const cases = [
      [{ bucketId: "argon-weekly", window: "weekly", remainingFraction: 0.3, disabled: true }],
      [{ bucketId: "argon-weekly", window: "weekly", remainingFraction: 0.3, disabled: "no" }],
      [
        { bucketId: "argon-weekly", window: "weekly", remainingFraction: 0.3 },
        { bucketId: "argon-weekly-2", window: "weekly", remainingFraction: 0.5 },
      ],
      [{ bucketId: "argon-5h", window: "5h", remainingFraction: 0.3 }],
      [{ bucketId: "gemini-weekly", window: "weekly", remainingFraction: 0.3 }],
    ]
    for (const buckets of cases) {
      const ctx = makeCtx()
      setupDbToken(ctx)
      probeSummary(ctx, withArgon(makeQuotaSummaryPayload(), buckets))

      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)

      expect(result.lines.map((l) => l.label)).toEqual(["Session", "Weekly", "Claude", "Claude Weekly"])
      // A shared bucket id inside the Argon group never replaces the shared pool's own value.
      expect(result.lines[1].used).toBe(10)
    }
  })

  it("keeps Argon models out of the Gemini Session pool", async () => {
    const ctx = makeCtx()
    setupDbToken(ctx)
    const models = makeCloudCodeResponse()
    models.models["gemini-4-argon-high"] = {
      displayName: "Gemini 4 Argon (High)",
      model: "gemini-4-argon-high",
      quotaInfo: { remainingFraction: 0, resetTime: "2026-02-08T10:00:00Z" },
    }
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("retrieveUserQuotaSummary")) return { status: 200, bodyText: JSON.stringify(claudeOnlySummary()) }
      if (url.includes("fetchAvailableModels")) return { status: 200, bodyText: JSON.stringify(models) }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.map((l) => l.label)).toEqual(["Session", "Claude", "Claude Weekly"])
    expect(result.lines[0].used).toBe(20)
  })

  it("reads the plan from loadCodeAssist on the Antigravity login's Cloud Code path", async () => {
    for (const [load, plan] of [
      [makeAgyLoadResponse({ paidTier: { id: "g1-ultra-tier", name: "Google AI Ultra" }, currentTier: { name: "Antigravity" } }), "Google AI Ultra"],
      [makeAgyLoadResponse({ paidTier: { id: "g1-ultra-tier" }, currentTier: { name: "Antigravity" } }), "Google AI Ultra"],
      [makeAgyLoadResponse({ paidTier: undefined, currentTier: { name: "Antigravity" } }), "Antigravity"],
    ]) {
      const ctx = makeCtx()
      setupDbToken(ctx)
      ctx.host.http.request.mockImplementation((opts) => {
        const url = String(opts.url)
        if (url.includes("retrieveUserQuotaSummary")) return { status: 200, bodyText: JSON.stringify(makeQuotaSummaryPayload()) }
        if (url.includes("loadCodeAssist")) return { status: 200, bodyText: JSON.stringify(load) }
        return { status: 500, bodyText: "" }
      })

      const plugin = await loadPlugin()
      expect(plugin.probe(ctx).plan).toBe(plan)
    }
  })
})
