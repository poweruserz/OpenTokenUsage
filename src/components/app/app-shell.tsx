import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react"
import { useShallow } from "zustand/react/shallow"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { AppContent, type AppContentActionProps } from "@/components/app/app-content"
import { ChangelogDialog } from "@/components/changelog-dialog"
import { PanelFooter } from "@/components/panel-footer"
import { SideNav, type NavPlugin, type PluginContextAction } from "@/components/side-nav"
import { StarPromptCard } from "@/components/star-prompt"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import { useAppVersion } from "@/hooks/app/use-app-version"
import { usePanel } from "@/hooks/app/use-panel"
import type { useAppUpdate } from "@/hooks/use-app-update"
import { useWhatsNew } from "@/hooks/use-whats-new"
import { useWindowsAppearance } from "@/hooks/use-windows-appearance"
import { t } from "@/lib/i18n"
import { savePanelPinned } from "@/lib/settings"
import { cn } from "@/lib/utils"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"

type EdgeDrag = { startX: number; startWidth: number; pending: number | null; busy: boolean; done: boolean }

/**
 * A strip along the panel's left or right edge that drags it wider or narrower. It follows the pointer itself
 * and sends one width at a time, the newest, so a fast drag never queues resizes. 4 px, so the right one stays
 * clear of the scrollbar's thumb in the middle of its 12 px track.
 */
