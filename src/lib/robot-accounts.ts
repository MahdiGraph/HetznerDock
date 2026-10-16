import { db } from "./db"
import { decrypt, encrypt } from "./crypto"

/**
 * A Robot account is a Hetzner Robot webservice user and its password, which
 * reach the dedicated servers of one Hetzner customer account. Robot creates the
 * webservice user under Settings, "Web service and app settings"; it is not the
 * login of the Robot website. The panel holds one per customer account and lists
 * their servers next to the cloud servers.
 */

export type RobotAccount = { id: number; name: string; username: string; created_at: number; updated_at: number }

type Row = RobotAccount & { password: string; assignments: number }

export function listRobotAccounts() {
  const rows = db()
    .prepare(
      `SELECT id, name, username, password, created_at, updated_at,
         (SELECT COUNT(*) FROM assignments WHERE kind = 'dedicated' AND project_id = robot_accounts.id) AS assignments
       FROM robot_accounts ORDER BY name COLLATE NOCASE, id`
    )
    .all() as Row[]
  return rows.map(({ password, ...account }) => ({ ...account, unreadable: decrypt(password) === null }))
}

export type RobotAccountInfo = ReturnType<typeof listRobotAccounts>[number]

export function getRobotAccount(id: number): RobotAccount | null {
  if (!Number.isInteger(id) || id <= 0) return null
  return (
    (db().prepare("SELECT id, name, username, created_at, updated_at FROM robot_accounts WHERE id = ?").get(id) as
      | RobotAccount
      | undefined) ?? null
  )
}

/** The webservice user and its decrypted password, or null when the account is missing or unreadable. */
export function robotCredentials(id: number): { username: string; password: string } | null {
  const row = db().prepare("SELECT username, password FROM robot_accounts WHERE id = ?").get(id) as
    | { username: string; password: string }
    | undefined
  const password = row ? decrypt(row.password) : null
  return row && password ? { username: row.username, password } : null
}

export function robotAccountNames(): Map<number, string> {
  const rows = db().prepare("SELECT id, name FROM robot_accounts").all() as { id: number; name: string }[]
  return new Map(rows.map((r) => [r.id, r.name]))
}

export function createRobotAccount(name: string, username: string, password: string): number {
  const now = Date.now()
  const info = db()
    .prepare("INSERT INTO robot_accounts (name, username, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(name, username, encrypt(password), now, now)
  return Number(info.lastInsertRowid)
}

export function updateRobotAccount(id: number, patch: { name?: string; username?: string; password?: string }) {
  const now = Date.now()
  if (patch.name !== undefined) db().prepare("UPDATE robot_accounts SET name = ?, updated_at = ? WHERE id = ?").run(patch.name, now, id)
  if (patch.username) db().prepare("UPDATE robot_accounts SET username = ?, updated_at = ? WHERE id = ?").run(patch.username, now, id)
  if (patch.password) {
    db().prepare("UPDATE robot_accounts SET password = ?, updated_at = ? WHERE id = ?").run(encrypt(patch.password), now, id)
  }
}

/** Deletes the account and every assignment of its servers. */
export function deleteRobotAccount(id: number) {
  db().transaction(() => {
    db().prepare("DELETE FROM assignments WHERE kind = 'dedicated' AND project_id = ?").run(id)
    db().prepare("DELETE FROM robot_accounts WHERE id = ?").run(id)
  })()
}

export function robotAssignmentCount(id: number): number {
  return (
    db().prepare("SELECT COUNT(*) AS n FROM assignments WHERE kind = 'dedicated' AND project_id = ?").get(id) as { n: number }
  ).n
}
