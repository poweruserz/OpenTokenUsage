import { cleanup, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

let latestOnDragEnd: ((event: any) => void) | undefined

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd?: (event: any) => void }) => {
    latestOnDragEnd = onDragEnd
    return <div data-testid="dnd-context">{children}</div>
  },
  closestCenter: vi.fn(),
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn((_sensor: any, options?: any) => ({ sensor: _sensor, options })),
  useSensors: vi.fn((...sensors: any[]) => sensors),
}))

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: (items: any[], from: number, to: number) => {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  },
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}))

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}))

import { SettingsPage } from "@/pages/settings"
import { DEFAULT_ALERT_SETTINGS, DEFAULT_DESKTOP_WIDGETS } from "@/lib/settings"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const defaultProps = {
  plugins: [{ id: "a", name: "Alpha", enabled: true }],
  onReorder: vi.fn(),
  onToggle: vi.fn(),
  autoUpdateInterval: 15 as const,
  onAutoUpdateIntervalChange: vi.fn(),
  themeMode: "dark" as const,
  onThemeModeChange: vi.fn(),
  displayMode: "used" as const,
  onDisplayModeChange: vi.fn(),
  resetTimerDisplayMode: "relative" as const,
  onResetTimerDisplayModeChange: vi.fn(),
  timeFormatMode: "auto" as const,
  onTimeFormatModeChange: vi.fn(),
  menubarIconStyle: "icon" as const,
  onMenubarIconStyleChange: vi.fn(),
  trayProvider: "auto",
  onTrayProviderChange: vi.fn(),
  trayMetric: "auto",
  onTrayMetricChange: vi.fn(),
  trayPercentColor: "#ffffff",
  onTrayPercentColorChange: vi.fn(),
  traySettingsPreview: {
    bars: [{ id: "a", fraction: 0.7 }],
    providerBars: [{ id: "a", fraction: 0.7 }],
    providerIconUrl: "icon-a",
    providerPercentText: "70%",
  },
  globalShortcut: null,
  onGlobalShortcutChange: vi.fn(),
  startOnLogin: false,
  onStartOnLoginChange: vi.fn(),
}

afterEach(() => {
  cleanup()
})

/** Settings come in groups, one shown at a time: open the one a test needs. */
const openCategory = (name: string) => userEvent.click(screen.getByRole("tab", { name }))

