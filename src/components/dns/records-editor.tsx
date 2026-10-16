"use client"

import * as React from "react"
import { LockSimpleIcon, MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Tile } from "@/components/board"
import { ConfirmAction, ErrorNote, Loading, Notice, useAction } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useDns } from "@/hooks/use-api"
import { dnsCall } from "@/lib/client"
import { formatTtl, MAX_TTL, MIN_TTL, nameProblem, RECORD_HINTS, RECORD_TYPES, valueProblem, type RecordType } from "@/lib/dns-records"
import type { HzAction } from "@/lib/hz-types"
import type { Watch, Zone } from "./zone-view"

type DnsRecord = { value: string; comment?: string }
export type RRSet = { id: string; name: string; type: string; ttl: number | null; records: DnsRecord[]; protection?: { change: boolean } }
type Body = { name: string; type: RecordType; ttl: number | null; records: DnsRecord[] }
type Save = (method: "POST" | "PUT", body: Body, done: string) => Promise<void>

const editableType = (type: string) => ((RECORD_TYPES as readonly string[]).includes(type) ? (type as RecordType) : null)
const ttlOf = (text: string) => (text.trim() ? Number(text) : null)

/** The lines of a text box as records, keeping the comment of every value that stays. */
function toRecords(text: string, old: DnsRecord[] = []): DnsRecord[] {
  const comments = new Map(old.map((r) => [r.value, r.comment]))
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((value) => (comments.get(value) ? { value, comment: comments.get(value) } : { value }))
}

/** "www" for www.example.com and "@" for example.com itself, as Hetzner names records. */
function relativeName(input: string, zone: string) {
  const name = input.trim().toLowerCase().replace(/\.$/, "")
  if (name === zone) return "@"
  return name.endsWith(`.${zone}`) ? name.slice(0, -zone.length - 1) : name
}

/** Checks a record set before it goes to Hetzner, which checks it again. */
function problem(body: Body, ttlText: string): string | null {
  const name = nameProblem(body.name)
  if (name) return name
  if (ttlText.trim() && !(Number.isInteger(body.ttl) && body.ttl! >= MIN_TTL && body.ttl! <= MAX_TTL)) {
    return `The TTL is a whole number of seconds from ${MIN_TTL}, or empty for the zone's default.`
  }
  if (!body.records.length) return "Add at least one value."
  if (body.type === "CNAME" && body.records.length > 1) return "A CNAME record has exactly one value."
  for (const r of body.records) {
    const value = valueProblem(body.type, r.value)
    if (value) return value
  }
  return null
}

const fullName = (name: string, zone: string) => (name === "@" ? zone : `${name}.${zone}`)

export function RecordsEditor({ project, id, zone, canChange, watch }: { project: number; id: number; zone: Zone; canChange: boolean; watch: Watch }) {
  const list = useDns<{ rrsets: RRSet[] }>(project, id, "rrsets")
  const { mutate } = list
  const [query, setQuery] = React.useState("")
  const editable = canChange && zone.mode !== "secondary"
  const rrsets = React.useMemo(() => list.data?.rrsets ?? [], [list.data])
  const q = query.trim().toLowerCase()
  const shown = q ? rrsets.filter((r) => [fullName(r.name, zone.name), r.type, ...r.records.map((x) => x.value)].some((v) => v.toLowerCase().includes(q))) : rrsets

  // The list changes at once; the toast follows Hetzner until the name servers have it.
  const save = React.useCallback<Save>(
    async (method, body, done) => {
      const res = await dnsCall<{ action?: HzAction; actions?: HzAction[] }>(project, id, method, "rrsets", body)
      await mutate()
      void watch(res.actions ?? res.action, done).then(() => mutate())
    },
    [project, id, mutate, watch]
  )

  const remove = async (r: RRSet) => {
    const res = await dnsCall<{ action?: HzAction }>(project, id, "POST", "rrsets/delete", { name: r.name, type: r.type })
    await mutate()
    void watch(res.action, `The ${r.type} record ${fullName(r.name, zone.name)} is deleted`).then(() => mutate())
  }

  return (
    <div className="grid gap-2">
      <Tile className="lg:p-8">
        <h2 className="display text-3xl">Records</h2>
        <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
          Names are relative to the zone: @ stands for the zone itself, and www for www.{zone.name}. A change reaches Hetzner&apos;s name servers within moments;
          resolvers that asked before may keep the old answer for as long as the record&apos;s TTL.
        </p>
        {zone.mode === "secondary" ? (
          <Notice tone="info" className="mt-6">
            This is a secondary zone: its records are copied from its primary name servers, so they can only be changed there.
          </Notice>
        ) : editable ? (
          <AddRecord zone={zone} rrsets={rrsets} onSave={save} />
        ) : null}
      </Tile>
      <ErrorNote error={list.error} />
      {rrsets.length > 8 ? (
        <div className="relative max-w-sm">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a record" aria-label="Find a record" className="bg-card pl-9" />
        </div>
      ) : null}
      {list.isLoading && !list.data ? (
        <Loading />
      ) : shown.length ? (
        <ul className="grid gap-2">
          {shown.map((r) => (
            <RecordSet key={r.id} rrset={r} zone={zone} editable={editable} onSave={save} onDelete={remove} />
          ))}
        </ul>
      ) : list.data ? (
        <Tile>
          <p className="prose-serif text-base text-muted-foreground">{q ? "No record matches." : "No records yet."}</p>
        </Tile>
      ) : null}
    </div>
  )
}

