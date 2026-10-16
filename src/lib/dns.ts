import { formatTtl } from "./dns-records"
import { hzFetchAll } from "./hetzner"
import type { Dict, ServerSummary } from "./summary"

/**
 * DNS zones live in a Hetzner project like cloud servers and are served by the
 * same Cloud API (api.hetzner.cloud/v1/zones) with the project token. The list
 * of a project is cached for half a minute and shared by everyone.
 */

type CacheEntry = { at: number; raw: Dict[] }

const globals = globalThis as unknown as {
  __hzdockZones?: Map<number, CacheEntry>
  __hzdockZonesInFlight?: Map<number, Promise<Dict[]>>
}

const TTL = 30_000

export async function projectZones(projectId: number, refresh = false): Promise<Dict[]> {
  const cache = (globals.__hzdockZones ??= new Map())
  const inFlight = (globals.__hzdockZonesInFlight ??= new Map())
  const hit = cache.get(projectId)
  if (!refresh && hit && Date.now() - hit.at < TTL) return hit.raw
  const pending = inFlight.get(projectId)
  if (pending) return pending
  const load = hzFetchAll<Dict>(projectId, "/zones", "zones")
    .then((raw) => {
      raw.sort((a, b) => String(a.name).localeCompare(String(b.name)))
      cache.set(projectId, { at: Date.now(), raw })
      return raw
    })
    .finally(() => inFlight.delete(projectId))
  inFlight.set(projectId, load)
  return load
}

export function invalidateZones(projectId: number) {
  globals.__hzdockZones?.delete(projectId)
}

export function cachedZoneName(projectId: number, zoneId: number): string | null {
  const raw = globals.__hzdockZones?.get(projectId)?.raw.find((z) => Number(z.id) === zoneId)
  return typeof raw?.name === "string" ? raw.name : null
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function summarizeZone(raw: Dict, project: { id: number; name: string }): ServerSummary {
  const records = num(raw.record_count)
  const ttl = num(raw.ttl)
  return {
    kind: "dns",
    id: Number(raw.id),
    projectId: project.id,
    projectName: project.name,
    name: str(raw.name) ?? `Zone ${raw.id}`,
    status: str(raw.status),
    ipv4: null,
    ipv6: null,
    host: str(raw.name),
    location: null,
    country: null,
    type: raw.mode === "secondary" ? "Secondary" : "Primary",
    spec:
      [records === null ? null : `${records} record${records === 1 ? "" : "s"}`, ttl === null ? null : `TTL ${formatTtl(ttl)}`]
        .filter(Boolean)
        .join(" · ") || null,
    os: null,
    arch: null,
    created: str(raw.created),
    traffic: { out: null, in: null, included: null },
    rescue: false,
  }
}

/** Removes what only admins should see: labels, and the TSIG keys of a secondary zone's primaries. */
export function stripZone(zone: Dict): Dict {
  const primaries = Array.isArray(zone.primary_nameservers) ? (zone.primary_nameservers as Dict[]) : []
  return { ...zone, labels: {}, primary_nameservers: primaries.map((p) => ({ address: p.address, port: p.port })) }
}

export function stripRRSet(rrset: Dict): Dict {
  return { ...rrset, labels: {} }
}
