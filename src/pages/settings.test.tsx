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

describe("SettingsPage", () => {
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
    const row = screen.getByText("Beta").closest("div")!
    await userEvent.click(within(row).getByRole("checkbox"))
    expect(onToggle).toHaveBeenCalledWith("b")
  })

  it("reorders plugins on drag end", () => {
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
    latestOnDragEnd?.({ active: { id: "a" }, over: { id: "b" } })
    expect(onReorder).toHaveBeenCalledWith(["b", "a"])
  })

  it("lists enabled providers first, keeping their order", () => {
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
    const names = screen.getAllByText(/^(Alpha|Beta|Gamma|Delta)$/).map((el) => el.textContent)
    expect(names).toEqual(["Beta", "Delta", "Alpha", "Gamma"])
  })

  it("ignores invalid drag end", () => {
    const onReorder = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onReorder={onReorder}
      />
    )
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

  it("renders app theme section with theme options", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("Theme")).toBeInTheDocument()
    expect(screen.getByText("Dark (pure black) or light")).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole("radio", { name: "Left" }))
    expect(onDisplayModeChange).toHaveBeenCalledWith("left")
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

  it("renders menubar icon section", () => {
    render(<SettingsPage {...defaultProps} />)
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
    await userEvent.click(screen.getByRole("radio", { name: "Percent" }))
    expect(onMenubarIconStyleChange).toHaveBeenCalledWith("percent")
  })

  it("tray metric dropdown triggers onTrayMetricChange", async () => {
    const onTrayMetricChange = vi.fn()
    render(
      <SettingsPage {...defaultProps} menubarIconStyle="bars" onTrayMetricChange={onTrayMetricChange} />
    )
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Metric" }), "Weekly")
    expect(onTrayMetricChange).toHaveBeenCalledWith("Weekly")
    expect(screen.queryByRole("radio", { name: "Weekly" })).not.toBeInTheDocument()
  })

  it("does not render removed bar icon controls", () => {
    render(<SettingsPage {...defaultProps} />)
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
    await userEvent.click(screen.getByText("Start on login"))
    expect(onStartOnLoginChange).toHaveBeenCalledWith(true)
  })

  it("offers Smart refresh and explains its per-account schedule", async () => {
    const onAutoUpdateIntervalChange = vi.fn()
    render(<SettingsPage {...defaultProps} autoUpdateInterval="smart" onAutoUpdateIntervalChange={onAutoUpdateIntervalChange} />)
    expect(screen.getByRole("radio", { name: "Smart" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText(/After 5 quiet minutes/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("radio", { name: "15 min" }))
    expect(onAutoUpdateIntervalChange).toHaveBeenCalledWith(15)
  })
})
