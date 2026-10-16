"use client"

import * as React from "react"
import { Board, Tile, TileLabel } from "@/components/board"
import { CopyButton, ErrorNote, Loading, Notice, useAction } from "@/components/common"
import { Flag } from "@/components/flag"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRobot } from "@/hooks/use-api"
import { robotCall } from "@/lib/client"
import { formatDate } from "@/lib/format"
import type { PermissionKey, Permissions } from "@/lib/permissions"
import { BOOT_NAMES, type BootInfo, type DedicatedServer, type ResetInfo } from "@/lib/robot-types"
import { BackLink, RenameButton } from "../header"
import { DedicatedAdminTools } from "./admin"
import { DedicatedProvider, rescueLabel, useDedicated, type DedicatedContextValue } from "./context"
import { DedicatedInstall } from "./install"
import { DedicatedNetwork } from "./network"
import { DedicatedOverview } from "./overview"
import { DedicatedPowerTile } from "./power"
import { DedicatedRescue } from "./rescue"
import { DedicatedTraffic } from "./traffic"

/** The page of a dedicated server from Hetzner Robot: the same board as a cloud server, with Robot's tools. */
export function DedicatedView({
  project,
  projectName,
  id,
  isAdmin,
  permissions,
  canRename,
  nickname: initialNickname,
}: {
  project: number
  projectName: string
  id: number
  isAdmin: boolean
  permissions: Permissions
  canRename: boolean
  nickname: string | null
}) {
  const [tab, setTab] = React.useState("overview")
  const [nickname, setNickname] = React.useState(initialNickname)
  // Robot has no running actions to follow, so the page checks back slowly; what is set for
  // the next boot a little more often while something is, since a start uses it up.
  const detail = useRobot<{ server: DedicatedServer }>(project, id, "", undefined, { refreshInterval: 120_000 })
  const boot = useRobot<BootInfo>(project, id, "boot", undefined, { refreshInterval: (d) => (d?.active ? 60_000 : 0) })
  const reset = useRobot<ResetInfo>(project, id, "reset", undefined, { refreshInterval: 120_000 })
  const { mutate: reloadDetail } = detail
  const { mutate: reloadBoot } = boot
  const { mutate: reloadReset } = reset
  const refresh = React.useCallback(() => {
    void reloadDetail()
    void reloadBoot()
    void reloadReset()
  }, [reloadDetail, reloadBoot, reloadReset])
  const server = detail.data?.server

  const can = React.useCallback((key: PermissionKey) => isAdmin || permissions[key], [isAdmin, permissions])
  const openTab = React.useCallback((next: string) => {
    setTab(next)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  if (detail.error && !server) {
    return (
      <>
        <BackLink isAdmin={isAdmin} />
        <ErrorNote error={detail.error} />
      </>
    )
  }
  if (!server) {
    return (
      <>
        <BackLink isAdmin={isAdmin} />
        <Loading label="Loading the server from Robot…" />
      </>
    )
  }

  const value: DedicatedContextValue = {
    project,
    projectName,
    id,
    isAdmin,
    permissions,
    server,
    boot: boot.data,
    bootError: boot.error,
    reset: reset.data,
    refresh,
    can,
    openTab,
  }

  const tabs: { value: string; label: string; content: React.ReactNode; show: boolean }[] = [
    { value: "overview", label: "Overview", content: <DedicatedOverview />, show: true },
    { value: "install", label: "Install", content: <DedicatedInstall />, show: can("rebuild") && boot.data?.linux !== null },
    { value: "rescue", label: "Rescue", content: <DedicatedRescue />, show: can("rescue") && boot.data?.rescue !== null },
    { value: "network", label: "Network", content: <DedicatedNetwork />, show: true },
    { value: "traffic", label: "Traffic", content: <DedicatedTraffic />, show: true },
    { value: "admin", label: "Admin", content: <DedicatedAdminTools />, show: isAdmin },
  ]
  const traffic = server.traffic ? (server.traffic.toLowerCase() === "unlimited" ? "unlimited traffic" : `${server.traffic} traffic`) : null

  return (
    <DedicatedProvider value={value}>
      <BackLink isAdmin={isAdmin} />
      <Board className="mb-2">
        <Tile className="col-span-12 flex flex-col justify-between gap-8 lg:col-span-6 lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[13px] text-muted-foreground">
              Dedicated server · {projectName} · <span className="tabular">#{id}</span>
            </p>
            {canRename ? (
              <RenameButton kind="dedicated" project={project} id={id} hetznerName={server.name} nickname={nickname} onSaved={setNickname} />
            ) : null}
          </div>
          <div>
            <h1 className="display text-4xl break-words md:text-6xl">{nickname || server.name}</h1>
            {nickname ? <p className="mt-3 text-sm text-muted-foreground">Hetzner name: {server.name}</p> : null}
          </div>
          <p className="text-sm text-muted-foreground">{[server.product, server.dc, traffic].filter(Boolean).join(" · ") || " "}</p>
        </Tile>
        <DedicatedPowerTile className="col-span-12 sm:col-span-6 lg:col-span-3" />
        <Tile tone="tile" className="col-span-12 flex flex-col justify-between gap-6 sm:col-span-6 lg:col-span-3">
          <TileLabel>Main IP address</TileLabel>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="display text-2xl break-all tabular md:text-[1.75rem]">{server.ipv4 ?? "No IPv4"}</p>
              {server.ipv4 ? <CopyButton value={server.ipv4} label="Copy IP" /> : null}
            </div>
            {server.ipv6 ? (
              <p className="mt-1 truncate text-sm text-muted-foreground tabular" title={server.ipv6}>
                {server.ipv6}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-muted-foreground">
              <Flag country={server.country} className="mr-1.5" />
              {[server.city, server.dc].filter(Boolean).join(" · ") || " "}
            </p>
          </div>
        </Tile>
      </Board>

      <div className="mb-8 grid gap-2">
        <BootNotice />
        {server.status === "in process" ? <Notice tone="info">Hetzner is still setting this server up.</Notice> : null}
        {isAdmin && server.cancelled ? (
          <Notice>
            This server is cancelled at Hetzner{server.paidUntil ? `; it is paid until ${formatDate(server.paidUntil)}` : ""}.
          </Notice>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="no-scrollbar mb-5 overflow-x-auto pb-1.5">
          <TabsList variant="line" className="h-10">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="px-3 text-sm">
                  {t.label}
                </TabsTrigger>
              ))}
          </TabsList>
        </div>
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <TabsContent key={t.value} value={t.value}>
              {t.content}
            </TabsContent>
          ))}
      </Tabs>
    </DedicatedProvider>
  )
}

