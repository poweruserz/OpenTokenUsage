import { useEffect, useRef, useState } from "react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Eye, EyeOff, GripVertical } from "lucide-react"
import { t, tLabel } from "@/lib/i18n"
import { orderedLabels, type LineLayout } from "@/lib/line-layout"
import { saveLineLayouts } from "@/lib/settings"
import { cn } from "@/lib/utils"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

function LayoutRow({ label, hidden, onToggle }: { label: string; hidden: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: label })
  const name = tLabel(label)
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex h-8 items-center gap-2.5 rounded-md px-2 transition-colors", isDragging && "bg-accent opacity-50")}
    >
      <button
        type="button"
        aria-label={t("card.customizeMove", { row: name })}
        className="touch-none cursor-grab text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className={cn("flex-1 truncate text-[13px]", hidden && "text-muted-foreground line-through")}>{name}</span>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!hidden}
        aria-label={t(hidden ? "card.customizeShow" : "card.customizeHide", { row: name })}
        title={t(hidden ? "card.customizeShow" : "card.customizeHide", { row: name })}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-md transition-colors hover:bg-accent",
          hidden ? "text-muted-foreground/60" : "text-foreground"
        )}
      >
        {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

/**
 * A card's Customize mode (`line-layout.ts`): drag its overview rows into order, hide the ones not
 * wanted; each change is saved at once. Ctrl+Z steps back, Esc or Done leaves.
 */
export function LineLayoutEditor({ pluginId, labels, onDone }: { pluginId: string; labels: string[]; onDone: () => void }) {
  const layouts = useAppPreferencesStore((state) => state.lineLayouts)
  const setLayouts = useAppPreferencesStore((state) => state.setLineLayouts)
  const layout = layouts[pluginId]
  // The card's layouts before each change made here, newest last.
  const [history, setHistory] = useState<(LineLayout | undefined)[]>([])
  const container = useRef<HTMLDivElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const rows = orderedLabels(labels, layout)
  const hidden = layout?.hidden ?? []

  // Keys reach the editor without a click first.
  useEffect(() => container.current?.focus(), [])

  const apply = (next: LineLayout | undefined) => {
    const all = { ...useAppPreferencesStore.getState().lineLayouts }
    if (next && (next.order.length > 0 || next.hidden.length > 0)) all[pluginId] = next
    else delete all[pluginId]
    setLayouts(all)
    void saveLineLayouts(all).catch((error) => console.error("Failed to save the card layout:", error))
  }
  const change = (next: LineLayout | undefined) => {
    setHistory((past) => [...past, layout])
    apply(next)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    change({ order: arrayMove(rows, rows.indexOf(String(active.id)), rows.indexOf(String(over.id))), hidden })
  }
  const toggle = (label: string) =>
    change({ order: rows, hidden: hidden.includes(label) ? hidden.filter((other) => other !== label) : [...hidden, label] })
  const undo = () => {
    if (history.length === 0) return
    apply(history[history.length - 1])
    setHistory((past) => past.slice(0, -1))
  }

  return (
    <div
      ref={container}
      tabIndex={-1}
      role="group"
      aria-label={t("card.customize")}
      className="outline-none"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation()
          onDone()
        } else if (e.key.toLowerCase() === "z" && e.ctrlKey && !e.shiftKey) {
          e.preventDefault()
          undo()
        }
      }}
    >
      <p className="mb-1.5 text-xs text-muted-foreground">{t("card.customizeHint")}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rows} strategy={verticalListSortingStrategy}>
          {rows.map((label) => (
            <LayoutRow key={label} label={label} hidden={hidden.includes(label)} onToggle={() => toggle(label)} />
          ))}
        </SortableContext>
      </DndContext>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          className="text-xs text-primary underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline"
          disabled={!layout}
          onClick={() => change(undefined)}
        >
          {t("card.customizeReset")}
        </button>
        <button type="button" className="fluent-control px-3 text-xs" onClick={onDone}>
          {t("card.customizeDone")}
        </button>
      </div>
    </div>
  )
}
