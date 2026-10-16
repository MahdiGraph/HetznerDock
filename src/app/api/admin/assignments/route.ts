import { z } from "zod"
import { db } from "@/lib/db"
import { clientIp, HttpError, json, readJson, requireApiAdmin, route } from "@/lib/http"
import { getProject } from "@/lib/projects"
import { getRobotAccount } from "@/lib/robot-accounts"
import { SERVER_KINDS } from "@/lib/summary"
import { audit } from "@/lib/audit"

const ServerRef = {
  /** A cloud server of a project, or a dedicated server of a Robot account (projectId is then the account). */
  kind: z.enum(SERVER_KINDS).default("cloud"),
  projectId: z.number().int().positive(),
  serverId: z.number().int().positive(),
}

const Put = z.object({
  ...ServerRef,
  label: z.string().max(200).nullable().optional(),
  userIds: z.array(z.number().int().positive()).max(500),
})

/** Replaces the list of users a server is assigned to. */
export const PUT = route(async (req) => {
  const admin = requireApiAdmin(req)
  const body = await readJson(req, Put)
  const { kind, projectId, serverId } = body
  if (kind === "cloud" ? !getProject(projectId) : !getRobotAccount(projectId)) {
    throw new HttpError(404, kind === "cloud" ? "That Hetzner project does not exist." : "That Robot account does not exist.")
  }

  const current = db()
    .prepare("SELECT user_id FROM assignments WHERE kind = ? AND project_id = ? AND server_id = ?")
    .all(kind, projectId, serverId) as { user_id: number }[]
  const before = new Set(current.map((r) => r.user_id))
  const after = new Set(body.userIds)
  const users = new Map(
    (db().prepare("SELECT id, username FROM users").all() as { id: number; username: string }[]).map((u) => [u.id, u.username])
  )

  const added: string[] = []
  const removed: string[] = []
  db().transaction(() => {
    for (const id of after) {
      if (!users.has(id)) continue
      if (!before.has(id)) {
        db()
          .prepare(
            "INSERT INTO assignments (user_id, kind, project_id, server_id, label, created_at) VALUES (?, ?, ?, ?, ?, ?)"
          )
          .run(id, kind, projectId, serverId, body.label ?? null, Date.now())
        added.push(users.get(id)!)
      } else if (body.label) {
        db()
          .prepare("UPDATE assignments SET label = ? WHERE user_id = ? AND kind = ? AND project_id = ? AND server_id = ?")
          .run(body.label, id, kind, projectId, serverId)
      }
    }
    for (const id of before) {
      if (!after.has(id)) {
        db()
          .prepare("DELETE FROM assignments WHERE user_id = ? AND kind = ? AND project_id = ? AND server_id = ?")
          .run(id, kind, projectId, serverId)
        removed.push(users.get(id) ?? `#${id}`)
      }
    }
  })()

  const name = body.label || `server ${serverId}`
  const common = {
    user: admin,
    kind,
    projectId,
    serverId,
    serverName: body.label ?? null,
    ip: clientIp(req),
    status: 200,
  }
  if (added.length) audit({ ...common, action: `Assigned ${name} to ${added.join(", ")}` })
  if (removed.length) audit({ ...common, action: `Unassigned ${name} from ${removed.join(", ")}` })
  return json({ ok: true })
})

const Delete = z.object({ ...ServerRef, userId: z.number().int().positive() })

/** Removes one assignment (used from the Users screen). */
export const DELETE = route(async (req) => {
  const admin = requireApiAdmin(req)
  const body = await readJson(req, Delete)
  const { kind, projectId, serverId } = body
  const user = db().prepare("SELECT username FROM users WHERE id = ?").get(body.userId) as { username: string } | undefined
  const row = db()
    .prepare("SELECT label FROM assignments WHERE user_id = ? AND kind = ? AND project_id = ? AND server_id = ?")
    .get(body.userId, kind, projectId, serverId) as { label: string | null } | undefined
  db()
    .prepare("DELETE FROM assignments WHERE user_id = ? AND kind = ? AND project_id = ? AND server_id = ?")
    .run(body.userId, kind, projectId, serverId)
  audit({
    user: admin,
    action: `Unassigned ${row?.label || `server ${serverId}`} from ${user?.username ?? `#${body.userId}`}`,
    kind,
    projectId,
    serverId,
    serverName: row?.label ?? null,
    ip: clientIp(req),
    status: 200,
  })
  return json({ ok: true })
})
