import * as React from "react"

import { cn } from "@/lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  indicatorColor?: string
  markerValue?: number
  refreshing?: boolean
  /** Usage spent unseen, `from` in this bar's own terms (100 - used when it shows what's left). */
  unseen?: { from: number; settling: boolean } | null
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, indicatorColor, markerValue, refreshing, unseen, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value))
    const unseenFrom = unseen ? Math.min(100, Math.max(0, unseen.from)) : clamped
    const hatchStart = Math.min(unseenFrom, clamped)
    const hatchWidth = Math.abs(unseenFrom - clamped)
    // The fill waits at the start of the spent part while it blinks, then grows over it.
    const fillWidth = unseen && !unseen.settling ? hatchStart : clamped
    const clampedMarker =
      typeof markerValue === "number" && Number.isFinite(markerValue)
        ? Math.min(100, Math.max(0, markerValue))
        : null
    const showMarker = clampedMarker !== null && clamped > 0 && clamped < 100
    const indicatorStyle = indicatorColor
      ? { backgroundColor: indicatorColor }
      : undefined
    const markerTransform =
      clampedMarker === null
        ? undefined
        : clampedMarker <= 0
          ? "translateX(0)"
          : clampedMarker >= 100
            ? "translateX(-100%)"
            : "translateX(-50%)"
    const markerStyle = showMarker
      ? {
          left: `${clampedMarker}%`,
          transform: markerTransform,
        }
      : undefined

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-track", className)}
        {...props}
      >
        <div
          className={cn("h-full transition-all bg-primary", unseen?.settling && "duration-700 ease-out")}
          style={{ width: `${fillWidth}%`, ...indicatorStyle }}
        />
        {unseen && hatchWidth > 0 && (
          <div
            data-slot="progress-unseen"
            aria-hidden="true"
            className={cn(
              "progress-unseen absolute inset-y-0 text-primary transition-opacity duration-700",
              unseen.settling ? "opacity-0" : "animate-unseen"
            )}
            style={{ left: `${hatchStart}%`, width: `${hatchWidth}%`, color: indicatorColor }}
          />
        )}
        {showMarker && (
          <div
            data-slot="progress-marker"
            aria-hidden="true"
            className="absolute top-0 bottom-0 w-0.5 z-10 pointer-events-none bg-foreground/70"
            style={markerStyle}
          />
        )}
        {refreshing && (
          <div
            data-slot="progress-refreshing"
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden rounded-full"
          >
            <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        )}
      </div>
    )
  }
)
Progress.displayName = "Progress"

export { Progress }
