import { useEffect, useRef, useState } from "react"
import { Loader2, ChevronRight, ExternalLink as ExternalLinkIcon, X } from "lucide-react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useChangelog } from "@/hooks/use-changelog"
import { Button } from "@/components/ui/button"
import { openUrl } from "@tauri-apps/plugin-opener"
import { getLocale, t } from "@/lib/i18n"

interface ChangelogDialogProps {
  currentVersion: string
  /** From About: a back button. Without it this is what's new after an update, with its video. */
  onBack?: () => void
  onClose: () => void
}

/**
 * Whether the panel's window is shown, asked from the OS every second while what's new is up: the
 * webview of a panel hidden since start reports itself visible, and a show doesn't always bring focus.
 */
function usePanelShown(on: boolean) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!on || !isTauri()) return
    const check = () => {
      getCurrentWindow().isVisible().then(setShown, () => {})
    }
    check()
    const id = window.setInterval(check, 1000)
    return () => window.clearInterval(id)
  }, [on])
  return shown
}

/** The video the update shipped (`whats_new.rs`), held in memory only while the window is open. */
function WhatsNewVideo({ panelOpen }: { panelOpen: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Often ready while the panel is still hidden after a start: it plays from the beginning once shown.
  useEffect(() => {
    const video = videoRef.current
    if (!src || !video || !panelOpen) return
    video.currentTime = 0
    void video.play().catch(() => {})
  }, [src, panelOpen])
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    invoke<ArrayBuffer>("whats_new_video")
      .then((bytes) => {
        if (cancelled) return
        url = URL.createObjectURL(new Blob([bytes], { type: "video/webm" }))
        setSrc(url)
      })
      .catch(() => {}) // no video in this update: the notes alone
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [])
  if (!src) return null
  return (
    <video
      ref={videoRef}
      src={src}
      muted
      loop
      playsInline
      controls
      aria-label={t("whatsNew.video")}
      className="w-full rounded-md border mb-4 bg-black"
    />
  )
}