export function ResizeEdge({
  side,
  width,
  resize,
  keep,
}: {
  side: "West" | "East"
  width: () => number
  resize: (width: number, side: "West" | "East") => Promise<void>
  keep: () => void
}) {
  const drag = useRef<EdgeDrag | null>(null)
  const pump = (state: EdgeDrag) => {
    if (state.busy) return
    if (state.pending === null) {
      if (state.done) keep()
      return
    }
    const next = state.pending
    state.pending = null
    state.busy = true
    resize(next, side)
      .catch((error) => console.error("Failed to resize the panel:", error))
      .finally(() => {
        state.busy = false
        pump(state)
      })
  }
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    state.done = true
    pump(state)
  }
  return (
    <div
      aria-hidden
      onPointerDown={(event) => {
        if (event.button !== 0 || !isTauri()) return
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        drag.current = { startX: event.screenX, startWidth: width(), pending: null, busy: false, done: false }
      }}
      onPointerMove={(event) => {
        const state = drag.current
        if (!state) return
        // The button came up where no pointerup reached us (another window took the mouse).
        if ((event.buttons & 1) === 0) return end(event)
        const moved = event.screenX - state.startX
        state.pending = state.startWidth + (side === "East" ? moved : -moved)
        pump(state)
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      className={cn("absolute inset-y-0 z-30 w-1 cursor-ew-resize touch-none", side === "West" ? "left-0" : "right-0")}
    />
  )
}

type AppShellProps = {
  onRefreshAll: () => void
  navPlugins: NavPlugin[]
  displayPlugins: DisplayPluginState[]
  settingsPlugins: SettingsPluginState[]
  autoUpdateNextAt: number | null
  selectedPlugin: DisplayPluginState | null
  onPluginContextAction: (pluginId: string, action: PluginContextAction) => void
  isPluginRefreshAvailable: (pluginId: string) => boolean
  onNavReorder: (orderedIds: string[]) => void
  appContentProps: AppContentActionProps
  /** Owned by App so a language switch (which remounts this shell) keeps a downloaded update. */
  appUpdate: ReturnType<typeof useAppUpdate>
}

const FLUENT_ICONS = { fontFamily: '"Segoe Fluent Icons", "Segoe MDL2 Assets"' }

/** Caption button that keeps the panel above other windows; stored, and applied on every start. */
function PinButton() {
  const pinned = useAppPreferencesStore((state) => state.panelPinned)
  const setPinned = useAppPreferencesStore((state) => state.setPanelPinned)
  useEffect(() => {
    if (!isTauri()) return
    getCurrentWindow()
      .setAlwaysOnTop(pinned)
      .catch((error) => console.error("Failed to keep the panel on top:", error))
  }, [pinned])
  const label = t(pinned ? "app.unpin" : "app.pin")
  return (
    <button
      type="button"
      onClick={() => {
        setPinned(!pinned)
        void savePanelPinned(!pinned).catch((error) => console.error("Failed to save the pin:", error))
      }}
      className={cn(
        "titlebar-button inline-flex items-center justify-center w-[46px] h-8 hover:bg-accent active:bg-accent/60 transition-colors",
        pinned ? "text-primary" : "text-foreground"
      )}
      title={label}
      aria-label={label}
      aria-pressed={pinned}
    >
      {/* Segoe Fluent Icons: Pin / PinnedFill */}
      <span aria-hidden className="text-[12px]" style={FLUENT_ICONS}>
        {pinned ? "" : ""}
      </span>
    </button>
  )
}

/** Windows 11 title bar: app icon + caption, a pin, and a Fluent caption button that hides to the tray. */
function TitleBar() {
  return (
    <div data-tauri-drag-region className="titlebar flex items-center h-8 pl-3 shrink-0">
      <img src="/icon.png" alt="" className="size-4 pointer-events-none" draggable={false} />
      <span className="ml-2.5 text-xs text-foreground/80 select-none pointer-events-none">OpenTokenUsage</span>
      <span className="flex-1" />
      <PinButton />
      <button
        type="button"
        onClick={() => invoke("hide_panel")}
        className="titlebar-button inline-flex items-center justify-center w-[46px] h-8 text-foreground hover:bg-accent active:bg-accent/60 transition-colors"
        title={t("app.minimize")}
        aria-label={t("app.minimize")}
      >
        <span aria-hidden className="text-[10px]" style={FLUENT_ICONS}>
          {""}
        </span>
      </button>
    </div>
  )
}

export function AppShell({
  onRefreshAll,
  navPlugins,
  displayPlugins,
  settingsPlugins,
  autoUpdateNextAt,
  selectedPlugin,
  onPluginContextAction,
  isPluginRefreshAvailable,
  onNavReorder,
  appContentProps,
  appUpdate,
}: AppShellProps) {
  const {
    activeView,
    setActiveView,
    showAbout,
    setShowAbout,
  } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
      setActiveView: state.setActiveView,
      showAbout: state.showAbout,
      setShowAbout: state.setShowAbout,
    }))
  )

  const {
    containerRef,
    scrollRef,
    canScrollDown,
    maxPanelHeightPx,
    panelWidth,
    resizePanel,
    keepPanelWidth,
  } = usePanel({
    activeView,
    setActiveView,
    showAbout,
    setShowAbout,
    displayPlugins,
  })

  useWindowsAppearance()
  const appVersion = useAppVersion()
  const navRight = useAppPreferencesStore((state) => state.navRight)
  const { updateStatus, triggerInstall, checkForUpdates } = appUpdate
  const whatsNew = useWhatsNew(appUpdate.afterUpdate)

  return (
    <div ref={containerRef} tabIndex={-1} className="relative flex flex-col bg-background outline-none">
      {/* Settings has its own, wider width (two columns). */}
      {activeView !== "settings" && (
        <>
          <ResizeEdge side="West" width={panelWidth} resize={resizePanel} keep={keepPanelWidth} />
          <ResizeEdge side="East" width={panelWidth} resize={resizePanel} keep={keepPanelWidth} />
        </>
      )}
      {/* A tall dialog (data-panel-dialog) makes a short panel grow while it's open; the window follows the content height. */}
      <div
        className="relative overflow-hidden select-none w-full flex flex-col has-[[data-panel-dialog]]:min-h-[470px]"
        style={maxPanelHeightPx ? { maxHeight: `${maxPanelHeightPx}px` } : undefined}
      >
        <TitleBar />
        <div className={cn("flex flex-1 min-h-0", navRight ? "flex-row-reverse" : "flex-row")}>
          <SideNav
            activeView={activeView}
            onViewChange={setActiveView}
            plugins={navPlugins}
            onPluginContextAction={onPluginContextAction}
            isPluginRefreshAvailable={isPluginRefreshAvailable}
            onReorder={onNavReorder}
          />
          {/* NavigationView content layer: its corner next to the nav rounded, over the Mica base */}
          <div
            className={cn(
              "flex-1 flex flex-col px-3 pt-2 pb-1.5 min-w-0 bg-card border-t",
              navRight ? "border-r rounded-tr-lg" : "border-l rounded-tl-lg"
            )}
          >
            {/* Out to the card's edge, so the scrollbar sits there and the content keeps its right padding, as on the left. */}
            <div className="relative flex-1 min-h-0 -mr-3">
              <div ref={scrollRef} className="h-full overflow-y-auto pr-3">
                <AppContent
                  {...appContentProps}
                  displayPlugins={displayPlugins}
                  settingsPlugins={settingsPlugins}
                  selectedPlugin={selectedPlugin}
                />
              </div>
              <div
                className={`pointer-events-none absolute left-0 right-3 bottom-0 h-14 bg-gradient-to-t from-card to-transparent transition-opacity duration-200 ${canScrollDown ? "opacity-100" : "opacity-0"}`}
              />
              <StarPromptCard />
            </div>
            <PanelFooter
              refreshing={displayPlugins.some((plugin) => plugin.loading)}
              version={appVersion}
              autoUpdateNextAt={autoUpdateNextAt}
              updateStatus={updateStatus}
              onUpdateInstall={triggerInstall}
              onUpdateCheck={checkForUpdates}
              onRefreshAll={onRefreshAll}
              showAbout={showAbout}
              onShowAbout={() => setShowAbout(true)}
              onCloseAbout={() => setShowAbout(false)}
            />
          </div>
        </div>
        {whatsNew.version && <ChangelogDialog currentVersion={whatsNew.version} onClose={whatsNew.close} />}
      </div>
    </div>
  )
}
