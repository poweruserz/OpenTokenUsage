import { ProviderCard } from "@/components/provider-card"
import { SpendSummary } from "@/components/spend-summary"
import type { PluginDisplayState } from "@/lib/plugin-types"
import type { DisplayMode, ResetTimerDisplayMode, TimeFormatMode } from "@/lib/settings"
import { t } from "@/lib/i18n"

interface OverviewPageProps {
  plugins: PluginDisplayState[]
  onRetryPlugin?: (pluginId: string) => void
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  timeFormatMode?: TimeFormatMode
  onResetTimerDisplayModeToggle?: () => void
  onDisplayModeToggle?: () => void
}

export function OverviewPage({
  plugins,
  onRetryPlugin,
  displayMode,
  resetTimerDisplayMode,
  timeFormatMode = "auto",
  onResetTimerDisplayModeToggle,
  onDisplayModeToggle,
}: OverviewPageProps) {
  if (plugins.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t("overview.noProviders")}
      </div>
    )
  }

  return (
    <div>
      {plugins.map((plugin, index) => (
        <ProviderCard
          key={plugin.meta.id}
          name={plugin.meta.name}
          pluginId={plugin.meta.id}
          statusPageUrl={plugin.meta.statusPageUrl}
          plan={plugin.data?.plan}
          showSeparator={index < plugins.length - 1}
          loading={plugin.loading}
          error={plugin.error}
          lines={plugin.data?.lines ?? []}
          skeletonLines={plugin.meta.lines}
          lastManualRefreshAt={plugin.lastManualRefreshAt}
          lastUpdatedAt={plugin.lastUpdatedAt}
          onRetry={onRetryPlugin ? () => onRetryPlugin(plugin.meta.id) : undefined}
          scopeFilter="overview"
          displayMode={displayMode}
          resetTimerDisplayMode={resetTimerDisplayMode}
          timeFormatMode={timeFormatMode}
          onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
          onDisplayModeToggle={onDisplayModeToggle}
        />
      ))}
      <SpendSummary plugins={plugins} />
    </div>
  )
}
