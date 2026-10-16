"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowsClockwiseIcon, MagnifyingGlassIcon, UserPlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { PageHeader } from "@/components/board"
import { ErrorNote, Loading, StateMark } from "@/components/common"
import { Flag } from "@/components/flag"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useApi } from "@/hooks/use-api"
import { api, errorMessage, serverHref } from "@/lib/client"
import { formatMoney } from "@/lib/format"
import type { RateLimit } from "@/lib/hetzner"
import { serverKey, type ServerKind, type ServerSummary } from "@/lib/summary"
import type { AdminUserRow } from "@/lib/users"

export type AdminServer = ServerSummary & { assignees: { userId: number; username: string; name: string | null }[] }
export type AdminServersResponse = {
  servers: AdminServer[]
  errors: { kind: ServerKind; projectId: number; project: string; message: string }[]
  projects: { id: number; name: string; currency: string; rateLimit: RateLimit | null }[]
  /** Robot accounts, whose dedicated servers are listed with the cloud servers. */
  accounts: { id: number; name: string }[]
}

const KIND_NAMES: Record<ServerKind, string> = { cloud: "Cloud", dedicated: "Dedicated", storage: "Storage Box", dns: "DNS zone" }

/** Storage Boxes and DNS zones belong to a Hetzner project, so they share its filter tab. */
const ownerKey = (s: ServerSummary) => `${s.kind === "dedicated" ? "dedicated" : "cloud"}:${s.projectId}`

