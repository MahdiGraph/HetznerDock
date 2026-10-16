/** Shared between server and client: the shapes the panel's gateway returns. */

export type ActionError = { code: string; message: string }

export type HzAction = {
  id: number
  command: string
  status: "running" | "success" | "error"
  progress: number
  started: string
  finished: string | null
  resources: { id: number; type: string }[]
  error: ActionError | null
}

export type ImageInfo = {
  id: number
  type: "system" | "app" | "snapshot" | "backup"
  name: string | null
  description: string
  osFlavor: string | null
  osVersion: string | null
  architecture: string | null
  /** Compressed size in GB that snapshots are billed by. */
  imageSize: number | null
  diskSize: number | null
  created: string | null
  status: string
  /** The server a snapshot was taken from. */
  fromServer: number | null
  /** The server a backup belongs to. */
  boundTo: number | null
  protected: boolean
  deprecated: boolean
}

export type ImageCatalog = { system: ImageInfo[]; apps: ImageInfo[]; snapshots: ImageInfo[]; backups: ImageInfo[] }

export type SnapshotList = {
  snapshots: ImageInfo[]
  backups: ImageInfo[]
  /** How many snapshots the user may keep; null means no limit (admins). */
  limit: number | null
}

export type IsoInfo = {
  id: number
  name: string | null
  description: string
  type: string | null
  architecture: string | null
}

export type FirewallRule = {
  description?: string | null
  direction: "in" | "out"
  protocol: "tcp" | "udp" | "icmp" | "esp" | "gre"
  port?: string | null
  source_ips?: string[]
  destination_ips?: string[]
}

export type FirewallInfo = {
  id: number
  name: string
  rules: FirewallRule[]
  /** applied or pending on this server */
  status: string | null
  /** True when the firewall protects this server and nothing else. */
  exclusive: boolean
  /** How many servers it applies to (including through label selectors). */
  appliedCount: number
}

export type FloatingIpInfo = {
  id: number
  name: string
  ip: string
  type: "ipv4" | "ipv6"
  dnsPtr: { ip: string; dns_ptr: string }[]
  blocked: boolean
  location: string | null
  country: string | null
}

export type PrivateNetInfo = { id: number; name: string | null; ipRange: string | null; ip: string; aliasIps: string[] }

export type NetworkInfo = { floatingIps: FloatingIpInfo[]; privateNets: PrivateNetInfo[] }

export type VolumeInfo = {
  id: number
  name: string
  size: number
  linuxDevice: string | null
  format: string | null
  status: string
}

export type ServerTypeOption = {
  id: number
  name: string
  description: string
  cores: number
  memory: number
  disk: number
  cpuType: string
  storageType: string
  architecture: string
  available: boolean
  deprecated: boolean
  /** Monthly price including VAT in the server's location. */
  price: number | null
}
