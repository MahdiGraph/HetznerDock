import crypto from "node:crypto"
import { hzFetchAll } from "./hetzner"
import type { Dict, ServerSummary } from "./summary"

/**
 * Storage Boxes live in a Hetzner project like cloud servers, but are served by
 * the Hetzner API (api.hetzner.com) with the same project token. The list of a
 * project is cached for half a minute and shared by everyone.
 */

type CacheEntry = { at: number; raw: Dict[] }

const globals = globalThis as unknown as {
  __hzdockBoxes?: Map<number, CacheEntry>
  __hzdockBoxesInFlight?: Map<number, Promise<Dict[]>>
}

const TTL = 30_000

export async function projectStorageBoxes(projectId: number, refresh = false): Promise<Dict[]> {
  const cache = (globals.__hzdockBoxes ??= new Map())
  const inFlight = (globals.__hzdockBoxesInFlight ??= new Map())
  const hit = cache.get(projectId)
  if (!refresh && hit && Date.now() - hit.at < TTL) return hit.raw
  const pending = inFlight.get(projectId)
  if (pending) return pending
  const load = hzFetchAll<Dict>(projectId, "/storage_boxes", "storage_boxes", { sort: "name:asc" }, 5000, "hetzner")
    .then((raw) => {
      cache.set(projectId, { at: Date.now(), raw })
      return raw
    })
    .finally(() => inFlight.delete(projectId))
  inFlight.set(projectId, load)
  return load
}

export function invalidateStorage(projectId: number) {
  globals.__hzdockBoxes?.delete(projectId)
}

export function cachedStorageName(projectId: number, boxId: number): string | null {
  const raw = globals.__hzdockBoxes?.get(projectId)?.raw.find((b) => Number(b.id) === boxId)
  return typeof raw?.name === "string" ? raw.name : null
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

/** "1 TB" for 1099511627776 bytes, the way Hetzner names Storage Box sizes. */
export function boxSize(bytes: number | null): string | null {
  if (!bytes) return null
  const tb = bytes / 1024 ** 4
  return tb >= 1 ? `${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB` : `${Math.round(bytes / 1024 ** 3)} GB`
}

export function summarizeStorage(raw: Dict, project: { id: number; name: string }): ServerSummary {
  const type = (raw.storage_box_type ?? {}) as Dict
  const loc = (raw.location ?? {}) as Dict
  const stats = (raw.stats ?? {}) as Dict
  const size = num(type.size)
  return {
    kind: "storage",
    id: Number(raw.id),
    projectId: project.id,
    projectName: project.name,
    name: str(raw.name) ?? `Storage Box ${raw.id}`,
    status: str(raw.status),
    ipv4: null,
    ipv6: null,
    host: str(raw.server),
    usage: size ? { used: num(stats.size) ?? 0, size } : null,
    location: [str(loc.city), str(loc.name)].filter(Boolean).join(" · ") || null,
    country: str(loc.country),
    type: str(type.name)?.toUpperCase() ?? null,
    spec: boxSize(size),
    os: null,
    arch: null,
    created: str(raw.created),
    traffic: { out: null, in: null, included: null },
    rescue: false,
  }
}

/** Removes what only admins should see: prices and labels. */
export function stripBox(box: Dict): Dict {
  const type = (box.storage_box_type ?? {}) as Dict
  return { ...box, labels: {}, storage_box_type: { ...type, prices: [] } }
}

/**
 * A password that passes Hetzner's Storage Box policy: 12 to 128 characters with
 * an upper and a lower case letter, a digit and one of its special characters.
 */
export function boxPassword(length = 20): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const lower = "abcdefghijkmnopqrstuvwxyz"
  const digits = "23456789"
  const special = "-_.!@#%+"
  const all = upper + lower + digits + special
  const pick = (set: string) => set[crypto.randomInt(set.length)]
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)]
  while (chars.length < length) chars.push(pick(all))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join("")
}
