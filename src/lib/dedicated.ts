import { HetznerError } from "./hetzner"
import { robotRequest, unwrap } from "./robot"
import { cleanupRobotKeys } from "./robot-keys"
import { siteOf, type DedicatedServer } from "./robot-types"
import type { Dict, ServerSummary } from "./summary"

/**
 * The dedicated servers of the Robot accounts. Robot allows 200 server list
 * requests an hour per account, so the list is loaded once for everyone and kept
 * for a minute, and server pages read from it instead of asking for each server.
 */

const LIST_TTL = 60_000
/** What a server offers (reset, rescue, Wake on LAN) rarely changes. */
const DETAIL_TTL = 60 * 60_000

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null)

const globals = globalThis as unknown as {
  __hzdockRobotServers?: Map<number, { at: number; raw: Dict[] }>
  __hzdockRobotServersInFlight?: Map<number, Promise<Dict[]>>
  __hzdockRobotDetails?: Map<string, { at: number; raw: Dict }>
}

/** Every dedicated server of one Robot account, as Robot returns them. */
export async function accountServers(accountId: number, refresh = false): Promise<Dict[]> {
  const cache = (globals.__hzdockRobotServers ??= new Map())
  const inFlight = (globals.__hzdockRobotServersInFlight ??= new Map())
  const hit = cache.get(accountId)
  if (!refresh && hit && Date.now() - hit.at < LIST_TTL) return hit.raw
  const pending = inFlight.get(accountId)
  if (pending) return pending
  const load = robotRequest({ accountId, path: "/server" })
    .then(({ data }) => unwrap<Dict>(data, "server"))
    .catch((e) => {
      // An account without servers answers 404.
      if (e instanceof HetznerError && e.code === "SERVER_NOT_FOUND") return []
      throw e
    })
    .then((raw) => {
      cache.set(accountId, { at: Date.now(), raw })
      // SSH keys left over from earlier boots go away in the background.
      void cleanupRobotKeys(accountId).catch(() => undefined)
      return raw
    })
    .finally(() => inFlight.delete(accountId))
  inFlight.set(accountId, load)
  return load
}

/** Forgets the cached list after a change, so the next list shows it. */
export function invalidateAccount(accountId: number) {
  globals.__hzdockRobotServers?.delete(accountId)
}

/** The server's name from the cached list, if the list has been loaded. */
export function cachedDedicatedName(accountId: number, number: number): string | null {
  const raw = globals.__hzdockRobotServers?.get(accountId)?.raw.find((s) => Number(s.server_number) === number)
  return raw ? nameOf(raw) : null
}

/** One server from the shared list; Robot is asked directly only when the list does not have it. */
export async function findDedicated(accountId: number, number: number): Promise<Dict> {
  const listed = (await accountServers(accountId).catch(() => [] as Dict[])).find((s) => Number(s.server_number) === number)
  return listed ?? serverDetail(accountId, number, true)
}

/** Robot's details of one server, which add what it offers. Kept for an hour. */
export async function serverDetail(accountId: number, number: number, refresh = false): Promise<Dict> {
  const cache = (globals.__hzdockRobotDetails ??= new Map())
  const key = `${accountId}:${number}`
  const hit = cache.get(key)
  if (!refresh && hit && Date.now() - hit.at < DETAIL_TTL) return hit.raw
  const { data } = await robotRequest<{ server?: Dict }>({ accountId, path: `/server/${number}` })
  const raw = data?.server ?? {}
  cache.set(key, { at: Date.now(), raw })
  return raw
}

function nameOf(raw: Dict): string {
  return str(raw.server_name) ?? [str(raw.product), `#${raw.server_number}`].filter(Boolean).join(" ")
}

/** "20 TB" → bytes the way Hetzner counts them (1 TB is 1024⁴ bytes); "unlimited" → null. */
function includedTraffic(value: unknown): number | null {
  const match = str(value)?.match(/^([\d.]+)\s*(TB|GB)$/i)
  if (!match) return null
  return Number(match[1]) * 1024 ** (match[2].toUpperCase() === "TB" ? 4 : 3)
}

export function subnetsOf(raw: Dict): { ip: string; mask: number }[] {
  const list = Array.isArray(raw.subnet) ? (raw.subnet as Dict[]) : []
  return list
    .map((s) => ({ ip: String(s.ip ?? ""), mask: Number(s.mask) }))
    .filter((s) => s.ip && Number.isInteger(s.mask))
}

/** The single IPv4 addresses of the server, the main one first. */
export function ipsOf(raw: Dict): string[] {
  const main = str(raw.server_ip)
  const ips = (Array.isArray(raw.ip) ? raw.ip : []).filter((v): v is string => typeof v === "string" && !v.includes(":"))
  return main && !main.includes(":") ? [main, ...ips.filter((ip) => ip !== main)] : ips
}

function ipv6Of(raw: Dict): string | null {
  const net = str(raw.server_ipv6_net)
  if (!net) return null
  return `${net}/${subnetsOf(raw).find((s) => s.ip === net)?.mask ?? 64}`
}

export function summarizeDedicated(raw: Dict, account: { id: number; name: string }, opts: { admin?: boolean } = {}): ServerSummary {
  const dc = str(raw.dc)
  const site = siteOf(dc)
  const traffic = str(raw.traffic)
  return {
    kind: "dedicated",
    id: Number(raw.server_number),
    projectId: account.id,
    projectName: account.name,
    name: nameOf(raw),
    status: str(raw.status),
    ipv4: ipsOf(raw)[0] ?? null,
    ipv6: ipv6Of(raw),
    location: [site?.city, dc].filter(Boolean).join(" · ") || null,
    country: site?.country ?? null,
    type: str(raw.product),
    spec: traffic ? (traffic.toLowerCase() === "unlimited" ? "Unlimited traffic" : `${traffic} traffic`) : null,
    os: null,
    arch: null,
    created: null,
    traffic: { out: null, in: null, included: includedTraffic(traffic) },
    rescue: false,
    ...(opts.admin ? { price: null, cancelled: raw.cancelled === true } : {}),
  }
}

/** The server for its page. Billing details are left out for users. */
export function dedicatedServer(raw: Dict, detail: Dict | null, isAdmin: boolean): DedicatedServer {
  const dc = str(raw.dc)
  const site = siteOf(dc)
  const ips = ipsOf(raw)
  return {
    number: Number(raw.server_number),
    name: nameOf(raw),
    product: str(raw.product),
    dc,
    city: site?.city ?? null,
    country: site?.country ?? null,
    status: str(raw.status),
    ipv4: ips[0] ?? null,
    ipv6: ipv6Of(raw),
    ips,
    subnets: subnetsOf(raw),
    traffic: str(raw.traffic),
    features: detail ? { reset: detail.reset === true, rescue: detail.rescue === true, wol: detail.wol === true } : null,
    ...(isAdmin ? { paidUntil: str(raw.paid_until), cancelled: raw.cancelled === true } : {}),
  }
}
