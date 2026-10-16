/**
 * Shared between server and client: the DNS record types users can edit and the
 * checks for their names and values. Values are in zone file form, the way the
 * Cloud API takes them: "10 mail.example.org." for MX, quoted text for TXT.
 */

export const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "NS"] as const
export type RecordType = (typeof RECORD_TYPES)[number]

export const MIN_TTL = 60
export const MAX_TTL = 2_147_483_647

export const RECORD_HINTS: Record<RecordType, { placeholder: string; hint: string }> = {
  A: { placeholder: "203.0.113.10", hint: "IPv4 addresses, one per line." },
  AAAA: { placeholder: "2001:db8::10", hint: "IPv6 addresses, one per line." },
  CNAME: { placeholder: "www.example.org.", hint: "One host name. End a full name with a dot; without one, the zone's name is added." },
  MX: { placeholder: "10 mail.example.org.", hint: "A priority and a mail server per line; the lowest priority is tried first." },
  TXT: { placeholder: "v=spf1 include:_spf.example.org ~all", hint: "Any text, one value per line. Quotes are added for you." },
  SRV: { placeholder: "10 5 5060 sip.example.org.", hint: "Priority, weight, port and target per line." },
  CAA: { placeholder: '0 issue "letsencrypt.org"', hint: "Flags, tag and the value in quotes, one per line." },
  NS: { placeholder: "ns1.example.org.", hint: "Name servers that answer for this name, one per line." },
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const LABEL = "[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?"
const HOST = new RegExp(`^${LABEL}(\\.${LABEL})*\\.?$`, "i")
const OWNER = new RegExp(`^(@|\\*|(\\*\\.)?${LABEL}(\\.${LABEL})*)$`)
const QUOTED = /"(?:[^"\\]|\\.)*"/g

export const isIPv4 = (v: string) => IPV4.test(v)

export function isIPv6(v: string) {
  if (v.length > 45 || !/^[0-9a-f:.]+$/i.test(v)) return false
  const halves = v.split("::")
  if (halves.length > 2) return false
  const groups = halves.flatMap((h) => (h ? h.split(":") : []))
  const last = groups[groups.length - 1] ?? ""
  const v4 = last.includes(".")
  if (v4 && !isIPv4(last)) return false
  const hex = v4 ? groups.slice(0, -1) : groups
  if (!hex.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return false
  const count = hex.length + (v4 ? 2 : 0)
  return halves.length === 2 ? count < 8 : count === 8
}

const isHost = (v: string) => v === "@" || (v.length <= 254 && HOST.test(v))
const isPort = (v: string) => /^\d{1,5}$/.test(v) && Number(v) <= 65535

/** What is wrong with a record name relative to the zone ("www", "@", "*.dev"), or null. */
export function nameProblem(name: string): string | null {
  if (!name) return "Enter a name, or @ for the zone itself."
  if (name.length > 253) return "That name is too long."
  if (!OWNER.test(name)) return "Use lower case letters, digits, dashes and underscores with dots between the parts, @ for the zone itself or * for any name."
  return null
}

/** What is wrong with one value of a record of this type, or null. */
export function valueProblem(type: RecordType, value: string): string | null {
  const v = value.trim()
  if (!v) return "A value is empty."
  if (v.length > 4000) return "A value is too long."
  const parts = v.split(/\s+/)
  switch (type) {
    case "A":
      return isIPv4(v) ? null : `${v} is not an IPv4 address.`
    case "AAAA":
      return isIPv6(v) ? null : `${v} is not an IPv6 address.`
    case "CNAME":
    case "NS":
      return isHost(v) ? null : `${v} is not a host name.`
    case "MX":
      return parts.length === 2 && isPort(parts[0]) && (isHost(parts[1]) || parts[1] === ".")
        ? null
        : `${v} should be a priority and a mail server, like 10 mail.example.org.`
    case "SRV":
      return parts.length === 4 && parts.slice(0, 3).every(isPort) && (isHost(parts[3]) || parts[3] === ".")
        ? null
        : `${v} should be a priority, a weight, a port and a target, like 10 5 5060 sip.example.org.`
    case "CAA":
      return /^\d{1,3}\s+[a-z0-9]{1,15}\s+"[^"\\]*"$/i.test(v) && Number(parts[0]) <= 255
        ? null
        : `${v} should be flags, a tag and a quoted value, like 0 issue "letsencrypt.org".`
    case "TXT":
      if (!/^[\x20-\x7e]*$/.test(v)) return "TXT values can only hold printable ASCII characters."
      if (!v.startsWith('"')) return null
      if (v.replace(QUOTED, "").trim()) return "Close every quote, or leave the quotes out and they are added for you."
      return (v.match(QUOTED) ?? []).some((q) => q.slice(1, -1).replace(/\\(\d{3}|.)/g, "x").length > 255)
        ? "Each quoted part of a TXT value can hold at most 255 characters."
        : null
  }
}

/**
 * A value the way Hetzner stores it: single spaces, and TXT text quoted in
 * parts of at most 255 characters unless it is quoted already.
 */
export function normalizeValue(type: RecordType, value: string) {
  const v = value.trim()
  if (type !== "TXT") return v.replace(/\s+/g, " ")
  if (v.startsWith('"')) return v
  const parts: string[] = []
  for (let i = 0; i < v.length; i += 255) parts.push(v.slice(i, i + 255))
  return (parts.length ? parts : [""]).map((p) => `"${p.replace(/["\\]/g, (c) => `\\${c}`)}"`).join(" ")
}

/** "1 h" for 3600 seconds. */
export function formatTtl(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "zone default"
  for (const [size, unit] of [
    [86400, "d"],
    [3600, "h"],
    [60, "min"],
  ] as const) {
    if (seconds >= size && seconds % size === 0) return `${seconds / size} ${unit}`
  }
  return `${seconds} s`
}
