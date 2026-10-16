"use client"

import * as React from "react"
import { toast } from "sonner"
import { Board, Facts, Tile, TileLabel } from "@/components/board"
import { CopyButton, ErrorNote, Loading, Notice, StateMark, useAction } from "@/components/common"
import { BackLink, RenameButton } from "@/components/server/header"
import { SectionTitle } from "@/components/server/parts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDns } from "@/hooks/use-api"
import { api, dnsCall, dnsUrl, errorMessage } from "@/lib/client"
import { formatTtl, MAX_TTL, MIN_TTL } from "@/lib/dns-records"
import { formatDateTime, humanize, timeAgo } from "@/lib/format"
import type { HzAction } from "@/lib/hz-types"
import type { Dict } from "@/lib/summary"
import { RecordsEditor } from "./records-editor"

export type Zone = Dict & {
  name: string
  mode: "primary" | "secondary"
  ttl: number
  status: string
  record_count: number
  registrar: string
  created: string
  authoritative_nameservers: { assigned: string[]; delegated: string[]; delegation_last_check: string | null; delegation_status: string }
  primary_nameservers: { address: string; port: number }[]
  protection: { delete: boolean }
}

/** Follows Hetzner actions with a toast until they finish, then loads the zone again. */
export type Watch = (actions: HzAction | HzAction[] | undefined, done: string) => Promise<void>

type Props = { project: number; id: number; zone: Zone; canChange: boolean; watch: Watch }

