// A fake Hetzner Robot webservice, for trying dedicated servers in Hetzner Dock
// without a Robot account. mock-hetzner.mjs serves it under /robot:
//
//   npm run mock            (then http://localhost:4010/robot)
//
// In the panel, open Settings → Robot accounts → Webservice address, enter
// http://localhost:4010/robot, and add one of the webservice users printed at
// start. Servers, resets, Wake on LAN, rescue and Linux boots, reverse DNS,
// traffic and SSH keys answer like Robot, closely enough to click through every
// screen. Everything is kept in memory.
import crypto from "node:crypto"

/** Webservice users and their passwords; each one is a Robot account. */
export const ROBOT_USERS = {
  "#ws+MockRobot1": { password: "mock-robot-password-1", account: "main" },
  "#ws+MockRobot2": { password: "mock-robot-password-2", account: "reseller" },
}

const RESCUE_OS = ["linux", "vkvm"]
const DISTS = [
  "AlmaLinux 9 base",
  "Arch Linux latest minimal",
  "CentOS Stream 9 base",
  "Debian 12 base",
  "Debian 13 base",
  "Rocky Linux 9 base",
  "Ubuntu 22.04 LTS base",
  "Ubuntu 24.04 LTS base",
]
const LANGS = ["en", "de"]

/* ------------------------------------------------------------------ data */

function makeServer(account, s) {
  const boot = (extra = {}) => ({ active: false, choice: null, lang: null, password: null, keys: [], ...extra })
  return {
    account,
    server_ip: s.ip,
    server_ipv6_net: s.ipv6,
    server_number: s.number,
    server_name: s.name,
    product: s.product,
    dc: s.dc,
    traffic: s.traffic ?? "unlimited",
    status: s.status ?? "ready",
    cancelled: s.cancelled ?? false,
    paid_until: s.paidUntil ?? "2026-11-30",
    ip: [s.ip, ...(s.extraIps ?? [])],
    subnet: [{ ip: s.ipv6, mask: "64" }, ...(s.subnets ?? [])],
    reset: true,
    rescue: true,
    vnc: true,
    windows: s.windows ?? true,
    plesk: false,
    cpanel: false,
    wol: s.wol ?? true,
    hot_swap: s.hotSwap ?? false,
    linked_storagebox: null,
    _resetTypes: s.resetTypes ?? ["sw", "hw", "man"],
    _operating: s.resetTypes?.includes("power") ? "running" : "not supported",
    _manualUntil: 0,
    _boot: { rescue: boot(), linux: boot(), vnc: boot(), windows: boot() },
  }
}

const servers = [
  makeServer("main", {
    number: 2104871,
    name: "db-01",
    product: "AX52",
    dc: "FSN1-DC14",
    ip: "198.51.100.41",
    ipv6: "2a01:4f8:271:3c5e::",
    extraIps: ["198.51.100.42"],
    subnets: [{ ip: "203.0.113.128", mask: "29" }],
  }),
  makeServer("main", {
    number: 2187203,
    name: "backup-01",
    product: "SX65",
    dc: "HEL1-DC7",
    ip: "198.51.100.52",
    ipv6: "2a01:4f9:3a:1d2f::",
    resetTypes: ["power", "power_long", "hw", "man"],
    hotSwap: true,
  }),
  makeServer("main", {
    number: 1953306,
    name: "",
    product: "Server Auction",
    dc: "NBG1-DC3",
    ip: "198.51.100.63",
    ipv6: "2a01:4f8:110:8e2a::",
    cancelled: true,
    paidUntil: "2026-12-31",
    wol: false,
    windows: false,
  }),
  makeServer("main", {
    number: 2215540,
    name: "gpu-01",
    product: "GEX44",
    dc: "FSN1-DC18",
    ip: "198.51.100.74",
    ipv6: "2a01:4f8:2b0:41c7::",
    traffic: "20 TB",
    status: "in process",
  }),
  makeServer("reseller", {
    number: 1874412,
    name: "mail-dedi",
    product: "EX44",
    dc: "NBG1-DC5",
    ip: "198.51.100.85",
    ipv6: "2a01:4f8:1c0:7d03::",
  }),
]

