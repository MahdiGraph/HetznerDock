"use client"

import * as React from "react"
import { toast } from "sonner"
import { api, hzUrl } from "@/lib/client"
import type { HzAction } from "@/lib/hz-types"
import type { PermissionKey, Permissions } from "@/lib/permissions"
import type { Dict } from "@/lib/summary"

export type ServerContextValue = {
  project: number
  projectName: string
  id: number
  isAdmin: boolean
  permissions: Permissions
  /** The server as Hetzner returns it (without prices and labels for users). */
  server: Dict
  /** Loads the server again. */
  refresh: () => void
  /** Follows a Hetzner action to its end with a toast, then loads the server again. */
  watch: (action: HzAction | null | undefined, labels: { pending: string; success: string }, onDone?: () => void) => void
  /** Whether the signed-in user may use a feature. */
  can: (key: PermissionKey | "snapshots") => boolean
  /** Switches the page to another tab. */
  openTab: (tab: string) => void
  /** An image the Rebuild tab should start with, chosen on the Snapshots tab. */
  rebuildImage: number | null
  setRebuildImage: (id: number | null) => void
}

const ServerContext = React.createContext<ServerContextValue | null>(null)

export function ServerProvider({ value, children }: { value: ServerContextValue; children: React.ReactNode }) {
  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>
}

export function useServer(): ServerContextValue {
  const value = React.useContext(ServerContext)
  if (!value) throw new Error("useServer outside ServerProvider")
  return value
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Polls running actions until Hetzner says they succeeded or failed. The toast
 * shows the progress; the callback runs once each action settles.
 */
export function useActionWatcher(project: number, id: number, onSettled: () => void) {
  const watching = React.useRef(new Set<number>())
  const mounted = React.useRef(true)
  const settled = React.useRef(onSettled)
  React.useEffect(() => {
    settled.current = onSettled
  }, [onSettled])
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return React.useCallback(
    (action: HzAction | null | undefined, labels: { pending: string; success: string }, onDone?: () => void) => {
      if (!action?.id || watching.current.has(action.id)) return
      watching.current.add(action.id)
      void (async () => {
        let current = action
        const toastId = current.status === "running" ? toast.loading(labels.pending) : undefined
        const started = Date.now()
        let failures = 0
        while (mounted.current && current.status === "running" && Date.now() - started < 20 * 60_000) {
          await sleep(Date.now() - started < 20_000 ? 1500 : 4000)
          try {
            current = (await api<{ action: HzAction }>(hzUrl(project, id, `actions/${action.id}`))).action
            failures = 0
          } catch {
            if (++failures >= 5) break
          }
          if (mounted.current && current.status === "running" && current.progress > 0 && current.progress < 100) {
            toast.loading(`${labels.pending} ${current.progress}%`, { id: toastId })
          }
        }
        watching.current.delete(action.id)
        if (!mounted.current) {
          if (toastId !== undefined) toast.dismiss(toastId)
          return
        }
        if (current.status === "success") toast.success(labels.success, { id: toastId })
        else if (current.status === "error") toast.error(current.error?.message ?? "Hetzner reported an error.", { id: toastId })
        else toast.message("Hetzner is still working on it. Follow it on the History tab.", { id: toastId })
        settled.current()
        onDone?.()
      })()
    },
    [project, id]
  )
}