function AddRecord({ zone, rrsets, onSave }: { zone: Zone; rrsets: RRSet[]; onSave: Save }) {
  const [name, setName] = React.useState("")
  const [type, setType] = React.useState<RecordType>("A")
  const [ttl, setTtl] = React.useState("")
  const [values, setValues] = React.useState("")
  const { busy, run } = useAction()
  const hint = RECORD_HINTS[type]
  return (
    <form
      className="mt-6 grid max-w-3xl gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const rel = relativeName(name, zone.name)
        // A value for a name and type that already has records joins them.
        const existing = rrsets.find((r) => r.name === rel && r.type === type)
        const added = toRecords(values)
        const records = existing ? [...existing.records, ...added.filter((a) => !existing.records.some((r) => r.value === a.value))] : added
        const body: Body = { name: rel, type, ttl: ttl.trim() ? ttlOf(ttl) : (existing?.ttl ?? null), records }
        const wrong = problem(body, ttl)
        if (wrong) return void toast.error(wrong)
        run("add", async () => {
          const where = fullName(rel, zone.name)
          await onSave(existing ? "PUT" : "POST", body, existing ? `Added to the ${type} record ${where}` : `The ${type} record ${where} is added`)
          setName("")
          setValues("")
          setTtl("")
        })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_10rem]">
        <label className="grid gap-1 text-sm">
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`www, or @ for ${zone.name}`} required className="bg-background" />
        </label>
        <div className="grid gap-1 text-sm">
          <span>Type</span>
          <Select value={type} onValueChange={(v) => setType(v as RecordType)}>
            <SelectTrigger className="w-full bg-background" aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECORD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="grid gap-1 text-sm">
          TTL in seconds
          <Input type="number" min={MIN_TTL} max={MAX_TTL} value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder={`${zone.ttl}, the default`} className="bg-background tabular" />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        Values
        <Textarea value={values} onChange={(e) => setValues(e.target.value)} placeholder={hint.placeholder} rows={2} className="bg-background font-mono text-[13px]" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">{hint.hint}</p>
        <Button type="submit" disabled={!!busy || !values.trim()}>
          {busy === "add" ? <Spinner /> : <PlusIcon />} Add record
        </Button>
      </div>
    </form>
  )
}

function RecordSet({ rrset, zone, editable, onSave, onDelete }: { rrset: RRSet; zone: Zone; editable: boolean; onSave: Save; onDelete: (r: RRSet) => Promise<void> }) {
  const [editing, setEditing] = React.useState(false)
  const [values, setValues] = React.useState("")
  const [ttl, setTtl] = React.useState("")
  const { busy, run } = useAction()
  const type = editableType(rrset.type)
  const locked = rrset.protection?.change === true
  // The zone's own name servers are Hetzner's and stay as they are here.
  const own = rrset.name === "@" && rrset.type === "NS"
  const canEdit = editable && !!type && !locked && !own
  const where = fullName(rrset.name, zone.name)
  return (
    <li className="flex flex-col gap-3 bg-card p-5 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium">
          <span className="bg-tile px-1.5 py-0.5 text-[12px] tabular">{rrset.type}</span>
          <span className="break-all">{rrset.name}</span>
          {rrset.name !== "@" ? <span className="text-[13px] font-normal break-all text-muted-foreground">{where}</span> : null}
          {locked ? <LockSimpleIcon className="size-4 text-muted-foreground" aria-label="Protected" /> : null}
        </p>
        {editing && type ? (
          <form
            className="mt-3 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const body: Body = { name: rrset.name, type, ttl: ttlOf(ttl), records: toRecords(values, rrset.records) }
              const wrong = problem(body, ttl)
              if (wrong) return void toast.error(wrong)
              run("save", async () => {
                await onSave("PUT", body, `The ${type} record ${where} is saved`)
                setEditing(false)
              })
            }}
          >
            <Textarea
              value={values}
              onChange={(e) => setValues(e.target.value)}
              rows={Math.min(8, rrset.records.length + 1)}
              aria-label="Values, one per line"
              className="bg-background font-mono text-[13px]"
            />
            <p className="text-[13px] text-muted-foreground">{RECORD_HINTS[type].hint}</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm">
                TTL in seconds
                <Input type="number" min={MIN_TTL} max={MAX_TTL} value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder={`${zone.ttl}, the default`} className="w-44 bg-background tabular" />
              </label>
              <Button type="submit" disabled={!!busy}>
                {busy === "save" ? <Spinner /> : null} Save
              </Button>
              <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <ul className="mt-2 grid gap-1">
              {rrset.records.map((r) => (
                <li key={r.value} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <code className="bg-tile px-1.5 py-0.5 text-[13px] break-all">{r.value}</code>
                  {r.comment ? <span className="text-[13px] text-muted-foreground">{r.comment}</span> : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted-foreground">
              TTL {rrset.ttl === null ? `${formatTtl(zone.ttl)}, the zone's default` : formatTtl(rrset.ttl)}
              {locked ? " · protected at Hetzner" : ""}
            </p>
          </>
        )}
      </div>
      {canEdit && !editing ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setValues(rrset.records.map((r) => r.value).join("\n"))
              setTtl(rrset.ttl === null ? "" : String(rrset.ttl))
              setEditing(true)
            }}
          >
            Edit
          </Button>
          <ConfirmAction
            title={`Delete the ${rrset.type} record ${where}?`}
            description={`All its values go at once. Resolvers that asked before may keep them for up to ${formatTtl(rrset.ttl ?? zone.ttl)}.`}
            confirmLabel="Delete"
            destructive
            onConfirm={() => onDelete(rrset)}
          >
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
              Delete
            </Button>
          </ConfirmAction>
        </div>
      ) : null}
    </li>
  )
}
