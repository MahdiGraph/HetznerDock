import crypto from "node:crypto"
import { z } from "zod"
import type { User } from "./auth"
import { db } from "./db"
import { HetznerError, hzFetchAll, hzRequest } from "./hetzner"
import { HttpError } from "./http"
import { inIPv6Network, isCidr, isHostname, isIPv4, isIPv6 } from "./ip"
import type { PermissionKey, Permissions } from "./permissions"
import { cleanupTemporaryKeys, temporaryKey } from "./rescue-keys"
import { MAX_SSH_KEYS, parseSshKeys } from "./ssh"
import { get, locationOf, stripForUser, type Dict } from "./summary"
import type {
  FirewallInfo,
  FirewallRule,
  FloatingIpInfo,
  HzAction,
  ImageCatalog,
  ImageInfo,
  IsoInfo,
  NetworkInfo,
  PrivateNetInfo,
  ServerTypeOption,
  SnapshotList,
  VolumeInfo,
} from "./hz-types"

/**
 * Everything a panel user can do with one cloud server. The gateway matches the
 * request against this list (or, for dedicated servers, the one in
 * dedicated-operations.ts) and refuses anything that is not on it, so users never
 * reach the Hetzner API directly: each operation checks its input, reaches only
 * this server (or resources that belong to it) and says what to log.
 */

type Method = "GET" | "POST" | "PUT" | "DELETE"

export type OpContext = {
  user: User
  isAdmin: boolean
  /** The Hetzner Cloud project, or for a dedicated server its Robot account. */
  projectId: number
  /** The cloud server's ID, or the dedicated server's number. */
  serverId: number
  params: Record<string, string>
  query: URLSearchParams
  body: unknown
  permissions: Permissions
  /** Filled in once the operation has loaded the server. */
  serverName: string | null
  /** The activity log line, set by operations that describe themselves while they run. */
  note?: string
  /** Harmless details for the activity log: never passwords, keys or scripts. */
  detail?: Record<string, unknown>
  raw?: Dict
}

