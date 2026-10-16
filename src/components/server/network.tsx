"use client"

import * as React from "react"
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react"
import { Tile } from "@/components/board"
import { CopyButton, ErrorNote, Loading, StateMark, useAction } from "@/components/common"
import { Flag } from "@/components/flag"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useHz } from "@/hooks/use-api"
import { hzCall } from "@/lib/client"
import type { HzAction, NetworkInfo } from "@/lib/hz-types"
import { inIPv6Network, isHostname, isIPv6 } from "@/lib/ip"
import { get } from "@/lib/summary"
import { useServer } from "./context"

type Ptr = { ip: string; dns_ptr: string }

/** One row of the address table: a primary IP or a floating IP. */
type Address = {
  key: string
  ip: string
  kind: string
  v6: boolean
  ptrs: Ptr[]
  blocked: boolean
  country?: string | null
}

function addresses(server: Record<string, unknown>, network: NetworkInfo | undefined): Address[] {
  const list: Address[] = []
  const v4 = get<Record<string, unknown>>(server, "public_net.ipv4")
  const v6 = get<Record<string, unknown>>(server, "public_net.ipv6")
  if (v4?.ip) {
    list.push({
      key: "v4",
      ip: String(v4.ip),
      kind: "Primary IPv4",
      v6: false,
      ptrs: v4.dns_ptr ? [{ ip: String(v4.ip), dns_ptr: String(v4.dns_ptr) }] : [],
      blocked: v4.blocked === true,
    })
  }
  if (v6?.ip) {
    list.push({
      key: "v6",
      ip: String(v6.ip),
      kind: "Primary IPv6 network",
      v6: true,
      ptrs: Array.isArray(v6.dns_ptr) ? (v6.dns_ptr as Ptr[]) : [],
      blocked: v6.blocked === true,
    })
  }
  for (const f of network?.floatingIps ?? []) {
    list.push({
      key: `f${f.id}`,
      ip: f.ip,
      kind: `Floating ${f.type === "ipv6" ? "IPv6" : "IPv4"} · ${f.name}`,
      v6: f.type === "ipv6",
      ptrs: f.dnsPtr,
      blocked: f.blocked,
      country: f.country,
    })
  }
  return list
}

/** "2a01:4f8:c0c:1234::/64" → "2a01:4f8:c0c:1234::1", the address Hetzner configures on the server. */
function firstAddress(network: string) {
  const base = network.split("/")[0]
  return base.endsWith("::") ? `${base}1` : base
}

