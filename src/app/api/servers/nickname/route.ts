import { z } from "zod"
import { db } from "@/lib/db"
import { clientIp, HttpError, json, readJson, requireApiUser, route } from "@/lib/http"
import { audit } from "@/lib/audit"

const Body = z.object({
  projectId: z.number().int().positive(),
  serverId: z.number().int().positive(),
  /** Empty or null goes back to the Hetzner name. */
  nickname: z.string().trim().max(80).nullable(),
})

/**
 * Sets the name a user sees for one of their servers. It is stored only in the
 * panel, for that user; the server's name at Hetzner is never changed.
 */
export const PUT = route(async (req) => {
  const user = requireApiUser(req)
  const body = await readJson(req, Body)
  const nickname = body.nickname || null
  const row = db()
    .prepare("SELECT label FROM assignments WHERE user_id = ? AND project_id = ? AND server_id = ?")
    .get(user.id, body.projectId, body.serverId) as { label: string | null } | undefined
  if (!row) throw new HttpError(404, "Only the users a server is assigned to can give it their own name.")
  db()
    .prepare("UPDATE assignments SET nickname = ? WHERE user_id = ? AND project_id = ? AND server_id = ?")
    .run(nickname, user.id, body.projectId, body.serverId)
  audit({
    user,
    action: nickname ? `Named the server "${nickname}" for themselves` : "Went back to the Hetzner name of the server",
    projectId: body.projectId,
    serverId: body.serverId,
    serverName: row.label,
    ip: clientIp(req),
    status: 200,
  })
  return json({ ok: true, nickname })
})
