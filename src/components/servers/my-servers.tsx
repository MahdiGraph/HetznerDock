"use client"

import Link from "next/link"
import { ArrowRightIcon } from "@phosphor-icons/react"
import { PageHeader } from "@/components/board"
import { ErrorNote, Loading, StateMark } from "@/components/common"
import { Flag } from "@/components/flag"
import { useApi } from "@/hooks/use-api"
import { serverHref } from "@/lib/client"
import type { UserServer } from "@/lib/servers"
import { serverKey } from "@/lib/summary"

export function MyServers({ name }: { name: string }) {
  const { data, error, isLoading } = useApi<{ servers: UserServer[] }>("/api/servers", { refreshInterval: 60_000 })
  const servers = data?.servers ?? []

  return (
    <>
      <PageHeader
        title="My servers"
        description={
          servers.length
            ? `${name}, these are the servers you look after. Open one to restart it, open its console or rebuild it.`
            : undefined
        }
      />
      <ErrorNote error={error} className="mb-4" />
      {isLoading && !data ? (
        <Loading label="Loading your servers…" />
      ) : data && servers.length === 0 ? (
        <div className="bg-card p-8 md:p-12">
          <p className="display text-3xl">No servers yet</p>
          <p className="prose-serif mt-3 max-w-lg text-base text-muted-foreground">
            Your admin has not assigned you a server. Once they do, it shows up here.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {servers.map((s) => (
            <li key={serverKey(s.kind, s.projectId, s.id)}>
              <Link
                href={serverHref(s.kind, s.projectId, s.id)}
                className="group grid grid-cols-12 items-center gap-x-4 gap-y-2 bg-card p-5 transition-colors outline-none hover:bg-accent focus-visible:bg-accent md:p-6"
              >
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <p className="text-[13px] text-muted-foreground">
                    {s.kind === "dns"
                      ? `${s.type === "Secondary" ? "Secondary " : ""}DNS zone`
                      : `${s.kind === "dedicated" ? "Dedicated server" : s.kind === "storage" ? "Storage Box" : "Cloud server"}${s.type ? ` ${s.type}` : ""}`}
                  </p>
                  <p className="display mt-1 truncate text-2xl md:text-3xl">{s.name}</p>
                </div>
                {s.error ? (
                  <p className="col-span-12 text-sm text-destructive md:col-span-7">{s.error}</p>
                ) : (
                  <>
                    <div className="col-span-6 min-w-0 md:col-span-2">
                      <p className="text-[13px] text-muted-foreground">{s.kind === "storage" ? "Host" : s.kind === "dns" ? "Domain" : "IP address"}</p>
                      <p className="mt-0.5 truncate text-base tabular">{s.host ?? s.ipv4 ?? s.ipv6 ?? "—"}</p>
                    </div>
                    <div className="col-span-6 min-w-0 md:col-span-2">
                      <p className="text-[13px] text-muted-foreground">{s.kind === "dns" ? "Records" : "Location"}</p>
                      <p className="mt-0.5 truncate text-base">
                        {s.kind === "dns" ? (
                          (s.spec ?? "—")
                        ) : (
                          <>
                            <Flag country={s.country} className="mr-1.5" />
                            {s.location ?? "—"}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="col-span-9 min-w-0 md:col-span-3">
                      <p className="text-[13px] text-muted-foreground">{s.kind === "cloud" ? (s.os ?? "System") : "Status"}</p>
                      <StateMark state={s.status} className="mt-1 text-base" label={s.rescue ? "Rescue mode on" : undefined} />
                    </div>
                  </>
                )}
                <div className="col-span-3 flex justify-end md:col-span-1">
                  <ArrowRightIcon className="size-6 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
