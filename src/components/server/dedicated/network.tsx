"use client"

import * as React from "react"
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { CopyButton, ErrorNote, Loading, useAction } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useRobot } from "@/hooks/use-api"
import { robotCall } from "@/lib/client"
import { inIPv4Network, inIPv6Network, isHostname, isIPv4, isIPv6 } from "@/lib/ip"
import type { DedicatedAddress } from "@/lib/robot-types"
import { useDedicated } from "./context"

function kindOf(a: DedicatedAddress) {
  if (a.role === "main") return "Main IPv4"
  if (a.role === "single") return "Extra IPv4"
  return a.v6 ? "IPv6 network" : "IPv4 subnet"
}

/** The address a network suggests first: ::2 is the one Hetzner's installer gives a dedicated server. */
function suggested(a: DedicatedAddress) {
  if (a.role !== "subnet") return a.ip
  return a.v6 && a.base.endsWith("::") ? `${a.base}2` : a.base
}

export function DedicatedNetwork() {
  const { project, id, can } = useDedicated()
  const network = useRobot<{ addresses: DedicatedAddress[] }>(project, id, "network")
  const [editing, setEditing] = React.useState<DedicatedAddress | null>(null)
  const list = network.data?.addresses ?? []

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="display mb-4 text-3xl">IP addresses</h2>
        <ErrorNote error={network.error} className="mb-2" />
        {network.isLoading && !network.data ? (
          <Loading />
        ) : (
          <div className="bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Address</TableHead>
                  <TableHead className="hidden sm:table-cell">Kind</TableHead>
                  <TableHead>Reverse DNS</TableHead>
                  <TableHead className="w-0 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((a) => (
                  <TableRow key={a.ip}>
                    <TableCell className="py-3 pl-5">
                      <span className="inline-flex items-center gap-1 break-all tabular">
                        {a.ip}
                        <CopyButton value={a.role === "subnet" ? suggested(a) : a.ip} label="Copy address" className="size-6" />
                      </span>
                      <div className="text-[13px] text-muted-foreground sm:hidden">{kindOf(a)}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{kindOf(a)}</TableCell>
                    <TableCell className="max-w-72">
                      {a.ptrs.length === 0 ? (
                        <span className="text-muted-foreground">Not set</span>
                      ) : a.role === "subnet" ? (
                        <span>
                          {a.ptrs.length} name{a.ptrs.length === 1 ? "" : "s"}
                          <span className="block truncate text-[13px] text-muted-foreground">{a.ptrs[0].ptr}</span>
                        </span>
                      ) : (
                        <span className="break-all">{a.ptrs[0].ptr}</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      {can("rdns") ? (
                        <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                          <PencilSimpleIcon /> Reverse DNS
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {network.data && !list.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-4 pl-5 text-muted-foreground">
                      Robot lists no addresses for this server.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-3 text-[13px] text-muted-foreground">
          Failover IPs and vSwitch networks are managed in Robot by the account owner.
        </p>
      </section>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing ? (
            <RdnsForm key={editing.ip} address={editing} onClose={() => setEditing(null)} onSaved={() => network.mutate()} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RdnsForm({ address, onClose, onSaved }: { address: DedicatedAddress; onClose: () => void; onSaved: () => void }) {
  const { project, id } = useDedicated()
  const { busy, run } = useAction()
  const subnet = address.role === "subnet"
  const [ptrs, setPtrs] = React.useState(address.ptrs)
  const [ip, setIp] = React.useState(suggested(address))
  const [name, setName] = React.useState(subnet ? "" : (address.ptrs[0]?.ptr ?? ""))
  const ipOk = !subnet || (address.v6 ? isIPv6(ip) && inIPv6Network(ip, address.ip) : isIPv4(ip) && inIPv4Network(ip, address.ip))
  const nameOk = isHostname(name.trim())

  const send = (target: string, ptr: string | null) =>
    run(`${target}:${ptr ?? ""}`, async () => {
      // The answer carries the address the way Robot stores it, e.g. an IPv6 address in its short form.
      const res = await robotCall<{ ip: string; ptr: string | null }>(project, id, "POST", "rdns", { ip: target, dns_ptr: ptr })
      toast.success(res.ptr ? `Reverse DNS of ${res.ip} is ${res.ptr}` : `Reverse DNS of ${res.ip} removed`)
      onSaved()
      if (subnet) {
        setPtrs((list) => [...list.filter((p) => p.ip !== res.ip), ...(res.ptr ? [{ ip: res.ip, ptr: res.ptr }] : [])])
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
      {subnet ? (
        <div className="my-4 grid gap-4">
          {ptrs.length ? (
            <ul className="grid gap-1">
              {ptrs.map((p) => (
                <li key={p.ip} className="flex items-center gap-3 bg-muted px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block break-all tabular">{p.ip}</span>
                    <span className="block break-all text-muted-foreground">{p.ptr}</span>
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
              <FieldDescription>
                Any address inside {address.ip}.{address.v6 ? " Hetzner's installer gives the server the one ending in ::2." : ""}
              </FieldDescription>
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
          </Field>
        </FieldGroup>
      )}
      {!ipOk ? <ErrorNote error={new Error(`The address has to be inside ${address.ip}.`)} className="mb-4" /> : null}
      <DialogFooter>
        {!subnet && address.ptrs.length ? (
          <Button type="button" variant="ghost" className="sm:mr-auto" disabled={!!busy} onClick={() => send(address.ip, null)}>
            Remove the name
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onClose}>
          {subnet ? "Done" : "Cancel"}
        </Button>
        <Button type="button" disabled={!!busy || !nameOk || !ipOk} onClick={() => send(ip, name.trim().replace(/\.$/, ""))}>
          {busy && busy.endsWith(name.trim()) ? <Spinner /> : null} {subnet ? "Add name" : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}
