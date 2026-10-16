/** Shared between server and client: what users (not admins) may do with their servers. */

export const PERMISSION_KEYS = ["console", "rebuild", "rescue", "password", "iso", "rdns", "firewall", "storage"] as const
export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export type Permissions = Record<PermissionKey, boolean> & {
  /** How many snapshots a user may keep per server. 0 turns snapshots off. */
  snapshots: number
}

export const DEFAULT_PERMISSIONS: Permissions = {
  console: true,
  rebuild: true,
  rescue: true,
  password: true,
  iso: true,
  rdns: true,
  firewall: true,
  storage: true,
  snapshots: 1,
}

export const SNAPSHOT_LIMITS = [0, 1, 2, 3, 5, 10] as const

/** Each switch covers cloud servers and, where Robot has the same thing, dedicated servers. */
export const PERMISSION_META: Record<PermissionKey, { label: string; description: string }> = {
  console: {
    label: "Console",
    description: "Open a cloud server's screen and keyboard in the browser.",
  },
  rebuild: {
    label: "Rebuild",
    description:
      "Wipe the disk and install a fresh image, an app or one of the server's own snapshots; on a dedicated server, a fresh Linux.",
  },
  rescue: {
    label: "Rescue mode",
    description: "Boot the rescue system to repair a server that no longer starts, cloud or dedicated.",
  },
  password: {
    label: "Reset root password",
    description: "Have Hetzner set a new root password on a running cloud server.",
  },
  iso: {
    label: "ISO images",
    description: "Attach an installer ISO to a cloud server to install a system by hand through the console.",
  },
  rdns: {
    label: "Reverse DNS",
    description: "Change the reverse DNS name of the server's IP addresses, cloud or dedicated.",
  },
  storage: {
    label: "Storage Boxes",
    description: "Reset a Storage Box's password, change how it can be reached, and manage its snapshots and sub-accounts.",
  },
  firewall: {
    label: "Firewall",
    description: "Edit a firewall that protects only this cloud server, or create one for it.",
  },
}

/** Fills gaps with the defaults, so settings saved by an older version stay valid. */
export function normalizePermissions(value: unknown): Permissions {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
  const out = { ...DEFAULT_PERMISSIONS }
  for (const key of PERMISSION_KEYS) if (typeof input[key] === "boolean") out[key] = input[key] as boolean
  const limit = Number(input.snapshots)
  if (Number.isInteger(limit) && limit >= 0 && limit <= 50) out.snapshots = limit
  return out
}