const DELEGATION: Record<string, { state: string | null; label: string }> = {
  valid: { state: "ok", label: "Delegated to Hetzner" },
  "partially-valid": { state: null, label: "Partly delegated to Hetzner" },
  invalid: { state: "error", label: "Not delegated to Hetzner" },
  lame: { state: "error", label: "Delegated, but not answered" },
  unregistered: { state: "error", label: "The domain is not registered" },
  unknown: { state: null, label: "Delegation not checked yet" },
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function ZoneView({
  project,
  projectName,
  id,
  isAdmin,
  canChange,
  canRename,
  nickname: initialNickname,
}: {
  project: number
  projectName: string
  id: number
  isAdmin: boolean
  canChange: boolean
  canRename: boolean
  nickname: string | null
}) {
  const [nickname, setNickname] = React.useState(initialNickname)
  const detail = useDns<{ zone: Zone }>(project, id, "", undefined, {
    refreshInterval: (d) => (d?.zone?.status === "updating" ? 5000 : 60_000),
  })
  const { mutate } = detail
  const refresh = React.useCallback(() => void mutate(), [mutate])

  const watch = React.useCallback<Watch>(
    async (actions, done) => {
      const list = (Array.isArray(actions) ? actions : [actions]).filter((a): a is HzAction => !!a?.id)
      const toastId = list.some((a) => a.status === "running") ? toast.loading("Hetzner is working on it…") : undefined
      let failure: string | null = null
      for (const action of list) {
        let current = action
        for (let i = 0; current.status === "running" && i < 120; i++) {
          await sleep(1500)
          try {
            current = (await api<{ action: HzAction }>(dnsUrl(project, id, `actions/${action.id}`))).action
          } catch {
            break
          }
        }
        if (current.status === "error") failure = current.error?.message ?? "Hetzner reported an error."
      }
      if (failure) toast.error(failure, { id: toastId })
      else toast.success(done, { id: toastId })
      refresh()
    },
    [project, id, refresh]
  )

  const zone = detail.data?.zone
  if (!zone) {
    return (
      <>
        <BackLink isAdmin={isAdmin} />
        {detail.error ? <ErrorNote error={detail.error} /> : <Loading label="Loading the zone from Hetzner…" />}
      </>
    )
  }

  const ns = zone.authoritative_nameservers
  const delegation = DELEGATION[ns?.delegation_status] ?? DELEGATION.unknown
  const props: Props = { project, id, zone, canChange, watch }

  return (
    <>
      <BackLink isAdmin={isAdmin} />
      <Board className="mb-8">
        <Tile className="col-span-12 flex flex-col justify-between gap-8 lg:col-span-6 lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[13px] text-muted-foreground">
              DNS zone · {projectName} · <span className="tabular">#{id}</span>
            </p>
            {canRename ? <RenameButton kind="dns" project={project} id={id} hetznerName={zone.name} nickname={nickname} onSaved={setNickname} /> : null}
          </div>
          <div>
            <h1 className="display text-4xl break-words md:text-6xl">{nickname || zone.name}</h1>
            {nickname ? <p className="mt-3 text-sm text-muted-foreground">Domain: {zone.name}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <StateMark state={zone.status} label={zone.status === "ok" ? "Up to date" : humanize(zone.status)} />
            <span>
              {zone.mode === "secondary" ? "Secondary zone" : "Primary zone"} · default TTL {formatTtl(zone.ttl)}
            </span>
          </div>
        </Tile>
        <Tile tone="tile" className="col-span-12 flex flex-col justify-between gap-6 sm:col-span-6 lg:col-span-3">
          <TileLabel>Records</TileLabel>
          <div>
            <p className="display text-6xl tabular">{zone.record_count ?? "—"}</p>
            <p className="mt-2 text-sm text-muted-foreground" title={formatDateTime(zone.created)}>
              Zone created {timeAgo(zone.created)}
            </p>
          </div>
        </Tile>
        <Tile tone="tile" className="col-span-12 flex flex-col justify-between gap-6 sm:col-span-6 lg:col-span-3">
          <TileLabel>Name servers</TileLabel>
          <div className="min-w-0">
            <ul className="grid gap-0.5">
              {(ns?.assigned ?? []).map((n) => (
                <li key={n} className="flex items-center gap-1 text-base break-all">
                  {n}
                  <CopyButton value={n} label="Copy name server" className="size-6" />
                </li>
              ))}
            </ul>
            <StateMark state={delegation.state} label={delegation.label} className="mt-3 text-muted-foreground" />
          </div>
        </Tile>
      </Board>

      <Tabs defaultValue="records">
        <div className="no-scrollbar mb-5 overflow-x-auto pb-1.5">
          <TabsList variant="line" className="h-10">
            {["Records", "Settings", "History"].map((t) => (
              <TabsTrigger key={t} value={t.toLowerCase()} className="px-3 text-sm">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="records">
          <RecordsEditor {...props} />
        </TabsContent>
        <TabsContent value="settings">
          <Settings key={zone.ttl} {...props} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="history">
          <History project={project} id={id} />
        </TabsContent>
      </Tabs>
    </>
  )
}

/* ------------------------------------------------------------------ settings */

function Settings({ project, id, zone, canChange, isAdmin, watch }: Props & { isAdmin: boolean }) {
  const [ttl, setTtl] = React.useState(String(zone.ttl))
  const { busy, run } = useAction()
  const ns = zone.authoritative_nameservers
  const facts: [string, React.ReactNode][] = [
    ["Registrar", humanize(zone.registrar)],
    ["Name servers at the registry", ns?.delegated?.length ? ns.delegated.join(", ") : "None found"],
    ["Last checked", ns?.delegation_last_check ? timeAgo(ns.delegation_last_check) : "Not yet"],
  ]
  if (zone.mode === "secondary") {
    facts.push(["Primary name servers", zone.primary_nameservers?.map((p) => `${p.address}:${p.port}`).join(", ") || "—"])
  }
  return (
    <Board>
      <Tile className="col-span-12 lg:col-span-7 lg:p-8">
        <SectionTitle>Default TTL</SectionTitle>
        <p className="prose-serif text-base text-muted-foreground">
          How long resolvers may keep an answer from this zone, for every record without a TTL of its own. Now {formatTtl(zone.ttl)}.
        </p>
        {canChange ? (
          <form
            className="mt-6 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const value = Number(ttl)
              if (!Number.isInteger(value) || value < MIN_TTL || value > MAX_TTL) {
                toast.error(`The TTL is a whole number of seconds, at least ${MIN_TTL}.`)
                return
              }
              run("ttl", async () => {
                const res = await dnsCall<{ action?: HzAction }>(project, id, "POST", "ttl", { ttl: value })
                void watch(res.action, `The default TTL is ${formatTtl(value)}`)
              })
            }}
          >
            <label className="grid gap-1 text-sm">
              Seconds
              <Input type="number" min={MIN_TTL} max={MAX_TTL} value={ttl} onChange={(e) => setTtl(e.target.value)} className="w-36 bg-background tabular" />
            </label>
            <Button type="submit" disabled={!!busy || Number(ttl) === zone.ttl}>
              {busy === "ttl" ? <Spinner /> : null} Save
            </Button>
          </form>
        ) : null}
      </Tile>
      <Tile tone="tile" className="col-span-12 lg:col-span-5 lg:p-8">
        <SectionTitle>Delegation</SectionTitle>
        <Facts className="sm:grid-cols-1" items={facts} />
        <p className="mt-6 text-[13px] text-muted-foreground">The zone answers for the whole internet once the domain&apos;s registrar names the name servers shown above.</p>
      </Tile>
      {isAdmin ? <Protection project={project} id={id} zone={zone} watch={watch} /> : null}
    </Board>
  )
}

function Protection({ project, id, zone, watch }: Omit<Props, "canChange">) {
  const { busy, run } = useAction()
  return (
    <Tile tone="tile" className="col-span-12 lg:col-span-5 lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <SectionTitle>Protection</SectionTitle>
        {busy ? (
          <Spinner />
        ) : (
          <Switch
            checked={zone.protection?.delete === true}
            aria-label="Protect the DNS zone"
            onCheckedChange={(enabled) =>
              run("protect", async () => {
                const res = await dnsCall<{ action?: HzAction }>(project, id, "POST", "protection", { enabled })
                void watch(res.action, enabled ? "The zone is protected" : "Protection is off")
              })
            }
          />
        )}
      </div>
      <p className="prose-serif text-base text-muted-foreground">While it is on, nobody can delete the zone in the Hetzner Console. Only admins see this.</p>
    </Tile>
  )
}

/* ------------------------------------------------------------------ history */

function History({ project, id }: { project: number; id: number }) {
  const data = useDns<{ actions: HzAction[] }>(project, id, "actions", undefined, {
    refreshInterval: (d) => (d?.actions?.some((a) => a.status === "running") ? 3000 : 0),
  })
  if (data.isLoading && !data.data) return <Loading />
  const actions = data.data?.actions ?? []
  return (
    <div className="grid gap-2">
      <ErrorNote error={data.error} />
      {actions.some((a) => a.status === "running") ? <Notice tone="info">Hetzner is working on this zone right now.</Notice> : null}
      {actions.length ? (
        <Tile className="p-0">
          <ol className="grid">
            {actions.map((a, i) => (
              <li key={a.id} className={i % 2 ? "bg-tile/50 px-5 py-3" : "px-5 py-3"}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{humanize(a.command)}</p>
                    <p className="text-[13px] text-muted-foreground" title={formatDateTime(a.started)}>
                      {timeAgo(a.started)}
                    </p>
                  </div>
                  <StateMark state={a.status} label={a.status === "running" ? `Running, ${a.progress}%` : a.status === "success" ? "Done" : "Failed"} />
                </div>
                {a.error ? <p className="mt-1 text-[13px] text-destructive">{errorMessage(new Error(a.error.message))}</p> : null}
              </li>
            ))}
          </ol>
        </Tile>
      ) : (
        <Tile>
          <p className="prose-serif text-base text-muted-foreground">Nothing has happened to this zone yet.</p>
        </Tile>
      )}
    </div>
  )
}