export function AdminServers({ configured }: { configured: boolean }) {
  const [owner, setOwner] = React.useState("all")
  const [query, setQuery] = React.useState("")
  const [refreshing, setRefreshing] = React.useState(false)
  const [assigning, setAssigning] = React.useState<AdminServer | null>(null)
  const { data, error, isLoading, mutate } = useApi<AdminServersResponse>(configured ? "/api/admin/servers" : null)
  const currency = new Map((data?.projects ?? []).map((p) => [p.id, p.currency]))
  // Cloud projects and Robot accounts to filter by, each as "kind:id".
  const owners = [
    ...(data?.projects ?? []).map((p) => ({ key: `cloud:${p.id}`, name: p.name })),
    ...(data?.accounts ?? []).map((a) => ({ key: `dedicated:${a.id}`, name: a.name })),
  ]

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (data?.servers ?? []).filter((s) => owner === "all" || ownerKey(s) === owner)
    if (!q) return list
    return list.filter((s) =>
      [s.id, s.name, s.ipv4, s.ipv6, s.host, s.location, s.type, s.os, s.projectName, s.status, KIND_NAMES[s.kind], ...s.assignees.map((a) => a.username)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    )
  }, [data, query, owner])

  async function refresh() {
    setRefreshing(true)
    try {
      await mutate(await api<AdminServersResponse>("/api/admin/servers?refresh=1"), { revalidate: false })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setRefreshing(false)
    }
  }

  if (!configured) {
    return (
      <>
        <PageHeader title="Servers" />
        <Empty className="bg-card py-16">
          <EmptyHeader>
            <EmptyTitle className="display text-2xl">No Hetzner account yet</EmptyTitle>
            <EmptyDescription className="prose-serif text-base">
              Add a Cloud project&apos;s API token or a Robot webservice user in Settings and its servers show up here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/admin/settings">Open Settings</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Servers"
        description="Every cloud server of your Hetzner projects and every dedicated server of your Robot accounts. Assign one to a user and it appears in their panel."
        actions={
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Spinner /> : <ArrowsClockwiseIcon />} Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {owners.length > 1 ? (
          <div className="no-scrollbar min-w-0 overflow-x-auto pb-1.5">
            <Tabs value={owner} onValueChange={setOwner}>
              <TabsList variant="line">
                <TabsTrigger value="all" className="px-3 text-sm">
                  All
                </TabsTrigger>
                {owners.map((o) => (
                  <TabsTrigger key={o.key} value={o.key} className="px-3 text-sm">
                    {o.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        ) : (
          <span />
        )}
        <InputGroup className="h-9 shrink-0 bg-card lg:w-80">
          <InputGroupAddon>
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search name, IP, user…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </InputGroup>
      </div>

      <ErrorNote error={error} className="mb-4" />
      {data?.errors.map((e) => (
        <ErrorNote key={`${e.kind}:${e.projectId}`} error={new Error(`${e.project}: ${e.message}`)} className="mb-2" />
      ))}
      {isLoading && !data ? (
        <Loading label="Loading servers from Hetzner…" />
      ) : data && rows.length === 0 ? (
        <p className="prose-serif bg-card p-8 text-base text-muted-foreground">
          {query ? "No server matches that search." : "There are no servers here yet."}
        </p>
      ) : data ? (
        <div className="bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Server</TableHead>
                <TableHead>IP address</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="hidden xl:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden text-right 2xl:table-cell">A month</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead className="w-0 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={serverKey(s.kind, s.projectId, s.id)}>
                  <TableCell className="py-3 pl-4">
                    <Link href={serverHref(s.kind, s.projectId, s.id)} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    <div className="text-[13px] text-muted-foreground">
                      {KIND_NAMES[s.kind]} · {s.projectName} · <span className="tabular">#{s.id}</span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular">{s.host ?? s.ipv4 ?? s.ipv6 ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Flag country={s.country} className="mr-1.5" />
                    {s.location ?? "—"}
                  </TableCell>
                  <TableCell className="hidden max-w-64 xl:table-cell">
                    <div>{s.type ?? "—"}</div>
                    <div className="truncate text-[13px] text-muted-foreground">{s.spec}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {s.status ? <StateMark state={s.status} /> : "—"}
                    {s.rescue ? <div className="text-[13px] text-warning">Rescue mode on</div> : null}
                    {s.cancelled ? <div className="text-[13px] text-destructive">Cancelled</div> : null}
                  </TableCell>
                  <TableCell className="hidden text-right tabular 2xl:table-cell">
                    {formatMoney(s.price, currency.get(s.projectId))}
                  </TableCell>
                  <TableCell className="max-w-56">
                    {s.assignees.length ? (
                      <span className="line-clamp-2">{s.assignees.map((a) => a.username).join(", ")}</span>
                    ) : (
                      <span className="text-muted-foreground">Nobody</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setAssigning(s)}>
                      <UserPlusIcon /> Assign
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <AssignDialog server={assigning} onClose={() => setAssigning(null)} onSaved={() => mutate()} />
    </>
  )
}

function AssignDialog({ server, onClose, onSaved }: { server: AdminServer | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={!!server} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {server ? (
          <AssignForm key={serverKey(server.kind, server.projectId, server.id)} server={server} onClose={onClose} onSaved={onSaved} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function AssignForm({ server, onClose, onSaved }: { server: AdminServer; onClose: () => void; onSaved: () => void }) {
  const users = useApi<{ users: AdminUserRow[] }>("/api/admin/users")
  const [selected, setSelected] = React.useState<Set<number>>(() => new Set(server.assignees.map((a) => a.userId)))
  const [saving, setSaving] = React.useState(false)

  const people = (users.data?.users ?? []).filter((u) => u.role === "user")

  async function save() {
    setSaving(true)
    try {
      await api("/api/admin/assignments", {
        method: "PUT",
        body: { kind: server.kind, projectId: server.projectId, serverId: server.id, label: server.name, userIds: [...selected] },
      })
      toast.success("Assignment saved")
      onSaved()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="display text-2xl">Assign {server.name}</DialogTitle>
        <DialogDescription className="prose-serif text-[15px]">
          {server.kind === "dedicated"
            ? "Users you tick can manage this dedicated server: resets, the rescue system, Linux installation, reverse DNS and traffic, within what Settings allows."
            : server.kind === "storage"
              ? "Users you tick can use this Storage Box: see its usage, reset its password, change access, and manage snapshots and sub-accounts, within what Settings allows."
              : server.kind === "dns"
                ? "Users you tick can manage the records of this DNS zone and its default TTL, within what Settings allows."
                : "Users you tick can manage this server: power, console, rebuild, rescue, network and firewall, within what Settings allows."}{" "}
          Admins already see every server.
        </DialogDescription>
      </DialogHeader>
      {users.isLoading ? (
        <Loading />
      ) : people.length === 0 ? (
        <p className="prose-serif bg-muted p-4 text-[15px]">
          There are no users yet.{" "}
          <Link href="/admin/users" className="underline">
            Create one first
          </Link>
          .
        </p>
      ) : (
        <ul className="grid max-h-80 gap-1 overflow-y-auto">
          {people.map((u) => {
            const checked = selected.has(u.id)
            return (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-3 bg-muted px-3 py-2.5 text-sm hover:bg-accent">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const next = new Set(selected)
                      if (v) next.add(u.id)
                      else next.delete(u.id)
                      setSelected(next)
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{u.name || u.username}</span>
                    {u.name ? <span className="text-muted-foreground"> · {u.username}</span> : null}
                  </span>
                  {u.disabled ? <span className="text-[13px] text-muted-foreground">Disabled</span> : null}
                </label>
              </li>
            )
          })}
        </ul>
      )}
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || users.isLoading}>
          {saving ? <Spinner /> : null} Save
        </Button>
      </DialogFooter>
    </>
  )
}
