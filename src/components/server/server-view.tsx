"use client"

import * as React from "react"
import { Board, Tile, TileLabel } from "@/components/board"
import { CopyButton, ErrorNote, Loading, Notice, useAction } from "@/components/common"
import { Flag } from "@/components/flag"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useHz } from "@/hooks/use-api"
import { hzCall } from "@/lib/client"
import type { HzAction } from "@/lib/hz-types"
import type { PermissionKey, Permissions } from "@/lib/permissions"
import { get, locationOf, osName, TRANSITIONAL, typeSpec, type Dict } from "@/lib/summary"
import { AdminTools } from "./admin"
import { ServerProvider, useActionWatcher, useServer, type ServerContextValue } from "./context"
import { Firewall } from "./firewall"
import { Graphs } from "./graphs"
import { BackLink, RenameButton } from "./header"
import { History } from "./history"
import { Iso } from "./iso"
import { Network } from "./network"
import { Overview } from "./overview"
import { PowerTile } from "./power"
import { Rebuild } from "./rebuild"
import { Rescue } from "./rescue"
import { Snapshots } from "./snapshots"

export function ServerView({
  project,
  projectName,
  id,
  isAdmin,
  permissions,
  canRename,
  nickname: initialNickname,
  currency,
}: {
  project: number
  projectName: string
  id: number
  isAdmin: boolean
  permissions: Permissions
  canRename: boolean
  nickname: string | null
  currency: string
}) {
  const [tab, setTab] = React.useState("overview")
  const [nickname, setNickname] = React.useState(initialNickname)
  const [rebuildImage, setRebuildImage] = React.useState<number | null>(null)
  const detail = useHz<{ server: Dict }>(project, id, "", undefined, {
    // Fast while Hetzner is changing the server, slow otherwise.
    refreshInterval: (d) => (d && TRANSITIONAL.includes(String(d.server?.status)) ? 3000 : 60_000),
  })
  const { mutate } = detail
  const refresh = React.useCallback(() => void mutate(), [mutate])
  const watch = useActionWatcher(project, id, refresh)
  const server = detail.data?.server

  const can = React.useCallback(
    (key: PermissionKey | "snapshots") => isAdmin || (key === "snapshots" ? permissions.snapshots > 0 : permissions[key]),
    [isAdmin, permissions]
  )
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
        <Loading label="Loading the server from Hetzner…" />
      </>
    )
  }

  const value: ServerContextValue = {
    project,
    projectName,
    id,
    isAdmin,
    permissions,
    server,
    refresh,
    watch,
    can,
    openTab,
    rebuildImage,
    setRebuildImage,
  }

  const tabs: { value: string; label: string; content: React.ReactNode; show: boolean }[] = [
    { value: "overview", label: "Overview", content: <Overview currency={currency} />, show: true },
    { value: "rebuild", label: "Rebuild", content: <Rebuild />, show: can("rebuild") },
    { value: "rescue", label: "Rescue", content: <Rescue />, show: can("rescue") || can("password") },
    { value: "network", label: "Network", content: <Network />, show: true },
    { value: "firewall", label: "Firewall", content: <Firewall />, show: true },
    { value: "graphs", label: "Graphs", content: <Graphs />, show: true },
    { value: "snapshots", label: "Snapshots", content: <Snapshots />, show: true },
    { value: "iso", label: "ISO", content: <Iso />, show: can("iso") },
    { value: "history", label: "History", content: <History />, show: true },
    { value: "admin", label: "Admin", content: <AdminTools currency={currency} />, show: isAdmin },
  ]

  const loc = locationOf(server)
  const ipv4 = get<string>(server, "public_net.ipv4.ip") ?? null
  const ipv6 = get<string>(server, "public_net.ipv6.ip") ?? null
  const type = server.server_type as Dict | undefined
  const iso = server.iso as { description?: string; name?: string } | null

  return (
    <ServerProvider value={value}>
      <BackLink isAdmin={isAdmin} />
      <Board className="mb-2">
        <Tile className="col-span-12 flex flex-col justify-between gap-8 lg:col-span-6 lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[13px] text-muted-foreground">
              Cloud server · {projectName} · <span className="tabular">#{id}</span>
            </p>
            {canRename ? (
              <RenameButton
                kind="cloud"
                project={project}
                id={id}
                hetznerName={String(server.name ?? "")}
                nickname={nickname}
                onSaved={setNickname}
              />
            ) : null}
          </div>
          <div>
            <h1 className="display text-4xl break-words md:text-6xl">{nickname || String(server.name ?? id)}</h1>
            {nickname ? <p className="mt-3 text-sm text-muted-foreground">Hetzner name: {String(server.name)}</p> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {[String(type?.name ?? "").toUpperCase() || null, typeSpec(type), osName(server.image)].filter(Boolean).join(" · ") || " "}
          </p>
        </Tile>
        <PowerTile className="col-span-12 sm:col-span-6 lg:col-span-3" />
        <Tile tone="tile" className="col-span-12 flex flex-col justify-between gap-6 sm:col-span-6 lg:col-span-3">
          <TileLabel>Main IP address</TileLabel>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="display text-2xl break-all tabular md:text-[1.75rem]">{ipv4 ?? "No IPv4"}</p>
              {ipv4 ? <CopyButton value={ipv4} label="Copy IP" /> : null}
            </div>
            {ipv6 ? <p className="mt-1 truncate text-sm text-muted-foreground tabular" title={ipv6}>{ipv6}</p> : null}
            <p className="mt-2 text-sm text-muted-foreground">
              <Flag country={typeof loc.country === "string" ? loc.country : null} className="mr-1.5" />
              {[loc.city, loc.name].filter(Boolean).join(" · ") || " "}
            </p>
          </div>
        </Tile>
      </Board>

      <div className="mb-8 grid gap-2">
        {server.rescue_enabled ? <RescueNotice /> : null}
        {iso ? (
          <Notice tone="info">
            The ISO {iso.description || iso.name} is in the drive, so the server boots from it first.{" "}
            {can("iso") ? (
              <button type="button" className="underline" onClick={() => openTab("iso")}>
                Eject it
              </button>
            ) : (
              "Ask your admin to eject it when you are done."
            )}
          </Notice>
        ) : null}
        {server.locked ? <Notice>Hetzner has locked this server. Contact Hetzner support through the account owner.</Notice> : null}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v)
          if (v !== "rebuild") setRebuildImage(null)
        }}
      >
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
    </ServerProvider>
  )
}

function RescueNotice() {
  const { project, id, can, watch, refresh } = useServer()
  const { busy, run } = useAction()
  return (
    <Notice>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>Rescue mode is on: the server starts the rescue system at its next boot.</span>
        {can("rescue") ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={!!busy}
            onClick={() =>
              run("disable", async () => {
                const res = await hzCall<{ action?: HzAction }>(project, id, "POST", "actions/disable_rescue")
                watch(res.action, { pending: "Turning rescue mode off…", success: "Rescue mode is off" })
                refresh()
              })
            }
          >
            {busy ? <Spinner /> : null} Turn it off
          </Button>
        ) : null}
      </div>
    </Notice>
  )
}
