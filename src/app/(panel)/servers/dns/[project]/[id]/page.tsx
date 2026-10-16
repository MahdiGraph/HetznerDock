import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { getProject } from "@/lib/projects"
import { canAccess, knownServerName } from "@/lib/servers"
import { getPermissions } from "@/lib/settings"
import { ZoneView } from "@/components/dns/zone-view"

/** A DNS zone: {project} is its Hetzner project, {id} the zone. */
type Props = { params: Promise<{ project: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project, id } = await params
  return { title: knownServerName("dns", Number(project), Number(id)) ?? `DNS zone ${id}` }
}

export default async function DnsZonePage({ params }: Props) {
  const user = await requireUser()
  const { project: rawProject, id: rawId } = await params
  const project = getProject(Number(rawProject))
  const id = Number(rawId)
  if (!project || !Number.isSafeInteger(id) || id <= 0 || !canAccess(user, "dns", project.id, id)) notFound()
  const assignment = db()
    .prepare("SELECT nickname FROM assignments WHERE user_id = ? AND kind = 'dns' AND project_id = ? AND server_id = ?")
    .get(user.id, project.id, id) as { nickname: string | null } | undefined
  const isAdmin = user.role === "admin"
  return (
    <ZoneView
      project={project.id}
      projectName={project.name}
      id={id}
      isAdmin={isAdmin}
      canChange={isAdmin || getPermissions().dns}
      canRename={!!assignment}
      nickname={assignment?.nickname ?? null}
    />
  )
}
