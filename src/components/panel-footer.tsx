import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { AboutDialog } from "@/components/about-dialog";
import type { UpdateStatus } from "@/hooks/use-app-update";
import { useNowTicker } from "@/hooks/use-now-ticker";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/locales/en";

/** Hover text for an update error; the status message is an internal (English) code. */
const UPDATE_ERROR_TITLES: Record<string, MessageKey> = {
  "Update check failed": "footer.updateCheckFailed",
  "Download failed": "footer.updateDownloadFailed",
  "Install failed": "footer.updateInstallFailed",
};

/** Update states that put text or a button on the left side of the footer. */
const UPDATE_SHOWN = new Set<UpdateStatus["status"]>(["downloading", "ready", "installing", "error"]);

interface PanelFooterProps {
  version: string;
  autoUpdateNextAt: number | null;
  refreshing?: boolean;
  updateStatus: UpdateStatus;
  onUpdateInstall: () => void;
  onUpdateCheck: () => void;
  onRefreshAll?: () => void;
  showAbout: boolean;
  onShowAbout: () => void;
  onCloseAbout: () => void;
}

function VersionDisplay({
  version,
  updateStatus,
  onUpdateInstall,
  onUpdateCheck,
  onVersionClick,
}: {
  version: string;
  updateStatus: UpdateStatus;
  onUpdateInstall: () => void;
  onUpdateCheck: () => void;
  onVersionClick: () => void;
}) {
  switch (updateStatus.status) {
    case "downloading":
      return (
        <span className="text-xs text-muted-foreground">
          {updateStatus.progress >= 0
            ? t("footer.downloading", { progress: updateStatus.progress })
            : t("footer.downloadingIndeterminate")}
        </span>
      );
    case "ready":
      return (
        <Button
          variant="default"
          size="xs"
          className="update-border-beam"
          onClick={onUpdateInstall}
        >
          {t("footer.restartToUpdate")}
        </Button>
      );
    case "installing":
      return (
        <span className="text-xs text-muted-foreground">{t("footer.installing")}</span>
      );
    case "error":
      if (updateStatus.message === "Update check failed") {
        return (
          <button
            type="button"
            onClick={onUpdateCheck}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={t(UPDATE_ERROR_TITLES[updateStatus.message] ?? "footer.updateFailed")}
          >
            {t("footer.updatesSoon")}
          </button>
        );
      }
      return (
        <span className="text-xs text-destructive" title={t(UPDATE_ERROR_TITLES[updateStatus.message] ?? "footer.updateFailed")}>
          {t("footer.updateFailed")}
        </span>
      );
    default:
      return (
        <button
          type="button"
          onClick={onVersionClick}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          OpenTokenUsage {version}
        </button>
      );
  }
}

export function PanelFooter({
  version,
  autoUpdateNextAt,
  refreshing = false,
  updateStatus,
  onUpdateInstall,
  onUpdateCheck,
  onRefreshAll,
  showAbout,
  onShowAbout,
  onCloseAbout,
}: PanelFooterProps) {
  const now = useNowTicker({
    enabled: Boolean(autoUpdateNextAt),
    resetKey: autoUpdateNextAt,
  });

  // While the left side shows an update ("Restart to update", "Downloading 42%"…), the countdown shrinks to
  // just the time so the two never collide in longer languages; the full text stays in the tooltip.
  const updateShown = UPDATE_SHOWN.has(updateStatus.status);
  const { countdownLabel, countdownFull } = useMemo(() => {
    if (!autoUpdateNextAt) {
      const paused = t(refreshing ? "footer.refreshing" : "footer.paused");
      return { countdownLabel: paused, countdownFull: paused };
    }
    const remainingMs = Math.max(0, autoUpdateNextAt - now);
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const time = totalSeconds >= 60
      ? t("duration.m", { m: Math.ceil(totalSeconds / 60) })
      : t("duration.s", { s: totalSeconds });
    const full = t("footer.nextUpdate", { time });
    return { countdownLabel: updateShown ? time : full, countdownFull: full };
  }, [autoUpdateNextAt, now, updateShown, refreshing]);

  return (
    <>
      {/* The update state on the left never shrinks; the countdown takes what's left and ends in "…" if it must. */}
      <div className="flex items-center gap-3 h-8 pt-1.5 border-t">
        <div className="shrink-0">
          <VersionDisplay
            version={version}
            updateStatus={updateStatus}
            onUpdateInstall={onUpdateInstall}
            onUpdateCheck={onUpdateCheck}
            onVersionClick={onShowAbout}
          />
        </div>
        {autoUpdateNextAt !== null && onRefreshAll ? (
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.blur()
              onRefreshAll()
            }}
            className="ml-auto min-w-0 truncate text-xs text-muted-foreground tabular-nums hover:text-foreground transition-colors cursor-pointer"
            title={updateShown ? `${countdownFull} · ${t("footer.refreshNow")}` : t("footer.refreshNow")}
          >
            {countdownLabel}
          </button>
        ) : (
          <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground tabular-nums" title={countdownFull}>
            {countdownLabel}
          </span>
        )}
      </div>
      {showAbout && (
        <AboutDialog version={version} onClose={onCloseAbout} />
      )}
    </>
  );
}
