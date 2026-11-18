import { render, renderHook, screen, waitFor } from "@testing-library/react"
import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  ClaudeSessionList,
  ClaudeSessions,
  hasLiveSessions,
  useClaudeSessions,
  type LiveSession,
} from "@/components/claude-sessions"
import { DEFAULT_CARD_FEATURES } from "@/lib/settings"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }))
let panelOpen = true
vi.mock("@/hooks/use-unseen-usage", () => ({ usePanelOpen: () => panelOpen }))

const session = (over: Partial<LiveSession>): LiveSession => ({
  id: "s",
  name: "my-app",
  cwd: "C:\\work\\my-app",
  status: "busy",
  contextPercent: null,
  ...over,
})

describe("claude sessions", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    panelOpen = true
    useAppPreferencesStore.setState({ cardFeatures: DEFAULT_CARD_FEATURES })
  })

  it("lists sessions only for the usual Claude and Codex logins and their extra accounts", () => {
    expect(hasLiveSessions("claude")).toBe(true)
    expect(hasLiveSessions("claude-1a2b3c4d")).toBe(true)
    expect(hasLiveSessions("codex")).toBe(true)
    expect(hasLiveSessions("codex-1a2b3c4d")).toBe(true)
    expect(hasLiveSessions("claude-wsl-0011aabb")).toBe(false)
    expect(hasLiveSessions("cursor")).toBe(false)
  })

  it("asks the host for a Claude or Codex card's sessions and none for other cards", async () => {
    vi.mocked(invoke).mockResolvedValue([session({})])
    const { result } = renderHook(() => useClaudeSessions("codex"))
    await waitFor(() => expect(result.current).toHaveLength(1))
    expect(invoke).toHaveBeenCalledWith("live_sessions", { pluginId: "codex" })

    vi.mocked(invoke).mockClear()
    renderHook(() => useClaudeSessions("cursor"))
    expect(invoke).not.toHaveBeenCalled()
  })

  it("reads nothing while the panel sits hidden in the tray", () => {
    panelOpen = false
    renderHook(() => useClaudeSessions("claude"))
    expect(invoke).not.toHaveBeenCalled()
  })

  it("leaves the overview's cards alone when turned off there, and still reads for the detail page", async () => {
    vi.mocked(invoke).mockResolvedValue([])
    useAppPreferencesStore.setState({ cardFeatures: { ...DEFAULT_CARD_FEATURES, sessionsOnOverview: false } })
    render(<ClaudeSessions pluginId="claude" />)
    expect(invoke).not.toHaveBeenCalled()

    render(<ClaudeSessions pluginId="claude" section />)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("live_sessions", { pluginId: "claude" }))
  })

  it("shows nothing without sessions", () => {
    const { container } = render(<ClaudeSessionList sessions={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows each session's state and warns as its context fills up", () => {
    render(
      <ClaudeSessionList
        sessions={[
          session({ id: "a", name: "api", status: "waiting" }),
          session({ id: "b", name: "web", status: "idle", contextPercent: 72.4 }),
          session({ id: "c", name: "docs", contextPercent: 91 }),
        ]}
      />
    )
    expect(screen.getByText("Live sessions")).toBeInTheDocument()
    expect(screen.getByText("Waiting for you")).toBeInTheDocument()
    expect(screen.getByText("72% context")).toHaveClass("text-yellow-600")
    expect(screen.getByText("91% context")).toHaveClass("text-destructive")
    expect(screen.getByText("Compacts soon")).toBeInTheDocument()
    // The warning takes the busy text's place; the dot still says it.
    expect(screen.queryByText("Working")).not.toBeInTheDocument()
    expect(screen.getAllByRole("img", { name: "Working" })).toHaveLength(1)
    // A dot between a row's state and its context; none on the row with the state alone.
    expect(screen.getAllByText("·")).toHaveLength(2)
  })
})
