import { db } from "./db"
import { decrypt, encrypt } from "./crypto"

/**
 * A project is one Hetzner Cloud project and its API token. Hetzner binds every
 * token to a single project, so the panel holds one token per project and shows
 * the servers of all of them together.
 */

export type Project = { id: number; name: string; created_at: number; updated_at: number }

type Row = Project & { token: string; assignments: number }

export function listProjects() {
  const rows = db()
    .prepare(
      `SELECT id, name, token, created_at, updated_at,
         (SELECT COUNT(*) FROM assignments WHERE project_id = projects.id) AS assignments
       FROM projects ORDER BY name COLLATE NOCASE, id`
    )
    .all() as Row[]
  return rows.map(({ token, ...project }) => {
    const plain = decrypt(token)
    return { ...project, tokenHint: plain ? `••••${plain.slice(-4)}` : null, unreadable: !plain }
  })
}

export type ProjectInfo = ReturnType<typeof listProjects>[number]

export function getProject(id: number): Project | null {
  if (!Number.isInteger(id) || id <= 0) return null
  return (
    (db().prepare("SELECT id, name, created_at, updated_at FROM projects WHERE id = ?").get(id) as Project | undefined) ?? null
  )
}

/** The decrypted API token, or null when the project is missing or the token cannot be read. */
export function projectToken(id: number): string | null {
  const row = db().prepare("SELECT token FROM projects WHERE id = ?").get(id) as { token: string } | undefined
  return row ? decrypt(row.token) : null
}

export function projectNames(): Map<number, string> {
  const rows = db().prepare("SELECT id, name FROM projects").all() as { id: number; name: string }[]
  return new Map(rows.map((r) => [r.id, r.name]))
}

export function createProject(name: string, token: string): number {
  const now = Date.now()
  const info = db()
    .prepare("INSERT INTO projects (name, token, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(name, encrypt(token), now, now)
  return Number(info.lastInsertRowid)
}

export function updateProject(id: number, patch: { name?: string; token?: string }) {
  const now = Date.now()
  if (patch.name !== undefined) db().prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?").run(patch.name, now, id)
  if (patch.token) db().prepare("UPDATE projects SET token = ?, updated_at = ? WHERE id = ?").run(encrypt(patch.token), now, id)
}

/** Deletes the project and, through the foreign key, every assignment of its servers. */
export function deleteProject(id: number) {
  db().prepare("DELETE FROM projects WHERE id = ?").run(id)
}

export function assignmentCount(id: number): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM assignments WHERE project_id = ?").get(id) as { n: number }).n
}