/** What Robot boots next, when it is not the disks, with a way to cancel it. */
function BootNotice() {
  const { boot, project, id, can, refresh } = useDedicated()
  const { busy, run } = useAction()
  if (!boot?.active) return null

  const cancel = (config: "rescue" | "linux", done: string) =>
    run(
      "cancel",
      async () => {
        await robotCall(project, id, "DELETE", config)
        refresh()
      },
      done
    )

  if (boot.active === "rescue") {
    return (
      <Notice>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            The {rescueLabel(boot.rescue?.activeOs ?? "linux")} is set for the next start: reset the server to boot it.
          </span>
          {can("rescue") ? (
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => cancel("rescue", "Rescue mode is off")}>
              {busy ? <Spinner /> : null} Turn it off
            </Button>
          ) : null}
        </div>
      </Notice>
    )
  }
  if (boot.active === "linux") {
    return (
      <Notice>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {boot.linux?.activeDist ?? "Linux"} is set to install at the next start, which erases the disks.
          </span>
          {can("rebuild") ? (
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => cancel("linux", "The installation is cancelled")}>
              {busy ? <Spinner /> : null} Cancel it
            </Button>
          ) : null}
        </div>
      </Notice>
    )
  }
  const name = BOOT_NAMES[boot.active]
  return <Notice>{`${name.charAt(0).toUpperCase()}${name.slice(1)} is set for the next start in Robot.`}</Notice>
}
