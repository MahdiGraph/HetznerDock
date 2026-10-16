"use client"

import * as React from "react"
import { Board, Facts, Tile } from "@/components/board"
import { ErrorNote, Loading } from "@/components/common"
import { Flag } from "@/components/flag"
import { useHz } from "@/hooks/use-api"
import { countryName } from "@/lib/geo"
import { formatBytes, formatDate, formatMoney } from "@/lib/format"
import type { VolumeInfo } from "@/lib/hz-types"
import { get, gigabytes, locationOf, monthlyPrice, osName } from "@/lib/summary"
import { useServer } from "./context"
import { SectionTitle } from "./parts"

const text = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v))

function Traffic() {
  const { server } = useServer()
  const out = Number(server.outgoing_traffic ?? NaN)
  const inbound = Number(server.ingoing_traffic ?? NaN)
  const included = Number(server.included_traffic ?? NaN)
  const share = Number.isFinite(out) && included > 0 ? out / included : null
  return (
    <Tile tone="tile" className="col-span-12 lg:col-span-5">
      <SectionTitle>Traffic this month</SectionTitle>
      {share !== null ? (
        <>
          <p className="display text-4xl tabular">{Math.round(share * 1000) / 10}%</p>
          <div className="mt-4 h-3 bg-background/70">
            <div
              className={share >= 0.9 ? "h-3 bg-destructive" : share >= 0.5 ? "h-3 bg-warning" : "h-3 bg-foreground"}
              style={{ width: `${Math.min(100, Math.max(share * 100, 0.5))}%` }}
            />
          </div>
        </>
      ) : null}
      <Facts
        className="mt-6"
        items={[
          ["Outgoing", formatBytes(Number.isFinite(out) ? out : null, { binary: true })],
          ["Included", formatBytes(Number.isFinite(included) ? included : null, { binary: true })],
          ["Incoming", formatBytes(Number.isFinite(inbound) ? inbound : null, { binary: true })],
        ]}
      />
      <p className="mt-6 text-[13px] text-muted-foreground">
        Hetzner only counts outgoing traffic against the included amount. The counter starts again each billing month.
      </p>
    </Tile>
  )
}

function Volumes() {
  const { server, project, id } = useServer()
  const count = ((server.volumes as unknown[] | undefined) ?? []).length
  const volumes = useHz<{ volumes: VolumeInfo[] }>(project, id, count ? "volumes" : null)
  return (
    <Tile className="col-span-12 lg:col-span-7">
      <SectionTitle>Storage</SectionTitle>
      <Facts
        items={[
          ["System disk", gigabytes(server.primary_disk_size)],
          ["Disk type", get(server, "server_type.storage_type") === "network" ? "Network (Ceph)" : "Local NVMe SSD"],
        ]}
      />
      <p className="mt-6 text-sm font-medium">Volumes</p>
      {!count ? (
        <p className="mt-2 text-sm text-muted-foreground">No volumes are attached.</p>
      ) : volumes.isLoading && !volumes.data ? (
        <Loading />
      ) : (
        <>
          <ErrorNote error={volumes.error} className="mt-2" />
          <ul className="mt-2 grid gap-1">
            {(volumes.data?.volumes ?? []).map((v) => (
              <li key={v.id} className="grid grid-cols-[1fr_auto] gap-4 bg-tile px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{v.name}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {[v.linuxDevice, v.format ? `formatted ${v.format}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="tabular">{v.size} GB</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Tile>
  )
}

export function Overview({ currency }: { currency: string }) {
  const { server, isAdmin } = useServer()
  const type = (server.server_type ?? {}) as Record<string, unknown>
  const loc = locationOf(server)
  const country = text(loc.country)
  const price = isAdmin ? monthlyPrice(server) : null
  const nets = (server.private_net as unknown[] | undefined) ?? []

  return (
    <Board>
      <Tile className="col-span-12 lg:col-span-7">
        <SectionTitle>Plan</SectionTitle>
        <Facts
          items={[
            [
              "Server type",
              [text(type.name)?.toUpperCase(), text(type.description)]
                .filter((v, i, list) => v && list.findIndex((w) => w?.toLowerCase() === v.toLowerCase()) === i)
                .join(" · ") || null,
            ],
            ["Processor", type.cores ? `${type.cores} ${type.cpu_type === "dedicated" ? "dedicated" : "shared"} vCPU${Number(type.cores) === 1 ? "" : "s"}` : null],
            ["Memory", gigabytes(type.memory)],
            ["Architecture", type.architecture === "arm" ? "Arm64 (Ampere)" : type.architecture ? "x86" : null],
            ["System", osName(server.image)],
            ["Created", formatDate(text(server.created))],
            ["Backups", server.backup_window ? `Daily, between ${server.backup_window} UTC` : "Off"],
            ["Protection", get(server, "protection.delete") || get(server, "protection.rebuild") ? "On" : "Off"],
            ...(nets.length ? ([["Private networks", `${nets.length} attached`]] as [string, React.ReactNode][]) : []),
            ...(server.placement_group ? ([["Placement group", text(get(server, "placement_group.name"))]] as [string, React.ReactNode][]) : []),
            ...(isAdmin ? ([["Price", price !== null ? `${formatMoney(price, currency)} a month, VAT included` : null]] as [string, React.ReactNode][]) : []),
          ]}
        />
      </Tile>
      <Tile tone="tile" className="col-span-12 lg:col-span-5">
        <SectionTitle>Location</SectionTitle>
        <Facts
          items={[
            ["City", text(loc.city)],
            ["Country", country ? <span key="c"><Flag country={country} className="mr-1.5" />{countryName(country)}</span> : null],
            ["Location", text(loc.name)],
            ["Network zone", text(loc.network_zone)],
            ["Data center", text(loc.description)],
          ]}
        />
      </Tile>
      <Volumes />
      <Traffic />
      {isAdmin && server.labels && Object.keys(server.labels as object).length ? (
        <Tile className="col-span-12">
          <SectionTitle>Labels</SectionTitle>
          <ul className="flex flex-wrap gap-1">
            {Object.entries(server.labels as Record<string, string>).map(([k, v]) => (
              <li key={k} className="bg-tile px-2.5 py-1 text-sm">
                {k}
                {v ? <span className="text-muted-foreground">={v}</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-muted-foreground">Only admins see labels.</p>
        </Tile>
      ) : null}
    </Board>
  )
}
