"use client"

import * as React from "react"
import type { PermissionKey, Permissions } from "@/lib/permissions"
import type { BootInfo, DedicatedServer, ResetInfo } from "@/lib/robot-types"

export type DedicatedContextValue = {
  /** The Robot account the server belongs to. */
  project: number
  projectName: string
  /** The server number. */
  id: number
  isAdmin: boolean
  permissions: Permissions
  server: DedicatedServer
  /** What is set for the next boot and what Robot offers; undefined while loading. */
  boot: BootInfo | undefined
  bootError: unknown
  /** The resets Robot offers and the power state; undefined while loading. */
  reset: ResetInfo | undefined
  /** Loads the server, its boot configuration and its power state again. */
  refresh: () => void
  /** Whether the signed-in user may use a feature. */
  can: (key: PermissionKey) => boolean
  /** Switches the page to another tab. */
  openTab: (tab: string) => void
}

const DedicatedContext = React.createContext<DedicatedContextValue | null>(null)

export function DedicatedProvider({ value, children }: { value: DedicatedContextValue; children: React.ReactNode }) {
  return <DedicatedContext.Provider value={value}>{children}</DedicatedContext.Provider>
}

export function useDedicated(): DedicatedContextValue {
  const value = React.useContext(DedicatedContext)
  if (!value) throw new Error("useDedicated outside DedicatedProvider")
  return value
}

/** Labels for the rescue systems Robot offers. */
export function rescueLabel(os: string) {
  if (os === "linux") return "Linux rescue system"
  if (os === "vkvm") return "vKVM console"
  if (os === "freebsd") return "FreeBSD rescue system"
  return os
}
