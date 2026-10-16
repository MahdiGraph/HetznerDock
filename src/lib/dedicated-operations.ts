import { z } from "zod"
import { db } from "./db"
import { dedicatedServer, findDedicated, ipsOf, serverDetail, subnetsOf } from "./dedicated"
import { HetznerError } from "./hetzner"
import { HttpError } from "./http"
import { compactIPv6, inIPv4Network, inIPv6Network, isHostname, isIPv4, isIPv6 } from "./ip"
import { SshKeysText, sshKeysOrThrow, type Op, type OpContext } from "./operations"
import { robotRequest, unwrap } from "./robot"
import { temporaryRobotKey } from "./robot-keys"
import {
  BOOT_NAMES,
  RESET_META,
  RESET_TYPES,
  TRAFFIC_PERIODS,
  type BootConfig,
  type BootInfo,
  type DedicatedAddress,
  type DedicatedServer,
  type ResetInfo,
  type ResetType,
  type TrafficPeriod,
  type TrafficReport,
} from "./robot-types"
import type { Dict } from "./summary"

/**
 * Everything a panel user can do with one dedicated server, through the Robot
 * webservice. Like the cloud operations, each one checks its input and touches
 * only this server: its own IP addresses, its own boot configuration, and SSH
 * keys the user pasted for this boot. Robot's own SSH keys, other servers and
 * billing details never reach users.
 */

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null)
/** Robot answers a list of choices while a boot is not set, and the chosen value while it is. */
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : []
const count = (v: unknown) => (Array.isArray(v) ? v.length : 0)

const GB = 1024 ** 3

/* ------------------------------------------------------------------ helpers */

const globals = globalThis as unknown as { __hzdockRobotCache?: Map<string, { at: number; data: unknown }> }

/** Answers Robot gives about one server, kept briefly so open pages do not use up its hourly limits. */
async function remember<T>(key: string, ttl: number, load: () => Promise<T>, fresh = false): Promise<T> {
  const cache = (globals.__hzdockRobotCache ??= new Map())
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < ttl) return hit.data as T
  const data = await load()
  cache.set(key, { at: Date.now(), data })
  return data
}

function forget(ctx: OpContext, ...what: string[]) {
  for (const name of what) globals.__hzdockRobotCache?.delete(`${name}:${ctx.projectId}:${ctx.serverId}`)
}

/** The server from the shared list; it also gives the activity log the server's name. */
async function loadServer(ctx: OpContext): Promise<Dict> {
  if (ctx.raw) return ctx.raw
  const raw = await findDedicated(ctx.projectId, ctx.serverId)
  ctx.raw = raw
  ctx.serverName = str(raw.server_name) ?? ctx.serverName
  return raw
}

function robot<T = unknown>(ctx: OpContext, method: "GET" | "POST" | "PUT" | "DELETE", path: string, form?: Record<string, string | string[]>) {
  return robotRequest<T>({ accountId: ctx.projectId, method, path: path.replace("{n}", String(ctx.serverId)), form })
}

/** The boot configurations, or null when Robot offers none for this server. */
async function bootOf(ctx: OpContext, fresh = false): Promise<Dict | null> {
  return remember(
    `boot:${ctx.projectId}:${ctx.serverId}`,
    15_000,
    async () => {
      try {
        return ((await robot<{ boot?: Dict }>(ctx, "GET", "/boot/{n}")).data?.boot ?? null) as Dict | null
      } catch (e) {
        if (e instanceof HetznerError && e.code === "BOOT_NOT_AVAILABLE") return null
        throw e
      }
    },
    fresh
  )
}

function bootInfo(boot: Dict | null): BootInfo {
  const part = (name: BootConfig) => (boot?.[name] && typeof boot[name] === "object" ? (boot[name] as Dict) : null)
  const rescue = part("rescue")
  const linux = part("linux")
  const active = (["rescue", "linux", "vnc", "windows"] as BootConfig[]).find((name) => part(name)?.active === true) ?? null
  // Passwords stay out: Robot repeats the active boot's password here, and the panel shows it only once.
  return {
    active,
    rescue: rescue
      ? {
          os: strings(rescue.os),
          activeOs: rescue.active === true ? (strings(rescue.os)[0] ?? null) : null,
          keys: rescue.active === true ? count(rescue.authorized_key) : 0,
        }
      : null,
    linux: linux
      ? {
          dists: strings(linux.dist),
          langs: strings(linux.lang),
          activeDist: linux.active === true ? (strings(linux.dist)[0] ?? null) : null,
          activeLang: linux.active === true ? (strings(linux.lang)[0] ?? null) : null,
          keys: linux.active === true ? count(linux.authorized_key) : 0,
        }
      : null,
  }
}

