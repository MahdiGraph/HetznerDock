/** Shared between server and client: SSH public keys pasted by users. */

const KEY_TYPES = [
  "ssh-ed25519",
  "ssh-rsa",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "sk-ssh-ed25519@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com",
]

export const MAX_SSH_KEYS = 10

/**
 * Splits pasted text into public keys, one per line. Blank lines and # comments
 * are skipped; anything that does not look like an OpenSSH public key is
 * returned in `invalid` so the form can say which line is wrong.
 */
export function parseSshKeys(text: string): { keys: string[]; invalid: string[] } {
  const keys: string[] = []
  const invalid: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const [type, data] = line.split(/\s+/)
    const ok =
      KEY_TYPES.includes(type) &&
      !!data &&
      /^[A-Za-z0-9+/]+={0,3}$/.test(data) &&
      data.length >= 40 &&
      line.length <= 16 * 1024
    if (ok) keys.push(line.replace(/\s+/g, " "))
    else invalid.push(line.length > 40 ? `${line.slice(0, 40)}…` : line)
  }
  return { keys: [...new Set(keys)], invalid }
}
