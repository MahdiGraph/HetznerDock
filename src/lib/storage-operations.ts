import { z } from "zod"
import { hzRequest } from "./hetzner"
import { HttpError } from "./http"
import type { Op, OpContext } from "./operations"
import { boxPassword, stripBox } from "./storage"
import type { HzAction } from "./hz-types"
import type { Dict } from "./summary"

/**
 * Everything users can do with a Storage Box. Every call names the box in its
 * path, so Hetzner itself refuses snapshots and sub-accounts of another box.
 */

const base = (ctx: OpContext) => `/storage_boxes/${ctx.serverId}`

async function call<T = Dict>(ctx: OpContext, method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown, query?: Record<string, string | number>) {
  const { data } = await hzRequest<T>({ projectId: ctx.projectId, api: "hetzner", method, path, body, query })
  return data
}

async function loadBox(ctx: OpContext): Promise<Dict> {
  if (ctx.raw) return ctx.raw
  const data = await call<{ storage_box: Dict }>(ctx, "GET", base(ctx))
  ctx.raw = data.storage_box
  if (typeof data.storage_box?.name === "string") ctx.serverName = data.storage_box.name
  return data.storage_box
}

const Access = z
  .object({
    ssh_enabled: z.boolean(),
    samba_enabled: z.boolean(),
    webdav_enabled: z.boolean(),
    zfs_enabled: z.boolean(),
    reachable_externally: z.boolean(),
  })
  .partial()

const SubAccess = z
  .object({
    ssh_enabled: z.boolean(),
    samba_enabled: z.boolean(),
    webdav_enabled: z.boolean(),
    reachable_externally: z.boolean(),
    readonly: z.boolean(),
  })
  .partial()

const HomeDirectory = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._\-/]+$/, "letters, digits, dots, dashes, underscores and slashes")
  .refine((d) => !d.split("/").includes(".."), "no .. in the path")

const AccessNames: Record<string, string> = {
  ssh_enabled: "SSH",
  samba_enabled: "Samba",
  webdav_enabled: "WebDAV",
  zfs_enabled: "the ZFS snapshot folder",
  reachable_externally: "access from outside Hetzner",
  readonly: "read-only",
}

