/** Shared between server and client: no Node imports here. */

export type Dict = Record<string, unknown>

export const SERVER_STATUSES = [
  "running",
  "initializing",
  "starting",
  "stopping",
  "off",
  "deleting",
  "migrating",
  "rebuilding",
  "unknown",
] as const

/** Statuses a server passes through on its own; the page polls while it is in one. */
export const TRANSITIONAL = ["initializing", "starting", "stopping", "deleting", "migrating", "rebuilding"]

/**
 * Cloud servers come from a Hetzner Cloud project, dedicated servers from a Robot
 * account. A dedicated server's number can equal a cloud server's ID, so a server
 * is always named by its kind, its project or account, and its ID.
 */
export const SERVER_KINDS = ["cloud", "dedicated"] as const
export type ServerKind = (typeof SERVER_KINDS)[number]

/** A server's key in maps and lists, "dedicated:2:1234567". */
export function serverKey(kind: ServerKind, projectId: number, serverId: number) {
  return `${kind}:${projectId}:${serverId}`
}

export type ServerSummary = {
  kind: ServerKind
  /** The cloud server's ID, or the dedicated server's number. */
  id: number
  /** The Hetzner Cloud project (API token) the server belongs to, or for a dedicated server its Robot account. */
  projectId: number
  projectName: string
  /** The server's name at Hetzner. */
  name: string
  status: string | null
  ipv4: string | null
  /** The IPv6 network, for example 2a01:4f8:c0c:1234::/64. */
  ipv6: string | null
  /** "Falkenstein · fsn1" */
  location: string | null
  /** ISO country code of the location, for the flag. */
  country: string | null
  /** Server type name, for example CX23. */
  type: string | null
  /** "2 vCPU · 4 GB RAM · 40 GB disk" */
  spec: string | null
  os: string | null
  arch: string | null
  created: string | null
  traffic: { out: number | null; in: number | null; included: number | null }
  rescue: boolean
  /** Monthly price including VAT, only filled in for admins. Robot does not report one for dedicated servers. */
  price?: number | null
  /** Whether a dedicated server is cancelled at Hetzner, only filled in for admins. */
  cancelled?: boolean
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function get<T = unknown>(obj: unknown, path: string): T | undefined {
  let cur: unknown = obj
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined
    cur = (cur as Dict)[key]
  }
  return cur as T | undefined
}

/** The server's location. Servers carried it under datacenter.location until July 2026. */
export function locationOf(raw: Dict): Dict {
  return ((raw.location ?? get(raw, "datacenter.location") ?? {}) as Dict) || {}
}

/** "4" → "4 GB", "0.5" → "512 MB" */
export function gigabytes(value: unknown): string | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n < 1 ? `${Math.round(n * 1024)} MB` : `${Number.isInteger(n) ? n : n.toFixed(1)} GB`
}

export function osName(image: unknown): string | null {
  const img = (image ?? {}) as Dict
  const type = str(img.type)
  if (type === "system" || type === "app") return str(img.description) ?? str(img.name)
  const flavor = str(img.os_flavor)
  const version = str(img.os_version)
  if (flavor && flavor !== "unknown") return [flavor.charAt(0).toUpperCase() + flavor.slice(1), version].filter(Boolean).join(" ")
  return type === "snapshot" ? "From a snapshot" : type === "backup" ? "From a backup" : null
}

export function typeSpec(serverType: unknown): string | null {
  const t = (serverType ?? {}) as Dict
  const parts = [
    num(t.cores) ? `${t.cores} vCPU` : null,
    gigabytes(t.memory) ? `${gigabytes(t.memory)} RAM` : null,
    gigabytes(t.disk) ? `${gigabytes(t.disk)} disk` : null,
  ].filter(Boolean)
  return parts.join(" · ") || null
}

/** The monthly price of the server's type in its location, including VAT. */
export function monthlyPrice(raw: Dict): number | null {
  const prices = get<Dict[]>(raw, "server_type.prices")
  const where = str(locationOf(raw).name)
  if (!Array.isArray(prices) || !where) return null
  const match = prices.find((p) => p.location === where)
  const gross = Number(get(match, "price_monthly.gross"))
  return Number.isFinite(gross) ? gross : null
}

export function summarize(raw: Dict, project: { id: number; name: string }, opts: { price?: boolean } = {}): ServerSummary {
  const loc = locationOf(raw)
  const type = (raw.server_type ?? {}) as Dict
  const net = (raw.public_net ?? {}) as Dict
  const city = str(loc.city)
  const name = str(loc.name)
  return {
    kind: "cloud",
    id: Number(raw.id),
    projectId: project.id,
    projectName: project.name,
    name: str(raw.name) ?? String(raw.id ?? ""),
    status: str(raw.status),
    ipv4: str(get(net, "ipv4.ip")),
    ipv6: str(get(net, "ipv6.ip")),
    location: [city, name].filter(Boolean).join(" · ") || null,
    country: str(loc.country),
    type: str(type.name)?.toUpperCase() ?? null,
    spec: typeSpec(type),
    os: osName(raw.image),
    arch: str(type.architecture),
    created: str(raw.created),
    traffic: { out: num(raw.outgoing_traffic), in: num(raw.ingoing_traffic), included: num(raw.included_traffic) },
    rescue: raw.rescue_enabled === true,
    ...(opts.price ? { price: monthlyPrice(raw) } : {}),
  }
}

/** Removes what only admins should see: prices, labels and hints about other servers. */
export function stripForUser(server: Dict): Dict {
  const out: Dict = { ...server, labels: {} }
  if (out.server_type && typeof out.server_type === "object") {
    out.server_type = { ...(out.server_type as Dict), prices: [] }
  }
  if (out.image && typeof out.image === "object") {
    out.image = { ...(out.image as Dict), created_from: null, labels: {} }
  }
  if (out.placement_group && typeof out.placement_group === "object") {
    const pg = out.placement_group as Dict
    out.placement_group = { id: pg.id, name: pg.name, type: pg.type, created: pg.created, labels: {}, servers: [] }
  }
  return out
}
