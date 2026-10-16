"use client"

import useSWRInfinite from "swr/infinite"
import { Tile } from "@/components/board"
import { ErrorNote, Loading, StateMark } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { fetcher, hzUrl } from "@/lib/client"
import { duration, formatDateTime, humanize, timeAgo } from "@/lib/format"
import type { HzAction } from "@/lib/hz-types"
import { useServer } from "./context"

const COMMANDS: Record<string, string> = {
  start_server: "Power on",
  stop_server: "Power off",
  reboot_server: "Reboot",
  reset_server: "Reset",
  shutdown_server: "Shut down",
  rebuild_server: "Rebuild",
  create_server: "Server created",
  enable_rescue: "Rescue mode on",
  disable_rescue: "Rescue mode off",
  create_image: "Snapshot",
  attach_iso: "ISO inserted",
  detach_iso: "ISO ejected",
  change_dns_ptr: "Reverse DNS changed",
  reset_password: "Root password reset",
  request_console: "Console opened",
  change_server_type: "Server type changed",
  enable_backup: "Backups on",
  disable_backup: "Backups off",
  change_protection: "Protection changed",
  apply_firewall: "Firewall applied",
  remove_firewall: "Firewall removed",
  set_firewall_rules: "Firewall rules changed",
  attach_volume: "Volume attached",
  detach_volume: "Volume detached",
  assign_floating_ip: "Floating IP assigned",
  unassign_floating_ip: "Floating IP removed",
  assign_primary_ip: "Primary IP assigned",
  unassign_primary_ip: "Primary IP removed",
  attach_to_network: "Joined a private network",
  detach_from_network: "Left a private network",
  change_alias_ips: "Alias IPs changed",
  add_to_placement_group: "Added to a placement group",
  remove_from_placement_group: "Removed from a placement group",
}

export function commandName(command: string) {
  return COMMANDS[command] ?? humanize(command)
}

type Page = { actions: HzAction[]; meta?: { pagination?: { next_page?: number | null } } }

export function History() {
  const { project, id } = useServer()
  const { data, error, size, setSize, isLoading, isValidating } = useSWRInfinite<Page>(
    (index, previous) => {
      if (previous && !previous.meta?.pagination?.next_page) return null
      return hzUrl(project, id, "actions", { page: index + 1, per_page: 25 })
    },
    fetcher<Page>,
    {
      revalidateOnFocus: false,
      refreshInterval: (latest) => (latest?.some((p) => p.actions.some((a) => a.status === "running")) ? 3000 : 0),
    }
  )
  const actions = data?.flatMap((p) => p.actions) ?? []
  const more = !!data?.[data.length - 1]?.meta?.pagination?.next_page
  const loadingMore = isValidating && size > (data?.length ?? 0)
  const running = actions.filter((a) => a.status === "running")

  if (isLoading && !data) return <Loading />

  return (
    <div className="grid gap-2">
      <ErrorNote error={error} />
      {running.map((a) => (
        <Tile key={a.id} tone="primary" className="lg:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="text-sm opacity-80">Running now · started {timeAgo(a.started)}</p>
              <p className="display mt-2 text-3xl md:text-4xl">{commandName(a.command)}</p>
            </div>
            <p className="display text-6xl tabular">{a.progress}%</p>
          </div>
          <div className="mt-6 h-3 bg-primary-foreground/20">
            <div className="h-3 bg-primary-foreground transition-[width]" style={{ width: `${a.progress}%` }} />
          </div>
        </Tile>
      ))}

      {actions.length === 0 ? (
        <Tile>
          <p className="prose-serif text-base text-muted-foreground">Nothing has happened to this server yet.</p>
        </Tile>
      ) : (
        <Tile className="p-0">
          <ol className="grid">
            {actions.map((a, i) => (
              <li key={a.id} className={i % 2 ? "bg-tile/50 px-5 py-3" : "px-5 py-3"}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{commandName(a.command)}</p>
                    <p className="text-[13px] text-muted-foreground" title={formatDateTime(a.started)}>
                      {timeAgo(a.started)}
                      {duration(a.started, a.finished) ? ` · took ${duration(a.started, a.finished)}` : ""}
                    </p>
                  </div>
                  <StateMark
                    state={a.status}
                    label={a.status === "running" ? `Running, ${a.progress}%` : a.status === "success" ? "Done" : "Failed"}
                  />
                </div>
                {a.error ? <p className="mt-1 text-[13px] text-destructive">{a.error.message}</p> : null}
              </li>
            ))}
          </ol>
        </Tile>
      )}
      {more ? (
        <div className="mt-2">
          <Button variant="secondary" disabled={loadingMore} onClick={() => setSize(size + 1)}>
            {loadingMore ? <Spinner /> : null} Load more
          </Button>
        </div>
      ) : null}
    </div>
  )
}
