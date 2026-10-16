/** Shared between server and client: small IP address helpers. */

export function isIPv4(value: string): boolean {
  const parts = value.split(".")
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && (p === "0" || !p.startsWith("0")))
}

/** The address as a 128-bit number, or null when it is not a valid IPv6 address. */
export function parseIPv6(value: string): bigint | null {
  let text = value.trim().toLowerCase()
  if (!text.includes(":") || /[^0-9a-f:.]/.test(text)) return null
  // An embedded IPv4 tail (::ffff:1.2.3.4) becomes two hextets.
  const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    if (!isIPv4(v4[1])) return null
    const n = v4[1].split(".").map(Number)
    text = text.slice(0, -v4[1].length) + `${((n[0] << 8) | n[1]).toString(16)}:${((n[2] << 8) | n[3]).toString(16)}`
  }
  const halves = text.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail]
  let out = BigInt(0)
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    out = (out << BigInt(16)) | BigInt(parseInt(g, 16))
  }
  return out
}

export function isIPv6(value: string): boolean {
  return parseIPv6(value) !== null
}

/** Whether an IPv6 address lies inside a network such as 2a01:4f8:c0c:1234::/64. */
export function inIPv6Network(address: string, network: string): boolean {
  const [base, bits] = network.split("/")
  const prefix = Number(bits ?? 128)
  const a = parseIPv6(address)
  const b = parseIPv6(base)
  if (a === null || b === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 128) return false
  const shift = BigInt(128 - prefix)
  return a >> shift === b >> shift
}

/** The usual short form of an IPv6 address: lower case, the longest run of zero groups as "::". */
export function compactIPv6(value: string): string | null {
  const n = parseIPv6(value)
  if (n === null) return null
  const groups = Array.from({ length: 8 }, (_, i) => Number((n >> BigInt(112 - i * 16)) & BigInt(0xffff)))
  let best = { at: -1, length: 1 }
  for (let i = 0; i < 8; ) {
    let j = i
    while (j < 8 && groups[j] === 0) j++
    if (j - i > best.length) best = { at: i, length: j - i }
    i = j === i ? i + 1 : j
  }
  const hex = groups.map((g) => g.toString(16))
  if (best.at < 0) return hex.join(":")
  return `${hex.slice(0, best.at).join(":")}::${hex.slice(best.at + best.length).join(":")}`
}

function ipv4Number(value: string): number | null {
  return isIPv4(value) ? value.split(".").reduce((n, part) => n * 256 + Number(part), 0) : null
}

/** Whether an IPv4 address lies inside a network such as 203.0.113.16/29. */
export function inIPv4Network(address: string, network: string): boolean {
  const [base, bits] = network.split("/")
  const prefix = Number(bits ?? 32)
  const a = ipv4Number(address)
  const b = ipv4Number(base)
  if (a === null || b === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false
  const size = 2 ** (32 - prefix)
  return Math.floor(a / size) === Math.floor(b / size)
}

/** A host name as reverse DNS needs it: labels of letters, digits and dashes, dots between. */
export function isHostname(value: string): boolean {
  if (value.length < 1 || value.length > 253) return false
  return value
    .replace(/\.$/, "")
    .split(".")
    .every((label) => /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
}

/** A CIDR block for firewall rules, e.g. 0.0.0.0/0, 203.0.113.7/32 or 2001:db8::/32. */
export function isCidr(value: string): boolean {
  const [address, bits, extra] = value.split("/")
  if (extra !== undefined || bits === undefined || !/^\d{1,3}$/.test(bits)) return false
  const n = Number(bits)
  if (isIPv4(address)) return n <= 32
  if (isIPv6(address)) return n <= 128
  return false
}