async function resetInfo(ctx: OpContext, fresh = false): Promise<ResetInfo> {
  return remember(
    `reset:${ctx.projectId}:${ctx.serverId}`,
    30_000,
    async () => {
      try {
        const reset = (await robot<{ reset?: Dict }>(ctx, "GET", "/reset/{n}")).data?.reset ?? {}
        const offered = strings(reset.type)
        const status = str(reset.operating_status)
        return {
          types: RESET_TYPES.filter((t) => offered.includes(t)),
          operatingStatus: status && status !== "not supported" ? status : null,
        }
      } catch (e) {
        if (e instanceof HetznerError && e.code === "RESET_NOT_AVAILABLE") return { types: [], operatingStatus: null }
        throw e
      }
    },
    fresh
  )
}

/**
 * Restarts the server so it boots what was just set up: a hardware reset where
 * Robot offers one, or the power button for a server that is off.
 */
async function restart(ctx: OpContext): Promise<ResetType | null> {
  const { types, operatingStatus } = await resetInfo(ctx, true)
  const off = operatingStatus !== null && operatingStatus !== "running"
  const type = off && types.includes("power") ? "power" : (["hw", "sw", "power"] as const).find((t) => types.includes(t))
  if (!type) return null
  await robot(ctx, "POST", "/reset/{n}", { type })
  forget(ctx, "reset")
  return type
}

/** Saves the SSH keys a user pasted for this one boot and returns their fingerprints. */
async function bootKeys(ctx: OpContext, text: string | undefined): Promise<string[]> {
  const fingerprints: string[] = []
  for (const key of sshKeysOrThrow(text)) fingerprints.push(await temporaryRobotKey(ctx.projectId, ctx.serverId, key))
  return fingerprints
}

/** Refuses when another kind of boot is set: Robot keeps one at a time. */
function blockedBy(info: BootInfo, wanted: BootConfig) {
  if (!info.active || info.active === wanted) return
  const name = BOOT_NAMES[info.active]
  throw new HttpError(409, `${name.charAt(0).toUpperCase()}${name.slice(1)} is set for the next boot. Cancel it first.`)
}

/** The server's addresses: single IPv4 addresses first, then its IPv6 network and other subnets. */
function addressesOf(raw: Dict): DedicatedAddress[] {
  const main = str(raw.server_ip)
  const list: DedicatedAddress[] = ipsOf(raw).map((ip) => ({
    ip,
    base: ip,
    mask: 32,
    v6: false,
    role: ip === main ? "main" : "single",
    ptrs: [],
  }))
  for (const s of subnetsOf(raw)) {
    list.push({ ip: `${s.ip}/${s.mask}`, base: s.ip, mask: s.mask, v6: s.ip.includes(":"), role: "subnet", ptrs: [] })
  }
  return list
}

function holds(address: DedicatedAddress, ip: string) {
  if (address.v6) return isIPv6(ip) && inIPv6Network(ip, address.ip)
  return address.role === "subnet" ? isIPv4(ip) && inIPv4Network(ip, address.ip) : address.ip === ip
}

/** The reverse DNS entries of this server's addresses, and nothing else of the account. */
async function rdnsEntries(ctx: OpContext, raw: Dict, addresses: DedicatedAddress[]) {
  const main = str(raw.server_ip)
  const data = await remember(`rdns:${ctx.projectId}:${ctx.serverId}`, 30_000, async () => {
    try {
      return (
        await robotRequest({ accountId: ctx.projectId, path: "/rdns", query: main ? { server_ip: main } : undefined })
      ).data
    } catch (e) {
      // No entries at all is a 404.
      if (e instanceof HetznerError && e.status === 404) return []
      throw e
    }
  })
  return unwrap<Dict>(data, "rdns")
    .map((r) => ({ ip: String(r.ip ?? ""), ptr: String(r.ptr ?? "") }))
    .filter((r) => r.ip && r.ptr && addresses.some((a) => holds(a, r.ip)))
}

