import { act, renderHook } from "@testing-library/react"
import { invoke } from "@tauri-apps/api/core"
import { sendNotification } from "@tauri-apps/plugin-notification"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PluginState } from "@/hooks/app/types"
import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import { LOGIN_CHECK_MS, needsSignIn, useLoginRecovery } from "@/hooks/app/use-login-recovery"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(() => Promise.resolve(true)),
  requestPermission: vi.fn(() => Promise.resolve("granted")),
  sendNotification: vi.fn(),
}))

const EXPIRED = "Token expired. Run `claude` to log in again."
const DATA = { providerId: "claude", displayName: "Claude", lines: [] } as unknown as PluginOutput
const META = [{ id: "claude", name: "Claude" }] as PluginMeta[]
const state = (error: string | null, data: PluginOutput | null = DATA): PluginState => ({
  data,
  loading: false,
  error,
  lastManualRefreshAt: null,
  lastUpdatedAt: null,
})

let stamp: number | null = 100
const settle = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
})

function mount(initial: Record<string, PluginState>, notify = true, enabledIds = ["claude", "cursor"]) {
  const setLoadingForPlugins = vi.fn()
  const setErrorForPlugins = vi.fn()
  const startBatch = vi.fn(() => Promise.resolve<string[] | undefined>(undefined))
  const view = renderHook(
    ({ pluginStates }) =>
      useLoginRecovery({
        pluginStates,
        pluginsMeta: META,
        enabledIds,
        notify,
        alertSettings: { levels: [80, 95], sound: "windows", customSoundName: null },
        setLoadingForPlugins,
        setErrorForPlugins,
        startBatch,
      }),
    { initialProps: { pluginStates: initial } }
  )
  return { ...view, setLoadingForPlugins, setErrorForPlugins, startBatch }
}

describe("useLoginRecovery", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stamp = 100
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockImplementation((command) =>
      Promise.resolve(command === "login_file_stamp" ? stamp : undefined)
    )
    vi.mocked(sendNotification).mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it("knows a sign-in error by its one-click login command", () => {
    expect(needsSignIn(state(EXPIRED))).toBe(true)
    expect(needsSignIn(state("Rate limited by Anthropic, retry in ~60m"))).toBe(false)
    expect(needsSignIn(state(null))).toBe(false)
  })

  it("probes a card waiting for a sign-in as soon as its login file is written", async () => {
    const { startBatch, setLoadingForPlugins } = mount({ claude: state(EXPIRED) })
    await settle()
    expect(invoke).toHaveBeenCalledWith("login_file_stamp", { pluginId: "claude" })

    await act(async () => vi.advanceTimersByTime(LOGIN_CHECK_MS))
    await settle()
    expect(startBatch).not.toHaveBeenCalled()

    stamp = 200
    await act(async () => vi.advanceTimersByTime(LOGIN_CHECK_MS))
    await settle()
    expect(setLoadingForPlugins).toHaveBeenCalledWith(["claude"])
    expect(startBatch).toHaveBeenCalledWith(["claude"])

    await act(async () => vi.advanceTimersByTime(LOGIN_CHECK_MS))
    await settle()
    expect(startBatch).toHaveBeenCalledTimes(1)
  })

  it("doesn't take the login file a probe rewrote itself for a sign-in", async () => {
    const { rerender, startBatch } = mount({ claude: state(EXPIRED) })
    await settle()
    // A token refresh writes the file, yet usage still answers 401: the card waits again.
    for (let i = 0; i < 3; i++) {
      rerender({ pluginStates: { claude: { ...state(null), loading: true } } })
      stamp! += 100
      rerender({ pluginStates: { claude: state(EXPIRED) } })
      await settle()
      await act(async () => vi.advanceTimersByTime(LOGIN_CHECK_MS))
      await settle()
    }
    expect(startBatch).not.toHaveBeenCalled()
  })

  it("puts the error back when the probe can't start", async () => {
    const { startBatch, setErrorForPlugins } = mount({ claude: state(EXPIRED) })
    startBatch.mockRejectedValueOnce(new Error("no runtime"))
    await settle()
    stamp = 200
    await act(async () => vi.advanceTimersByTime(LOGIN_CHECK_MS))
    await settle()
    expect(setErrorForPlugins).toHaveBeenCalledWith(["claude"], "Failed to start probe")
  })

  it("leaves a disabled card alone", async () => {
    mount({ claude: state(EXPIRED) }, true, ["cursor"])
    await settle()
    expect(invoke).not.toHaveBeenCalledWith("login_file_stamp", expect.anything())
  })

  it("watches nothing while no card asks for a sign-in", async () => {
    mount({ claude: state(null), cursor: state("Rate limited by Cursor, try again later") })
    await settle()
    await act(async () => vi.advanceTimersByTime(LOGIN_CHECK_MS * 3))
    expect(invoke).not.toHaveBeenCalledWith("login_file_stamp", expect.anything())
  })

  it("toasts once when a working card loses its sign-in, and again after it recovered", async () => {
    const { rerender } = mount({ claude: state(null) })
    rerender({ pluginStates: { claude: state(EXPIRED) } })
    await settle()
    rerender({ pluginStates: { claude: { ...state(EXPIRED), lastUpdatedAt: 1 } } })
    await settle()
    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(sendNotification).toHaveBeenCalledWith({ title: "Claude: sign in again", body: expect.any(String) })

    rerender({ pluginStates: { claude: state(null) } })
    rerender({ pluginStates: { claude: state(EXPIRED) } })
    await settle()
    expect(sendNotification).toHaveBeenCalledTimes(2)
  })

  it("keeps one toast while a stopped distro shows its cached data in between", async () => {
    const { rerender } = mount({ claude: state(null) })
    rerender({ pluginStates: { claude: state(EXPIRED) } })
    await settle()
    rerender({ pluginStates: { claude: state(null, { ...DATA, staleSince: "2026-11-06T00:00:00Z" } as PluginOutput) } })
    rerender({ pluginStates: { claude: state(EXPIRED) } })
    await settle()
    expect(sendNotification).toHaveBeenCalledTimes(1)
  })

  it("doesn't toast for a card that was signed out when the app started, or with alerts off", async () => {
    mount({ claude: state(EXPIRED, null) })
    await settle()
    // Cached data from an earlier run (a stopped WSL distro's card) isn't this run working.
    const cached = mount({ claude: state(null, { ...DATA, staleSince: "2026-11-01T00:00:00Z" } as PluginOutput) })
    cached.rerender({ pluginStates: { claude: state(EXPIRED) } })
    await settle()
    const { rerender } = mount({ claude: state(null) }, false)
    rerender({ pluginStates: { claude: state(EXPIRED) } })
    await settle()
    expect(sendNotification).not.toHaveBeenCalled()
  })
})
