import { useEffect, useId, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { loadCollapsedSections, saveCollapsedSections, type DetailSection as SectionId } from "@/lib/settings"
import { cn } from "@/lib/utils"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

/** Reads which parts were left closed, once as the app starts: well before a detail page is opened. */
export function useStoredDetailSections() {
  useEffect(() => {
    loadCollapsedSections()
      .then((sections) => useAppPreferencesStore.getState().setCollapsedSections(sections))
      .catch((error) => console.error("Failed to load the closed detail sections:", error))
  }, [])
}

/** Whether a part of the detail page is open. Closing one closes it on every provider's page. */
export function useDetailSectionOpen(id: SectionId): boolean {
  return useAppPreferencesStore((state) => !state.collapsedSections.includes(id))
}

function toggleSection(id: SectionId) {
  const { collapsedSections, setCollapsedSections } = useAppPreferencesStore.getState()
  const next = collapsedSections.includes(id)
    ? collapsedSections.filter((section) => section !== id)
    : [...collapsedSections, id]
  setCollapsedSections(next)
  void saveCollapsedSections(next).catch((error) => console.error("Failed to save the closed detail sections:", error))
}

/**
 * One part of a provider's detail page, under a rule and a title that opens and closes it.
 * `aside` stays beside the title either way (a count); `controls` take its place while open.
 */
export function DetailSection({
  id,
  title,
  aside,
  controls,
  children,
}: {
  id: SectionId
  title: string
  aside?: ReactNode
  controls?: ReactNode
  children?: ReactNode
}) {
  const open = useDetailSectionOpen(id)
  const bodyId = useId()
  const beside = open ? (controls ?? aside) : aside
  return (
    <section className="mt-3 border-t border-border pt-2.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => toggleSection(id)}
          className="-ml-1 flex min-w-0 items-center gap-1 rounded-sm px-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden
            className={cn("size-3 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-90")}
          />
          <span className="truncate">{title}</span>
        </button>
        {beside != null && <div className="shrink-0 text-xs">{beside}</div>}
      </div>
      {open && children != null && (
        <div id={bodyId} className="mt-2 pl-4">
          {children}
        </div>
      )}
    </section>
  )
}
