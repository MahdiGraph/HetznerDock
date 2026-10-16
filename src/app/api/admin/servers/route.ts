import { json, requireApiAdmin, route } from "@/lib/http"
import { assignmentMap, listAllServers, projectCurrency } from "@/lib/servers"
import { listProjects } from "@/lib/projects"
import { listRobotAccounts } from "@/lib/robot-accounts"
import { rateLimitOf } from "@/lib/hetzner"
import { serverKey } from "@/lib/summary"

/** Every cloud server of every Hetzner project and every dedicated server of every Robot account, with who it is assigned to. */
export const GET = route(async (req) => {
  requireApiAdmin(req)
  const refresh = req.nextUrl.searchParams.get("refresh") === "1"
  const { servers, errors } = await listAllServers(refresh, true)
  const assigned = assignmentMap()
  const failed = new Set(errors.filter((e) => e.kind === "cloud").map((e) => e.projectId))
  const projects = await Promise.all(
    listProjects().map(async (p) => ({
      id: p.id,
      name: p.name,
      currency: failed.has(p.id) ? "EUR" : await projectCurrency(p.id),
      rateLimit: rateLimitOf(p.id),
    }))
  )
  return json({
    servers: servers.map((s) => ({ ...s, assignees: assigned.get(serverKey(s.kind, s.projectId, s.id)) ?? [] })),
    errors,
    projects,
    accounts: listRobotAccounts().map((a) => ({ id: a.id, name: a.name })),
  })
})
