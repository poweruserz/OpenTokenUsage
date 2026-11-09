import { useEffect, useRef, useState } from "react"
import { DetailSection } from "@/components/detail-section"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { usePanelOpen } from "@/hooks/use-unseen-usage"
import { t, type MessageKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** A running Claude Code session (`claude_sessions.rs`). */
export type LiveSession = {
  id: string
  name: string
  cwd: string
  status: string | null
  /** Context window fill (0-100); only with the status-line bridge on. */
  contextPercent: number | null
}

export const SESSIONS_POLL_MS = 5_000
/** Claude Code compacts the conversation when its context fills up; these warn ahead of it. */
export const CONTEXT_WARN_PERCENT = 70
export const CONTEXT_COMPACT_SOON_PERCENT = 85

/** The usual Claude login or an extra account (`claude-1a2b3c4d`); not a WSL copy. */
export function isClaudeLogin(pluginId: string | undefined) {
  return pluginId === "claude" || /^claude-[0-9a-f]{8}$/.test(pluginId ?? "")
}

const STATUS: Record<string, { key: MessageKey; dot: string }> = {
  busy: { key: "card.sessions.busy", dot: "bg-primary animate-pulse" },
  shell: { key: "card.sessions.shell", dot: "bg-primary animate-pulse" },
  waiting: { key: "card.sessions.waiting", dot: "bg-yellow-500" },
  idle: { key: "card.sessions.idle", dot: "bg-muted-foreground/50" },
}

/** Live sessions of a Claude card's login, read every few seconds while the panel is shown. */
export function useClaudeSessions(pluginId: string) {
  const [sessions, setSessions] = useState<LiveSession[]>([])
  // The OS's answer: the hidden panel's page reports itself visible until it is first shown.
  const panelOpen = usePanelOpen()
  const enabled = isTauri() && isClaudeLogin(pluginId) && panelOpen
  const tick = useNowTicker({ enabled, intervalMs: SESSIONS_POLL_MS })
  const failedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    invoke<LiveSession[]>("claude_sessions", { pluginId })
      .then((next) => {
        failedRef.current = false
        if (!cancelled) setSessions(next)
      })
      .catch((error) => {
        // Once per failure, not every few seconds.
        if (!failedRef.current) console.error("Failed to list Claude sessions:", error)
        failedRef.current = true
      })
    return () => {
      cancelled = true
    }
  }, [enabled, pluginId, tick])

  return enabled ? sessions : []
}

/** `section`: on the detail page, where the list is one of the parts that close. */
export function ClaudeSessionList({ sessions, section = false }: { sessions: LiveSession[]; section?: boolean }) {
  if (sessions.length === 0) return null
  const rows = sessions.map((session) => <SessionRow key={session.id} session={session} />)
  if (section) {
    return (
      <DetailSection
        id="sessions"
        title={t("card.sessions.title")}
        aside={<span className="tabular-nums text-muted-foreground">{sessions.length}</span>}
      >
        <div className="space-y-1.5">{rows}</div>
      </DetailSection>
    )
  }
  return (
    <div className="mt-4 space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{t("card.sessions.title")}</div>
      {rows}
    </div>
  )
}

export function ClaudeSessions({ pluginId, section }: { pluginId: string; section?: boolean }) {
  return <ClaudeSessionList sessions={useClaudeSessions(pluginId)} section={section} />
}

function SessionRow({ session }: { session: LiveSession }) {
  const status = session.status ? STATUS[session.status] : undefined
  const statusText = status ? t(status.key) : null
  const percent = session.contextPercent == null ? null : Math.round(session.contextPercent)
  const compactSoon = percent != null && percent >= CONTEXT_COMPACT_SOON_PERCENT
  return (
    <div className="flex items-center gap-2 text-xs" title={session.cwd}>
      <span
        role="img"
        aria-label={statusText ?? undefined}
        className={cn("size-1.5 shrink-0 rounded-full", status?.dot ?? "bg-muted-foreground/50")}
      />
      <span className="min-w-0 flex-1 truncate">{session.name}</span>
      {compactSoon ? (
        <span className="shrink-0 text-destructive">{t("card.sessions.compactSoon")}</span>
      ) : (
        statusText && <span className="shrink-0 text-muted-foreground">{statusText}</span>
      )}
      {percent != null && (
        <span
          className={cn(
            "shrink-0 tabular-nums",
            compactSoon
              ? "text-destructive"
              : percent >= CONTEXT_WARN_PERCENT
                ? "text-yellow-600 dark:text-yellow-500"
                : "text-muted-foreground"
          )}
        >
          {t("card.sessions.context", { percent })}
        </span>
      )}
    </div>
  )
}
