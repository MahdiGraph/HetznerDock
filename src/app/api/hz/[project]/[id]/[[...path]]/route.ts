import type { NextRequest } from "next/server"
import { clientIp, HttpError, json, parseWith, requireApiUser, route } from "@/lib/http"
import { HetznerError } from "@/lib/hetzner"
import { getProject } from "@/lib/projects"
import { canAccess, invalidateProject, knownServerName } from "@/lib/servers"
import { getPermissions } from "@/lib/settings"
import { matchOperation, type OpContext } from "@/lib/operations"
import { audit } from "@/lib/audit"

type Ctx = { params: Promise<{ project: string; id: string; path?: string[] }> }

const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/

/**
 * The single gateway between panel users and the Hetzner API for one server.
 * It checks the session, the assignment, the list of operations and the user
 * permissions, runs the operation (through the proxy when enabled) and logs
 * what changed.
 */
async function handle(req: NextRequest, ctx: Ctx) {
  const user = requireApiUser(req)
  const params = await ctx.params
  const project = getProject(Number(params.project))
  if (!project) throw new HttpError(404, "Unknown Hetzner project.")
  const serverId = Number(params.id)
  if (!Number.isSafeInteger(serverId) || serverId <= 0) throw new HttpError(404, "Unknown server.")
  const segments = params.path ?? []
  if (!segments.every((s) => SEGMENT.test(s))) throw new HttpError(400, "Invalid path.")

  if (!canAccess(user, project.id, serverId)) throw new HttpError(404, "This server is not assigned to you.")
  const match = matchOperation(req.method, segments)
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
    projectId: project.id,
    serverId,
    params: opParams,
    query: req.nextUrl.searchParams,
    body,
    permissions,
    serverName: knownServerName(project.id, serverId),
  }

  const log = (status: number) =>
    op.describe &&
    audit({
      user,
      action: op.describe(context),
      projectId: project.id,
      serverId,
      serverName: context.serverName,
      detail: context.detail ? JSON.stringify(context.detail) : null,
      status,
      ip: clientIp(req),
    })

  try {
    const result = await op.run(context)
    log(200)
    if (op.mutates) invalidateProject(project.id)
    return json(result ?? { ok: true })
  } catch (e) {
    if (e instanceof HetznerError) log(e.status)
    throw e
  }
}

export const GET = route<Ctx>(handle)
export const POST = route<Ctx>(handle)
export const PUT = route<Ctx>(handle)
export const DELETE = route<Ctx>(handle)