function SimpleMarkdown({ content }: { content: string }) {
  // Regex for identifying various markdown elements
  const patterns = [
    // Markdown links: [label](url)
    { type: "link", regex: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g },
    // Plain URLs: https://...
    { type: "url", regex: /(https?:\/\/[^\s<>]*[^\s<>.,:;!'")\]])/g },
    // Bolds: **text** or __text__
    { type: "bold", regex: /(\*\*|__)(.*?)\1/g },
    // Italics: *text* or _text_
    { type: "italic", regex: /(\*|_)(.*?)\1/g },
    // PR/Issue numbers: #123
    { type: "pr", regex: /(#\d+)/g },
    // Usernames: @user
    { type: "user", regex: /(@[\w-]+)/g },
    // Commit hashes: 7 chars hex
    { type: "commit", regex: /\b([a-f0-9]{7})\b/g },
  ];

  const renderText = (text: string): React.ReactNode => {
    let parts: Array<{ type: string; content: string; url?: string }> = [
      { type: "text", content: text },
    ];

    patterns.forEach((pattern) => {
      const newParts: typeof parts = [];
      parts.forEach((part) => {
        if (part.type !== "text") {
          newParts.push(part);
          return;
        }

        let lastIndex = 0;
        let match;
        const regex = new RegExp(pattern.regex);

        while ((match = regex.exec(part.content)) !== null) {
          if (match.index > lastIndex) {
            newParts.push({ type: "text", content: part.content.slice(lastIndex, match.index) });
          }

          if (pattern.type === "link") {
            newParts.push({ type: "link", content: match[1], url: match[2] });
          } else if (pattern.type === "bold") {
            newParts.push({ type: "bold", content: match[2] });
          } else if (pattern.type === "italic") {
            newParts.push({ type: "italic", content: match[2] });
          } else if (pattern.type === "pr") {
            newParts.push({ type: "pr", content: match[1] });
          } else if (pattern.type === "user") {
            newParts.push({ type: "user", content: match[1] });
          } else if (pattern.type === "commit") {
            const isHex = /^[a-f0-9]+$/.test(match[1]);
            if (isHex && match[1].length === 7) {
              newParts.push({ type: "commit", content: match[1] });
            } else {
              newParts.push({ type: "text", content: match[1] });
            }
          } else if (pattern.type === "url") {
            newParts.push({ type: "link", content: match[1], url: match[1] });
          }

          lastIndex = regex.lastIndex;
        }

        if (lastIndex < part.content.length) {
          newParts.push({ type: "text", content: part.content.slice(lastIndex) });
        }
      });
      parts = newParts;
    });

    const linkClass = "text-[#58a6ff] hover:underline hover:text-[#58a6ff]/80 transition-colors cursor-pointer";

    return parts.map((part, i) => {
      if (part.type === "link") {
        return (
          <button
            key={i}
            onClick={() => openUrl(part.url!).catch(console.error)}
            className={linkClass}
          >
            {part.content}
          </button>
        );
      }
      if (part.type === "bold") {
        return <strong key={i} className="font-bold text-foreground">{renderText(part.content)}</strong>;
      }
      if (part.type === "italic") {
        return <em key={i} className="italic text-foreground/90">{renderText(part.content)}</em>;
      }
      if (part.type === "pr") {
        return (
          <button
            key={i}
            onClick={() => openUrl(`https://github.com/PowerUserZ/OpenTokenUsage/pull/${part.content.slice(1)}`).catch(console.error)}
            className={linkClass}
          >
            {part.content}
          </button>
        );
      }
      if (part.type === "user") {
        return (
          <button
            key={i}
            onClick={() => openUrl(`https://github.com/${part.content.slice(1)}`).catch(console.error)}
            className={linkClass}
          >
            {part.content}
          </button>
        );
      }
      if (part.type === "commit") {
        return (
          <button
            key={i}
            onClick={() => openUrl(`https://github.com/PowerUserZ/OpenTokenUsage/commit/${part.content}`).catch(console.error)}
            className={`${linkClass} font-mono`}
          >
            {part.content}
          </button>
        );
      }
      return <span key={i}>{part.content}</span>;
    });
  };

  const lines = content.split("\n");
  return (
    <div className="space-y-1.5 break-words">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === "---" || trimmed === "***" || trimmed === "--") {
          return <hr key={i} className="border-t border-border/50 my-4" />
        }
        if (trimmed.startsWith("###")) {
          return <h4 key={i} className="text-sm font-bold mt-4 mb-1 text-foreground">{renderText(trimmed.replace(/^###\s*/, ""))}</h4>
        }
        if (trimmed.startsWith("##")) {
          return <h3 key={i} className="text-base font-bold mt-5 mb-2 text-foreground">{renderText(trimmed.replace(/^##\s*/, ""))}</h3>
        }
        if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
          if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            return (
              <div key={i} className="flex gap-2 pl-1 text-[13px] leading-relaxed">
                <span className="text-muted-foreground/60 mt-1.5 shrink-0 scale-75">•</span>
                <span className="flex-1 text-foreground/90">{renderText(trimmed.replace(/^[-*]\s*/, ""))}</span>
              </div>
            )
          }
        }
        if (!trimmed) return <div key={i} className="h-1" />
        return <p key={i} className="text-[13px] text-foreground/90 leading-relaxed">{renderText(line)}</p>
      })}
    </div>
  )
}

export function ChangelogDialog({ currentVersion, onBack, onClose }: ChangelogDialogProps) {
  const { releases, loading, error } = useChangelog(currentVersion)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // What's new closes with the panel once it was shown.
  const panelOpen = usePanelShown(!onBack)
  const shownRef = useRef(false)
  useEffect(() => {
    if (onBack) return
    if (panelOpen) shownRef.current = true
    else if (shownRef.current) onClose()
  }, [onBack, onClose, panelOpen])

  const currentRelease = releases.find(r => 
    r.tag_name === currentVersion || 
    r.tag_name === `v${currentVersion}` ||
    r.name === currentVersion ||
    r.name === `v${currentVersion}`
  )

  return (
    <div data-panel-dialog className="absolute inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        role="dialog"
        aria-label={onBack ? t("changelog.title") : t("whatsNew.title")}
        className="bg-popover rounded-lg border shadow-2xl flex flex-col w-[92%] h-[88%] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                title={t("changelog.back")}
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            )}
            <h2 className={onBack ? "font-semibold text-sm" : "font-semibold text-sm pl-1.5"}>
              {onBack ? t("changelog.title") : t("whatsNew.title")}
            </h2>
          </div>
          {!onBack && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
              title={t("whatsNew.close")}
              aria-label={t("whatsNew.close")}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 overflow-x-hidden">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs">{t("changelog.loading")}</span>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <span className="text-destructive text-sm font-medium mb-1">{t("changelog.failed")}</span>
              <span className="text-xs text-muted-foreground mb-4">{t("changelog.failedHint")}</span>
              <Button size="xs" variant="outline" onClick={() => window.location.reload()}>
                {t("changelog.tryAgain")}
              </Button>
            </div>
          ) : currentRelease ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {!onBack && <WhatsNewVideo panelOpen={panelOpen} />}
              <div className="flex items-baseline justify-between mb-4 border-b pb-4">
                <div>
                  <h3 className="font-bold text-lg">{currentRelease.name || currentRelease.tag_name}</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {currentRelease.published_at
                      ? t("changelog.releasedOn", {
                          date: new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeZone: "UTC" }).format(
                            new Date(currentRelease.published_at)
                          ),
                        })
                      : t("changelog.unpublished")}
                  </p>
                </div>
                <button
                  onClick={() => openUrl(currentRelease.html_url).catch(console.error)}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  GitHub <ExternalLinkIcon className="w-3 h-3" />
                </button>
              </div>
              
              <div className="bg-muted/10 rounded-lg p-1">
                <SimpleMarkdown content={currentRelease.body ?? ""} />
              </div>

              {releases.length >= 1 && (
                <div className="mt-8 pt-6 border-t border-dashed">
                  <p className="text-[10px] text-muted-foreground text-center">
                    {t("changelog.olderVersions")}{" "}
                    <button
                      onClick={() => openUrl("https://github.com/PowerUserZ/OpenTokenUsage/releases").catch(console.error)}
                      className="text-primary hover:underline"
                    >
                      {t("changelog.fullChangelog")}
                    </button>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-60">
              <span className="text-sm font-medium mb-1">{t("changelog.noNotes", { version: currentVersion })}</span>
              <span className="text-xs mb-4">{t("changelog.noNotesHint")}</span>
              <button
                onClick={() => openUrl("https://github.com/PowerUserZ/OpenTokenUsage/releases").catch(console.error)}
                className="text-xs text-primary hover:underline"
              >
                {t("changelog.viewAll")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