/** Robot's traffic query for one calendar day, month or year, as it wants the dates written. */
function trafficSpan(period: TrafficPeriod, date: string) {
  const [y, m, d] = date.split("-").map(Number)
  const valid =
    period === "day"
      ? /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d && m >= 1 && m <= 12
      : period === "month"
        ? /^\d{4}-\d{2}$/.test(date) && m >= 1 && m <= 12
        : /^\d{4}$/.test(date)
  if (!valid || y < 2000) throw new HttpError(400, "date: a day as 2026-10-15, a month as 2026-10 or a year as 2026")
  const start = Date.UTC(y, period === "year" ? 0 : m - 1, period === "day" ? d : 1)
  if (start > Date.now()) throw new HttpError(400, "That is in the future.")
  if (period === "day") return { from: `${date}T00`, to: `${date}T23` }
  if (period === "month") return { from: `${date}-01`, to: `${date}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` }
  return { from: `${date}-01`, to: `${date}-12` }
}

/** When one of Robot's traffic values starts: the hour, day or month it is listed under. */
function slotStart(period: TrafficPeriod, date: string, slot: string): number | null {
  const [y, m, d] = date.split("-").map(Number)
  if (/^\d{1,2}$/.test(slot)) {
    const n = Number(slot)
    if (period === "day") return Date.UTC(y, m - 1, d, n)
    if (period === "month") return Date.UTC(y, m - 1, n)
    return Date.UTC(y, n - 1, 1)
  }
  const t = Date.parse(/T\d{2}$/.test(slot) ? `${slot}:00:00Z` : `${slot}${slot.length === 7 ? "-01" : ""}T00:00:00Z`)
  return Number.isFinite(t) ? t : null
}

function today(period: TrafficPeriod) {
  const now = new Date().toISOString()
  return period === "day" ? now.slice(0, 10) : period === "month" ? now.slice(0, 7) : now.slice(0, 4)
}

/* ------------------------------------------------------------------ operations */

const Ip = z.string().trim().max(64)

