import crypto from "node:crypto"
import { db } from "./db"
import { HetznerError } from "./hetzner"
import { md5Fingerprint } from "./rescue-keys"
import { robotRequest } from "./robot"

/**
 * Robot boots a rescue system or a Linux installation only with SSH keys saved
 * in the account, named by fingerprint. When a user pastes a key, the panel saves
 * it in the account for that one boot and deletes it again a day later. A boot
 * stays set until the server restarts, so the keys are kept longer than in the
 * cloud, where rescue mode ends after an hour.
 */

const TTL = 24 * 60 * 60_000

const globals = globalThis as unknown as { __hzdockRobotKeyCleanup?: Map<number, number> }

/** Saves a key for one boot and returns its fingerprint. A key the account already has is used as it is. */
export async function temporaryRobotKey(accountId: number, serverNumber: number, publicKey: string): Promise<string> {
  const fingerprint = md5Fingerprint(publicKey)
  const name = `hetzner-dock-${serverNumber}-${crypto.randomBytes(4).toString("hex")}`
  try {
    const { data } = await robotRequest<{ key?: { fingerprint?: unknown } }>({
      accountId,
      method: "POST",
      path: "/key",
      form: { name, data: publicKey },
    })
    const saved = typeof data?.key?.fingerprint === "string" ? data.key.fingerprint : fingerprint
    db()
      .prepare("INSERT OR IGNORE INTO robot_temp_keys (account_id, fingerprint, created_at) VALUES (?, ?, ?)")
      .run(accountId, saved, Date.now())
    return saved
  } catch (e) {
    if (!(e instanceof HetznerError && e.code === "KEY_ALREADY_EXISTS")) throw e
    // If the panel saved it for an earlier boot, it is kept for this one too.
    db()
      .prepare("UPDATE robot_temp_keys SET created_at = ? WHERE account_id = ? AND fingerprint = ?")
      .run(Date.now(), accountId, fingerprint)
    return fingerprint
  }
}

/** Deletes an account's boot keys once they are a day old. Cheap to call often. */
export async function cleanupRobotKeys(accountId: number) {
  const runs = (globals.__hzdockRobotKeyCleanup ??= new Map())
  if (Date.now() - (runs.get(accountId) ?? 0) < 15 * 60_000) return
  runs.set(accountId, Date.now())
  const rows = db()
    .prepare("SELECT fingerprint FROM robot_temp_keys WHERE account_id = ? AND created_at < ?")
    .all(accountId, Date.now() - TTL) as { fingerprint: string }[]
  for (const row of rows) {
    try {
      await robotRequest({ accountId, method: "DELETE", path: `/key/${row.fingerprint}` })
    } catch (e) {
      // Gone already is fine; anything else is tried again later.
      if (!(e instanceof HetznerError && e.status === 404)) continue
    }
    db().prepare("DELETE FROM robot_temp_keys WHERE account_id = ? AND fingerprint = ?").run(accountId, row.fingerprint)
  }
}