export function Network() {
  const { server, project, id, can } = useServer()
  const network = useHz<NetworkInfo>(project, id, "network")
  const [editing, setEditing] = React.useState<Address | null>(null)
  const list = addresses(server, network.data)
  const editable = can("rdns")

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="display mb-4 text-3xl">IP addresses</h2>
        <div className="bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Address</TableHead>
                <TableHead className="hidden sm:table-cell">Kind</TableHead>
                <TableHead>Reverse DNS</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="w-0 pr-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.key}>
                  <TableCell className="py-3 pl-5">
                    <span className="inline-flex items-center gap-1 break-all tabular">
                      {a.country ? <Flag country={a.country} className="mr-1" /> : null}
                      {a.ip}
                      <CopyButton value={a.v6 ? firstAddress(a.ip) : a.ip} label="Copy address" className="size-6" />
                    </span>
                    <div className="text-[13px] text-muted-foreground sm:hidden">{a.kind}</div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{a.kind}</TableCell>
                  <TableCell className="max-w-72">
                    {a.ptrs.length === 0 ? (
                      <span className="text-muted-foreground">Not set</span>
                    ) : a.v6 ? (
                      <span>
                        {a.ptrs.length} name{a.ptrs.length === 1 ? "" : "s"}
                        <span className="block truncate text-[13px] text-muted-foreground">{a.ptrs[0].dns_ptr}</span>
                      </span>
                    ) : (
                      <span className="break-all">{a.ptrs[0].dns_ptr}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {a.blocked ? <StateMark state="BLOCKED" label="Blocked by Hetzner" /> : <StateMark state="ON" label="Routed" />}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    {editable ? (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                        <PencilSimpleIcon /> Reverse DNS
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {list.some((a) => a.blocked) ? (
          <p className="mt-3 text-sm text-destructive">
            Hetzner&apos;s abuse team blocked an address. Check the e-mail Hetzner sent to the account owner.
          </p>
        ) : null}
        <ErrorNote error={network.error} className="mt-2" />
      </section>

      <PrivateNetworks data={network.data} loading={network.isLoading && !network.data} />

      <RdnsDialog
        address={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          network.mutate()
        }}
        project={project}
        id={id}
      />
    </div>
  )
}

function PrivateNetworks({ data, loading }: { data: NetworkInfo | undefined; loading: boolean }) {
  if (loading) return <Loading />
  if (!data?.privateNets.length) return null
  return (
    <section>
      <h2 className="display mb-4 text-3xl">Private networks</h2>
      <Tile className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Network</TableHead>
              <TableHead>Address on it</TableHead>
              <TableHead className="hidden pr-5 sm:table-cell">Range</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.privateNets.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="py-3 pl-5">{n.name ?? `Network ${n.id}`}</TableCell>
                <TableCell className="tabular">
                  {n.ip}
                  {n.aliasIps.length ? <span className="block text-[13px] text-muted-foreground">also {n.aliasIps.join(", ")}</span> : null}
                </TableCell>
                <TableCell className="hidden pr-5 tabular sm:table-cell">{n.ipRange ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Tile>
    </section>
  )
}

function RdnsDialog({
  address,
  onClose,
  onSaved,
  project,
  id,
}: {
  address: Address | null
  onClose: () => void
  onSaved: () => void
  project: number
  id: number
}) {
  return (
    <Dialog open={!!address} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {address ? <RdnsForm key={address.key} address={address} onClose={onClose} onSaved={onSaved} project={project} id={id} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function RdnsForm({
  address,
  onClose,
  onSaved,
  project,
  id,
}: {
  address: Address
  onClose: () => void
  onSaved: () => void
  project: number
  id: number
}) {
  const { refresh, watch } = useServer()
  const { busy, run } = useAction()
  const [ptrs, setPtrs] = React.useState(address.ptrs)
  const [ip, setIp] = React.useState(address.v6 ? firstAddress(address.ip) : address.ip)
  const [name, setName] = React.useState(address.v6 ? "" : (address.ptrs[0]?.dns_ptr ?? ""))
  const ipOk = !address.v6 || (isIPv6(ip) && inIPv6Network(ip, address.ip))
  const nameOk = isHostname(name.trim())

  const send = (target: string, ptr: string | null) =>
    run(`${target}:${ptr ?? ""}`, async () => {
      const res = await hzCall<{ action?: HzAction }>(project, id, "POST", "rdns", { ip: target, dns_ptr: ptr })
      watch(
        res.action,
        {
          pending: "Changing reverse DNS…",
          success: ptr ? `Reverse DNS of ${target} is ${ptr}` : `Reverse DNS of ${target} was reset`,
        },
        onSaved
      )
      refresh()
      if (address.v6) {
        setPtrs((list) => [...list.filter((p) => p.ip !== target), ...(ptr ? [{ ip: target, dns_ptr: ptr }] : [])])
        setName("")
      } else {
        onClose()
      }
    })

  return (
    <>
      <DialogHeader>
        <DialogTitle className="display text-2xl break-all tabular">{address.ip}</DialogTitle>
        <DialogDescription className="prose-serif text-[15px]">
          Reverse DNS is the name an address resolves back to. Mail servers check it. Point the name at the address first,
          then set it here.
        </DialogDescription>
      </DialogHeader>
      {address.v6 ? (
        <div className="my-4 grid gap-4">
          {ptrs.length ? (
            <ul className="grid gap-1">
              {ptrs.map((p) => (
                <li key={p.ip} className="flex items-center gap-3 bg-muted px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block break-all tabular">{p.ip}</span>
                    <span className="block break-all text-muted-foreground">{p.dns_ptr}</span>
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove the name of ${p.ip}`}
                    disabled={!!busy}
                    onClick={() => send(p.ip, null)}
                  >
                    {busy === `${p.ip}:` ? <Spinner /> : <TrashIcon />}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No address in this network has a name yet.</p>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rdns-ip">Address</FieldLabel>
              <Input id="rdns-ip" value={ip} onChange={(e) => setIp(e.target.value.trim())} className="tabular" />
              <FieldDescription>Any address inside {address.ip}. The server itself uses the one ending in ::1.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="rdns-name">Host name</FieldLabel>
              <Input id="rdns-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mail.example.com" />
            </Field>
          </FieldGroup>
        </div>
      ) : (
        <FieldGroup className="my-6">
          <Field>
            <FieldLabel htmlFor="rdns-name">Host name</FieldLabel>
            <Input id="rdns-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mail.example.com" autoFocus />
            <FieldDescription>Resetting brings back Hetzner&apos;s default name.</FieldDescription>
          </Field>
        </FieldGroup>
      )}
      {!ipOk ? <ErrorNote error={new Error(`The address has to be inside ${address.ip}.`)} className="mb-4" /> : null}
      <DialogFooter>
        {!address.v6 && address.ptrs.length ? (
          <Button type="button" variant="ghost" className="sm:mr-auto" disabled={!!busy} onClick={() => send(address.ip, null)}>
            Reset to default
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onClose}>
          {address.v6 ? "Done" : "Cancel"}
        </Button>
        <Button type="button" disabled={!!busy || !nameOk || !ipOk} onClick={() => send(ip, name.trim().replace(/\.$/, ""))}>
          {busy && busy.endsWith(name.trim()) ? <Spinner /> : null} {address.v6 ? "Add name" : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}
