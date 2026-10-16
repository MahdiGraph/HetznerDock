import { db } from "./db"

export type AdminUserRow = {
  id: number
  username: string
  name: string | null
  role: "admin" | "user"
  disabled: number
  created_at: number
  last_login_at: number | null
  servers: { project_id: number; server_id: number; label: string | null }[]
}

export function listUsers(): AdminUserRow[] {
  const users = db()
    .prepare("SELECT id, username, name, role, disabled, created_at, last_login_at FROM users ORDER BY role, username")
    .all() as Omit<AdminUserRow, "servers">[]
  const assignments = db()
    .prepare("SELECT user_id, project_id, server_id, label FROM assignments ORDER BY created_at")
    .all() as { user_id: number; project_id: number; server_id: number; label: string | null }[]
  return users.map((u) => ({
    ...u,
    servers: assignments
      .filter((a) => a.user_id === u.id)
      .map(({ project_id, server_id, label }) => ({ project_id, server_id, label })),
  }))
}