describe("SettingsPage", () => {
  it("shows one group of settings at a time, usage first", async () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByRole("tab", { name: "Usage" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("Usage mode")).toBeInTheDocument()
    expect(screen.queryByText("Tray icon")).not.toBeInTheDocument()
    await openCategory("Taskbar & desktop")
    expect(screen.getByText("Tray icon")).toBeInTheDocument()
    expect(screen.getByText("Desktop widgets")).toBeInTheDocument()
    // The shared look shows only while the strip or the widgets are on.
    expect(screen.queryByText("Strip and widget look")).not.toBeInTheDocument()
    expect(screen.queryByText("Usage mode")).not.toBeInTheDocument()
  })

  it("toggles plugins", async () => {
    const onToggle = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        plugins={[
          { id: "b", name: "Beta", enabled: false },
        ]}
        onToggle={onToggle}
      />
    )
    await openCategory("Providers")
    const row = screen.getByText("Beta").closest("div")!
    await userEvent.click(within(row).getByRole("checkbox"))
    expect(onToggle).toHaveBeenCalledWith("b")
  })

  it("reorders plugins on drag end", async () => {
    const onReorder = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        plugins={[
          { id: "a", name: "Alpha", enabled: true },
          { id: "b", name: "Beta", enabled: true },
        ]}
        onReorder={onReorder}
      />
    )
    await openCategory("Providers")
    latestOnDragEnd?.({ active: { id: "a" }, over: { id: "b" } })
    expect(onReorder).toHaveBeenCalledWith(["b", "a"])
  })

  it("gives one provider its own alert levels and takes them back", async () => {
    const saved = useAppPreferencesStore.getState()
    useAppPreferencesStore.setState({ usageAlerts: true, alertSettings: { ...DEFAULT_ALERT_SETTINGS, providerLevels: {} } })
    const own = () => useAppPreferencesStore.getState().alertSettings.providerLevels
    try {
      render(
        <SettingsPage
          {...defaultProps}
          plugins={[
            { id: "claude", name: "Claude", enabled: true },
            { id: "cursor", name: "Cursor", enabled: true },
          ]}
        />
      )
      await openCategory("Notifications")
      await userEvent.selectOptions(screen.getByLabelText("Per provider"), "cursor")
      await userEvent.click(screen.getByRole("checkbox", { name: "Same as all providers" }))
      expect(own()).toEqual({ cursor: [80, 95] })
      await userEvent.click(within(screen.getByRole("group", { name: "Cursor" })).getByRole("button", { name: "80%" }))
      expect(own()).toEqual({ cursor: [95] })
      expect(screen.getByRole("option", { name: "Cursor · 95%" })).toBeInTheDocument()
      await userEvent.click(screen.getByRole("checkbox", { name: "Same as all providers" }))
      expect(own()).toEqual({})
    } finally {
      useAppPreferencesStore.setState({ usageAlerts: saved.usageAlerts, alertSettings: saved.alertSettings })
    }
  })

  it("turns usage spike notifications off and on again", async () => {
    const saved = useAppPreferencesStore.getState()
    useAppPreferencesStore.setState({ usageAlerts: true, alertSettings: DEFAULT_ALERT_SETTINGS })
    try {
      render(<SettingsPage {...defaultProps} />)
      await openCategory("Notifications")
      const spikes = screen.getByRole("checkbox", { name: /far faster than usual/ })
      expect(spikes).toBeChecked()
      await userEvent.click(spikes)
      expect(useAppPreferencesStore.getState().alertSettings.spikes).toBe(false)
      await userEvent.click(spikes)
      expect(useAppPreferencesStore.getState().alertSettings.spikes).toBe(true)
    } finally {
      useAppPreferencesStore.setState({ usageAlerts: saved.usageAlerts, alertSettings: saved.alertSettings })
    }
  })

  it("turns early refill notifications off and sets how much they need", async () => {
    const saved = useAppPreferencesStore.getState()
    useAppPreferencesStore.setState({ usageAlerts: true, alertSettings: DEFAULT_ALERT_SETTINGS })
    try {
      render(<SettingsPage {...defaultProps} />)
      await openCategory("Notifications")
      await userEvent.selectOptions(screen.getByLabelText("By at least"), "20")
      expect(useAppPreferencesStore.getState().alertSettings.refillPoints).toBe(20)
      await userEvent.click(screen.getByRole("checkbox", { name: /refills before its reset/ }))
      expect(useAppPreferencesStore.getState().alertSettings.refills).toBe(false)
      expect(screen.queryByLabelText("By at least")).not.toBeInTheDocument()
    } finally {
      useAppPreferencesStore.setState({ usageAlerts: saved.usageAlerts, alertSettings: saved.alertSettings })
    }
  })

  it("turns live sessions, the spend summary and each tool it counts on and off", async () => {
    const saved = useAppPreferencesStore.getState().cardFeatures
    try {
      render(<SettingsPage {...defaultProps} />)
      await userEvent.click(screen.getByRole("checkbox", { name: "Grok" }))
      expect(useAppPreferencesStore.getState().cardFeatures.spendToolsOff).toEqual(["grok"])
      await userEvent.click(screen.getByRole("checkbox", { name: /Live Claude Code and Codex sessions/ }))
      expect(useAppPreferencesStore.getState().cardFeatures.liveSessions).toBe(false)
      await userEvent.click(screen.getByRole("checkbox", { name: "Spend summary under the cards" }))
      expect(useAppPreferencesStore.getState().cardFeatures.spend).toBe(false)
      expect(screen.queryByRole("checkbox", { name: "Grok" })).not.toBeInTheDocument()
    } finally {
      useAppPreferencesStore.setState({ cardFeatures: saved })
    }
  })

  it("switches following, its detail, the activity dots and the click-through key", async () => {
    const saved = useAppPreferencesStore.getState()
    useAppPreferencesStore.setState({
      taskbarStrip: true,
      desktopWidgets: { ...DEFAULT_DESKTOP_WIDGETS, enabled: true, clickThrough: true },
    })
    try {
      render(<SettingsPage {...defaultProps} />)
      await openCategory("Taskbar & desktop")
      const style = () => useAppPreferencesStore.getState().taskbarStripStyle
      expect(screen.queryByRole("checkbox", { name: /In detail/ })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole("checkbox", { name: /Follow the active app/ }))
      expect(style().followActive).toBe(true)
      await userEvent.click(screen.getByRole("checkbox", { name: /In detail/ }))
      expect(style().followDetail).toBe(false)
      await userEvent.click(screen.getByRole("checkbox", { name: /Dot on a logo/ }))
      expect(style().activityDots).toBe(false)
      await userEvent.selectOptions(screen.getByLabelText("Hold this key to click or drag"), "alt")
      expect(useAppPreferencesStore.getState().desktopWidgets.clickThroughKey).toBe("alt")
    } finally {
      useAppPreferencesStore.setState({
        taskbarStrip: saved.taskbarStrip,
        taskbarStripStyle: saved.taskbarStripStyle,
        desktopWidgets: saved.desktopWidgets,
      })
    }
  })

  it("refuses a file that isn't a settings backup and says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<SettingsPage {...defaultProps} />)
    await openCategory("App")
    const file = new File([JSON.stringify({ hello: "world" })], "other.json", { type: "application/json" })
    await userEvent.upload(screen.getByLabelText("Import and restart"), file)
    expect(await screen.findByText("That isn't an OpenTokenUsage settings backup.")).toBeInTheDocument()
    vi.mocked(console.error).mockRestore()
  })

  it("picks a currency and takes the rate the user types", async () => {
    const saved = useAppPreferencesStore.getState().currency
    const currency = () => useAppPreferencesStore.getState().currency
    try {
      render(<SettingsPage {...defaultProps} />)
      expect(screen.queryByText("1 USD in TRY")).not.toBeInTheDocument()
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Currency" }), "TRY")
      expect(currency()).toEqual({ code: "TRY", rate: 1 })
      const rate = screen.getByLabelText("1 USD in TRY")
      await userEvent.clear(rate)
      await userEvent.type(rate, "40.5")
      expect(currency()).toEqual({ code: "TRY", rate: 40.5 })
      // A cleared field isn't applied, and shows the rate in use again once left.
      await userEvent.clear(rate)
      await userEvent.tab()
      expect(currency()).toEqual({ code: "TRY", rate: 40.5 })
      expect(rate).toHaveValue(40.5)
    } finally {
      useAppPreferencesStore.setState({ currency: saved })
    }
  })

  it("lists enabled providers first, keeping their order", async () => {
    render(
      <SettingsPage
        {...defaultProps}
        plugins={[
          { id: "a", name: "Alpha", enabled: false },
          { id: "b", name: "Beta", enabled: true },
          { id: "c", name: "Gamma", enabled: false },
          { id: "d", name: "Delta", enabled: true },
        ]}
      />
    )
    await openCategory("Providers")
    // Not the per-provider alert picker's options.
    const names = screen
      .getAllByText(/^(Alpha|Beta|Gamma|Delta)$/, { ignore: "option, script, style" })
      .map((el) => el.textContent)
    expect(names).toEqual(["Beta", "Delta", "Alpha", "Gamma"])
  })

  it("ignores invalid drag end", async () => {
    const onReorder = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onReorder={onReorder}
      />
    )
    await openCategory("Providers")
    latestOnDragEnd?.({ active: { id: "a" }, over: null })
    latestOnDragEnd?.({ active: { id: "a" }, over: { id: "a" } })
    expect(onReorder).not.toHaveBeenCalled()
  })

  it("updates auto-update interval", async () => {
    const onAutoUpdateIntervalChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onAutoUpdateIntervalChange={onAutoUpdateIntervalChange}
      />
    )
    await userEvent.click(screen.getByText("30 min"))
    expect(onAutoUpdateIntervalChange).toHaveBeenCalledWith(30)
  })

  it("shows auto-update helper text", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("How often usage is fetched")).toBeInTheDocument()
  })

  it("renders app theme section with theme options", async () => {
    render(<SettingsPage {...defaultProps} />)
    await openCategory("Appearance")
    expect(screen.getByText("Theme")).toBeInTheDocument()
    expect(screen.getByText("Dark (pure black), light or Halloween")).toBeInTheDocument()
    expect(screen.queryByText("Windows")).toBeNull()
    expect(screen.queryByText("OLED")).toBeNull()
    expect(screen.getByText("Light")).toBeInTheDocument()
    expect(screen.getByText("Dark")).toBeInTheDocument()
  })

  it("updates theme mode", async () => {
    const onThemeModeChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onThemeModeChange={onThemeModeChange}
      />
    )
    await openCategory("Appearance")
    await userEvent.click(screen.getByText("Light"))
    expect(onThemeModeChange).toHaveBeenCalledWith("light")
  })

  it("updates display mode", async () => {
    const onDisplayModeChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onDisplayModeChange={onDisplayModeChange}
      />
    )
    const usageMode = screen.getByRole("radiogroup", { name: "Usage mode" })
    await userEvent.click(within(usageMode).getByRole("radio", { name: "Left" }))
    expect(onDisplayModeChange).toHaveBeenCalledWith("left")
  })

  it("moves the provider bar to the panel's right side", async () => {
    render(<SettingsPage {...defaultProps} />)
    await openCategory("Appearance")
    const side = screen.getByRole("radiogroup", { name: "Provider bar" })
    await userEvent.click(within(side).getByRole("radio", { name: "Right" }))
    expect(useAppPreferencesStore.getState().navRight).toBe(true)
    useAppPreferencesStore.getState().setNavRight(false)
  })

  it("updates reset timer display mode", async () => {
    const onResetTimerDisplayModeChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onResetTimerDisplayModeChange={onResetTimerDisplayModeChange}
      />
    )
    await userEvent.click(screen.getByRole("radio", { name: /Absolute/ }))
    expect(onResetTimerDisplayModeChange).toHaveBeenCalledWith("absolute")
  })

  it("renders renamed usage section heading", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("Usage mode")).toBeInTheDocument()
  })

  it("renders reset timers section heading", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("Reset timers")).toBeInTheDocument()
  })

  it("renders time format section heading", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("Time format")).toBeInTheDocument()
    expect(screen.getByText("12-hour or 24-hour clock")).toBeInTheDocument()
  })

  it("updates time format mode to 12h", async () => {
    const onTimeFormatModeChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onTimeFormatModeChange={onTimeFormatModeChange}
      />
    )
    await userEvent.click(screen.getByRole("radio", { name: "12-hour" }))
    expect(onTimeFormatModeChange).toHaveBeenCalledWith("12h")
  })

  it("updates time format mode to 24h", async () => {
    const onTimeFormatModeChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onTimeFormatModeChange={onTimeFormatModeChange}
      />
    )
    await userEvent.click(screen.getByRole("radio", { name: "24-hour" }))
    expect(onTimeFormatModeChange).toHaveBeenCalledWith("24h")
  })

  it("renders menubar icon section", async () => {
    render(<SettingsPage {...defaultProps} />)
    await openCategory("Taskbar & desktop")
    expect(screen.getByText("Tray icon")).toBeInTheDocument()
    expect(screen.getByText("What shows next to the clock on the taskbar")).toBeInTheDocument()
  })

  it("clicking Bars triggers onMenubarIconStyleChange(\"bars\")", async () => {
    const onMenubarIconStyleChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onMenubarIconStyleChange={onMenubarIconStyleChange}
      />
    )
    await openCategory("Taskbar & desktop")
    await userEvent.click(screen.getByRole("radio", { name: "Bars" }))
    expect(onMenubarIconStyleChange).toHaveBeenCalledWith("bars")
  })

  it("clicking Percent triggers onMenubarIconStyleChange(\"percent\")", async () => {
    const onMenubarIconStyleChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onMenubarIconStyleChange={onMenubarIconStyleChange}
      />
    )
    await openCategory("Taskbar & desktop")
    await userEvent.click(screen.getByRole("radio", { name: "Percent" }))
    expect(onMenubarIconStyleChange).toHaveBeenCalledWith("percent")
  })

  it("tray metric dropdown triggers onTrayMetricChange", async () => {
    const onTrayMetricChange = vi.fn()
    render(
      <SettingsPage {...defaultProps} menubarIconStyle="bars" onTrayMetricChange={onTrayMetricChange} />
    )
    await openCategory("Taskbar & desktop")
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Metric" }), "Weekly")
    expect(onTrayMetricChange).toHaveBeenCalledWith("Weekly")
    expect(screen.queryByRole("radio", { name: "Weekly" })).not.toBeInTheDocument()
  })

  it("does not render removed bar icon controls", async () => {
    render(<SettingsPage {...defaultProps} />)
    await openCategory("Taskbar & desktop")
    expect(screen.queryByText("Bar Icon")).not.toBeInTheDocument()
    expect(screen.queryByText("Show percentage")).not.toBeInTheDocument()
  })

  it("toggles start on login checkbox", async () => {
    const onStartOnLoginChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onStartOnLoginChange={onStartOnLoginChange}
      />
    )
    await openCategory("App")
    await userEvent.click(screen.getByText("Start on login"))
    expect(onStartOnLoginChange).toHaveBeenCalledWith(true)
  })

  it("offers Smart refresh and explains its per-account schedule", async () => {
    const onAutoUpdateIntervalChange = vi.fn()
    render(<SettingsPage {...defaultProps} autoUpdateInterval="smart" onAutoUpdateIntervalChange={onAutoUpdateIntervalChange} />)
    expect(screen.getByRole("radio", { name: "Smart" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText(/Checks every 2 minutes after usage changes/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("radio", { name: "15 min" }))
    expect(onAutoUpdateIntervalChange).toHaveBeenCalledWith(15)
  })
})
