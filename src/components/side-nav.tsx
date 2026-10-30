import { useCallback, useState } from "react"
import { CircleHelp, Settings } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { cn } from "@/lib/utils"
import { getRelativeLuminance } from "@/lib/color"
import { useDarkMode } from "@/hooks/use-dark-mode"
import { t } from "@/lib/i18n"
import { BmcCup } from "@/components/bmc-cup"
import { HelpDialog } from "@/components/help-dialog"
import { SupportDialog } from "@/components/support-dialog"

type ActiveView = "home" | "settings" | string

type PluginContextAction = "reload" | "remove"

interface NavPlugin {
  id: string
  name: string
  iconUrl: string
  brandColor?: string
}

interface SideNavProps {
  activeView: ActiveView
  onViewChange: (view: ActiveView) => void
  plugins: NavPlugin[]
  onPluginContextAction?: (pluginId: string, action: PluginContextAction) => void
  isPluginRefreshAvailable?: (pluginId: string) => boolean
  onReorder?: (orderedIds: string[]) => void
}

interface NavButtonProps {
  isActive: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  children: React.ReactNode
  "aria-label"?: string
}

function NavButton({ isActive, onClick, onContextMenu, children, "aria-label": ariaLabel }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-label={ariaLabel}
      className={cn(
        // WinUI NavigationView item: 4px-rounded fill, 3x16 accent pill on the selected one
        "relative flex items-center justify-center w-10 h-9 mx-1 my-0.5 rounded-md transition-colors",
        "hover:bg-accent active:bg-accent/60",
        isActive
          ? "bg-accent text-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[3px] before:bg-primary before:rounded-full"
          : "text-muted-foreground"
      )}
    >
      {children}
    </button>
  )
}

function getIconColor(brandColor: string | undefined, isDark: boolean): string {
  if (!brandColor) return "currentColor"
  const luminance = getRelativeLuminance(brandColor)
  if (isDark && luminance < 0.15) return "#ffffff"
  if (!isDark && luminance > 0.85) return "currentColor"
  return brandColor
}

interface SortableNavPluginProps {
  plugin: NavPlugin
  isActive: boolean
  isDark: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function SortableNavPlugin({ plugin, isActive, isDark, onClick, onContextMenu }: SortableNavPluginProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plugin.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} role="presentation">
      <NavButton
        isActive={isActive}
        onClick={onClick}
        onContextMenu={onContextMenu}
        aria-label={plugin.name}
      >
        <span
          role="img"
          aria-label={plugin.name}
          className="size-5 inline-block"
          style={{
            backgroundColor: getIconColor(plugin.brandColor, isDark),
            WebkitMaskImage: `url(${plugin.iconUrl})`,
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskImage: `url(${plugin.iconUrl})`,
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
          }}
        />
      </NavButton>
    </div>
  )
}

export function SideNav({
  activeView,
  onViewChange,
  plugins,
  onPluginContextAction,
  isPluginRefreshAvailable,
  onReorder,
}: SideNavProps) {
  const isDark = useDarkMode()
  const [showSupport, setShowSupport] = useState(false)
  const closeSupport = useCallback(() => setShowSupport(false), [])
  const [showHelp, setShowHelp] = useState(false)
  const closeHelp = useCallback(() => setShowHelp(false), [])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!onReorder) return
      const { active, over } = event
      if (over && active.id !== over.id) {
        const oldIndex = plugins.findIndex((p) => p.id === active.id)
        const newIndex = plugins.findIndex((p) => p.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return
        const next = arrayMove(plugins, oldIndex, newIndex)
        onReorder(next.map((p) => p.id))
      }
    },
    [onReorder, plugins]
  )

  const handlePluginContextMenu = useCallback(
    (e: React.MouseEvent, pluginId: string) => {
      e.preventDefault()
      if (!onPluginContextAction) return

      ;(async () => {
        const reloadItem = await MenuItem.new({
          id: `ctx-reload-${pluginId}`,
          text: t("nav.refreshUsage"),
          enabled: isPluginRefreshAvailable ? isPluginRefreshAvailable(pluginId) : true,
          action: () => onPluginContextAction(pluginId, "reload"),
        })
        const removeItem = await MenuItem.new({
          id: `ctx-remove-${pluginId}`,
          text: t("nav.disablePlugin"),
          action: () => onPluginContextAction(pluginId, "remove"),
        })
        const bottomSeparator = await PredefinedMenuItem.new({ item: "Separator" })
        const inspectItem = await MenuItem.new({
          id: `ctx-inspect-${pluginId}`,
          text: t("nav.inspect"),
          action: () => {
            invoke("open_devtools").catch(console.error)
          },
        })
        const menu = await Menu.new({
          items: [reloadItem, removeItem, bottomSeparator, inspectItem],
        })
        try {
          await menu.popup()
        } finally {
          await Promise.allSettled([
            menu.close(),
            reloadItem.close(),
            removeItem.close(),
            bottomSeparator.close(),
            inspectItem.close(),
          ])
        }
      })().catch(console.error)
    },
    [isPluginRefreshAvailable, onPluginContextAction]
  )

  return (
    <nav className="flex flex-col w-12 items-center py-1">
      {/* Home */}
      <NavButton
        isActive={activeView === "home"}
        onClick={() => onViewChange("home")}
        aria-label={t("nav.home")}
      >
        <img src="/icon.png" alt="" className="size-5" draggable={false} />
      </NavButton>

      {/* Plugin icons */}
      <div className="flex flex-1 min-h-0 flex-col items-center overflow-y-auto scrollbar-none">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={plugins.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            {plugins.map((plugin) => (
              <SortableNavPlugin
                key={plugin.id}
                plugin={plugin}
                isActive={activeView === plugin.id}
                isDark={isDark}
                onClick={() => onViewChange(plugin.id)}
                onContextMenu={(e) => handlePluginContextMenu(e, plugin.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Support: opens a short "why a coffee helps" dialog, not the site */}
      <NavButton
        isActive={showSupport}
        onClick={() => setShowSupport(true)}
        aria-label={t("support.navLabel")}
      >
        <BmcCup className="h-5 w-auto" />
      </NavButton>
      {showSupport && <SupportDialog onClose={closeSupport} />}

      {/* Help: common questions in the panel; GitHub is one link at their end */}
      <NavButton
        isActive={showHelp}
        onClick={() => setShowHelp(true)}
        aria-label={t("nav.help")}
      >
        <CircleHelp className="size-5" strokeWidth={1.5} />
      </NavButton>
      {showHelp && <HelpDialog onClose={closeHelp} />}

      {/* Settings */}
      <NavButton
        isActive={activeView === "settings"}
        onClick={() => onViewChange("settings")}
        aria-label={t("nav.settings")}
      >
        <Settings className="size-5" strokeWidth={1.5} />
      </NavButton>
    </nav>
  )
}

export type { ActiveView, NavPlugin, PluginContextAction }
