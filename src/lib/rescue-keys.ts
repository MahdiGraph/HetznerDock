import crypto from "node:crypto"
import { db } from "./db"
import { HetznerError, hzRequest } from "./hetzner"

/**
 * The rescue system only takes SSH keys that exist in the project. When a user
 * pastes a key, the panel adds it to the project for this one boot and deletes
 * it again two hours later. Hetzner disables rescue mode after an hour anyway.
 */

const TTL = 2 * 60 * 60_000

const globals = globalThis as unknown as { __hzdockKeyCleanup?: Map<number, number> }

/** Hetzner names SSH keys by their MD5 fingerprint, "b7:2f:30:…", in the Cloud API and in Robot. */
export function md5Fingerprint(publicKey: string) {
  const data = publicKey.trim().split(/\s+/)[1] ?? ""
  const hex = crypto.createHash("md5").update(Buffer.from(data, "base64")).digest("hex")
  return hex.match(/../g)!.join(":")
}

/** Adds a key for one rescue boot and returns its ID. A key the project already has is used as it is. */
export async function temporaryKey(projectId: number, serverId: number, publicKey: string): Promise<number> {
  const name = `hetzner-dock-rescue-${serverId}-${crypto.randomBytes(4).toString("hex")}`
  try {
    const { data } = await hzRequest<{ ssh_key: { id: number } }>({
      projectId,
      method: "POST",
      path: "/ssh_keys",
      body: { name, public_key: publicKey, labels: { "managed-by": "hetzner-dock" } },
    })
    const id = Number(data.ssh_key.id)
    db()
      .prepare("INSERT OR IGNORE INTO temp_ssh_keys (project_id, key_id, created_at) VALUES (?, ?, ?)")
      .run(projectId, id, Date.now())
    return id
  } catch (e) {
    if (e instanceof HetznerError && e.code === "uniqueness_error") {
      const { data } = await hzRequest<{ ssh_keys: { id: number }[] }>({
        projectId,
        path: "/ssh_keys",
        query: { fingerprint: md5Fingerprint(publicKey) },
      })
      const existing = data.ssh_keys?.[0]
      if (existing) return Number(existing.id)
    }
    throw e
  }
}

/** Deletes a project's rescue keys once they are two hours old. Cheap to call often. */
export async function cleanupTemporaryKeys(projectId: number) {
  const runs = (globals.__hzdockKeyCleanup ??= new Map())
  if (Date.now() - (runs.get(projectId) ?? 0) < 5 * 60_000) return
  runs.set(projectId, Date.now())
  const rows = db()
    .prepare("SELECT key_id FROM temp_ssh_keys WHERE project_id = ? AND created_at < ?")
    .all(projectId, Date.now() - TTL) as { key_id: number }[]
  for (const row of rows) {
    try {
      await hzRequest({ projectId, method: "DELETE", path: `/ssh_keys/${row.key_id}` })
    } catch (e) {
      // Gone already is fine; anything else is tried again later.
      if (!(e instanceof HetznerError && e.status === 404)) continue
    }
    db().prepare("DELETE FROM temp_ssh_keys WHERE project_id = ? AND key_id = ?").run(projectId, row.key_id)
  }
}
