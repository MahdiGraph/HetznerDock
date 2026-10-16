import { z } from "zod"
import { clientIp, HttpError, json, readJson, requireApiAdmin, route } from "@/lib/http"
import { assignmentCount, deleteProject, getProject, listProjects, updateProject } from "@/lib/projects"
import { invalidateProject } from "@/lib/servers"
import { ApiToken, ProjectName } from "@/lib/schemas"
import { audit } from "@/lib/audit"

type Ctx = { params: Promise<{ id: string }> }

async function load(ctx: Ctx) {
  const project = getProject(Number((await ctx.params).id))
  if (!project) throw new HttpError(404, "Project not found.")
  return project
}

const Patch = z.object({ name: ProjectName.optional(), token: ApiToken.optional() })

export const PATCH = route<Ctx>(async (req, ctx) => {
  const admin = requireApiAdmin(req)
  const project = await load(ctx)
  const body = await readJson(req, Patch)
  if (body.name && listProjects().some((p) => p.id !== project.id && p.name.toLowerCase() === body.name!.toLowerCase())) {
    throw new HttpError(409, "A project with that name already exists.")
  }
  updateProject(project.id, body)
  if (body.token) invalidateProject(project.id)
  const changes = [body.name && body.name !== project.name ? `renamed to "${body.name}"` : null, body.token ? "new API token" : null]
  audit({
    user: admin,
    action: `Updated Hetzner project "${project.name}" (${changes.filter(Boolean).join(", ") || "no changes"})`,
    projectId: project.id,
    ip: clientIp(req),
    status: 200,
  })
  return json({ ok: true, projects: listProjects() })
})

export const DELETE = route<Ctx>(async (req, ctx) => {
  const admin = requireApiAdmin(req)
  const project = await load(ctx)
  const assigned = assignmentCount(project.id)
  deleteProject(project.id)
  invalidateProject(project.id)
  audit({
    user: admin,
    action: `Removed Hetzner project "${project.name}"${assigned ? ` and ${assigned} assignment(s)` : ""}`,
    ip: clientIp(req),
    status: 200,
  })
  return json({ ok: true, projects: listProjects() })
})
