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
import type { ServerSummary } from "@/lib/summary"
import type { AdminUserRow } from "@/lib/users"

export type AdminServer = ServerSummary & { assignees: { userId: number; username: string; name: string | null }[] }
export type AdminServersResponse = {
  servers: AdminServer[]
  errors: { projectId: number; project: string; message: string }[]
  projects: { id: number; name: string; currency: string; rateLimit: RateLimit | null }[]
}

export function AdminServers({ configured }: { configured: boolean }) {
  const [project, setProject] = React.useState("all")
  const [query, setQuery] = React.useState("")
  const [refreshing, setRefreshing] = React.useState(false)
  const [assigning, setAssigning] = React.useState<AdminServer | null>(null)
  const { data, error, isLoading, mutate } = useApi<AdminServersResponse>(configured ? "/api/admin/servers" : null)
  const currency = new Map((data?.projects ?? []).map((p) => [p.id, p.currency]))
  const multiProject = (data?.projects.length ?? 0) > 1

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (data?.servers ?? []).filter((s) => project === "all" || String(s.projectId) === project)
    if (!q) return list
    return list.filter((s) =>
      [s.id, s.name, s.ipv4, s.ipv6, s.location, s.type, s.os, s.projectName, s.status, ...s.assignees.map((a) => a.username)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    )
  }, [data, query, project])

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
            <EmptyTitle className="display text-2xl">No Hetzner project yet</EmptyTitle>
            <EmptyDescription className="prose-serif text-base">
              Add a project&apos;s API token in Settings and its servers show up here.
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
        description="Every cloud server in your Hetzner projects. Assign one to a user and it appears in their panel."
        actions={
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Spinner /> : <ArrowsClockwiseIcon />} Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {multiProject ? (
          <div className="no-scrollbar min-w-0 overflow-x-auto pb-1.5">
            <Tabs value={project} onValueChange={setProject}>
              <TabsList variant="line">
                <TabsTrigger value="all" className="px-3 text-sm">
                  All projects
                </TabsTrigger>
                {data!.projects.map((p) => (
                  <TabsTrigger key={p.id} value={String(p.id)} className="px-3 text-sm">
                    {p.name}
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
        <ErrorNote key={e.projectId} error={new Error(`${e.project}: ${e.message}`)} className="mb-2" />
      ))}
      {isLoading && !data ? (
        <Loading label="Loading servers from Hetzner…" />
      ) : data && rows.length === 0 ? (
        <p className="prose-serif bg-card p-8 text-base text-muted-foreground">
          {query ? "No server matches that search." : "There are no servers in this project yet."}
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
                <TableRow key={`${s.projectId}:${s.id}`}>
                  <TableCell className="py-3 pl-4">
                    <Link href={serverHref(s.projectId, s.id)} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    <div className="text-[13px] text-muted-foreground">
                      {s.projectName} · <span className="tabular">#{s.id}</span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular">{s.ipv4 ?? s.ipv6 ?? "—"}</TableCell>
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
        {server ? <AssignForm key={`${server.projectId}:${server.id}`} server={server} onClose={onClose} onSaved={onSaved} /> : null}
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
        body: { projectId: server.projectId, serverId: server.id, label: server.name, userIds: [...selected] },
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
          Users you tick can manage this server: power, console, rebuild, rescue, network and firewall, within what
          Settings allows. Admins already see every server.
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
