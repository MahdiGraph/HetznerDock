"use client"

import * as React from "react"
import { PlusIcon, ShieldCheckIcon, TrashIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Tile } from "@/components/board"
import { ConfirmAction, ErrorNote, Loading, StateMark } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useHz } from "@/hooks/use-api"
import { errorMessage, hzCall } from "@/lib/client"
import type { FirewallInfo, FirewallRule, HzAction } from "@/lib/hz-types"
import { isCidr } from "@/lib/ip"
import { useServer } from "./context"

const ANYWHERE = ["0.0.0.0/0", "::/0"]
const PROTOCOLS = ["tcp", "udp", "icmp", "esp", "gre"] as const

const PRESETS: { label: string; rules: FirewallRule[] }[] = [
  { label: "SSH", rules: [{ direction: "in", protocol: "tcp", port: "22", source_ips: ANYWHERE, description: "SSH" }] },
  {
    label: "Web",
    rules: [
      { direction: "in", protocol: "tcp", port: "80", source_ips: ANYWHERE, description: "HTTP" },
      { direction: "in", protocol: "tcp", port: "443", source_ips: ANYWHERE, description: "HTTPS" },
    ],
  },
  { label: "Ping", rules: [{ direction: "in", protocol: "icmp", source_ips: ANYWHERE, description: "Ping" }] },
]

const DEFAULT_RULES: FirewallRule[] = [...PRESETS[0].rules, ...PRESETS[2].rules]

function addressesText(ips: string[] | undefined) {
  if (!ips?.length) return "—"
  const set = new Set(ips)
  if (set.size === 2 && ANYWHERE.every((a) => set.has(a))) return "Anywhere"
  if (set.size === 1 && set.has("0.0.0.0/0")) return "Any IPv4"
  if (set.size === 1 && set.has("::/0")) return "Any IPv6"
  return ips.join(", ")
}

function portText(rule: FirewallRule) {
  if (rule.protocol !== "tcp" && rule.protocol !== "udp") return "—"
  if (!rule.port || rule.port === "any" || rule.port === "1-65535") return "All"
  return rule.port
}

