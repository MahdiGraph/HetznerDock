import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { getRobotAccount } from "@/lib/robot-accounts"
import { canAccess, knownServerName } from "@/lib/servers"
import { getPermissions } from "@/lib/settings"
import { DedicatedView } from "@/components/server/dedicated/dedicated-view"

/** A dedicated server: {project} is its Robot account, {id} its server number. */
type Props = { params: Promise<{ project: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project, id } = await params
  const name = knownServerName("dedicated", Number(project), Number(id))
  return { title: name ?? `Server ${id}` }
}

export default async function DedicatedServerPage({ params }: Props) {
  const user = await requireUser()
  const { project: rawProject, id: rawId } = await params
  const account = getRobotAccount(Number(rawProject))
  const id = Number(rawId)
  if (!account || !Number.isSafeInteger(id) || id <= 0 || !canAccess(user, "dedicated", account.id, id)) notFound()
  // The name this user gave the server, if any. Admins see the Hetzner name.
  const assignment = db()
    .prepare("SELECT nickname FROM assignments WHERE user_id = ? AND kind = 'dedicated' AND project_id = ? AND server_id = ?")
    .get(user.id, account.id, id) as { nickname: string | null } | undefined
  return (
    <DedicatedView
      project={account.id}
      projectName={account.name}
      id={id}
      isAdmin={user.role === "admin"}
      permissions={getPermissions()}
      canRename={!!assignment}
      nickname={assignment?.nickname ?? null}
    />
  )
}
