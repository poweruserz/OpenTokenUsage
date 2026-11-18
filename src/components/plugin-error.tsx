import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { AlertCircle, ExternalLink, Info, SlidersHorizontal, SquareTerminal } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { isAccountId, isWslId } from "@/lib/accounts"
import { t, tLabel } from "@/lib/i18n"
import { getPluginErrorAction, isActionNeededError, translatePluginError } from "@/lib/plugin-errors"
import { cn } from "@/lib/utils"
import { useAppPluginStore } from "@/stores/app-plugin-store"

type PluginErrorProps = {
  message: string
  pluginId?: string
}

/** The "API keys" link from the provider's plugin.json (the card only shows links on its detail page). */
const API_KEYS_LINK = "API keys"

function formatMessage(message: string) {
  const parts = message.split(/`([^`]+)`/)
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <code
        key={`code-${index}`}
        className="rounded bg-muted px-1 font-mono text-[0.75rem] leading-tight"
      >
        {part}
      </code>
    ) : (
      part
    )
  )
}

const run = (command: string, args?: Record<string, unknown>) => () => {
  invoke(command, args).catch((error) => console.error(`${command} failed:`, error))
}

/**
 * The click that signs a card in when its error's fix is a login command, else null. A WSL card's
 * login lives in WSL: a Windows terminal can't fix it.
 */
export function loginFix(message: string, pluginId?: string): (() => void) | null {
  const action = getPluginErrorAction(message)
  if (action?.kind !== "run" || isWslId(pluginId)) return null
  // An extra account signs in to its own folder (`accounts.rs`), never the usual login.
  return isAccountId(pluginId)
    ? run("start_account_login", { id: pluginId })
    : run("run_in_terminal", { command: action.command })
}

function ErrorAction({ message, pluginId }: PluginErrorProps) {
  const apiKeysUrl = useAppPluginStore(
    (state) => state.pluginsMeta.find((meta) => meta.id === pluginId)?.links?.find((link) => link.label === API_KEYS_LINK)?.url
  )
  const action = getPluginErrorAction(message)
  // A WSL card's login lives in WSL: a Windows terminal or the Windows environment can't fix it.
  if (!action || isWslId(pluginId)) return null

  if (action.kind === "run") {
    return (
      <Button variant="outline" size="xs" className="mt-2 text-[11px]" onClick={loginFix(message, pluginId) ?? undefined}>
        <SquareTerminal className="size-3" />
        {t("error.runInTerminal", { cmd: action.command })}
      </Button>
    )
  }

  return (
    <div className="mt-2 space-y-2 text-muted-foreground">
      <p>{t("error.envSteps", { name: action.names[0] })}</p>
      <div className="flex flex-wrap gap-1.5">
        {apiKeysUrl && (
          <Button variant="outline" size="xs" className="text-[11px]" onClick={() => openUrl(apiKeysUrl).catch(console.error)}>
            {tLabel(API_KEYS_LINK)}
            <ExternalLink className="size-3 opacity-70" />
          </Button>
        )}
        <Button variant="outline" size="xs" className="text-[11px]" onClick={run("open_env_editor")}>
          <SlidersHorizontal className="size-3" />
          {t("error.openEnvEditor")}
        </Button>
      </div>
    </div>
  )
}

export function PluginError({ message, pluginId }: PluginErrorProps) {
  // Something for the user to do (sign in, open an app) is no failure: grey, not red.
  const calm = isActionNeededError(message)
  const Icon = calm ? Info : AlertCircle
  return (
    <Alert
      variant={calm ? "default" : "destructive"}
      className={cn(
        "flex items-start gap-2 [&>svg]:static [&>svg]:translate-y-0 [&>svg]:mt-0.5 [&>svg~*]:pl-0 [&>svg+div]:translate-y-0",
        calm && "bg-transparent text-muted-foreground [&>svg]:text-muted-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <AlertDescription className="select-text cursor-text">
        {formatMessage(translatePluginError(message))}
        <ErrorAction message={message} pluginId={pluginId} />
      </AlertDescription>
    </Alert>
  )
}
