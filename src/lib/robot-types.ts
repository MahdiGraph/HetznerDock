/** Shared between server and client: dedicated servers as the panel's gateway returns them. */

/** A dedicated server, from Robot's server list and details. */
export type DedicatedServer = {
  number: number
  name: string
  /** The product, for example AX42 or "Server Auction". */
  product: string | null
  /** The data center, for example FSN1-DC14. */
  dc: string | null
  city: string | null
  /** ISO country code, for the flag. */
  country: string | null
  /** "ready", or "in process" while Hetzner is setting it up. */
  status: string | null
  ipv4: string | null
  /** The IPv6 network, for example 2a01:4f8:111:4221::/64. */
  ipv6: string | null
  /** Single IPv4 addresses, the main one first. */
  ips: string[]
  /** Subnets routed to the server: its IPv6 network and any extra IPv4 subnets. */
  subnets: { ip: string; mask: number }[]
  /** Included traffic as Robot states it, for example "unlimited" or "20 TB". */
  traffic: string | null
  /** What Robot offers for this server; null when Robot's details could not be loaded. */
  features: { reset: boolean; rescue: boolean; wol: boolean } | null
  /** Admins only: the date the server is paid until, and whether it is cancelled. */
  paidUntil?: string | null
  cancelled?: boolean
}

/** Hetzner's dedicated server locations, by the start of the data center name. */
const SITES: Record<string, { city: string; country: string }> = {
  FSN: { city: "Falkenstein", country: "DE" },
  NBG: { city: "Nuremberg", country: "DE" },
  HEL: { city: "Helsinki", country: "FI" },
}

/** "FSN1-DC14" → Falkenstein, Germany. */
export function siteOf(dc: string | null | undefined): { city: string; country: string } | null {
  const match = dc?.toUpperCase().match(/^([A-Z]{3})\d/)
  return match ? (SITES[match[1]] ?? null) : null
}

/* ------------------------------------------------------------------ reset */

export const RESET_TYPES = ["sw", "hw", "power", "power_long", "man"] as const
export type ResetType = (typeof RESET_TYPES)[number]

/** How the panel names Robot's reset types, on buttons and in the activity log. */
export const RESET_META: Record<ResetType, { label: string; log: string; description: string }> = {
  sw: {
    label: "Send Ctrl+Alt+Del",
    log: "Send Ctrl+Alt+Del",
    description: "Robot sends Ctrl+Alt+Del to the server, so the operating system restarts cleanly if it still responds.",
  },
  hw: {
    label: "Hardware reset",
    log: "Hardware reset",
    description: "The server is reset at once, like pressing its reset button. Unsaved data on it can be lost.",
  },
  power: {
    label: "Press the power button",
    log: "Press the power button",
    description: "Robot presses the server's power button briefly: a running server shuts down, a server that is off starts.",
  },
  power_long: {
    label: "Hold the power button",
    log: "Hold the power button (power off)",
    description: "Robot holds the power button until the server is off, without asking the system. Unsaved data can be lost.",
  },
  man: {
    label: "Ask a technician",
    log: "Order a manual reset by a technician",
    description: "A Hetzner technician power-cycles the server by hand. It can take a while; use it when no other reset works.",
  },
}

export type ResetInfo = {
  /** The reset types this server offers, in the order of RESET_TYPES. */
  types: ResetType[]
  /** The power state, for servers that report one ("running"); otherwise null. */
  operatingStatus: string | null
}

/* ------------------------------------------------------------------ boot */

export type BootConfig = "rescue" | "linux" | "vnc" | "windows"

export const BOOT_NAMES: Record<BootConfig, string> = {
  rescue: "the rescue system",
  linux: "a Linux installation",
  vnc: "a VNC installation",
  windows: "a Windows installation",
}

export type BootInfo = {
  /** The configuration set for the next boot. Robot allows one at a time. */
  active: BootConfig | null
  /** null when the server has no rescue system. */
  rescue: {
    /** The systems on offer, while rescue is not set; the one that is set, while it is. */
    os: string[]
    activeOs: string | null
    /** How many SSH keys the active boot carries. */
    keys: number
  } | null
  /** null when the server cannot install Linux through Robot. */
  linux: {
    dists: string[]
    langs: string[]
    activeDist: string | null
    activeLang: string | null
    keys: number
  } | null
}

/* ------------------------------------------------------------------ network */

export type DedicatedAddress = {
  /** A single IPv4 address, or a network such as 2a01:4f8:111:4221::/64 or 203.0.113.16/29. */
  ip: string
  /** The address itself, without the prefix length. */
  base: string
  mask: number
  v6: boolean
  /** The main address, an extra single address, or a subnet. */
  role: "main" | "single" | "subnet"
  /** Reverse DNS names of addresses in it. */
  ptrs: { ip: string; ptr: string }[]
}

/* ------------------------------------------------------------------ traffic */

export const TRAFFIC_PERIODS = ["day", "month", "year"] as const
export type TrafficPeriod = (typeof TRAFFIC_PERIODS)[number]

export type TrafficReport = {
  period: TrafficPeriod
  /** The day (2026-10-15), month (2026-10) or year (2026) it covers. */
  date: string
  /** Bytes per hour, day or month. */
  rows: { t: number; in: number; out: number }[]
  total: { in: number; out: number }
}
