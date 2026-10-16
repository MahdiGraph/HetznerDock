import type { NextRequest } from "next/server"
import { audit } from "./audit"
import { invalidateAccount } from "./dedicated"
import { DEDICATED_OPERATIONS } from "./dedicated-operations"
import { invalidateZones } from "./dns"
import { DNS_OPERATIONS } from "./dns-operations"
import { HetznerError } from "./hetzner"
import { clientIp, HttpError, json, parseWith, requireApiUser, route } from "./http"
import { matchOperation, OPERATIONS, type OpContext } from "./operations"
import { getProject } from "./projects"
import { getRobotAccount } from "./robot-accounts"
import { canAccess, invalidateProject, knownServerName } from "./servers"
import { getPermissions } from "./settings"
import { invalidateStorage } from "./storage"
import { STORAGE_OPERATIONS } from "./storage-operations"
import type { ServerKind } from "./summary"

type Ctx = { params: Promise<{ project: string; id: string; path?: string[] }> }

const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/

const KINDS = {
  cloud: { owner: getProject, operations: OPERATIONS, unknown: "Unknown Hetzner project.", invalidate: invalidateProject },
  dedicated: {
    owner: getRobotAccount,
    operations: DEDICATED_OPERATIONS,
    unknown: "Unknown Robot account.",
    invalidate: invalidateAccount,
  },
  storage: { owner: getProject, operations: STORAGE_OPERATIONS, unknown: "Unknown Hetzner project.", invalidate: invalidateStorage },
  dns: { owner: getProject, operations: DNS_OPERATIONS, unknown: "Unknown Hetzner project.", invalidate: invalidateZones },
}

/**
 * The single gateway between panel users and Hetzner for one server: the Cloud
 * API for cloud servers (/api/hz/{project}/{id}/…), the Robot webservice for
 * dedicated servers (/api/hz/dedicated/{account}/{number}/…). It checks the
 * session, the assignment, the list of operations and the user permissions, runs
 * the operation (through the proxy when enabled) and logs what changed.
 */
export function gateway(kind: ServerKind) {
  const { owner: findOwner, operations, unknown, invalidate } = KINDS[kind]

  return route<Ctx>(async (req: NextRequest, ctx: Ctx) => {
    const user = requireApiUser(req)
    const params = await ctx.params
    const owner = findOwner(Number(params.project))
    if (!owner) throw new HttpError(404, unknown)
    const serverId = Number(params.id)
    if (!Number.isSafeInteger(serverId) || serverId <= 0) throw new HttpError(404, "Unknown server.")
    const segments = params.path ?? []
    if (!segments.every((s) => SEGMENT.test(s))) throw new HttpError(400, "Invalid path.")

    if (!canAccess(user, kind, owner.id, serverId)) throw new HttpError(404, "This server is not assigned to you.")
    const match = matchOperation(operations, req.method, segments)
    if (!match) throw new HttpError(404, "This is not available in Hetzner Dock.")
    const { op, params: opParams } = match
    const isAdmin = user.role === "admin"
    const permissions = getPermissions()
    if (op.adminOnly && !isAdmin) throw new HttpError(403, "Only admins can do this.")
    if (op.permission && !isAdmin && !permissions[op.permission]) throw new HttpError(403, "Your admin has turned this off.")

    let body: unknown = undefined
    if (op.body) {
      const text = await req.text()
      if (text.length > 128 * 1024) throw new HttpError(413, "Request body is too large.")
      let raw: unknown = {}
      try {
        raw = text ? JSON.parse(text) : {}
      } catch {
        throw new HttpError(400, "Invalid JSON body.")
      }
      body = parseWith(op.body, raw)
    }

    const context: OpContext = {
      user,
      isAdmin,
      projectId: owner.id,
      serverId,
      params: opParams,
      query: req.nextUrl.searchParams,
      body,
      permissions,
      serverName: knownServerName(kind, owner.id, serverId),
    }

    const log = (status: number) =>
      op.describe &&
      audit({
        user,
        action: op.describe(context),
        kind,
        projectId: owner.id,
        serverId,
        serverName: context.serverName,
        detail: context.detail ? JSON.stringify(context.detail) : null,
        status,
        ip: clientIp(req),
      })

    try {
      const result = await op.run(context)
      log(200)
      if (op.mutates) invalidate(owner.id)
      return json(result ?? { ok: true })
    } catch (e) {
      if (e instanceof HetznerError) log(e.status)
      throw e
    }
  })
}