const rdns = new Map([
  ["198.51.100.41", "db-01.example.net"],
  ["2a01:4f8:271:3c5e::2", "db-01.example.net"],
  ["198.51.100.85", "mail.example.org"],
])

const keys = []

// db-01 has a rescue boot waiting, so the notices can be seen right away.
servers[0]._boot.rescue = { active: true, choice: "linux", lang: null, password: "Kx7mQp2RtV9w", keys: [] }

/* ------------------------------------------------------------------ helpers */

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(body === undefined ? "" : JSON.stringify(body))
}

function fail(res, status, code, message, extra = {}) {
  send(res, status, { error: { status, code, message, ...extra } })
}

function invalid(res, fields, missing = []) {
  fail(res, 400, "INVALID_INPUT", "invalid input", { invalid: fields, missing })
}

function readForm(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"))
      const form = {}
      for (const [key, value] of params) {
        if (key.endsWith("[]")) (form[key.slice(0, -2)] ??= []).push(value)
        else form[key] = value
      }
      resolve(form)
    })
  })
}

function md5Fingerprint(publicKey) {
  const data = publicKey.trim().split(/\s+/)[1] ?? ""
  return crypto.createHash("md5").update(Buffer.from(data, "base64")).digest("hex").match(/../g).join(":")
}

function password() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  return Array.from(crypto.randomBytes(14), (b) => chars[b % chars.length]).join("")
}

const pick = (obj, fields) => Object.fromEntries(fields.map((f) => [f, obj[f]]))
const LIST_FIELDS = ["server_ip", "server_ipv6_net", "server_number", "server_name", "product", "dc", "traffic", "status", "cancelled", "paid_until", "ip", "subnet"]
const DETAIL_FIELDS = [...LIST_FIELDS, "reset", "rescue", "vnc", "windows", "plesk", "cpanel", "wol", "hot_swap", "linked_storagebox"]
const ref = (s) => pick(s, ["server_ip", "server_ipv6_net", "server_number"])

/** An IPv6 address as a number, enough to tell which /64 it is in. */
function v6Prefix(ip) {
  const [head, tail = ""] = ip.toLowerCase().split("::")
  const left = head ? head.split(":") : []
  const right = tail ? tail.split(":") : []
  const groups = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
  return groups.slice(0, 4).map((g) => parseInt(g || "0", 16)).join(":")
}

function v4Number(ip) {
  return ip.split(".").reduce((n, p) => n * 256 + Number(p), 0)
}

/** The server an address belongs to: one of its single IPs or inside one of its subnets. */
function ownerOf(list, ip) {
  return list.find(
    (s) =>
      s.ip.includes(ip) ||
      s.subnet.some((sub) =>
        ip.includes(":")
          ? sub.ip.includes(":") && v6Prefix(sub.ip) === v6Prefix(ip)
          : !sub.ip.includes(":") && Math.floor(v4Number(ip) / 2 ** (32 - Number(sub.mask))) === Math.floor(v4Number(sub.ip) / 2 ** (32 - Number(sub.mask)))
      )
  )
}

function keyView(fingerprint) {
  const key = keys.find((k) => k.fingerprint === fingerprint)
  return { key: { name: key?.name ?? "", fingerprint, type: key?.type ?? "ED25519", size: key?.size ?? 256 } }
}

/**
 * A boot configuration as Robot shows it: the choices while it is off, the chosen ones while it is on.
 * Like Robot, it repeats the password of an active boot; the panel must not pass that on.
 */
function bootView(server, name) {
  const b = server._boot[name]
  const base = { ...ref(server), active: b.active, password: b.active ? b.password : null }
  if (name === "rescue") {
    return {
      ...base,
      os: b.active ? b.choice : RESCUE_OS,
      arch: b.active ? 64 : [64],
      authorized_key: b.active ? b.keys.map(keyView) : [],
      host_key: [],
      boot_time: null,
    }
  }
  if (name === "linux") {
    return {
      ...base,
      dist: b.active ? b.choice : DISTS,
      arch: b.active ? 64 : [64],
      lang: b.active ? b.lang : LANGS,
      authorized_key: b.active ? b.keys.map(keyView) : [],
      host_key: [],
    }
  }
  if (name === "vnc") return { ...base, dist: b.active ? b.choice : ["Debian 12", "Ubuntu 24.04"], lang: b.active ? b.lang : LANGS }
  return { ...base, os: b.active ? b.choice : ["win2022"], lang: b.active ? b.lang : ["en"] }
}

