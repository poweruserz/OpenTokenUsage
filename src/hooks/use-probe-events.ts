import { useCallback, useEffect, useRef } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import type { PluginOutput } from "@/lib/plugin-types"

type ProbeResult = {
  batchId: string
  output: PluginOutput
}

type ProbeBatchComplete = {
  batchId: string
}

type ProbeBatchStarted = {
  batchId: string
  pluginIds: string[]
}

type UseProbeEventsOptions = {
  onResult: (output: PluginOutput) => void
  onBatchComplete: () => void
}

export function useProbeEvents({ onResult, onBatchComplete }: UseProbeEventsOptions) {
  const activeBatchIds = useRef<Set<string>>(new Set())
  const unlisteners = useRef<UnlistenFn[]>([])
  const listenersReadyRef = useRef<Promise<void> | null>(null)
  const listenersReadyResolveRef = useRef<(() => void) | null>(null)
  const listenersReadyErrorRef = useRef<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    // Create the promise that will resolve when listeners are ready
    listenersReadyErrorRef.current = null
    listenersReadyRef.current = new Promise<void>((resolve) => {
      listenersReadyResolveRef.current = resolve
    })

    const setup = async () => {
      try {
        // Apply every result, even from a batch this page doesn't know: the host skips a plugin
        // that is still probing from an earlier batch (e.g. before a webview reload), and that
        // probe's result is the only one that will clear the plugin's loading state.
        const resultUnlisten = await listen<ProbeResult>("probe:result", (event) => {
          onResult(event.payload.output)
        })

        if (cancelled) {
          resultUnlisten()
          listenersReadyResolveRef.current?.()
          return
        }

        const completeUnlisten = await listen<ProbeBatchComplete>(
          "probe:batch-complete",
          (event) => {
            if (activeBatchIds.current.delete(event.payload.batchId)) {
              onBatchComplete()
            }
          }
        )

        if (cancelled) {
          resultUnlisten()
          completeUnlisten()
          listenersReadyResolveRef.current?.()
          return
        }

        unlisteners.current.push(resultUnlisten, completeUnlisten)

        // Signal that listeners are ready
        listenersReadyResolveRef.current?.()
      } catch (error) {
        listenersReadyErrorRef.current =
          error instanceof Error ? error : new Error(String(error))
        listenersReadyResolveRef.current?.()
      }
    }

    void setup()

    return () => {
      cancelled = true
      unlisteners.current.forEach((unlisten) => unlisten())
      unlisteners.current = []
      listenersReadyErrorRef.current = null
      listenersReadyRef.current = null
      listenersReadyResolveRef.current = null
    }
  }, [onBatchComplete, onResult])

  const startBatch = useCallback(async (pluginIds?: string[], cacheLocalUsage?: boolean) => {
    // Wait for listeners to be ready before starting the batch
    if (listenersReadyRef.current) {
      await listenersReadyRef.current
    }
    if (listenersReadyErrorRef.current) {
      throw listenersReadyErrorRef.current
    }

    const batchId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `batch-${Date.now()}-${Math.random().toString(16).slice(2)}`

    activeBatchIds.current.add(batchId)
    const args = pluginIds
      ? { batchId, pluginIds }
      : { batchId }
    const probeArgs = cacheLocalUsage ? { ...args, cacheLocalUsage: true } : args
    try {
      const result = await invoke<ProbeBatchStarted>("start_probe_batch", probeArgs)
      return result.pluginIds
    } catch (error) {
      activeBatchIds.current.delete(batchId)
      throw error
    }
  }, [])

  return { startBatch }
}