export type Op = {
  method: Method
  /** Below /api/hz/{project}/{server}; ":name" matches a numeric ID. */
  path: string
  /** A user setting that has to be on; admins can always. */
  permission?: PermissionKey
  adminOnly?: boolean
  body?: z.ZodType
  /** The activity log line. Reads leave it out and are not logged. */
  describe?: (ctx: OpContext) => string
  /** Whether the server list should be loaded again afterwards. */
  mutates?: boolean
  run: (ctx: OpContext) => Promise<unknown>
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const base = (ctx: OpContext) => `/servers/${ctx.serverId}`

/* ------------------------------------------------------------------ helpers */

async function loadServer(ctx: OpContext): Promise<Dict> {
  if (ctx.raw) return ctx.raw
  const { data } = await hzRequest<{ server: Dict }>({ projectId: ctx.projectId, path: base(ctx) })
  ctx.raw = data.server
  ctx.serverName = str(data.server?.name) ?? ctx.serverName
  return data.server
}

async function serverAction(ctx: OpContext, command: string, body?: unknown) {
  const { data } = await hzRequest<Dict>({
    projectId: ctx.projectId,
    method: "POST",
    path: `${base(ctx)}/actions/${command}`,
    body,
  })
  return data
}

/** Polls an action until it finishes; null when it is still running after the timeout. */
async function waitForAction(projectId: number, actionId: number, timeoutMs = 20_000): Promise<HzAction | null> {
  const end = Date.now() + timeoutMs
  for (;;) {
    const { data } = await hzRequest<{ action: HzAction }>({ projectId, path: `/actions/${actionId}` })
    if (data.action.status !== "running") return data.action
    if (Date.now() > end) return null
    await sleep(1000)
  }
}

const globals = globalThis as unknown as { __hzdockCatalog?: Map<string, { at: number; data: unknown }> }

/** Lists that are the same for every server of a project, cached for ten minutes. */
async function cached<T>(key: string, load: () => Promise<T>, ttl = 10 * 60_000): Promise<T> {
  const cache = (globals.__hzdockCatalog ??= new Map())
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.data as T
  const data = await load()
  cache.set(key, { at: Date.now(), data })
  return data
}

function unavailable(raw: Dict) {
  const after = str(get(raw, "deprecation.unavailable_after"))
  return !!after && new Date(after).getTime() < Date.now()
}

function imageInfo(raw: Dict): ImageInfo {
  return {
    id: Number(raw.id),
    type: raw.type as ImageInfo["type"],
    name: str(raw.name),
    description: str(raw.description) ?? str(raw.name) ?? `Image ${raw.id}`,
    osFlavor: str(raw.os_flavor),
    osVersion: str(raw.os_version),
    architecture: str(raw.architecture),
    imageSize: num(raw.image_size),
    diskSize: num(raw.disk_size),
    created: str(raw.created),
    status: str(raw.status) ?? "unknown",
    fromServer: num(get(raw, "created_from.id")),
    boundTo: num(raw.bound_to),
    protected: get(raw, "protection.delete") === true,
    deprecated: !!raw.deprecation,
  }
}

async function serverArch(ctx: OpContext): Promise<string> {
  const fromQuery = ctx.query.get("arch")
  if (fromQuery === "x86" || fromQuery === "arm") return fromQuery
  return str(get(await loadServer(ctx), "server_type.architecture")) ?? "x86"
}

/** Snapshots taken from this server and backups that belong to it. */
async function ownImages(ctx: OpContext) {
  const [snapshots, backups] = await Promise.all([
    hzFetchAll<Dict>(ctx.projectId, "/images", "images", { type: "snapshot", sort: "created:desc" }),
    hzFetchAll<Dict>(ctx.projectId, "/images", "images", { type: "backup", bound_to: ctx.serverId, sort: "created:desc" }),
  ])
  return { all: snapshots, snapshots: snapshots.filter((i) => get(i, "created_from.id") === ctx.serverId), backups }
}

/**
 * Loads an image and checks the user may use it on this server: Hetzner's own
 * images, and the snapshots and backups of this very server. Admins may also
 * use any other snapshot of the project.
 */
async function usableImage(ctx: OpContext, imageId: number, opts: { system: boolean }): Promise<Dict> {
  const { data } = await hzRequest<{ image: Dict }>({ projectId: ctx.projectId, path: `/images/${imageId}` })
  const image = data.image
  const type = image.type
  if (opts.system && (type === "system" || type === "app")) return image
  if (type === "snapshot" && (get(image, "created_from.id") === ctx.serverId || ctx.isAdmin)) return image
  if (type === "backup" && image.bound_to === ctx.serverId) return image
  throw new HttpError(404, "That image is not available for this server.")
}

export function sshKeysOrThrow(text: string | undefined): string[] {
  if (!text?.trim()) return []
  const { keys, invalid } = parseSshKeys(text)
  if (invalid.length) throw new HttpError(400, `This is not an SSH public key: ${invalid[0]}`)
  if (keys.length > MAX_SSH_KEYS) throw new HttpError(400, `Add at most ${MAX_SSH_KEYS} SSH keys.`)
  return keys
}

function cloudInitForKeys(keys: string[]) {
  return ["#cloud-config", "ssh_authorized_keys:", ...keys.map((k) => `  - ${JSON.stringify(k)}`), ""].join("\n")
}

async function floatingIps(ctx: OpContext): Promise<Dict[]> {
  const all = await hzFetchAll<Dict>(ctx.projectId, "/floating_ips", "floating_ips")
  return all.filter((f) => f.server === ctx.serverId)
}

function floatingIpInfo(raw: Dict): FloatingIpInfo {
  const loc = (raw.home_location ?? {}) as Dict
  return {
    id: Number(raw.id),
    name: str(raw.name) ?? `Floating IP ${raw.id}`,
    ip: String(raw.ip ?? ""),
    type: raw.type === "ipv6" ? "ipv6" : "ipv4",
    dnsPtr: Array.isArray(raw.dns_ptr) ? (raw.dns_ptr as { ip: string; dns_ptr: string }[]) : [],
    blocked: raw.blocked === true,
    location: [str(loc.city), str(loc.name)].filter(Boolean).join(" · ") || null,
    country: str(loc.country),
  }
}

async function firewallsOf(ctx: OpContext): Promise<{ raw: Dict; status: string | null }[]> {
  const server = await loadServer(ctx)
  const list = (get<Dict[]>(server, "public_net.firewalls") ?? []).map((f) => ({ id: Number(f.id), status: str(f.status) }))
  return Promise.all(
    list.map(async (f) => {
      const { data } = await hzRequest<{ firewall: Dict }>({ projectId: ctx.projectId, path: `/firewalls/${f.id}` })
      return { raw: data.firewall, status: f.status }
    })
  )
}

function firewallInfo(raw: Dict, status: string | null, serverId: number): FirewallInfo {
  const servers = new Set<number>()
  let selectors = 0
  for (const a of (raw.applied_to as Dict[] | undefined) ?? []) {
    if (a.type === "server") servers.add(Number(get(a, "server.id")))
    if (a.type === "label_selector") {
      selectors++
      for (const r of (a.applied_to_resources as Dict[] | undefined) ?? []) {
        if (r.type === "server") servers.add(Number(get(r, "server.id")))
      }
    }
  }
  return {
    id: Number(raw.id),
    name: str(raw.name) ?? `Firewall ${raw.id}`,
    rules: (raw.rules as FirewallRule[] | undefined) ?? [],
    status,
    exclusive: selectors === 0 && servers.size === 1 && servers.has(serverId),
    appliedCount: servers.size,
  }
}

/** A firewall of this server that the caller may change: users only touch one that protects nothing else. */
async function editableFirewall(ctx: OpContext, firewallId: number) {
  const list = await firewallsOf(ctx)
  const match = list.find((f) => Number(f.raw.id) === firewallId)
  if (!match) throw new HttpError(404, "That firewall does not protect this server.")
  const info = firewallInfo(match.raw, match.status, ctx.serverId)
  if (!info.exclusive && !ctx.isAdmin) {
    throw new HttpError(403, "This firewall also protects other servers. Only an admin can change it.")
  }
  return info
}

/* ------------------------------------------------------------------ schemas */

const Id = z.number().int().positive()
export const SshKeysText = z.string().max(64 * 1024).optional()

const Cidrs = z.array(z.string().trim().refine(isCidr, "use CIDR blocks such as 203.0.113.0/24 or ::/0")).max(100)

const Rule = z
  .object({
    description: z.string().trim().max(255).nullable().optional(),
    direction: z.enum(["in", "out"]),
    protocol: z.enum(["tcp", "udp", "icmp", "esp", "gre"]),
    port: z
      .string()
      .trim()
      .regex(/^\d{1,5}(-\d{1,5})?$/, "a port such as 22 or a range such as 1024-5000")
      .nullable()
      .optional(),
    source_ips: Cidrs.optional(),
    destination_ips: Cidrs.optional(),
  })
  .superRefine((r, issue) => {
    const ports = r.port?.split("-").map(Number) ?? []
    if ((r.protocol === "tcp" || r.protocol === "udp") && !r.port) {
      issue.addIssue({ code: "custom", message: "TCP and UDP rules need a port", path: ["port"] })
    }
    if (ports.some((p) => p < 1 || p > 65535) || (ports.length === 2 && ports[0] > ports[1])) {
      issue.addIssue({ code: "custom", message: "ports go from 1 to 65535", path: ["port"] })
    }
    const ips = r.direction === "in" ? r.source_ips : r.destination_ips
    if (!ips?.length) issue.addIssue({ code: "custom", message: "add at least one address range", path: ["source_ips"] })
  })
  .transform((r): FirewallRule => {
    const out: FirewallRule = { direction: r.direction, protocol: r.protocol, description: r.description || null }
    if (r.protocol === "tcp" || r.protocol === "udp") out.port = r.port ?? null
    if (r.direction === "in") out.source_ips = r.source_ips ?? []
    else out.destination_ips = r.destination_ips ?? []
    return out
  })

const Rules = z.array(Rule).max(50, "a firewall holds 50 rules at most")

/* ------------------------------------------------------------------ operations */

const POWER: { command: string; label: string }[] = [
  { command: "poweron", label: "Power on" },
  { command: "reboot", label: "Reboot" },
  { command: "shutdown", label: "Shut down" },
  { command: "reset", label: "Reset (hard reboot)" },
  { command: "poweroff", label: "Power off (hard)" },
]

export const OPERATIONS: Op[] = [
  /* ---------------------------------------------------------------- reading */
  {
    method: "GET",
    path: "",
    run: async (ctx) => {
      const server = await loadServer(ctx)
      return { server: ctx.isAdmin ? server : stripForUser(server) }
    },
  },
  {
    method: "GET",
    path: "actions",
    run: async (ctx) => {
      const page = Math.min(Math.max(Number(ctx.query.get("page")) || 1, 1), 100)
      const perPage = Math.min(Math.max(Number(ctx.query.get("per_page")) || 25, 1), 50)
      const { data } = await hzRequest<Dict>({
        projectId: ctx.projectId,
        path: `${base(ctx)}/actions`,
        query: { sort: "id:desc", page, per_page: perPage },
      })
      return data
    },
  },
  {
    method: "GET",
    path: "actions/:action",
    run: async (ctx) => {
      const { data } = await hzRequest<{ action: HzAction }>({ projectId: ctx.projectId, path: `/actions/${ctx.params.action}` })
      const ours = data.action?.resources?.some((r) => r.type === "server" && r.id === ctx.serverId)
      if (!ours) throw new HttpError(404, "That action does not belong to this server.")
      return data
    },
  },
  {
    method: "GET",
    path: "metrics",
    run: async (ctx) => {
      const type = ctx.query.get("type") ?? ""
      if (!["cpu", "disk", "network"].includes(type)) throw new HttpError(400, "type: cpu, disk or network")
      const start = new Date(ctx.query.get("start") ?? "")
      const end = new Date(ctx.query.get("end") ?? "")
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        throw new HttpError(400, "start and end must be dates, start before end.")
      }
      if (end.getTime() - start.getTime() > 31 * 24 * 3600_000) throw new HttpError(400, "Hetzner keeps 30 days of metrics.")
      const step = Number(ctx.query.get("step"))
      const { data } = await hzRequest<Dict>({
        projectId: ctx.projectId,
        path: `${base(ctx)}/metrics`,
        query: {
          type,
          start: start.toISOString(),
          end: end.toISOString(),
          ...(Number.isInteger(step) && step > 0 ? { step } : {}),
        },
      })
      return data
    },
  },
  {
    method: "GET",
    path: "network",
    run: async (ctx): Promise<NetworkInfo> => {
      const server = await loadServer(ctx)
      const nets = (server.private_net as Dict[] | undefined) ?? []
      const [fips, privateNets] = await Promise.all([
        floatingIps(ctx),
        Promise.all(
          nets.map(async (n): Promise<PrivateNetInfo> => {
            const id = Number(n.network)
            const info = { id, name: null, ipRange: null, ip: String(n.ip ?? ""), aliasIps: (n.alias_ips as string[]) ?? [] }
            try {
              const { data } = await hzRequest<{ network: Dict }>({ projectId: ctx.projectId, path: `/networks/${id}` })
              return { ...info, name: str(data.network?.name), ipRange: str(data.network?.ip_range) }
            } catch {
              return info
            }
          })
        ),
      ])
      return { floatingIps: fips.map(floatingIpInfo), privateNets }
    },
  },
  {
    method: "GET",
    path: "volumes",
    run: async (ctx): Promise<{ volumes: VolumeInfo[] }> => {
      const server = await loadServer(ctx)
      const ids = ((server.volumes as number[] | undefined) ?? []).map(Number)
      const volumes = await Promise.all(
        ids.map(async (id) => {
          const { data } = await hzRequest<{ volume: Dict }>({ projectId: ctx.projectId, path: `/volumes/${id}` })
          const v = data.volume
          return {
            id,
            name: str(v.name) ?? `Volume ${id}`,
            size: Number(v.size) || 0,
            linuxDevice: str(v.linux_device),
            format: str(v.format),
            status: str(v.status) ?? "unknown",
          }
        })
      )
      return { volumes }
    },
  },

  /* ---------------------------------------------------------------- power */
  ...POWER.map(
    ({ command, label }): Op => ({
      method: "POST",
      path: `actions/${command}`,
      mutates: true,
      describe: () => label,
      run: (ctx) => serverAction(ctx, command),
    })
  ),

  /* ---------------------------------------------------------------- console */
  {
    method: "POST",
    path: "actions/request_console",
    permission: "console",
    describe: () => "Open console",
    run: async (ctx) => {
      const data = await serverAction(ctx, "request_console")
      return { wss_url: data.wss_url, password: data.password, action: data.action }
    },
  },

  /* ---------------------------------------------------------------- root password */
  {
    method: "POST",
    path: "actions/reset_password",
    permission: "password",
    describe: () => "Reset root password",
    run: async (ctx) => {
      const data = await serverAction(ctx, "reset_password")
      return { root_password: data.root_password ?? null, action: data.action }
    },
  },

  /* ---------------------------------------------------------------- rebuild */
  {
    method: "GET",
    path: "images",
    run: async (ctx): Promise<ImageCatalog> => {
      const arch = await serverArch(ctx)
      const [catalog, own] = await Promise.all([
        cached(`images:${ctx.projectId}:${arch}`, async () =>
          (
            await hzFetchAll<Dict>(ctx.projectId, "/images", "images", {
              type: ["system", "app"],
              status: "available",
              architecture: arch,
            })
          ).map(imageInfo)
        ),
        ownImages(ctx),
      ])
      const snapshots = (ctx.isAdmin ? own.all : own.snapshots)
        .map(imageInfo)
        .filter((i) => !i.architecture || i.architecture === arch)
      return {
        system: catalog.filter((i) => i.type === "system").sort((a, b) => a.description.localeCompare(b.description)),
        apps: catalog.filter((i) => i.type === "app").sort((a, b) => a.description.localeCompare(b.description)),
        snapshots,
        backups: own.backups.map(imageInfo),
      }
    },
  },
  {
    method: "POST",
    path: "rebuild",
    permission: "rebuild",
    mutates: true,
    body: z.object({
      image: Id,
      sshKeys: SshKeysText,
      userData: z.string().max(32 * 1024, "cloud-init user data is limited to 32 KiB").optional(),
    }),
    describe: (ctx) => ctx.note ?? "Rebuild",
    run: async (ctx) => {
      const body = ctx.body as { image: number; sshKeys?: string; userData?: string }
      const server = await loadServer(ctx)
      const image = await usableImage(ctx, body.image, { system: true })
      if (image.status !== "available") throw new HttpError(409, "That image is not ready yet.")
      const arch = str(get(server, "server_type.architecture"))
      if (arch && image.architecture && image.architecture !== arch) {
        throw new HttpError(400, "That image is made for a different processor architecture.")
      }
      const keys = sshKeysOrThrow(body.sshKeys)
      const userData = body.userData?.trim() ? body.userData : keys.length ? cloudInitForKeys(keys) : undefined
      const label = str(image.description) ?? str(image.name) ?? `image ${image.id}`
      ctx.note = `Rebuild with ${label}`
      ctx.detail = { image: label, ...(keys.length ? { sshKeys: keys.length } : {}), ...(body.userData?.trim() ? { cloudInit: true } : {}) }
      const { data } = await hzRequest<Dict>({
        projectId: ctx.projectId,
        method: "POST",
        path: `${base(ctx)}/actions/rebuild`,
        body: { image: String(image.id), ...(userData ? { user_data: userData } : {}) },
        timeoutMs: 60_000,
      })
      return { root_password: data.root_password ?? null, action: data.action }
    },
  },

  /* ---------------------------------------------------------------- rescue */
  {
    method: "POST",
    path: "rescue",
    permission: "rescue",
    mutates: true,
    body: z.object({ sshKeys: SshKeysText, reboot: z.boolean().default(false) }),
    describe: (ctx) => ctx.note ?? "Enable rescue mode",
    run: async (ctx) => {
      const body = ctx.body as { sshKeys?: string; reboot: boolean }
      const keys = sshKeysOrThrow(body.sshKeys)
      const server = await loadServer(ctx)
      await cleanupTemporaryKeys(ctx.projectId)
      const ids: number[] = []
      for (const key of keys) ids.push(await temporaryKey(ctx.projectId, ctx.serverId, key))
      ctx.note = body.reboot ? "Enable rescue mode and restart into it" : "Enable rescue mode"
      if (keys.length) ctx.detail = { sshKeys: keys.length }
      const data = await serverAction(ctx, "enable_rescue", { type: "linux64", ssh_keys: ids })
      const action = data.action as HzAction | undefined
      let restart: HzAction | null = null
      if (body.reboot) {
        // The restart has to wait: Hetzner refuses a second action while the first one runs.
        const done = action?.id ? await waitForAction(ctx.projectId, action.id) : null
        if (done?.status === "error") throw new HttpError(502, done.error?.message ?? "Hetzner could not enable rescue mode.")
        const command = server.status === "off" ? "poweron" : "reset"
        restart = ((await serverAction(ctx, command)).action as HzAction) ?? null
      }
      return { root_password: data.root_password ?? null, action, restart }
    },
  },
  {
    method: "POST",
    path: "actions/disable_rescue",
    permission: "rescue",
    mutates: true,
    describe: () => "Disable rescue mode",
    run: (ctx) => serverAction(ctx, "disable_rescue"),
  },

  /* ---------------------------------------------------------------- ISO */
  {
    method: "GET",
    path: "isos",
    run: async (ctx): Promise<{ isos: IsoInfo[] }> => {
      const arch = await serverArch(ctx)
      const isos = await cached(`isos:${ctx.projectId}:${arch}`, async () =>
        (
          await hzFetchAll<Dict>(ctx.projectId, "/isos", "isos", { architecture: arch, include_architecture_wildcard: true })
        )
          .filter((i) => !unavailable(i))
          .map((i) => ({
            id: Number(i.id),
            name: str(i.name),
            description: str(i.description) ?? str(i.name) ?? `ISO ${i.id}`,
            type: str(i.type),
            architecture: str(i.architecture),
          }))
          .sort((a, b) => a.description.localeCompare(b.description))
      )
      return { isos }
    },
  },
  {
    method: "POST",
    path: "iso",
    permission: "iso",
    mutates: true,
    body: z.object({ iso: Id }),
    describe: (ctx) => ctx.note ?? "Attach ISO",
    run: async (ctx) => {
      const { iso } = ctx.body as { iso: number }
      const { data: found } = await hzRequest<{ iso: Dict }>({ projectId: ctx.projectId, path: `/isos/${iso}` })
      const label = str(found.iso?.description) ?? str(found.iso?.name) ?? `ISO ${iso}`
      ctx.note = `Attach ISO ${label}`
      return serverAction(ctx, "attach_iso", { iso: String(iso) })
    },
  },
  {
    method: "POST",
    path: "actions/detach_iso",
    permission: "iso",
    mutates: true,
    describe: () => "Detach ISO",
    run: (ctx) => serverAction(ctx, "detach_iso"),
  },

  /* ---------------------------------------------------------------- reverse DNS */
  {
    method: "POST",
    path: "rdns",
    permission: "rdns",
    mutates: true,
    body: z.object({ ip: z.string().trim().max(64), dns_ptr: z.string().trim().max(253).nullable() }),
    describe: (ctx) => ctx.note ?? "Change reverse DNS",
    run: async (ctx) => {
      const body = ctx.body as { ip: string; dns_ptr: string | null }
      const ip = body.ip
      const ptr = body.dns_ptr ? body.dns_ptr.replace(/\.$/, "") : null
      if (!isIPv4(ip) && !isIPv6(ip)) throw new HttpError(400, "That is not an IP address.")
      if (ptr !== null && !isHostname(ptr)) throw new HttpError(400, "That is not a valid host name.")
      const server = await loadServer(ctx)
      const v4 = str(get(server, "public_net.ipv4.ip"))
      const v6 = str(get(server, "public_net.ipv6.ip"))
      let path: string | null = null
      if (ip === v4 || (v6 && isIPv6(ip) && inIPv6Network(ip, v6))) {
        path = `${base(ctx)}/actions/change_dns_ptr`
      } else {
        const fip = (await floatingIps(ctx)).find(
          (f) => f.ip === ip || (f.type === "ipv6" && isIPv6(ip) && inIPv6Network(ip, String(f.ip)))
        )
        if (fip) path = `/floating_ips/${fip.id}/actions/change_dns_ptr`
      }
      if (!path) throw new HttpError(404, "That address does not belong to this server.")
      ctx.note = ptr ? `Set reverse DNS of ${ip} to ${ptr}` : `Reset reverse DNS of ${ip}`
      const { data } = await hzRequest<Dict>({ projectId: ctx.projectId, method: "POST", path, body: { ip, dns_ptr: ptr } })
      return data
    },
  },

  /* ---------------------------------------------------------------- firewall */
  {
    method: "GET",
    path: "firewalls",
    run: async (ctx): Promise<{ firewalls: FirewallInfo[] }> => {
      const list = await firewallsOf(ctx)
      return { firewalls: list.map((f) => firewallInfo(f.raw, f.status, ctx.serverId)) }
    },
  },
  {
    method: "PUT",
    path: "firewalls/:firewall",
    permission: "firewall",
    body: z.object({ rules: Rules }),
    describe: (ctx) => ctx.note ?? "Change firewall rules",
    run: async (ctx) => {
      const { rules } = ctx.body as { rules: FirewallRule[] }
      const fw = await editableFirewall(ctx, Number(ctx.params.firewall))
      ctx.note = `Set ${rules.length} rule${rules.length === 1 ? "" : "s"} on firewall ${fw.name}`
      const { data } = await hzRequest<Dict>({
        projectId: ctx.projectId,
        method: "POST",
        path: `/firewalls/${fw.id}/actions/set_rules`,
        body: { rules },
      })
      return data
    },
  },
  {
    method: "POST",
    path: "firewalls",
    permission: "firewall",
    mutates: true,
    body: z.object({ rules: Rules }),
    describe: (ctx) => ctx.note ?? "Create firewall",
    run: async (ctx) => {
      const { rules } = ctx.body as { rules: FirewallRule[] }
      const server = await loadServer(ctx)
      const existing = (await firewallsOf(ctx)).map((f) => firewallInfo(f.raw, f.status, ctx.serverId))
      if (existing.some((f) => f.exclusive)) throw new HttpError(409, "This server already has its own firewall.")
      const stem = `${str(server.name) ?? `server-${ctx.serverId}`}-firewall`.slice(0, 50)
      for (let attempt = 0; ; attempt++) {
        const name = attempt === 0 ? stem : `${stem}-${crypto.randomBytes(2).toString("hex")}`
        try {
          const { data } = await hzRequest<{ firewall: Dict; actions: HzAction[] }>({
            projectId: ctx.projectId,
            method: "POST",
            path: "/firewalls",
            body: {
              name,
              rules,
              labels: { "managed-by": "hetzner-dock" },
              apply_to: [{ type: "server", server: { id: ctx.serverId } }],
            },
          })
          ctx.note = `Create firewall ${name} with ${rules.length} rule${rules.length === 1 ? "" : "s"}`
          return data
        } catch (e) {
          if (attempt < 3 && e instanceof HetznerError && e.code === "uniqueness_error") continue
          throw e
        }
      }
    },
  },
  {
    method: "DELETE",
    path: "firewalls/:firewall",
    permission: "firewall",
    mutates: true,
    describe: (ctx) => ctx.note ?? "Remove firewall",
    run: async (ctx) => {
      const fw = await editableFirewall(ctx, Number(ctx.params.firewall))
      ctx.note = fw.exclusive ? `Delete firewall ${fw.name}` : `Remove firewall ${fw.name} from this server`
      const { data } = await hzRequest<{ actions: HzAction[] }>({
        projectId: ctx.projectId,
        method: "POST",
        path: `/firewalls/${fw.id}/actions/remove_from_resources`,
        body: { remove_from: [{ type: "server", server: { id: ctx.serverId } }] },
      })
      if (!fw.exclusive) return { ok: true, deleted: false }
      // A firewall can only be deleted once it protects nothing; wait for the removal first.
      for (const action of data.actions ?? []) await waitForAction(ctx.projectId, action.id)
      try {
        await hzRequest({ projectId: ctx.projectId, method: "DELETE", path: `/firewalls/${fw.id}` })
      } catch (e) {
        // Still detaching: the server is unprotected already, the empty firewall stays for an admin.
        if (e instanceof HetznerError && e.code === "resource_in_use") return { ok: true, deleted: false }
        throw e
      }
      return { ok: true, deleted: true }
    },
  },

  /* ---------------------------------------------------------------- snapshots */
  {
    method: "GET",
    path: "snapshots",
    run: async (ctx): Promise<SnapshotList> => {
      const own = await ownImages(ctx)
      return {
        snapshots: own.snapshots.map(imageInfo),
        backups: own.backups.map(imageInfo),
        limit: ctx.isAdmin ? null : ctx.permissions.snapshots,
      }
    },
  },
  {
    method: "POST",
    path: "snapshots",
    mutates: true,
    body: z.object({ description: z.string().trim().max(100).optional() }),
    describe: (ctx) => ctx.note ?? "Take snapshot",
    run: async (ctx) => {
      const { description } = ctx.body as { description?: string }
      const server = await loadServer(ctx)
      if (!ctx.isAdmin) {
        const limit = ctx.permissions.snapshots
        if (limit <= 0) throw new HttpError(403, "Your admin has turned snapshots off.")
        const { snapshots } = await ownImages(ctx)
        if (snapshots.length >= limit) {
          throw new HttpError(409, `You can keep ${limit} snapshot${limit === 1 ? "" : "s"} of this server. Delete one first.`)
        }
      }
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ")
      const label = description || `${str(server.name) ?? "server"} ${stamp}`
      ctx.note = `Take snapshot "${label}"`
      const { data } = await hzRequest<Dict>({
        projectId: ctx.projectId,
        method: "POST",
        path: `${base(ctx)}/actions/create_image`,
        body: { type: "snapshot", description: label },
      })
      return { image: data.image ? imageInfo(data.image as Dict) : null, action: data.action }
    },
  },
  {
    method: "PUT",
    path: "snapshots/:image",
    body: z.object({ description: z.string().trim().min(1).max(100) }),
    describe: (ctx) => ctx.note ?? "Rename snapshot",
    run: async (ctx) => {
      const { description } = ctx.body as { description: string }
      const image = await usableImage(ctx, Number(ctx.params.image), { system: false })
      ctx.note = `Rename snapshot "${str(image.description) ?? image.id}" to "${description}"`
      const { data } = await hzRequest<{ image: Dict }>({
        projectId: ctx.projectId,
        method: "PUT",
        path: `/images/${image.id}`,
        body: { description },
      })
      return { image: imageInfo(data.image) }
    },
  },
  {
    method: "DELETE",
    path: "snapshots/:image",
    describe: (ctx) => ctx.note ?? "Delete snapshot",
    run: async (ctx) => {
      const image = await usableImage(ctx, Number(ctx.params.image), { system: false })
      // Users may delete their own snapshots; backups belong to the paid backup option.
      if (image.type === "backup" && !ctx.isAdmin) throw new HttpError(403, "Only an admin can delete backups.")
      ctx.note = `Delete ${image.type} "${str(image.description) ?? image.id}"`
      await hzRequest({ projectId: ctx.projectId, method: "DELETE", path: `/images/${image.id}` })
      return { ok: true }
    },
  },
  {
    method: "POST",
    path: "snapshots/:image/keep",
    adminOnly: true,
    describe: (ctx) => ctx.note ?? "Turn a backup into a snapshot",
    run: async (ctx) => {
      const image = await usableImage(ctx, Number(ctx.params.image), { system: false })
      if (image.type !== "backup") throw new HttpError(400, "Only backups can be turned into snapshots.")
      ctx.note = `Turn backup "${str(image.description) ?? image.id}" into a snapshot`
      const { data } = await hzRequest<{ image: Dict }>({
        projectId: ctx.projectId,
        method: "PUT",
        path: `/images/${image.id}`,
        body: { type: "snapshot" },
      })
      return { image: imageInfo(data.image) }
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
        .max(63)
        .regex(/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/, "letters, digits, dots and dashes, as in a host name"),
    }),
    describe: (ctx) => ctx.note ?? "Rename server",
    run: async (ctx) => {
      const { name } = ctx.body as { name: string }
      const before = str((await loadServer(ctx)).name)
      ctx.note = `Rename server "${before}" to "${name}" at Hetzner`
      const { data } = await hzRequest<{ server: Dict }>({ projectId: ctx.projectId, method: "PUT", path: base(ctx), body: { name } })
      db()
        .prepare("UPDATE assignments SET label = ? WHERE kind = 'cloud' AND project_id = ? AND server_id = ?")
        .run(name, ctx.projectId, ctx.serverId)
      ctx.serverName = name
      return { server: data.server }
    },
  },
  {
    method: "POST",
    path: "actions/change_protection",
    adminOnly: true,
    body: z.object({ enabled: z.boolean() }),
    describe: (ctx) => ((ctx.body as { enabled: boolean }).enabled ? "Turn protection on" : "Turn protection off"),
    // Hetzner currently wants delete and rebuild protection to have the same value.
    run: (ctx) => {
      const { enabled } = ctx.body as { enabled: boolean }
      return serverAction(ctx, "change_protection", { delete: enabled, rebuild: enabled })
    },
  },
  {
    method: "POST",
    path: "actions/enable_backup",
    adminOnly: true,
    mutates: true,
    describe: () => "Turn backups on",
    run: (ctx) => serverAction(ctx, "enable_backup"),
  },
  {
    method: "POST",
    path: "actions/disable_backup",
    adminOnly: true,
    mutates: true,
    describe: () => "Turn backups off and delete them",
    run: (ctx) => serverAction(ctx, "disable_backup"),
  },
  {
    method: "GET",
    path: "server-types",
    adminOnly: true,
    run: async (ctx): Promise<{ types: ServerTypeOption[] }> => {
      const server = await loadServer(ctx)
      const where = str(locationOf(server).name)
      const current = (server.server_type ?? {}) as Dict
      const all = await cached(`server-types:${ctx.projectId}`, () => hzFetchAll<Dict>(ctx.projectId, "/server_types", "server_types"))
      // Only types offered in the server's location, on the same architecture and disk kind, can be moved to.
      const types = all
        .filter((t) => ((t.locations as Dict[] | undefined) ?? []).some((l) => l.name === where))
        .filter((t) => t.architecture === current.architecture && t.storage_type === current.storage_type)
        .map((t): ServerTypeOption => {
          const here = ((t.locations as Dict[] | undefined) ?? []).find((l) => l.name === where)
          const price = ((t.prices as Dict[] | undefined) ?? []).find((p) => p.location === where)
          return {
            id: Number(t.id),
            name: String(t.name ?? ""),
            description: String(t.description ?? ""),
            cores: Number(t.cores) || 0,
            memory: Number(t.memory) || 0,
            disk: Number(t.disk) || 0,
            cpuType: String(t.cpu_type ?? ""),
            storageType: String(t.storage_type ?? ""),
            architecture: String(t.architecture ?? ""),
            available: here ? here.available !== false : false,
            deprecated: !!here?.deprecation,
            price: price ? Number(get(price, "price_monthly.gross")) || null : null,
          }
        })
        .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
      return { types }
    },
  },
  {
    method: "POST",
    path: "actions/change_type",
    adminOnly: true,
    mutates: true,
    body: z.object({ server_type: z.string().trim().min(1).max(40), upgrade_disk: z.boolean() }),
    describe: (ctx) => {
      const body = ctx.body as { server_type: string; upgrade_disk: boolean }
      return `Change type to ${body.server_type.toUpperCase()}${body.upgrade_disk ? " with a bigger disk" : ", keeping the disk"}`
    },
    run: (ctx) => serverAction(ctx, "change_type", ctx.body),
  },
]

/** Finds the operation for a request, with the IDs the path carries. */
export function matchOperation(
  operations: Op[],
  method: string,
  segments: string[]
): { op: Op; params: Record<string, string> } | null {
  for (const op of operations) {
    if (op.method !== method) continue
    const pattern = op.path ? op.path.split("/") : []
    if (pattern.length !== segments.length) continue
    const params: Record<string, string> = {}
    const ok = pattern.every((part, i) => {
      if (part.startsWith(":")) {
        if (!/^\d{1,18}$/.test(segments[i])) return false
        params[part.slice(1)] = segments[i]
        return true
      }
      return part === segments[i]
    })
    if (ok) return { op, params }
  }
  return null
}
