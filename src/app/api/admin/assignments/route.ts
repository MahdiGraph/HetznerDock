import { z } from "zod"
import { db } from "@/lib/db"
import { clientIp, HttpError, json, readJson, requireApiAdmin, route } from "@/lib/http"
import { getProject } from "@/lib/projects"
import { audit } from "@/lib/audit"

const ServerRef = {
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
  if (!getProject(body.projectId)) throw new HttpError(404, "That Hetzner project does not exist.")

  const current = db()
    .prepare("SELECT user_id FROM assignments WHERE project_id = ? AND server_id = ?")
    .all(body.projectId, body.serverId) as { user_id: number }[]
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
          .prepare("INSERT INTO assignments (user_id, project_id, server_id, label, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(id, body.projectId, body.serverId, body.label ?? null, Date.now())
        added.push(users.get(id)!)
      } else if (body.label) {
        db()
          .prepare("UPDATE assignments SET label = ? WHERE user_id = ? AND project_id = ? AND server_id = ?")
          .run(body.label, id, body.projectId, body.serverId)
      }
    }
    for (const id of before) {
      if (!after.has(id)) {
        db()
          .prepare("DELETE FROM assignments WHERE user_id = ? AND project_id = ? AND server_id = ?")
          .run(id, body.projectId, body.serverId)
        removed.push(users.get(id) ?? `#${id}`)
      }
    }
  })()

  const name = body.label || `server ${body.serverId}`
  const common = {
    user: admin,
    projectId: body.projectId,
    serverId: body.serverId,
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
  const user = db().prepare("SELECT username FROM users WHERE id = ?").get(body.userId) as { username: string } | undefined
  const row = db()
    .prepare("SELECT label FROM assignments WHERE user_id = ? AND project_id = ? AND server_id = ?")
    .get(body.userId, body.projectId, body.serverId) as { label: string | null } | undefined
  db()
    .prepare("DELETE FROM assignments WHERE user_id = ? AND project_id = ? AND server_id = ?")
    .run(body.userId, body.projectId, body.serverId)
  audit({
    user: admin,
    action: `Unassigned ${row?.label || `server ${body.serverId}`} from ${user?.username ?? `#${body.userId}`}`,
    projectId: body.projectId,
    serverId: body.serverId,
    serverName: row?.label ?? null,
    ip: clientIp(req),
    status: 200,
  })
  return json({ ok: true })
})
