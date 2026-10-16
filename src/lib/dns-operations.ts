import { z } from "zod"
import { stripRRSet, stripZone } from "./dns"
import { formatTtl, MAX_TTL, MIN_TTL, nameProblem, normalizeValue, RECORD_TYPES, valueProblem, type RecordType } from "./dns-records"
import { hzFetchAll, hzRequest } from "./hetzner"
import { HttpError } from "./http"
import type { HzAction } from "./hz-types"
import type { Op, OpContext } from "./operations"
import type { Dict } from "./summary"

/**
 * Everything users can do with a DNS zone. Every call names the zone in its
 * path, so Hetzner itself refuses records of another zone. Record names travel
 * in the body: "@" and "*.dev" are not allowed in the gateway's paths.
 */

const base = (ctx: OpContext) => `/zones/${ctx.serverId}`
// Names are checked against the record name rules first, so they are safe in a path.
const rrsetPath = (ctx: OpContext, name: string, type: string) => `${base(ctx)}/rrsets/${name}/${type}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function call<T = Dict>(ctx: OpContext, method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown, query?: Record<string, string | number>) {
  const { data } = await hzRequest<T>({ projectId: ctx.projectId, method, path, body, query })
  return data
}

async function loadZone(ctx: OpContext): Promise<Dict> {
  if (ctx.raw) return ctx.raw
  const data = await call<{ zone: Dict }>(ctx, "GET", base(ctx))
  ctx.raw = data.zone
  if (typeof data.zone?.name === "string") ctx.serverName = data.zone.name
  return data.zone
}

/** Waits until Hetzner has finished an action, so the next one does not find the zone busy. */
async function settle(ctx: OpContext, action: HzAction | undefined) {
  for (let i = 0; action?.status === "running" && i < 60; i++) {
    await sleep(500)
    action = (await call<{ action: HzAction }>(ctx, "GET", `/zones/actions/${action.id}`)).action
  }
  if (action?.status === "error") throw new HttpError(409, action.error?.message ?? "Hetzner could not change the records.")
}

const Ttl = z.number().int().min(MIN_TTL, `at least ${MIN_TTL} seconds`).max(MAX_TTL)

const Name = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((name, ctx) => {
    const problem = nameProblem(name)
    if (problem) ctx.addIssue({ code: "custom", message: problem })
  })

const Type = z.enum(RECORD_TYPES)

const RRSet = z
  .object({
    name: Name,
    type: Type,
    /** null: the zone's default TTL. Left out on a change: keep the current one. */
    ttl: Ttl.nullable().optional(),
    records: z
      .array(z.object({ value: z.string().max(4000), comment: z.string().trim().max(255).optional() }))
      .min(1, "add at least one value")
      .max(50, "at most 50 values"),
  })
  .superRefine((b, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", path: ["records"], message })
    if (b.type === "CNAME" && b.records.length > 1) return issue("A CNAME record has exactly one value.")
    if (b.type === "CNAME" && b.name === "@") return issue("The zone itself cannot have a CNAME record.")
    for (const r of b.records) {
      const problem = valueProblem(b.type, r.value)
      if (problem) return issue(problem)
    }
    const values = b.records.map((r) => normalizeValue(b.type, r.value))
    if (new Set(values).size !== values.length) issue("Every value can be there only once.")
  })
  .transform((b) => ({
    ...b,
    records: b.records.map((r) => ({ value: normalizeValue(b.type, r.value), ...(r.comment ? { comment: r.comment } : {}) })),
  }))

type RRSetInput = { name: string; type: RecordType; ttl?: number | null; records: { value: string; comment?: string }[] }
type HzRRSet = Dict & { name: string; type: string; ttl: number | null; records: { value: string; comment?: string }[] }

const label = (b: { name: string; type: string }) => `${b.type} record ${b.name}`
const values = (b: RRSetInput) => {
  const text = b.records.map((r) => r.value).join(", ")
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}
/** The zone's own name servers are Hetzner's: only admins change them. */
function guardOwnNameServers(ctx: OpContext) {
  const b = ctx.body as { name: string; type: string }
  if (b.name === "@" && b.type === "NS" && !ctx.isAdmin) throw new HttpError(403, "Only admins can change the zone's own name servers.")
}

const ORDER: string[] = ["SOA", ...RECORD_TYPES]
const typeRank = (t: string) => (ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length)

export const DNS_OPERATIONS: Op[] = [
  /* ---------------------------------------------------------------- reading */
  {
    method: "GET",
    path: "",
    run: async (ctx) => {
      const zone = await loadZone(ctx)
      return { zone: ctx.isAdmin ? zone : stripZone(zone) }
    },
  },
  {
    method: "GET",
    path: "rrsets",
    run: async (ctx) => {
      const rrsets = await hzFetchAll<HzRRSet>(ctx.projectId, `${base(ctx)}/rrsets`, "rrsets")
      // The zone itself ("@") first, then by name and type.
      const nameKey = (name: string) => (name === "@" ? "" : name)
      rrsets.sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)) || typeRank(a.type) - typeRank(b.type))
      return { rrsets: ctx.isAdmin ? rrsets : rrsets.map(stripRRSet) }
    },
  },
  {
    method: "GET",
    path: "actions",
    run: async (ctx) => {
      const page = Math.min(Math.max(Number(ctx.query.get("page")) || 1, 1), 100)
      return call(ctx, "GET", `${base(ctx)}/actions`, undefined, { sort: "id:desc", page, per_page: 25 })
    },
  },
  {
    method: "GET",
    path: "actions/:action",
    run: async (ctx) => {
      const data = await call<{ action: HzAction }>(ctx, "GET", `/zones/actions/${ctx.params.action}`)
      if (!(data.action?.resources ?? []).some((r) => r.type === "zone" && r.id === ctx.serverId)) {
        throw new HttpError(404, "That action does not belong to this zone.")
      }
      return data
    },
  },

  /* ---------------------------------------------------------------- records */
  {
    method: "POST",
    path: "rrsets",
    permission: "dns",
    mutates: true,
    body: RRSet,
    describe: (ctx) => `Add ${label(ctx.body as RRSetInput)}: ${values(ctx.body as RRSetInput)}`,
    run: (ctx) => {
      const b = ctx.body as RRSetInput
      guardOwnNameServers(ctx)
      ctx.detail = { name: b.name, type: b.type, ttl: b.ttl ?? null }
      return call(ctx, "POST", `${base(ctx)}/rrsets`, { name: b.name, type: b.type, ...(b.ttl ? { ttl: b.ttl } : {}), records: b.records })
    },
  },
  {
    method: "PUT",
    path: "rrsets",
    permission: "dns",
    mutates: true,
    body: RRSet,
    describe: (ctx) => `Change ${label(ctx.body as RRSetInput)}: ${values(ctx.body as RRSetInput)}`,
    run: async (ctx) => {
      const b = ctx.body as RRSetInput
      guardOwnNameServers(ctx)
      const path = rrsetPath(ctx, b.name, b.type)
      // Also makes sure the record set exists in this zone.
      const { rrset } = await call<{ rrset: HzRRSet }>(ctx, "GET", path)
      const key = (records: RRSetInput["records"]) => JSON.stringify(records.map((r) => [r.value, r.comment ?? ""]))
      const actions: HzAction[] = []
      if (key(rrset.records ?? []) !== key(b.records)) {
        actions.push((await call<{ action: HzAction }>(ctx, "POST", `${path}/actions/set_records`, { records: b.records })).action)
      }
      if (b.ttl !== undefined && b.ttl !== (rrset.ttl ?? null)) {
        await settle(ctx, actions[0])
        actions.push((await call<{ action: HzAction }>(ctx, "POST", `${path}/actions/change_ttl`, { ttl: b.ttl })).action)
      }
      if (!actions.length) throw new HttpError(400, "Nothing to change.")
      ctx.detail = { name: b.name, type: b.type, ttl: b.ttl ?? null }
      return { actions }
    },
  },
  {
    method: "POST",
    path: "rrsets/delete",
    permission: "dns",
    mutates: true,
    body: z.object({ name: Name, type: Type }),
    describe: (ctx) => `Delete ${label(ctx.body as RRSetInput)}`,
    run: (ctx) => {
      const b = ctx.body as RRSetInput
      guardOwnNameServers(ctx)
      return call(ctx, "DELETE", rrsetPath(ctx, b.name, b.type))
    },
  },
  {
    method: "POST",
    path: "ttl",
    permission: "dns",
    mutates: true,
    body: z.object({ ttl: Ttl }),
    describe: (ctx) => `Set the zone's default TTL to ${formatTtl((ctx.body as { ttl: number }).ttl)}`,
    run: (ctx) => call(ctx, "POST", `${base(ctx)}/actions/change_ttl`, ctx.body),
  },

  /* ---------------------------------------------------------------- admin only */
  {
    method: "POST",
    path: "protection",
    adminOnly: true,
    body: z.object({ enabled: z.boolean() }),
    describe: (ctx) => ((ctx.body as { enabled: boolean }).enabled ? "Protect the DNS zone" : "Remove the DNS zone protection"),
    run: (ctx) => call(ctx, "POST", `${base(ctx)}/actions/change_protection`, { delete: (ctx.body as { enabled: boolean }).enabled }),
  },
]