/** A reset or power press: boots whatever is set up, the way the real server would. */
function applyReset(server, type) {
  if (type === "power_long") {
    server._operating = "off"
    return
  }
  if (type === "power" && server._operating === "running") {
    server._operating = "off"
    return
  }
  if (server._operating !== "not supported") server._operating = "running"
  if (type === "man") server._manualUntil = Date.now() + 60_000
  const { rescue, linux } = server._boot
  // A start uses up the boot configuration: rescue boots once, an installation runs once.
  if (rescue.active) setTimeout(() => Object.assign(rescue, { active: false, password: null }), 8000)
  if (linux.active) setTimeout(() => Object.assign(linux, { active: false, password: null }), 20000)
}

/* ------------------------------------------------------------------ traffic */

/** Pretend traffic in GB, the same for the same address and slot every time. */
function trafficOf(ip, slotStart, hours) {
  const seed = crypto.createHash("md5").update(`${ip}:${slotStart}`).digest()
  const wave = 0.6 + 0.4 * Math.sin(slotStart / 3_600_000 / 5)
  const out = (seed[0] / 255) * 6 * wave * hours * (ip.includes(":") ? 0.3 : 1)
  const inbound = (seed[1] / 255) * 1.5 * wave * hours * (ip.includes(":") ? 0.3 : 1)
  return { in: Number(inbound.toFixed(4)), out: Number(out.toFixed(4)), sum: Number((inbound + out).toFixed(4)) }
}

/** The hours, days or months between from and to that are over, as Robot names them. */
function trafficSlots(type, from, to) {
  const slots = []
  const now = Date.now()
  if (type === "day") {
    const [date, h1] = from.split("T")
    const h2 = Number(to.split("T")[1])
    for (let h = Number(h1); h <= h2; h++) {
      const start = Date.parse(`${date}T${String(h).padStart(2, "0")}:00:00Z`)
      if (start + 3_600_000 <= now) slots.push({ key: String(h).padStart(2, "0"), start, hours: 1 })
    }
  } else if (type === "month") {
    const [y, m, d1] = from.split("-").map(Number)
    const d2 = Number(to.split("-")[2])
    for (let d = d1; d <= d2; d++) {
      const start = Date.UTC(y, m - 1, d)
      if (new Date(start).getUTCMonth() !== m - 1) break
      if (start + 86_400_000 <= now) slots.push({ key: String(d).padStart(2, "0"), start, hours: 24 })
    }
  } else {
    const [y, m1] = from.split("-").map(Number)
    const m2 = Number(to.split("-")[1])
    for (let m = m1; m <= m2; m++) {
      const start = Date.UTC(y, m - 1, 1)
      if (Date.UTC(y, m, 1) <= now) slots.push({ key: String(m).padStart(2, "0"), start, hours: 24 * 30 })
    }
  }
  return slots
}

/* ------------------------------------------------------------------ routes */

