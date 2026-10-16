export function formatBits(bps: number | null | undefined) {
  if (bps === null || bps === undefined || Number.isNaN(bps)) return "—"
  const units = ["bit/s", "Kbit/s", "Mbit/s", "Gbit/s", "Tbit/s"]
  let v = bps
  let i = 0
  while (Math.abs(v) >= 1000 && i < units.length - 1) {
    v /= 1000
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Bytes as KB, MB, GB… `binary` counts in steps of 1024, the way Hetzner states
 * traffic: its "20 TB" included traffic is 20 × 1024⁴ bytes.
 */
export function formatBytes(bytes: number | null | undefined, opts: { binary?: boolean } = {}) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—"
  const step = opts.binary ? 1024 : 1000
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  let v = bytes
  let i = 0
  while (Math.abs(v) >= step && i < units.length - 1) {
    v /= step
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export function formatMoney(amount: number | null | undefined, currency = "EUR") {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—"
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function formatDateTime(value: string | number | null | undefined) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function formatDate(value: string | number | null | undefined) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

export function timeAgo(value: string | number | null | undefined) {
  if (!value) return "never"
  const t = new Date(value).getTime()
  if (Number.isNaN(t)) return "—"
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} d ago`
  return formatDate(value)
}

/** How long something took, "4 s", "2 min 10 s". */
export function duration(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return null
  const s = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000))
  if (Number.isNaN(s)) return null
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min${s % 60 ? ` ${s % 60} s` : ""}`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

/** "rebuild_server" → "Rebuild server", "REMOTE_MANAGEMENT" → "Remote management" */
export function humanize(value: string | null | undefined) {
  if (!value) return "—"
  const spaced = value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
