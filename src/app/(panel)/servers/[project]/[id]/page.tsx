import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { getProject } from "@/lib/projects"
import { canAccess, knownServerName, projectCurrency } from "@/lib/servers"
import { getPermissions } from "@/lib/settings"
import { ServerView } from "@/components/server/server-view"

type Props = { params: Promise<{ project: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project, id } = await params
  const name = knownServerName("cloud", Number(project), Number(id))
  return { title: name ?? `Server ${id}` }
}

export default async function ServerPage({ params }: Props) {
  const user = await requireUser()
  const { project: rawProject, id: rawId } = await params
  const project = getProject(Number(rawProject))
  const id = Number(rawId)
  if (!project || !Number.isSafeInteger(id) || id <= 0 || !canAccess(user, "cloud", project.id, id)) notFound()
  // The name this user gave the server, if any. Admins see the Hetzner name.
  const assignment = db()
    .prepare("SELECT nickname FROM assignments WHERE user_id = ? AND kind = 'cloud' AND project_id = ? AND server_id = ?")
    .get(user.id, project.id, id) as { nickname: string | null } | undefined
  const isAdmin = user.role === "admin"
  return (
    <ServerView
      project={project.id}
      projectName={project.name}
      id={id}
      isAdmin={isAdmin}
      permissions={getPermissions()}
      canRename={!!assignment}
      nickname={assignment?.nickname ?? null}
      currency={isAdmin ? await projectCurrency(project.id) : "EUR"}
    />
  )
}