export async function handleRobot(req, res, url) {
  const auth = (req.headers.authorization ?? "").replace(/^Basic\s+/i, "")
  const [user, ...rest] = Buffer.from(auth, "base64").toString("utf8").split(":")
  const login = ROBOT_USERS[user]
  if (!login || login.password !== rest.join(":")) return fail(res, 401, "UNAUTHORIZED", "Unauthorized")

  const parts = url.pathname.replace(/^\/robot\/?/, "").replace(/\/+$/, "").split("/").filter(Boolean).map(decodeURIComponent)
  const method = req.method
  const form = method === "POST" || method === "PUT" ? await readForm(req) : {}
  const mine = servers.filter((s) => s.account === login.account)
  const find = (n) => mine.find((s) => s.server_number === Number(n))
  const notFound = () => fail(res, 404, "SERVER_NOT_FOUND", "server not found")

  // --- servers
  if (parts[0] === "server" && parts.length === 1 && method === "GET") {
    if (!mine.length) return notFound()
    return send(res, 200, mine.map((s) => ({ server: pick(s, LIST_FIELDS) })))
  }
  if (parts[0] === "server" && parts.length === 2) {
    const server = find(parts[1])
    if (!server) return notFound()
    if (method === "POST") {
      if (!form.server_name) return invalid(res, [], ["server_name"])
      server.server_name = form.server_name
    }
    return send(res, 200, { server: pick(server, DETAIL_FIELDS) })
  }

  // --- reset
  if (parts[0] === "reset" && parts.length === 2) {
    const server = find(parts[1])
    if (!server) return notFound()
    const view = { ...ref(server), type: server._resetTypes, operating_status: server._operating }
    if (method === "GET") return send(res, 200, { reset: view })
    if (method === "POST") {
      if (!server._resetTypes.includes(form.type)) return invalid(res, ["type"])
      if (form.type === "man" && server._manualUntil > Date.now()) return fail(res, 409, "RESET_MANUAL_ACTIVE", "There is already a running manual reset")
      applyReset(server, form.type)
      return send(res, 200, { reset: { ...ref(server), type: form.type } })
    }
  }

  // --- Wake on LAN
  if (parts[0] === "wol" && parts.length === 2) {
    const server = find(parts[1])
    if (!server) return notFound()
    if (!server.wol) return fail(res, 404, "WOL_NOT_AVAILABLE", "Wake On LAN is not available on this server")
    if (method === "POST" && server._operating === "off") server._operating = "running"
    return send(res, 200, { wol: ref(server) })
  }

  // --- boot configurations
  if (parts[0] === "boot" && parts.length >= 2) {
    const server = find(parts[1])
    if (!server) return notFound()
    const name = parts[2]
    if (!name && method === "GET") {
      return send(res, 200, { boot: Object.fromEntries(["rescue", "linux", "vnc", "windows"].map((n) => [n, bootView(server, n)])) })
    }
    if ((name === "rescue" || name === "linux") && parts.length === 3) {
      const b = server._boot[name]
      if (method === "GET") return send(res, 200, { [name]: bootView(server, name) })
      if (method === "DELETE") {
        Object.assign(b, { active: false, choice: null, lang: null, password: null, keys: [] })
        return send(res, 200, { [name]: bootView(server, name) })
      }
      if (method === "POST") {
        const fingerprints = form.authorized_key ?? []
        if (fingerprints.some((f) => !keys.some((k) => k.fingerprint === f))) return invalid(res, ["authorized_key"])
        if (name === "rescue") {
          if (!form.os) return invalid(res, [], ["os"])
          if (!RESCUE_OS.includes(form.os)) return invalid(res, ["os"])
          Object.assign(b, { active: true, choice: form.os, lang: null, keys: fingerprints, password: password() })
        } else {
          if (!form.dist || !form.lang) return invalid(res, [], [!form.dist ? "dist" : "lang"])
          if (!DISTS.includes(form.dist)) return invalid(res, ["dist"])
          if (!LANGS.includes(form.lang)) return invalid(res, ["lang"])
          Object.assign(b, { active: true, choice: form.dist, lang: form.lang, keys: fingerprints, password: password() })
        }
        // Robot keeps one boot at a time.
        for (const other of ["rescue", "linux", "vnc", "windows"]) if (other !== name) server._boot[other].active = false
        return send(res, 200, { [name]: bootView(server, name) })
      }
    }
  }

  // --- reverse DNS
  if (parts[0] === "rdns" && parts.length === 1 && method === "GET") {
    const owner = url.searchParams.get("server_ip") ? mine.find((s) => s.server_ip === url.searchParams.get("server_ip")) : null
    const list = [...rdns]
      .filter(([ip]) => (owner ? ownerOf([owner], ip) : ownerOf(mine, ip)))
      .map(([ip, ptr]) => ({ rdns: { ip, ptr } }))
    return list.length ? send(res, 200, list) : fail(res, 404, "NOT_FOUND", "No reverse DNS entries found")
  }
  if (parts[0] === "rdns" && parts.length === 2) {
    const ip = parts[1].toLowerCase()
    if (!ownerOf(mine, ip)) return fail(res, 404, "IP_NOT_FOUND", `The IP address ${ip} was not found`)
    if (method === "GET") {
      return rdns.has(ip) ? send(res, 200, { rdns: { ip, ptr: rdns.get(ip) } }) : fail(res, 404, "RDNS_NOT_FOUND", `The IP address ${ip} has no reverse DNS entry yet`)
    }
    if (method === "DELETE") {
      rdns.delete(ip)
      res.writeHead(200)
      return res.end()
    }
    if (method === "PUT" || method === "POST") {
      if (!form.ptr) return invalid(res, [], ["ptr"])
      if (method === "PUT" && rdns.has(ip)) return fail(res, 409, "RDNS_ALREADY_EXISTS", "There is already an existing reverse DNS entry")
      const created = !rdns.has(ip)
      rdns.set(ip, form.ptr)
      return send(res, created ? 201 : 200, { rdns: { ip, ptr: form.ptr } })
    }
  }

  // --- traffic
  if (parts[0] === "traffic" && parts.length === 1 && method === "POST") {
    const { type, from, to } = form
    const formats = { day: /^\d{4}-\d{2}-\d{2}T\d{2}$/, month: /^\d{4}-\d{2}-\d{2}$/, year: /^\d{4}-\d{2}$/ }
    if (!formats[type] || !formats[type].test(from ?? "") || !formats[type].test(to ?? "")) return invalid(res, ["type", "from", "to"])
    const targets = [...(form.ip ?? []), ...(form.subnet ?? [])].filter((ip) => ownerOf(mine, ip))
    if (!targets.length) return fail(res, 404, "NOT_FOUND", "No IP addresses or subnets found")
    const slots = trafficSlots(type, from, to)
    const data = {}
    for (const ip of targets) {
      if (!slots.length) continue
      const values = Object.fromEntries(slots.map((s) => [s.key, trafficOf(ip, s.start, s.hours)]))
      if (form.single_values === "true") data[ip] = values
      else {
        const sum = Object.values(values).reduce((a, v) => ({ in: a.in + v.in, out: a.out + v.out, sum: a.sum + v.sum }), { in: 0, out: 0, sum: 0 })
        data[ip] = sum
      }
    }
    return send(res, 200, { traffic: { type, from, to, data } })
  }

  // --- SSH keys
  if (parts[0] === "key" && parts.length === 1) {
    if (method === "GET") return keys.length ? send(res, 200, keys.map((k) => ({ key: k }))) : fail(res, 404, "NOT_FOUND", "No keys found")
    if (method === "POST") {
      if (!form.name || !form.data) return invalid(res, [], [!form.name ? "name" : "data"])
      const [type, data] = form.data.trim().split(/\s+/)
      if (!data || !/^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp\d+)$/.test(type)) return invalid(res, ["data"])
      const fingerprint = md5Fingerprint(form.data)
      if (keys.some((k) => k.fingerprint === fingerprint)) return fail(res, 409, "KEY_ALREADY_EXISTS", "The key already exists")
      const key = {
        name: form.name,
        fingerprint,
        type: type === "ssh-rsa" ? "RSA" : type === "ssh-ed25519" ? "ED25519" : "ECDSA",
        size: type === "ssh-rsa" ? 4096 : 256,
        data: form.data.trim(),
        created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      }
      keys.push(key)
      return send(res, 201, { key })
    }
  }
  if (parts[0] === "key" && parts.length === 2) {
    const index = keys.findIndex((k) => k.fingerprint === parts[1])
    if (index < 0) return fail(res, 404, "NOT_FOUND", "Key not found")
    if (method === "GET") return send(res, 200, { key: keys[index] })
    if (method === "DELETE") {
      keys.splice(index, 1)
      res.writeHead(200)
      return res.end()
    }
  }

  return fail(res, 404, "NOT_FOUND", `${method} ${url.pathname} is not in the mock`)
}
