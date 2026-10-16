import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { getProject } from "@/lib/projects"
import { canAccess, knownServerName } from "@/lib/servers"
import { getPermissions } from "@/lib/settings"
import { ConsoleView } from "@/components/console/console-view"

type Props = { params: Promise<{ project: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project, id } = await params
  return { title: `Console · ${knownServerName("cloud", Number(project), Number(id)) ?? `Server ${id}`}` }
}

export default async function ConsolePage({ params }: Props) {
  const user = await requireUser()
  const { project: rawProject, id: rawId } = await params
  const project = getProject(Number(rawProject))
  const id = Number(rawId)
  if (!project || !Number.isSafeInteger(id) || id <= 0 || !canAccess(user, "cloud", project.id, id)) notFound()
  const allowed = user.role === "admin" || getPermissions().console
  return <ConsoleView project={project.id} id={id} name={knownServerName("cloud", project.id, id)} allowed={allowed} />
}