function describeAccess(body: Record<string, boolean | undefined>) {
  return Object.entries(body)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${AccessNames[k] ?? k} ${v ? "on" : "off"}`)
    .join(", ")
}

export const STORAGE_OPERATIONS: Op[] = [
  /* ---------------------------------------------------------------- reading */
  {
    method: "GET",
    path: "",
    run: async (ctx) => {
      const box = await loadBox(ctx)
      return { storage_box: ctx.isAdmin ? box : stripBox(box) }
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
      const data = await call<{ action: HzAction }>(ctx, "GET", `/storage_boxes/actions/${ctx.params.action}`)
      const resources = data.action?.resources ?? []
      if (resources.some((r) => r.type === "storage_box" && r.id === ctx.serverId)) return data
      // A sub-account's action may name only the sub-account, which must be one of this box.
      const sub = resources.find((r) => r.type === "storage_box_subaccount")
      if (!sub) throw new HttpError(404, "That action does not belong to this Storage Box.")
      await call(ctx, "GET", `${base(ctx)}/subaccounts/${Number(sub.id)}`)
      return data
    },
  },
  {
    method: "GET",
    path: "snapshots",
    run: (ctx) => call(ctx, "GET", `${base(ctx)}/snapshots`, undefined, { sort: "created:desc" }),
  },
  {
    method: "GET",
    path: "subaccounts",
    run: async (ctx) => {
      const data = await call<{ subaccounts: Dict[] }>(ctx, "GET", `${base(ctx)}/subaccounts`)
      return { subaccounts: (data.subaccounts ?? []).map((s) => ({ ...s, labels: {} })) }
    },
  },

  /* ---------------------------------------------------------------- the box */
  {
    method: "POST",
    path: "password",
    permission: "storage",
    describe: () => "Reset the Storage Box password",
    run: async (ctx) => {
      const password = boxPassword()
      const data = await call(ctx, "POST", `${base(ctx)}/actions/reset_password`, { password })
      return { password, action: data.action }
    },
  },
  {
    method: "POST",
    path: "access",
    permission: "storage",
    mutates: true,
    body: Access,
    describe: (ctx) => `Change access: ${describeAccess(ctx.body as Record<string, boolean>)}`,
    run: async (ctx) => {
      const body = ctx.body as Record<string, boolean>
      if (!Object.keys(body).length) throw new HttpError(400, "Nothing to change.")
      return call(ctx, "POST", `${base(ctx)}/actions/update_access_settings`, body)
    },
  },
  {
    method: "POST",
    path: "snapshot-plan",
    permission: "storage",
    mutates: true,
    body: z.object({
      max_snapshots: z.number().int().min(1).max(100),
      minute: z.number().int().min(0).max(59),
      hour: z.number().int().min(0).max(23),
      day_of_week: z.number().int().min(1).max(7).nullable().default(null),
      day_of_month: z.number().int().min(1).max(31).nullable().default(null),
    }),
    describe: (ctx) => {
      const b = ctx.body as { max_snapshots: number; hour: number; minute: number }
      return `Turn on automatic snapshots at ${String(b.hour).padStart(2, "0")}:${String(b.minute).padStart(2, "0")} UTC, keeping ${b.max_snapshots}`
    },
    run: (ctx) => call(ctx, "POST", `${base(ctx)}/actions/enable_snapshot_plan`, ctx.body),
  },
  {
    method: "DELETE",
    path: "snapshot-plan",
    permission: "storage",
    mutates: true,
    describe: () => "Turn off automatic snapshots",
    run: (ctx) => call(ctx, "POST", `${base(ctx)}/actions/disable_snapshot_plan`),
  },

  /* ---------------------------------------------------------------- snapshots */
  {
    method: "POST",
    path: "snapshots",
    permission: "storage",
    body: z.object({ description: z.string().trim().max(200).optional() }),
    describe: (ctx) => `Take a Storage Box snapshot${(ctx.body as { description?: string }).description ? ` "${(ctx.body as { description: string }).description}"` : ""}`,
    run: (ctx) => {
      const { description } = ctx.body as { description?: string }
      return call(ctx, "POST", `${base(ctx)}/snapshots`, description ? { description } : {})
    },
  },
  {
    method: "DELETE",
    path: "snapshots/:snapshot",
    permission: "storage",
    describe: (ctx) => `Delete Storage Box snapshot ${ctx.params.snapshot}`,
    run: async (ctx) => {
      await call(ctx, "DELETE", `${base(ctx)}/snapshots/${ctx.params.snapshot}`)
      return { ok: true }
    },
  },
  {
    method: "POST",
    path: "snapshots/:snapshot/rollback",
    permission: "storage",
    mutates: true,
    describe: (ctx) => `Roll the Storage Box back to snapshot ${ctx.params.snapshot}`,
    run: async (ctx) => {
      // The snapshot must belong to this box; Hetzner answers 404 otherwise.
      await call(ctx, "GET", `${base(ctx)}/snapshots/${ctx.params.snapshot}`)
      return call(ctx, "POST", `${base(ctx)}/actions/rollback_snapshot`, { snapshot: Number(ctx.params.snapshot) })
    },
  },

  /* ---------------------------------------------------------------- sub-accounts */
  {
    method: "POST",
    path: "subaccounts",
    permission: "storage",
    body: z.object({
      home_directory: HomeDirectory,
      description: z.string().trim().max(200).optional(),
      access_settings: SubAccess.optional(),
    }),
    describe: (ctx) => `Create a sub-account for ${(ctx.body as { home_directory: string }).home_directory}`,
    run: async (ctx) => {
      const body = ctx.body as { home_directory: string; description?: string; access_settings?: Record<string, boolean> }
      const password = boxPassword()
      const data = await call<{ subaccount?: Dict; action?: HzAction }>(ctx, "POST", `${base(ctx)}/subaccounts`, {
        home_directory: body.home_directory,
        password,
        ...(body.description ? { description: body.description } : {}),
        ...(body.access_settings ? { access_settings: body.access_settings } : {}),
      })
      return { subaccount: data.subaccount ?? null, password, action: data.action }
    },
  },
  {
    method: "POST",
    path: "subaccounts/:subaccount/password",
    permission: "storage",
    describe: (ctx) => `Reset the password of sub-account ${ctx.params.subaccount}`,
    run: async (ctx) => {
      const password = boxPassword()
      const data = await call(ctx, "POST", `${base(ctx)}/subaccounts/${ctx.params.subaccount}/actions/reset_subaccount_password`, { password })
      return { password, action: data.action }
    },
  },
  {
    method: "POST",
    path: "subaccounts/:subaccount/access",
    permission: "storage",
    body: SubAccess,
    describe: (ctx) => `Change access of sub-account ${ctx.params.subaccount}: ${describeAccess(ctx.body as Record<string, boolean>)}`,
    run: (ctx) =>
      call(ctx, "POST", `${base(ctx)}/subaccounts/${ctx.params.subaccount}/actions/update_access_settings`, ctx.body),
  },
  {
    method: "DELETE",
    path: "subaccounts/:subaccount",
    permission: "storage",
    describe: (ctx) => `Delete sub-account ${ctx.params.subaccount}`,
    run: async (ctx) => {
      const data = await call(ctx, "DELETE", `${base(ctx)}/subaccounts/${ctx.params.subaccount}`)
      return data ?? { ok: true }
    },
  },

  /* ---------------------------------------------------------------- admin only */
  {
    method: "POST",
    path: "protection",
    adminOnly: true,
    body: z.object({ enabled: z.boolean() }),
    describe: (ctx) => ((ctx.body as { enabled: boolean }).enabled ? "Protect the Storage Box" : "Remove the Storage Box protection"),
    run: (ctx) => call(ctx, "POST", `${base(ctx)}/actions/change_protection`, { delete: (ctx.body as { enabled: boolean }).enabled }),
  },
]