export const DEDICATED_OPERATIONS: Op[] = [
  /* ---------------------------------------------------------------- reading */
  {
    method: "GET",
    path: "",
    run: async (ctx): Promise<{ server: DedicatedServer }> => {
      const raw = await loadServer(ctx)
      const detail = await serverDetail(ctx.projectId, ctx.serverId).catch(() => null)
      return { server: dedicatedServer(raw, detail, ctx.isAdmin) }
    },
  },
  {
    method: "GET",
    path: "boot",
    run: async (ctx): Promise<BootInfo> => bootInfo(await bootOf(ctx)),
  },
  {
    method: "GET",
    path: "reset",
    run: (ctx) => resetInfo(ctx),
  },
  {
    method: "GET",
    path: "network",
    run: async (ctx): Promise<{ addresses: DedicatedAddress[] }> => {
      const raw = await loadServer(ctx)
      const addresses = addressesOf(raw)
      for (const entry of await rdnsEntries(ctx, raw, addresses)) {
        addresses.find((a) => holds(a, entry.ip))?.ptrs.push(entry)
      }
      return { addresses }
    },
  },
  {
    method: "GET",
    path: "traffic",
    run: async (ctx): Promise<TrafficReport> => {
      const period = (ctx.query.get("period") ?? "month") as TrafficPeriod
      if (!TRAFFIC_PERIODS.includes(period)) throw new HttpError(400, "period: day, month or year")
      const date = ctx.query.get("date") || today(period)
      const { from, to } = trafficSpan(period, date)
      const raw = await loadServer(ctx)
      const ips = ipsOf(raw)
      const subnets = subnetsOf(raw).map((s) => s.ip)
      const report: TrafficReport = { period, date, rows: [], total: { in: 0, out: 0 } }
      if (!ips.length && !subnets.length) return report
      const data = await remember(`traffic:${ctx.projectId}:${ctx.serverId}:${period}:${date}`, 10 * 60_000, async () => {
        try {
          const { data } = await robotRequest<{ traffic?: { data?: Dict } }>({
            accountId: ctx.projectId,
            method: "POST",
            path: "/traffic",
            form: { type: period, from, to, ip: ips, subnet: subnets, single_values: "true" },
            timeoutMs: 60_000,
          })
          return data?.traffic?.data ?? {}
        } catch (e) {
          // Robot answers 404 when it has nothing for these addresses yet.
          if (e instanceof HetznerError && e.status === 404) return {}
          throw e
        }
      })
      // One series per address, in GB; the server's traffic is their sum.
      const slots = new Map<number, { in: number; out: number }>()
      for (const series of Object.values(data)) {
        if (!series || typeof series !== "object") continue
        for (const [slot, value] of Object.entries(series as Dict)) {
          const t = slotStart(period, date, slot)
          if (t === null || !value || typeof value !== "object") continue
          const row = slots.get(t) ?? { in: 0, out: 0 }
          row.in += (Number((value as Dict).in) || 0) * GB
          row.out += (Number((value as Dict).out) || 0) * GB
          slots.set(t, row)
        }
      }
      report.rows = [...slots].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, ...v }))
      report.total = report.rows.reduce((sum, r) => ({ in: sum.in + r.in, out: sum.out + r.out }), { in: 0, out: 0 })
      return report
    },
  },

  /* ---------------------------------------------------------------- power */
  {
    method: "POST",
    path: "reset",
    body: z.object({ type: z.enum(RESET_TYPES) }),
    describe: (ctx) => RESET_META[(ctx.body as { type: ResetType }).type].log,
    run: async (ctx) => {
      const { type } = ctx.body as { type: ResetType }
      const { types } = await resetInfo(ctx)
      if (!types.includes(type)) throw new HttpError(400, "This server does not offer that kind of reset.")
      await robot(ctx, "POST", "/reset/{n}", { type })
      forget(ctx, "reset", "boot")
      return { ok: true, type }
    },
  },
  {
    method: "POST",
    path: "wol",
    describe: () => "Send Wake on LAN",
    run: async (ctx) => {
      await robot(ctx, "POST", "/wol/{n}")
      forget(ctx, "reset")
      return { ok: true }
    },
  },

  /* ---------------------------------------------------------------- rescue */
  {
    method: "POST",
    path: "rescue",
    permission: "rescue",
    body: z.object({
      os: z.string().trim().min(1).max(40),
      sshKeys: SshKeysText,
      reboot: z.boolean().default(false),
    }),
    describe: (ctx) => ctx.note ?? "Enable rescue mode",
    run: async (ctx) => {
      const body = ctx.body as { os: string; sshKeys?: string; reboot: boolean }
      sshKeysOrThrow(body.sshKeys)
      await loadServer(ctx)
      const info = bootInfo(await bootOf(ctx, true))
      if (!info.rescue) throw new HttpError(409, "Robot has no rescue system for this server.")
      blockedBy(info, "rescue")
      const unknownOs = () => new HttpError(400, "Robot does not offer that rescue system for this server.")
      if (info.active !== "rescue" && !info.rescue.os.includes(body.os)) throw unknownOs()
      // Keys first, so a key Robot refuses leaves a rescue boot that is already set alone.
      const fingerprints = await bootKeys(ctx, body.sshKeys)
      if (info.active === "rescue") {
        // Starting it again gives a new password; Robot takes the set one back first.
        const { data } = await robot<{ rescue?: Dict }>(ctx, "DELETE", "/boot/{n}/rescue")
        if (!strings(data?.rescue?.os).includes(body.os)) throw unknownOs()
      }
      ctx.note = `Enable rescue mode (${body.os})${body.reboot ? " and restart into it" : ""}`
      ctx.detail = { os: body.os, ...(fingerprints.length ? { sshKeys: fingerprints.length } : {}) }
      const { data } = await robot<{ rescue?: Dict }>(ctx, "POST", "/boot/{n}/rescue", { os: body.os, authorized_key: fingerprints })
      forget(ctx, "boot")
      // The password exists only in this answer, so a failed restart must not lose it.
      let reset: ResetType | null = null
      let resetError: string | null = null
      if (body.reboot) {
        try {
          reset = await restart(ctx)
        } catch (e) {
          resetError = e instanceof Error ? e.message : "The restart failed."
        }
      }
      return { password: str(data?.rescue?.password), os: body.os, reset, resetError }
    },
  },
  {
    method: "DELETE",
    path: "rescue",
    permission: "rescue",
    describe: () => "Disable rescue mode",
    run: async (ctx) => {
      await robot(ctx, "DELETE", "/boot/{n}/rescue")
      forget(ctx, "boot")
      return { ok: true }
    },
  },

  /* ---------------------------------------------------------------- Linux installation */
  {
    method: "POST",
    path: "linux",
    permission: "rebuild",
    body: z.object({
      dist: z.string().trim().min(1).max(120),
      lang: z.string().trim().min(1).max(10),
      sshKeys: SshKeysText,
      reboot: z.boolean().default(false),
    }),
    describe: (ctx) => ctx.note ?? "Install Linux",
    run: async (ctx) => {
      const body = ctx.body as { dist: string; lang: string; sshKeys?: string; reboot: boolean }
      sshKeysOrThrow(body.sshKeys)
      await loadServer(ctx)
      const info = bootInfo(await bootOf(ctx, true))
      if (!info.linux) throw new HttpError(409, "Robot cannot install Linux on this server.")
      blockedBy(info, "linux")
      const check = (dists: string[], langs: string[]) => {
        if (!dists.includes(body.dist)) throw new HttpError(400, "Robot does not offer that system for this server.")
        if (!langs.includes(body.lang)) throw new HttpError(400, "Robot does not offer that language.")
      }
      if (info.active !== "linux") check(info.linux.dists, info.linux.langs)
      // Keys first, so a key Robot refuses leaves an installation that is already set alone.
      const fingerprints = await bootKeys(ctx, body.sshKeys)
      if (info.active === "linux") {
        const { data } = await robot<{ linux?: Dict }>(ctx, "DELETE", "/boot/{n}/linux")
        check(strings(data?.linux?.dist), strings(data?.linux?.lang))
      }
      ctx.note = `Install ${body.dist}${body.reboot ? " and restart to begin" : " at the next boot"}`
      ctx.detail = { dist: body.dist, lang: body.lang, ...(fingerprints.length ? { sshKeys: fingerprints.length } : {}) }
      const { data } = await robot<{ linux?: Dict }>(ctx, "POST", "/boot/{n}/linux", {
        dist: body.dist,
        lang: body.lang,
        authorized_key: fingerprints,
      })
      forget(ctx, "boot")
      let reset: ResetType | null = null
      let resetError: string | null = null
      if (body.reboot) {
        try {
          reset = await restart(ctx)
        } catch (e) {
          resetError = e instanceof Error ? e.message : "The restart failed."
        }
      }
      return { password: str(data?.linux?.password), dist: body.dist, reset, resetError }
    },
  },
  {
    method: "DELETE",
    path: "linux",
    permission: "rebuild",
    describe: () => "Cancel the Linux installation",
    run: async (ctx) => {
      await robot(ctx, "DELETE", "/boot/{n}/linux")
      forget(ctx, "boot")
      return { ok: true }
    },
  },

  /* ---------------------------------------------------------------- reverse DNS */
  {
    method: "POST",
    path: "rdns",
    permission: "rdns",
    body: z.object({ ip: Ip, dns_ptr: z.string().trim().max(253).nullable() }),
    describe: (ctx) => ctx.note ?? "Change reverse DNS",
    run: async (ctx) => {
      const body = ctx.body as { ip: string; dns_ptr: string | null }
      const ip = isIPv6(body.ip) ? compactIPv6(body.ip)! : body.ip
      const ptr = body.dns_ptr ? body.dns_ptr.replace(/\.$/, "") : null
      if (!isIPv4(ip) && !isIPv6(ip)) throw new HttpError(400, "That is not an IP address.")
      if (ptr !== null && !isHostname(ptr)) throw new HttpError(400, "That is not a valid host name.")
      const raw = await loadServer(ctx)
      if (!addressesOf(raw).some((a) => holds(a, ip))) throw new HttpError(404, "That address does not belong to this server.")
      ctx.note = ptr ? `Set reverse DNS of ${ip} to ${ptr}` : `Remove reverse DNS of ${ip}`
      if (ptr) {
        await robot(ctx, "POST", `/rdns/${ip}`, { ptr })
      } else {
        try {
          await robot(ctx, "DELETE", `/rdns/${ip}`)
        } catch (e) {
          if (!(e instanceof HetznerError && e.code === "RDNS_NOT_FOUND")) throw e
        }
      }
      forget(ctx, "rdns")
      return { ip, ptr }
    },
  },

  /* ---------------------------------------------------------------- admin only */
  {
    method: "PUT",
    path: "",
    adminOnly: true,
    mutates: true,
    body: z.object({
      name: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(/^[^\u0000-\u001f\u007f]+$/, "no control characters"),
    }),
    describe: (ctx) => ctx.note ?? "Rename server",
    run: async (ctx) => {
      const { name } = ctx.body as { name: string }
      const before = str((await loadServer(ctx)).server_name) ?? `#${ctx.serverId}`
      ctx.note = `Rename server "${before}" to "${name}" at Hetzner`
      await robot(ctx, "POST", "/server/{n}", { server_name: name })
      db()
        .prepare("UPDATE assignments SET label = ? WHERE kind = 'dedicated' AND project_id = ? AND server_id = ?")
        .run(name, ctx.projectId, ctx.serverId)
      ctx.serverName = name
      return { ok: true, name }
    },
  },
]
