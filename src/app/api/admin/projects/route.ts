import { z } from "zod"
import { clientIp, HttpError, json, readJson, requireApiAdmin, route } from "@/lib/http"
import { createProject, listProjects } from "@/lib/projects"
import { ApiToken, ProjectName } from "@/lib/schemas"
import { audit } from "@/lib/audit"

export const GET = route(async (req) => {
  requireApiAdmin(req)
  return json({ projects: listProjects() })
})

const Body = z.object({ name: ProjectName, token: ApiToken })

export const POST = route(async (req) => {
  const admin = requireApiAdmin(req)
  const body = await readJson(req, Body)
  if (listProjects().some((p) => p.name.toLowerCase() === body.name.toLowerCase())) {
    throw new HttpError(409, "A project with that name already exists.")
  }
  const id = createProject(body.name, body.token)
  audit({ user: admin, action: `Added Hetzner project "${body.name}"`, projectId: id, ip: clientIp(req), status: 200 })
  return json({ ok: true, id, projects: listProjects() })
})