function RulesTable({ rules, direction }: { rules: FirewallRule[]; direction: "in" | "out" }) {
  const list = rules.filter((r) => r.direction === direction)
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{direction === "in" ? "Incoming" : "Outgoing"}</p>
      {list.length === 0 ? (
        <p className="bg-tile px-3 py-2.5 text-sm text-muted-foreground">
          {direction === "in" ? "Nothing may come in: every incoming connection is dropped." : "No rules: all outgoing traffic is allowed."}
        </p>
      ) : (
        <div className="bg-tile">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-3">Protocol</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>{direction === "in" ? "From" : "To"}</TableHead>
                <TableHead className="hidden pr-3 sm:table-cell">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="py-2.5 pl-3 uppercase">{r.protocol}</TableCell>
                  <TableCell className="tabular">{portText(r)}</TableCell>
                  <TableCell className="max-w-72 break-all">{addressesText(direction === "in" ? r.source_ips : r.destination_ips)}</TableCell>
                  <TableCell className="hidden pr-3 text-muted-foreground sm:table-cell">{r.description || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export function Firewall() {
  const { project, id, can, isAdmin, refresh, watch } = useServer()
  const data = useHz<{ firewalls: FirewallInfo[] }>(project, id, "firewalls")
  const [editing, setEditing] = React.useState<{ firewall: FirewallInfo | null; rules: FirewallRule[] } | null>(null)
  const allowed = can("firewall")
  const firewalls = data.data?.firewalls ?? []

  if (data.isLoading && !data.data) return <Loading />

  return (
    <div className="grid gap-2">
      <Tile className="lg:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="display text-3xl">Firewall</h2>
            <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
              Hetzner&apos;s firewall filters traffic before it reaches the server. Incoming traffic is dropped unless a rule
              allows it; outgoing traffic is allowed until you add an outgoing rule.
            </p>
          </div>
          {allowed && !firewalls.some((f) => f.exclusive) ? (
            <Button className="shrink-0" onClick={() => setEditing({ firewall: null, rules: DEFAULT_RULES })}>
              <ShieldCheckIcon /> Create a firewall
            </Button>
          ) : null}
        </div>
        {!firewalls.length && !data.error ? (
          <p className="mt-6 bg-warning/10 p-3 text-sm text-warning">
            No firewall protects this server. Every port a program listens on can be reached from the internet.
          </p>
        ) : null}
      </Tile>
      <ErrorNote error={data.error} />

      {firewalls.map((fw) => {
        const editable = allowed && (fw.exclusive || isAdmin)
        return (
          <Tile key={fw.id} className="lg:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="display text-2xl break-words">{fw.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {fw.exclusive
                    ? "Protects only this server."
                    : `Shared: it protects ${fw.appliedCount} servers${isAdmin ? "" : ", so only an admin can change it"}.`}
                </p>
                {fw.status ? <StateMark state={fw.status} className="mt-2" label={fw.status === "applied" ? "Applied" : "Being applied"} /> : null}
              </div>
              {editable ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setEditing({ firewall: fw, rules: fw.rules })}>
                    Edit rules
                  </Button>
                  <ConfirmAction
                    title={fw.exclusive ? `Delete ${fw.name}?` : `Take ${fw.name} off this server?`}
                    description={
                      fw.exclusive
                        ? "The server is no longer filtered: everything listening on it can be reached from the internet."
                        : "Only this server stops using it; the other servers keep it."
                    }
                    confirmLabel={fw.exclusive ? "Delete firewall" : "Remove from server"}
                    destructive
                    onConfirm={async () => {
                      const res = await hzCall<{ deleted: boolean }>(project, id, "DELETE", `firewalls/${fw.id}`)
                      toast.success(res.deleted ? "Firewall deleted" : "Firewall removed from this server")
                      refresh()
                      await data.mutate()
                    }}
                  >
                    <Button variant="ghost" className="text-destructive hover:text-destructive">
                      {fw.exclusive ? "Delete" : "Remove"}
                    </Button>
                  </ConfirmAction>
                </div>
              ) : null}
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <RulesTable rules={fw.rules} direction="in" />
              <RulesTable rules={fw.rules} direction="out" />
            </div>
          </Tile>
        )
      })}

      <RulesDialog
        state={editing}
        onClose={() => setEditing(null)}
        onSaved={async (actions) => {
          for (const a of actions) watch(a, { pending: "Applying the firewall…", success: "Firewall applied" }, () => data.mutate())
          refresh()
          await data.mutate()
        }}
      />
    </div>
  )
}

type Row = { key: number; direction: "in" | "out"; protocol: FirewallRule["protocol"]; port: string; ips: string; description: string }

let rowKey = 0
function toRow(r: FirewallRule): Row {
  const ips = r.direction === "in" ? r.source_ips : r.destination_ips
  return {
    key: ++rowKey,
    direction: r.direction,
    protocol: r.protocol,
    port: r.port === "any" ? "1-65535" : (r.port ?? (r.protocol === "tcp" || r.protocol === "udp" ? "1-65535" : "")),
    ips: (ips ?? []).join(", "),
    description: r.description ?? "",
  }
}

function rowProblem(row: Row): string | null {
  const ports = row.protocol === "tcp" || row.protocol === "udp"
  if (ports) {
    if (!/^\d{1,5}(-\d{1,5})?$/.test(row.port)) return "Port: a number such as 22 or a range such as 1024-5000."
    const [a, b] = row.port.split("-").map(Number)
    if (a < 1 || a > 65535 || (b !== undefined && (b > 65535 || b < a))) return "Ports go from 1 to 65535."
  }
  const ips = row.ips.split(/[\s,]+/).filter(Boolean)
  if (!ips.length) return "Add at least one address range, or press Anywhere."
  const bad = ips.find((ip) => !isCidr(ip))
  if (bad) return `${bad} is not a range like 203.0.113.0/24 or 203.0.113.7/32.`
  return null
}

function fromRow(row: Row): FirewallRule {
  const ips = row.ips.split(/[\s,]+/).filter(Boolean)
  const rule: FirewallRule = { direction: row.direction, protocol: row.protocol, description: row.description.trim() || null }
  if (row.protocol === "tcp" || row.protocol === "udp") rule.port = row.port
  if (row.direction === "in") rule.source_ips = ips
  else rule.destination_ips = ips
  return rule
}

function RulesDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { firewall: FirewallInfo | null; rules: FirewallRule[] } | null
  onClose: () => void
  onSaved: (actions: HzAction[]) => void
}) {
  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        {state ? <RulesForm key={state.firewall?.id ?? "new"} state={state} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function RulesForm({
  state,
  onClose,
  onSaved,
}: {
  state: { firewall: FirewallInfo | null; rules: FirewallRule[] }
  onClose: () => void
  onSaved: (actions: HzAction[]) => void
}) {
  const { project, id } = useServer()
  const [rows, setRows] = React.useState<Row[]>(() => state.rules.map(toRow))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<unknown>(null)
  const problems = rows.map(rowProblem)
  const firstProblem = problems.findIndex(Boolean)

  const update = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const rules = rows.map(fromRow)
      if (state.firewall) {
        const res = await hzCall<{ actions?: HzAction[] }>(project, id, "PUT", `firewalls/${state.firewall.id}`, { rules })
        onSaved(res.actions ?? [])
        toast.success("Rules saved")
      } else {
        const res = await hzCall<{ actions?: HzAction[] }>(project, id, "POST", "firewalls", { rules })
        onSaved(res.actions ?? [])
        toast.success("Firewall created")
      }
      onClose()
    } catch (e) {
      setError(e)
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="display text-2xl">{state.firewall ? state.firewall.name : "New firewall"}</DialogTitle>
        <DialogDescription className="prose-serif text-[15px]">
          Each rule lets one kind of traffic through. Ranges are CIDR blocks: 203.0.113.7/32 is one address, 0.0.0.0/0 and
          ::/0 are everything.
        </DialogDescription>
      </DialogHeader>
      <div className="my-4 grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
        {rows.length === 0 ? <p className="bg-muted p-3 text-sm text-muted-foreground">No rules: nothing may come in.</p> : null}
        {rows.map((row, i) => {
          const ports = row.protocol === "tcp" || row.protocol === "udp"
          return (
            <div key={row.key} className="grid gap-2 bg-muted p-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-[7rem_7rem_8rem_1fr_auto]">
                <Select value={row.direction} onValueChange={(v) => update(row.key, { direction: v as Row["direction"] })}>
                  <SelectTrigger className="w-full bg-background" aria-label="Direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Incoming</SelectItem>
                    <SelectItem value="out">Outgoing</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={row.protocol}
                  onValueChange={(v) => {
                    const protocol = v as Row["protocol"]
                    update(row.key, { protocol, port: protocol === "tcp" || protocol === "udp" ? row.port || "1-65535" : "" })
                  }}
                >
                  <SelectTrigger className="w-full bg-background" aria-label="Protocol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROTOCOLS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={ports ? row.port : ""}
                  disabled={!ports}
                  placeholder={ports ? "22 or 1024-5000" : "No ports"}
                  aria-label="Port"
                  className="bg-background tabular"
                  onChange={(e) => update(row.key, { port: e.target.value.replace(/[^\d-]/g, "") })}
                />
                <div className="col-span-2 flex gap-1 md:col-span-1">
                  <Input
                    value={row.ips}
                    placeholder={row.direction === "in" ? "From: 203.0.113.0/24, ::/0" : "To: 0.0.0.0/0"}
                    aria-label={row.direction === "in" ? "From addresses" : "To addresses"}
                    className="bg-background tabular"
                    onChange={(e) => update(row.key, { ips: e.target.value })}
                  />
                  <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => update(row.key, { ips: ANYWHERE.join(", ") })}>
                    Anywhere
                  </Button>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Delete rule"
                  className="justify-self-end"
                  onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                >
                  <TrashIcon />
                </Button>
              </div>
              <Input
                value={row.description}
                placeholder="Note, for example Office VPN"
                maxLength={255}
                aria-label="Note"
                className="bg-background"
                onChange={(e) => update(row.key, { description: e.target.value })}
              />
              {problems[i] && i === firstProblem ? <p className="text-[13px] text-destructive">{problems[i]}</p> : null}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setRows((list) => [...list, toRow({ direction: "in", protocol: "tcp", port: "", source_ips: ANYWHERE })])}
        >
          <PlusIcon /> Rule
        </Button>
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRows((list) => [...list, ...preset.rules.map(toRow)])}
          >
            <PlusIcon /> {preset.label}
          </Button>
        ))}
      </div>
      <ErrorNote error={error} className="mt-4" />
      <DialogFooter className="mt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={busy || firstProblem !== -1 || rows.length > 50}>
          {busy ? <Spinner /> : null} {state.firewall ? "Save rules" : "Create and apply"}
        </Button>
      </DialogFooter>
    </>
  )
}
