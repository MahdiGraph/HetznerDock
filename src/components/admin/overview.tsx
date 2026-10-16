"use client"

import Link from "next/link"
import { ArrowRightIcon } from "@phosphor-icons/react"
import { Board, Tile, TileLabel } from "@/components/board"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import type { AuditRow } from "@/lib/audit"
import type { PublicSettings } from "@/lib/settings"
import { formatMoney, timeAgo } from "@/lib/format"
import { serverHref } from "@/lib/client"
import { serverKey } from "@/lib/summary"
import type { AdminServersResponse } from "./servers"

function useServers(enabled: boolean) {
  return useApi<AdminServersResponse>(enabled ? "/api/admin/servers" : null)
}

function Count({ enabled }: { enabled: boolean }) {
  const { data, error, isLoading } = useServers(enabled)
  const all = data?.servers ?? []
  // Storage Boxes and DNS zones are counted on their own line.
  const servers = all.filter((s) => s.kind !== "storage" && s.kind !== "dns")
  const boxes = all.filter((s) => s.kind === "storage").length
  const zones = all.filter((s) => s.kind === "dns").length
  const dedicated = servers.filter((s) => s.kind === "dedicated").length
  const running = servers.filter((s) => s.kind === "cloud" && s.status === "running").length
  const shared = servers.filter((s) => s.assignees.length > 0).length
  return (
    <Tile tone="tile" className="col-span-6 lg:col-span-3">
      <Link href="/admin/servers" className="flex h-full flex-col justify-between gap-6 outline-none">
        <TileLabel>Servers</TileLabel>
        <div>
          {!enabled ? (
            <p className="display text-6xl text-muted-foreground">—</p>
          ) : isLoading && !data ? (
            <Skeleton className="h-14 w-20" />
          ) : error ? (
            <p className="text-sm text-destructive">{error.message}</p>
          ) : (
            <>
              <p className="display text-6xl tabular">{servers.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {!servers.length
                  ? "None yet"
                  : dedicated
                    ? `${servers.length - dedicated} cloud · ${dedicated} dedicated · ${shared} shared`
                    : `${running} running · ${shared} shared`}
              </p>
              {boxes || zones ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  and{" "}
                  {[boxes ? `${boxes} Storage Box${boxes === 1 ? "" : "es"}` : null, zones ? `${zones} DNS zone${zones === 1 ? "" : "s"}` : null]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              ) : null}
              {data?.errors.length ? (
                <p className="mt-1 text-sm text-destructive">
                  {data.errors.map((e) => e.project).join(", ")} could not be loaded
                </p>
              ) : null}
            </>
          )}
        </div>
      </Link>
    </Tile>
  )
}

function Cost({ enabled }: { enabled: boolean }) {
  const { data, isLoading } = useServers(enabled)
  const currencies = new Map((data?.projects ?? []).map((p) => [p.id, p.currency]))
  const totals = new Map<string, number>()
  const dedicated = (data?.servers ?? []).some((s) => s.kind === "dedicated")
  for (const s of data?.servers ?? []) {
    if (s.price === null || s.price === undefined) continue
    const currency = currencies.get(s.projectId) ?? "EUR"
    totals.set(currency, (totals.get(currency) ?? 0) + s.price)
  }
  return (
    <Tile className="col-span-6 lg:col-span-3">
      <div className="flex h-full flex-col justify-between gap-6">
        <TileLabel>Servers cost a month</TileLabel>
        <div>
          {!enabled ? (
            <p className="display text-4xl text-muted-foreground">—</p>
          ) : isLoading && !data ? (
            <Skeleton className="h-10 w-28" />
          ) : (
            <>
              <p className="display text-4xl tabular">
                {totals.size ? [...totals].map(([c, v]) => formatMoney(v, c)).join(" + ") : formatMoney(0)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Cloud list prices with VAT, without backups, volumes or extra IPs
                {dedicated ? ". Robot does not report what dedicated servers cost" : ""}
              </p>
            </>
          )}
        </div>
      </div>
    </Tile>
  )
}

function TrafficWatch({ enabled }: { enabled: boolean }) {
  const { data } = useServers(enabled)
  const heavy = (data?.servers ?? [])
    .map((s) => ({ s, share: s.traffic.out !== null && s.traffic.included ? s.traffic.out / s.traffic.included : 0 }))
    .filter((x) => x.share >= 0.5)
    .sort((a, b) => b.share - a.share)
    .slice(0, 4)
  return (
    <Tile tone="tile" className="col-span-12 lg:col-span-3">
      <div className="flex h-full flex-col justify-between gap-6">
        <TileLabel>Traffic this month</TileLabel>
        {heavy.length ? (
          <ul className="grid gap-2 text-sm">
            {heavy.map(({ s, share }) => (
              <li key={serverKey(s.kind, s.projectId, s.id)}>
                <Link href={serverHref(s.kind, s.projectId, s.id)} className="flex items-baseline justify-between gap-3 hover:underline">
                  <span className="truncate">{s.name}</span>
                  <span className={share >= 0.9 ? "text-destructive tabular" : "tabular"}>{Math.round(share * 100)}%</span>
                </Link>
                <div className="mt-1 h-1.5 bg-background/70">
                  <div className={share >= 0.9 ? "h-1.5 bg-destructive" : "h-1.5 bg-warning"} style={{ width: `${Math.min(100, share * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <p className="display text-4xl">{enabled && data ? "All fine" : "—"}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Servers that have used half of their included outgoing traffic show up here.
            </p>
          </div>
        )}
      </div>
    </Tile>
  )
}

function ApiTile({ settings, enabled }: { settings: PublicSettings; enabled: boolean }) {
  const { data } = useServers(enabled)
  const configured = settings.hetzner.configured || settings.robot.configured
  const proxy = settings.proxy
  const projects = settings.hetzner.projects
  const accounts = settings.robot.accounts
  const unreadable = projects.some((p) => p.unreadable) || accounts.some((a) => a.unreadable)
  const limits = (data?.projects ?? []).map((p) => p.rateLimit).filter((r): r is NonNullable<typeof r> => !!r)
  const tightest = limits.sort((a, b) => a.remaining / a.limit - b.remaining / b.limit)[0]
  return (
    <Tile tone="primary" className="col-span-6 lg:col-span-3">
      <Link href="/admin/settings" className="flex h-full flex-col justify-between gap-6 outline-none">
        <TileLabel className="opacity-80">Hetzner API</TileLabel>
        <div>
          <p className="display text-3xl md:text-4xl">
            {!configured ? "Not set" : proxy.enabled ? proxy.protocol.toUpperCase() : "Direct"}
          </p>
          <p className="mt-2 text-sm opacity-80">
            {!configured
              ? unreadable
                ? "A saved token or password cannot be read. Enter it again."
                : "Add a project's API token or a Robot account in Settings"
              : `${[
                  projects.length ? `${projects.length} project${projects.length === 1 ? "" : "s"}` : null,
                  accounts.length ? `${accounts.length} Robot account${accounts.length === 1 ? "" : "s"}` : null,
                ]
                  .filter(Boolean)
                  .join(" and ")}${proxy.enabled ? ` via ${proxy.host}:${proxy.port}` : ", no proxy"}`}
          </p>
          {tightest ? (
            <p className="mt-1 text-sm opacity-80 tabular">
              {tightest.remaining} of {tightest.limit} requests left this hour
            </p>
          ) : null}
          {configured && unreadable ? <p className="mt-1 text-sm">A saved token or password cannot be read.</p> : null}
        </div>
      </Link>
    </Tile>
  )
}

export function AdminOverview({
  name,
  users,
  assignments,
  recent,
  settings,
}: {
  name: string
  users: { total: number; admins: number; disabled: number }
  assignments: { total: number; servers: number }
  recent: AuditRow[]
  settings: PublicSettings
}) {
  const configured = settings.hetzner.configured || settings.robot.configured
  const people = users.total - users.admins

  return (
    <Board>
      <Tile className="col-span-12 flex flex-col justify-between gap-10 lg:col-span-6 lg:row-span-2 lg:p-8">
        <h1 className="display text-5xl md:text-6xl">Hello, {name}</h1>
        <div>
          <p className="prose-serif max-w-xl text-xl md:text-2xl">
            {assignments.servers
              ? `${assignments.servers} server${assignments.servers === 1 ? " is" : "s are"} shared with ${people} user${people === 1 ? "" : "s"}.`
              : configured
                ? "Nothing is shared yet. Create a user, then assign them a server."
                : "Start by adding the API token of a Hetzner Cloud project or a Robot webservice user."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {configured ? (
              <>
                <Button asChild size="lg">
                  <Link href="/admin/servers">Assign servers</Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/admin/users">Add a user</Link>
                </Button>
              </>
            ) : (
              <Button asChild size="lg">
                <Link href="/admin/settings">Open Settings</Link>
              </Button>
            )}
          </div>
        </div>
      </Tile>

      <Count enabled={configured} />
      <ApiTile settings={settings} enabled={configured} />
      <Cost enabled={configured} />
      <Tile tone="tile" className="col-span-6 lg:col-span-3">
        <Link href="/admin/users" className="flex h-full flex-col justify-between gap-6 outline-none">
          <TileLabel>Users</TileLabel>
          <div>
            <p className="display text-6xl tabular">{users.total}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {users.admins} admin{users.admins === 1 ? "" : "s"}
              {users.disabled ? ` · ${users.disabled} disabled` : ""} · {assignments.total} assignment
              {assignments.total === 1 ? "" : "s"}
            </p>
          </div>
        </Link>
      </Tile>

      <Tile className="col-span-12 lg:col-span-9">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="display text-2xl">Recent activity</h2>
          <Link href="/admin/activity" className="inline-flex items-center gap-1 text-sm hover:underline">
            All activity <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        {recent.length ? (
          <ol className="mt-5 grid gap-1">
            {recent.map((row) => (
              <li key={row.id} className="grid grid-cols-[1fr_auto] gap-4 bg-background/60 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{row.username ?? "Someone"}</span> · {row.action}
                  {row.server_name || row.server_id ? (
                    <span className="text-muted-foreground"> · {row.server_name ?? row.server_id}</span>
                  ) : null}
                  {row.status !== null && row.status >= 400 ? <span className="text-destructive"> · failed</span> : null}
                </span>
                <span className="text-muted-foreground tabular">{timeAgo(row.at)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="prose-serif mt-5 text-base text-muted-foreground">Actions people take show up here.</p>
        )}
      </Tile>

      <TrafficWatch enabled={configured} />
    </Board>
  )
}
