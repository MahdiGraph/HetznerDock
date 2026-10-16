#!/usr/bin/env node
// A fake Hetzner Cloud API for trying Hetzner Dock without a real project, and
// under /robot a fake Hetzner Robot webservice for dedicated servers.
//
//   npm run mock            (listens on http://localhost:4010)
//
// Then, in the panel: Settings → API address → http://localhost:4010/v1, and add
// one of the tokens printed at start as a project. Servers, actions, images,
// metrics, firewalls and a small VNC console behave like the real API, closely
// enough to click through every screen. For dedicated servers, set Settings →
// Robot accounts → Webservice address to http://localhost:4010/robot and add a
// webservice user printed at start (see mock-robot.mjs). Everything is kept in
// memory.
import crypto from "node:crypto"
import http from "node:http"
import { handleRobot, ROBOT_USERS } from "./mock-robot.mjs"

const PORT = Number(process.env.MOCK_PORT || 4010)
const HOST = process.env.MOCK_HOST || "127.0.0.1"

/* ------------------------------------------------------------------ data */

const TOKENS = {
  mockCustomersToken0000000000000000000000000000000000000000000000001: "customers",
  mockPersonalToken00000000000000000000000000000000000000000000000002: "personal",
}

const LOCATIONS = {
  fsn1: { id: 1, name: "fsn1", description: "Falkenstein DC Park 1", country: "DE", city: "Falkenstein", latitude: 50.47612, longitude: 12.370071, network_zone: "eu-central" },
  nbg1: { id: 2, name: "nbg1", description: "Nuremberg DC Park 1", country: "DE", city: "Nuremberg", latitude: 49.452102, longitude: 11.076665, network_zone: "eu-central" },
  hel1: { id: 3, name: "hel1", description: "Helsinki DC Park 1", country: "FI", city: "Helsinki", latitude: 60.169855, longitude: 24.938379, network_zone: "eu-central" },
  ash: { id: 4, name: "ash", description: "Ashburn, VA", country: "US", city: "Ashburn, VA", latitude: 39.043757, longitude: -77.487442, network_zone: "us-east" },
  hil: { id: 5, name: "hil", description: "Hillsboro, OR", country: "US", city: "Hillsboro, OR", latitude: 45.54, longitude: -122.95, network_zone: "us-west" },
  sin: { id: 6, name: "sin", description: "Singapore", country: "SG", city: "Singapore", latitude: 1.283333, longitude: 103.833333, network_zone: "ap-southeast" },
}

const TB = 1024 ** 4
const eu = ["fsn1", "nbg1", "hel1"]
const all = Object.keys(LOCATIONS)

function serverType(id, name, cores, memory, disk, cpu_type, architecture, monthly, where, extra = {}) {
  return {
    id,
    name,
    description: `${name.toUpperCase()}`,
    cores,
    memory,
    disk,
    deprecated: false,
    deprecation: null,
    prices: where.map((loc) => ({
      location: loc,
      price_hourly: { net: (monthly / 730 / 1.19).toFixed(4), gross: (monthly / 730).toFixed(4) },
      price_monthly: { net: (monthly / 1.19).toFixed(4), gross: monthly.toFixed(4) },
      included_traffic: (loc === "ash" || loc === "hil" || loc === "sin" ? 1 : 20) * TB,
      price_per_tb_traffic: { net: "1.0000", gross: "1.1900" },
    })),
    storage_type: "local",
    cpu_type,
    category: cpu_type === "dedicated" ? "dedicated_cpu" : "cost_optimized",
    architecture,
    locations: where.map((loc) => ({ id: LOCATIONS[loc].id, name: loc, deprecation: null, recommended: loc === "fsn1", available: !(name === "cx53" && loc === "hel1") })),
    ...extra,
  }
}

const SERVER_TYPES = [
  serverType(115, "cx23", 2, 4, 40, "shared", "x86", 4.15, eu),
  serverType(116, "cx33", 4, 8, 80, "shared", "x86", 6.59, eu),
  serverType(117, "cx43", 8, 16, 160, "shared", "x86", 11.89, eu),
  serverType(118, "cx53", 16, 32, 320, "shared", "x86", 22.48, eu),
  serverType(108, "cpx22", 2, 4, 80, "shared", "x86", 7.71, all),
  serverType(109, "cpx32", 4, 8, 160, "shared", "x86", 13.28, all),
  serverType(110, "cpx42", 8, 16, 320, "shared", "x86", 24.94, all),
  serverType(45, "cax11", 2, 4, 40, "shared", "arm", 4.49, ["fsn1", "nbg1", "hel1"]),
  serverType(93, "cax21", 4, 8, 80, "shared", "arm", 7.73, ["fsn1", "nbg1", "hel1"]),
  serverType(94, "cax31", 8, 16, 160, "shared", "arm", 15.47, ["fsn1", "nbg1", "hel1"]),
  serverType(96, "ccx13", 2, 8, 80, "dedicated", "x86", 15.59, all),
  serverType(97, "ccx23", 4, 16, 160, "dedicated", "x86", 31.06, all),
  serverType(98, "ccx33", 8, 32, 240, "dedicated", "x86", 61.99, all),
]
const typeByName = (name) => SERVER_TYPES.find((t) => t.name === name)

let nextImage = 400000000
function systemImage(name, description, flavor, version, architecture) {
  return {
    id: nextImage++,
    type: "system",
    status: "available",
    name,
    description,
    image_size: null,
    disk_size: 5,
    created: "2026-04-25T12:00:00Z",
    created_from: null,
    bound_to: null,
    os_flavor: flavor,
    os_version: version,
    rapid_deploy: true,
    protection: { delete: false },
    deprecated: null,
    deprecation: null,
    labels: {},
    deleted: null,
    architecture,
  }
}
function appImage(name, description, architecture) {
  return { ...systemImage(name, description, "ubuntu", "24.04", architecture), type: "app", rapid_deploy: false }
}

const IMAGES = []
for (const arch of ["x86", "arm"]) {
  IMAGES.push(
    systemImage("ubuntu-22.04", "Ubuntu 22.04", "ubuntu", "22.04", arch),
    systemImage("ubuntu-24.04", "Ubuntu 24.04", "ubuntu", "24.04", arch),
    systemImage("ubuntu-26.04", "Ubuntu 26.04", "ubuntu", "26.04", arch),
    systemImage("debian-12", "Debian 12", "debian", "12", arch),
    systemImage("debian-13", "Debian 13", "debian", "13", arch),
    systemImage("fedora-44", "Fedora 44", "fedora", "44", arch),
    systemImage("rocky-10", "Rocky Linux 10", "rocky", "10", arch),
    systemImage("alma-10", "AlmaLinux 10", "alma", "10", arch),
    systemImage("centos-stream-10", "CentOS Stream 10", "centos", "stream-10", arch),
    systemImage("opensuse-16", "openSUSE Leap 16", "opensuse", "16", arch)
  )
  IMAGES.push(appImage("docker-ce", "Docker CE", arch), appImage("nextcloud", "Nextcloud", arch), appImage("wordpress", "WordPress", arch))
}
if (true) {
  for (const [name, description] of [["gitlab", "GitLab"], ["lamp", "LAMP stack"], ["coolify", "Coolify"]]) IMAGES.push(appImage(name, description, "x86"))
}
const sysImage = (name, arch = "x86") => IMAGES.find((i) => i.name === name && i.architecture === arch)

const ISOS = [
  ["windows-server-2025-en", "Windows Server 2025 English", "x86"],
  ["windows-server-2022-en", "Windows Server 2022 English", "x86"],
  ["windows-server-2022-de", "Windows Server 2022 German", "x86"],
  ["virtio-win-0.1.271", "virtio-win-0.1.271", null],
  ["freebsd-14.3-amd64", "FreeBSD 14.3 amd64", "x86"],
  ["freebsd-14.3-aarch64", "FreeBSD 14.3 aarch64", "arm"],
  ["opnsense-25.7", "OPNsense 25.7", "x86"],
  ["pfsense-ce-2.8", "pfSense CE 2.8", "x86"],
  ["archlinux-2026.10.01", "Arch Linux 2026.10.01", "x86"],
  ["nixos-25.05-x86_64", "NixOS 25.05 x86_64", "x86"],
  ["nixos-25.05-aarch64", "NixOS 25.05 aarch64", "arm"],
  ["alpine-3.22-x86_64", "Alpine Linux 3.22 x86_64", "x86"],
  ["alpine-3.22-aarch64", "Alpine Linux 3.22 aarch64", "arm"],
  ["proxmox-ve-9.0", "Proxmox VE 9.0", "x86"],
  ["truenas-scale-25.04", "TrueNAS SCALE 25.04", "x86"],
  ["ubuntu-24.04.3-live-server-amd64", "Ubuntu 24.04.3 Live Server amd64", "x86"],
  ["debian-13.1.0-amd64-netinst", "Debian 13.1.0 amd64 netinst", "x86"],
  ["gentoo-install-amd64-minimal", "Gentoo minimal install amd64", "x86"],
].map(([name, description, architecture], i) => ({ id: 120000 + i, name, description, type: "public", deprecation: null, architecture }))
ISOS.push({ id: 129999, name: null, description: "customer-recovery.iso", type: "private", deprecation: null, architecture: "x86" })

/* ------------------------------------------------------------------ projects */

let nextId = 70000000
let nextAction = 900000000
let nextResource = 5000

function makeServer(project, { name, type, location, image, status = "running", arch = "x86", ipv4, ipv6, created, backup = false, extra = {} }) {
  const t = typeByName(type)
  const id = nextId++
  return {
    id,
    name,
    status,
    created,
    public_net: {
      ipv4: { id: nextResource++, ip: ipv4, blocked: false, dns_ptr: `static.${ipv4.split(".").reverse().join(".")}.clients.your-server.de` },
      ipv6: { id: nextResource++, ip: ipv6, blocked: false, dns_ptr: [] },
      floating_ips: [],
      firewalls: [],
    },
    private_net: [],
    server_type: t,
    location: LOCATIONS[location],
    image: sysImage(image, arch) ?? null,
    iso: null,
    rescue_enabled: false,
    locked: false,
    backup_window: backup ? "22-02" : null,
    outgoing_traffic: Math.round(Math.random() * 3 * TB),
    ingoing_traffic: Math.round(Math.random() * 0.4 * TB),
    included_traffic: location === "ash" || location === "hil" || location === "sin" ? TB : 20 * TB,
    protection: { delete: false, rebuild: false },
    labels: { customer: project === "customers" ? "acme" : "me", env: "production" },
    volumes: [],
    load_balancers: [],
    primary_disk_size: t.disk,
    placement_group: null,
    _project: project,
    _user_data: null,
    ...extra,
  }
}

const state = {
  servers: [],
  actions: [],
  images: [...IMAGES],
  sshKeys: [],
  floatingIps: [],
  firewalls: [],
  volumes: [],
  networks: [],
}

function seed() {
  const s = (project, opts) => {
    const server = makeServer(project, opts)
    state.servers.push(server)
    return server
  }
  const web = s("customers", { name: "web-01", type: "cx23", location: "fsn1", image: "ubuntu-24.04", ipv4: "203.0.113.24", ipv6: "2a01:4f8:c0c:1a2b::/64", created: "2026-02-11T09:12:00Z", backup: true })
  const mail = s("customers", { name: "mail-01", type: "cx33", location: "nbg1", image: "debian-12", ipv4: "203.0.113.25", ipv6: "2a01:4f8:1c1e:42ab::/64", created: "2025-11-03T17:40:00Z" })
  const game = s("customers", { name: "game-01", type: "ccx23", location: "hel1", image: "ubuntu-22.04", status: "off", ipv4: "198.51.100.7", ipv6: "2a01:4f9:c012:7c1d::/64", created: "2026-05-21T20:01:00Z" })
  s("customers", { name: "arm-builder", type: "cax21", location: "fsn1", image: "ubuntu-24.04", arch: "arm", ipv4: "203.0.113.61", ipv6: "2a01:4f8:c17:5e01::/64", created: "2026-07-02T08:30:00Z" })
  const edge = s("customers", { name: "us-edge", type: "cpx22", location: "ash", image: "rocky-10", ipv4: "198.51.100.140", ipv6: "2a01:4ff:f0:9e3a::/64", created: "2026-08-14T15:55:00Z" })
  s("customers", { name: "sg-cache", type: "cpx22", location: "sin", image: "debian-13", ipv4: "192.0.2.88", ipv6: "2a01:4ff:2f0:1d2c::/64", created: "2026-09-01T03:10:00Z" })
  s("personal", { name: "vpn", type: "cx23", location: "hel1", image: "ubuntu-24.04", ipv4: "192.0.2.200", ipv6: "2a01:4f9:c010:dd01::/64", created: "2025-12-24T10:00:00Z" })
  const lab = s("personal", { name: "lab", type: "cx33", location: "nbg1", image: "fedora-44", status: "off", ipv4: "192.0.2.201", ipv6: "2a01:4f8:1c1b:2201::/64", created: "2026-03-30T22:22:00Z" })

  web.outgoing_traffic = Math.round(16.8 * TB)
  edge.outgoing_traffic = Math.round(0.62 * TB)
  web.public_net.ipv4.dns_ptr = "web-01.example.net"
  web.public_net.ipv6.dns_ptr = [{ ip: "2a01:4f8:c0c:1a2b::1", dns_ptr: "web-01.example.net" }]
  mail.public_net.ipv4.dns_ptr = "mail.example.net"
  lab.rescue_enabled = true
  lab.iso = ISOS.find((i) => i.name === "proxmox-ve-9.0")
  game.protection = { delete: true, rebuild: true }

  // Snapshots: two of web-01, one of mail-01 (users of web-01 must not see it).
  const snap = (server, description, created, size) =>
    state.images.push({
      ...systemImage(null, description, server.image?.os_flavor ?? "ubuntu", server.image?.os_version ?? "24.04", server.server_type.architecture),
      id: nextImage++,
      type: "snapshot",
      name: null,
      rapid_deploy: false,
      image_size: size,
      disk_size: server.primary_disk_size,
      created,
      created_from: { id: server.id, name: server.name },
      labels: { customer: "acme" },
    })
  snap(web, "web-01 before PHP 8.4", "2026-09-28T19:02:00Z", 3.42)
  snap(web, "web-01 clean install", "2026-03-02T11:15:00Z", 1.87)
  snap(mail, "mail-01 before migration", "2026-06-10T07:44:00Z", 2.95)
  for (let d = 1; d <= 3; d++) {
    state.images.push({
      ...systemImage(null, `${web.name} ${new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)}`, "ubuntu", "24.04", "x86"),
      id: nextImage++,
      type: "backup",
      name: null,
      rapid_deploy: false,
      image_size: 3.3 + d / 10,
      disk_size: 40,
      created: new Date(Date.now() - d * 86400000).toISOString(),
      bound_to: web.id,
    })
  }

  // A firewall shared by web-01 and us-edge, and one that only protects mail-01.
  const fw = (name, servers, rules) => {
    const firewall = {
      id: nextResource++,
      name,
      labels: {},
      created: "2026-01-10T10:00:00Z",
      rules,
      applied_to: servers.map((sv) => ({ type: "server", server: { id: sv.id } })),
    }
    state.firewalls.push(firewall)
    for (const sv of servers) sv.public_net.firewalls.push({ id: firewall.id, status: "applied" })
    return firewall
  }
  const any = ["0.0.0.0/0", "::/0"]
  fw("web-shared", [web, edge], [
    { description: "SSH", direction: "in", source_ips: any, destination_ips: [], protocol: "tcp", port: "22" },
    { description: "HTTP", direction: "in", source_ips: any, destination_ips: [], protocol: "tcp", port: "80" },
    { description: "HTTPS", direction: "in", source_ips: any, destination_ips: [], protocol: "tcp", port: "443" },
  ])
  fw("mail-01-firewall", [mail], [
    { description: "SSH from the office", direction: "in", source_ips: ["198.51.100.0/24"], destination_ips: [], protocol: "tcp", port: "22" },
    { description: "SMTP", direction: "in", source_ips: any, destination_ips: [], protocol: "tcp", port: "25" },
    { description: "Submission", direction: "in", source_ips: any, destination_ips: [], protocol: "tcp", port: "587" },
    { description: "IMAPS", direction: "in", source_ips: any, destination_ips: [], protocol: "tcp", port: "993" },
    { description: "Ping", direction: "in", source_ips: any, destination_ips: [], protocol: "icmp", port: null },
  ])

  const fip = (server, type, ip) => {
    const f = {
      id: nextResource++,
      name: `${server.name}-${type}`,
      description: null,
      ip,
      type,
      server: server.id,
      dns_ptr: type === "ipv4" ? [{ ip, dns_ptr: `static.${ip.split(".").reverse().join(".")}.clients.your-server.de` }] : [],
      home_location: server.location,
      blocked: false,
      protection: { delete: false },
      labels: {},
      created: "2026-02-12T09:00:00Z",
      _project: server._project,
    }
    state.floatingIps.push(f)
    server.public_net.floating_ips.push(f.id)
  }
  fip(web, "ipv4", "203.0.113.99")
  fip(mail, "ipv6", "2a01:4f8:2c0:ff00::/64")

  const volume = { id: nextResource++, name: "web-01-data", server: web.id, size: 100, linux_device: "/dev/disk/by-id/scsi-0HC_Volume_101", format: "ext4", status: "available", location: web.location, protection: { delete: false }, labels: {}, created: "2026-02-11T09:30:00Z", _project: "customers" }
  state.volumes.push(volume)
  web.volumes.push(volume.id)

  const network = { id: nextResource++, name: "backend", ip_range: "10.0.0.0/16", _project: "customers" }
  state.networks.push(network)
  web.private_net.push({ network: network.id, ip: "10.0.0.2", alias_ips: [], mac_address: "86:00:00:2a:7d:e0" })
  mail.private_net.push({ network: network.id, ip: "10.0.0.3", alias_ips: ["10.0.0.10"], mac_address: "86:00:00:2a:7d:e1" })

  // Some history.
  const past = (server, command, minutesAgo, seconds, error) => {
    const started = new Date(Date.now() - minutesAgo * 60_000)
    state.actions.push({
      id: nextAction++,
      command,
      status: error ? "error" : "success",
      progress: 100,
      started: started.toISOString(),
      finished: new Date(started.getTime() + seconds * 1000).toISOString(),
      resources: [{ id: server.id, type: "server" }],
      error: error ? { code: "action_failed", message: error } : null,
    })
  }
  past(web, "create_server", 60 * 24 * 200, 18)
  past(web, "enable_backup", 60 * 24 * 199, 2)
  past(web, "apply_firewall", 60 * 24 * 150, 3)
  past(web, "change_dns_ptr", 60 * 24 * 40, 1)
  past(web, "create_image", 60 * 24 * 18, 95)
  past(web, "reboot_server", 60 * 5, 2)
  past(web, "reset_password", 60 * 3, 4, "Could not reach the QEMU guest agent in the server.")
  past(mail, "create_server", 60 * 24 * 340, 21)
  past(lab, "enable_rescue", 30, 1)
  past(lab, "attach_iso", 25, 2)
}
seed()

/* ------------------------------------------------------------------ helpers */

const rate = new Map()

function send(res, status, body, headers = {}) {
  const text = body === undefined ? "" : JSON.stringify(body)
  res.writeHead(status, { "Content-Type": "application/json", ...headers })
  res.end(text)
}

function error(res, status, code, message, details = null) {
  send(res, status, { error: { code, message, details } })
}

function clean(obj) {
  if (Array.isArray(obj)) return obj.map(clean)
  if (!obj || typeof obj !== "object") return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) if (!k.startsWith("_")) out[k] = clean(v)
  return out
}

function paginate(res, key, list, query, headers) {
  const perPage = Math.min(Math.max(Number(query.get("per_page")) || 25, 1), 50)
  const page = Math.max(Number(query.get("page")) || 1, 1)
  const last = Math.max(1, Math.ceil(list.length / perPage))
  const items = list.slice((page - 1) * perPage, page * perPage)
  send(
    res,
    200,
    {
      [key]: clean(items),
      meta: {
        pagination: {
          page,
          per_page: perPage,
          previous_page: page > 1 ? page - 1 : null,
          next_page: page < last ? page + 1 : null,
          last_page: last,
          total_entries: list.length,
        },
      },
    },
    headers
  )
}

function sortBy(list, query, fields) {
  const sort = query.getAll("sort")[0]
  if (!sort) return list
  const [field, dir] = sort.split(":")
  if (!fields.includes(field)) return list
  const sorted = [...list].sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0))
  return dir === "desc" ? sorted.reverse() : sorted
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8")
      if (!text) return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch {
        resolve(Symbol.for("bad-json"))
      }
    })
  })
}

const DURATIONS = {
  start_server: 6,
  stop_server: 3,
  reboot_server: 4,
  shutdown_server: 5,
  reset_server: 4,
  rebuild_server: 25,
  enable_rescue: 2,
  disable_rescue: 2,
  create_image: 18,
  attach_iso: 2,
  detach_iso: 2,
  change_dns_ptr: 2,
  reset_password: 4,
  request_console: 1,
  change_server_type: 20,
  enable_backup: 2,
  disable_backup: 3,
  change_protection: 1,
  set_firewall_rules: 3,
  apply_firewall: 3,
  remove_firewall: 3,
}

/** Starts an action that runs for a while and applies `done` when it finishes. */
function startAction(command, resources, done, fail) {
  const action = {
    id: nextAction++,
    command,
    status: "running",
    progress: 0,
    started: new Date().toISOString(),
    finished: null,
    resources,
    error: null,
  }
  state.actions.push(action)
  const seconds = DURATIONS[command] ?? 3
  const started = Date.now()
  const timer = setInterval(() => {
    const share = (Date.now() - started) / (seconds * 1000)
    if (share >= 1) {
      clearInterval(timer)
      action.progress = 100
      action.finished = new Date().toISOString()
      if (fail) {
        action.status = "error"
        action.error = { code: "action_failed", message: fail }
      } else {
        action.status = "success"
        done?.()
      }
    } else {
      action.progress = Math.min(99, Math.round(share * 100))
    }
  }, 250)
  return action
}

const serverResource = (server) => [{ id: server.id, type: "server" }]

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  return Array.from(crypto.randomBytes(18), (b) => chars[b % chars.length]).join("")
}

function running(server) {
  return state.actions.some((a) => a.status === "running" && a.command !== "request_console" && a.resources.some((r) => r.type === "server" && r.id === server.id))
}

function md5Fingerprint(publicKey) {
  const data = publicKey.trim().split(/\s+/)[1] ?? ""
  return crypto.createHash("md5").update(Buffer.from(data, "base64")).digest("hex").match(/../g).join(":")
}

/* ------------------------------------------------------------------ metrics */

function metrics(server, type, start, end) {
  const from = new Date(start).getTime()
  const to = new Date(end).getTime()
  const step = Math.max(60, Math.ceil((to - from) / 1000 / 200))
  const series = {}
  const seed = server.id % 97
  const wave = (t, period, phase) => Math.sin(t / 1000 / period + phase + seed) * 0.5 + 0.5
  const values = (fn) => {
    const out = []
    for (let t = from; t <= to; t += step * 1000) out.push([t / 1000, String(Math.max(0, fn(t)).toFixed(3))])
    return out
  }
  const on = server.status === "running"
  if (type.includes("cpu")) {
    series.cpu = { values: values((t) => (on ? (8 + 55 * wave(t, 3600 * 3, 0) * wave(t, 900, 1)) * server.server_type.cores * 0.6 : 0)) }
  }
  if (type.includes("disk")) {
    series["disk.0.iops.read"] = { values: values((t) => (on ? 20 + 300 * wave(t, 5400, 2) : 0)) }
    series["disk.0.iops.write"] = { values: values((t) => (on ? 40 + 180 * wave(t, 2400, 3) : 0)) }
    series["disk.0.bandwidth.read"] = { values: values((t) => (on ? 2e5 + 9e6 * wave(t, 5400, 2) : 0)) }
    series["disk.0.bandwidth.write"] = { values: values((t) => (on ? 4e5 + 5e6 * wave(t, 2400, 3) : 0)) }
  }
  if (type.includes("network")) {
    series["network.0.bandwidth.in"] = { values: values((t) => (on ? 3e4 + 6e5 * wave(t, 4000, 4) : 0)) }
    series["network.0.bandwidth.out"] = { values: values((t) => (on ? 8e4 + 2.4e6 * wave(t, 7000, 5) * wave(t, 1200, 6) : 0)) }
    series["network.0.pps.in"] = { values: values((t) => (on ? 40 + 900 * wave(t, 4000, 4) : 0)) }
    series["network.0.pps.out"] = { values: values((t) => (on ? 60 + 1400 * wave(t, 7000, 5) : 0)) }
  }
  return { metrics: { start: new Date(from).toISOString(), end: new Date(to).toISOString(), step, time_series: series } }
}

/* ------------------------------------------------------------------ routes */

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname === "/robot" || url.pathname.startsWith("/robot/")) return handleRobot(req, res, url)
  if (!url.pathname.startsWith("/v1/")) return error(res, 404, "not_found", "not found")
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "")
  const project = TOKENS[token]

  // Rate limit headers like Hetzner's: 3600 an hour, refilling one a second.
  const bucket = rate.get(token) ?? { remaining: 3600, at: Date.now() }
  bucket.remaining = Math.min(3600, bucket.remaining + Math.floor((Date.now() - bucket.at) / 1000)) - 1
  bucket.at = Date.now()
  rate.set(token, bucket)
  const headers = {
    "RateLimit-Limit": "3600",
    "RateLimit-Remaining": String(Math.max(0, bucket.remaining)),
    "RateLimit-Reset": String(Math.floor(Date.now() / 1000) + (3600 - bucket.remaining)),
  }
  const ok = (body, status = 200) => send(res, status, clean(body), headers)

  if (!project) return error(res, 401, "unauthorized", "unable to authenticate")
  const path = url.pathname.slice(3).replace(/\/+$/, "")
  const parts = path.split("/").filter(Boolean)
  const q = url.searchParams
  const method = req.method
  const body = method === "GET" || method === "DELETE" ? {} : await readBody(req)
  if (body === Symbol.for("bad-json")) return error(res, 400, "json_error", "invalid JSON")

  const servers = state.servers.filter((s) => s._project === project)
  const findServer = (id) => servers.find((s) => s.id === Number(id))

  // --- servers
  if (parts[0] === "servers" && parts.length === 1 && method === "GET") {
    let list = servers
    if (q.get("name")) list = list.filter((s) => s.name === q.get("name"))
    const statuses = q.getAll("status")
    if (statuses.length) list = list.filter((s) => statuses.includes(s.status))
    return paginate(res, "servers", sortBy(list, q, ["id", "name", "created"]), q, headers)
  }
  if (parts[0] === "servers" && parts.length >= 2) {
    const server = findServer(parts[1])
    if (!server) return error(res, 404, "not_found", `server with ID '${parts[1]}' not found`)
    if (parts.length === 2 && method === "GET") return ok({ server })
    if (parts.length === 2 && method === "PUT") {
      if (body.name) {
        if (servers.some((s) => s.name === body.name && s.id !== server.id)) {
          return error(res, 409, "uniqueness_error", "server name is already used", { fields: [{ name: "name" }] })
        }
        server.name = body.name
      }
      if (body.labels) server.labels = body.labels
      return ok({ server })
    }
    if (parts[2] === "metrics" && method === "GET") {
      const type = q.getAll("type").join(",")
      if (!q.get("start") || !q.get("end") || !type) return error(res, 400, "invalid_input", "type, start and end are required")
      return ok(metrics(server, type, q.get("start"), q.get("end")))
    }
    if (parts[2] === "actions" && parts.length === 3 && method === "GET") {
      const list = state.actions.filter((a) => a.resources.some((r) => r.type === "server" && r.id === server.id))
      return paginate(res, "actions", sortBy(list, q, ["id", "command", "status", "started", "finished"]), q, headers)
    }
    if (parts[2] === "actions" && parts.length === 4 && method === "POST") return serverAction(server, parts[3], body, ok, res)
  }

  // --- actions
  if (parts[0] === "actions" && parts.length === 2 && method === "GET") {
    const action = state.actions.find((a) => a.id === Number(parts[1]))
    const visible = action && action.resources.every((r) => r.type !== "server" || findServer(r.id))
    if (!visible) return error(res, 404, "not_found", "action not found")
    return ok({ action })
  }

  // --- images
  const images = state.images.filter((i) => i.type === "system" || i.type === "app" || servers.some((s) => s.id === i.created_from?.id || s.id === i.bound_to) || i._project === project)
  if (parts[0] === "images" && parts.length === 1 && method === "GET") {
    let list = images
    const types = q.getAll("type")
    if (types.length) list = list.filter((i) => types.includes(i.type))
    const statuses = q.getAll("status")
    if (statuses.length) list = list.filter((i) => statuses.includes(i.status))
    if (q.get("architecture")) list = list.filter((i) => i.architecture === q.get("architecture"))
    const bound = q.getAll("bound_to").map(Number)
    if (bound.length) list = list.filter((i) => bound.includes(i.bound_to))
    return paginate(res, "images", sortBy(list, q, ["id", "name", "created"]), q, headers)
  }
  if (parts[0] === "images" && parts.length === 2) {
    const image = images.find((i) => i.id === Number(parts[1]))
    if (!image) return error(res, 404, "not_found", `image with ID '${parts[1]}' not found`)
    if (method === "GET") return ok({ image })
    if (method === "PUT") {
      if (image.type !== "snapshot" && image.type !== "backup") return error(res, 422, "invalid_input", "only snapshots and backups can be updated")
      if (body.description) image.description = body.description
      if (body.type === "snapshot") {
        image.type = "snapshot"
        image.created_from = { id: image.bound_to, name: state.servers.find((s) => s.id === image.bound_to)?.name ?? "" }
        image.bound_to = null
      }
      return ok({ image })
    }
    if (method === "DELETE") {
      if (image.protection.delete) return error(res, 423, "protected", "image is protected")
      state.images = state.images.filter((i) => i !== image)
      res.writeHead(204, headers)
      return res.end()
    }
  }

  // --- ISOs
  if (parts[0] === "isos" && parts.length === 1 && method === "GET") {
    let list = ISOS
    const arch = q.get("architecture")
    if (arch) list = list.filter((i) => i.architecture === arch || (q.get("include_architecture_wildcard") === "true" && i.architecture === null))
    return paginate(res, "isos", list, q, headers)
  }
  if (parts[0] === "isos" && parts.length === 2 && method === "GET") {
    const iso = ISOS.find((i) => i.id === Number(parts[1]) || i.name === parts[1])
    return iso ? ok({ iso }) : error(res, 404, "not_found", "iso not found")
  }

  // --- SSH keys
  const keys = state.sshKeys.filter((k) => k._project === project)
  if (parts[0] === "ssh_keys" && parts.length === 1 && method === "GET") {
    let list = keys
    if (q.get("fingerprint")) list = list.filter((k) => k.fingerprint === q.get("fingerprint"))
    return paginate(res, "ssh_keys", list, q, headers)
  }
  if (parts[0] === "ssh_keys" && parts.length === 1 && method === "POST") {
    if (!body.name || !body.public_key) return error(res, 422, "invalid_input", "name and public_key are required", { fields: [{ name: "public_key", messages: ["is required"] }] })
    const fingerprint = md5Fingerprint(body.public_key)
    if (keys.some((k) => k.fingerprint === fingerprint)) return error(res, 409, "uniqueness_error", "SSH key with the same fingerprint already exists", { fields: [{ name: "public_key" }] })
    const key = { id: nextResource++, name: body.name, fingerprint, public_key: body.public_key, labels: body.labels ?? {}, created: new Date().toISOString(), _project: project }
    state.sshKeys.push(key)
    return ok({ ssh_key: key }, 201)
  }
  if (parts[0] === "ssh_keys" && parts.length === 2 && method === "DELETE") {
    const key = keys.find((k) => k.id === Number(parts[1]))
    if (!key) return error(res, 404, "not_found", "ssh key not found")
    state.sshKeys = state.sshKeys.filter((k) => k !== key)
    res.writeHead(204, headers)
    return res.end()
  }

  // --- floating IPs
  const fips = state.floatingIps.filter((f) => f._project === project)
  if (parts[0] === "floating_ips" && parts.length === 1 && method === "GET") return paginate(res, "floating_ips", fips, q, headers)
  if (parts[0] === "floating_ips" && parts[2] === "actions" && parts[3] === "change_dns_ptr" && method === "POST") {
    const fip = fips.find((f) => f.id === Number(parts[1]))
    if (!fip) return error(res, 404, "not_found", "floating ip not found")
    if (!("dns_ptr" in body)) return error(res, 422, "invalid_input", "dns_ptr is required", { fields: [{ name: "dns_ptr", messages: ["is required"] }] })
    const action = startAction("change_dns_ptr", [{ id: fip.id, type: "floating_ip" }], () => {
      fip.dns_ptr = fip.dns_ptr.filter((p) => p.ip !== body.ip)
      if (body.dns_ptr) fip.dns_ptr.push({ ip: body.ip, dns_ptr: body.dns_ptr })
    })
    return ok({ action }, 201)
  }

  // --- firewalls
  const firewalls = state.firewalls.filter((f) => f.applied_to.some((a) => findServer(a.server?.id)) || f._project === project)
  if (parts[0] === "firewalls" && parts.length === 1 && method === "POST") {
    if (!body.name) return error(res, 422, "invalid_input", "name is required")
    if (firewalls.some((f) => f.name === body.name)) return error(res, 409, "uniqueness_error", "firewall name is already used", { fields: [{ name: "name" }] })
    const firewall = { id: nextResource++, name: body.name, labels: body.labels ?? {}, created: new Date().toISOString(), rules: (body.rules ?? []).map((r) => ({ destination_ips: [], source_ips: [], port: null, ...r })), applied_to: [], _project: project }
    state.firewalls.push(firewall)
    const actions = []
    for (const target of body.apply_to ?? []) {
      const server = findServer(target.server?.id)
      if (!server) return error(res, 422, "firewall_resource_not_found", "server not found")
      firewall.applied_to.push({ type: "server", server: { id: server.id } })
      const entry = { id: firewall.id, status: "pending" }
      server.public_net.firewalls.push(entry)
      actions.push(startAction("apply_firewall", [{ id: firewall.id, type: "firewall" }, ...serverResource(server)], () => (entry.status = "applied")))
    }
    return ok({ firewall, actions }, 201)
  }
  if (parts[0] === "firewalls" && parts.length >= 2) {
    const firewall = firewalls.find((f) => f.id === Number(parts[1]))
    if (!firewall) return error(res, 404, "not_found", "firewall not found")
    if (parts.length === 2 && method === "GET") return ok({ firewall })
    if (parts.length === 2 && method === "DELETE") {
      if (firewall.applied_to.length) return error(res, 422, "resource_in_use", "firewall still applied to a resource")
      state.firewalls = state.firewalls.filter((f) => f !== firewall)
      res.writeHead(204, headers)
      return res.end()
    }
    if (parts[3] === "set_rules" && method === "POST") {
      firewall.rules = (body.rules ?? []).map((r) => ({ destination_ips: [], source_ips: [], port: null, ...r }))
      const actions = firewall.applied_to.map((a) => startAction("set_firewall_rules", [{ id: firewall.id, type: "firewall" }, { id: a.server.id, type: "server" }]))
      return ok({ actions }, 201)
    }
    if (parts[3] === "remove_from_resources" && method === "POST") {
      const actions = []
      for (const target of body.remove_from ?? []) {
        const server = findServer(target.server?.id)
        if (!server) continue
        actions.push(
          startAction("remove_firewall", [{ id: firewall.id, type: "firewall" }, ...serverResource(server)], () => {
            firewall.applied_to = firewall.applied_to.filter((a) => a.server?.id !== server.id)
            server.public_net.firewalls = server.public_net.firewalls.filter((f) => f.id !== firewall.id)
          })
        )
      }
      return ok({ actions }, 201)
    }
  }

  // --- volumes, networks
  if (parts[0] === "volumes" && parts.length === 2 && method === "GET") {
    const volume = state.volumes.find((v) => v.id === Number(parts[1]) && v._project === project)
    return volume ? ok({ volume }) : error(res, 404, "not_found", "volume not found")
  }
  if (parts[0] === "networks" && parts.length === 2 && method === "GET") {
    const network = state.networks.find((n) => n.id === Number(parts[1]) && n._project === project)
    return network ? ok({ network: { ...network, servers: servers.filter((s) => s.private_net.some((p) => p.network === network.id)).map((s) => s.id) } }) : error(res, 404, "not_found", "network not found")
  }

  // --- catalog
  if (parts[0] === "server_types" && parts.length === 1 && method === "GET") return paginate(res, "server_types", SERVER_TYPES, q, headers)
  if (parts[0] === "locations" && parts.length === 1 && method === "GET") return paginate(res, "locations", Object.values(LOCATIONS), q, headers)
  if (parts[0] === "pricing" && method === "GET") return ok({ pricing: { currency: "EUR", vat_rate: "19.00" } })

  return error(res, 404, "not_found", `${method} ${url.pathname} is not in the mock`)
}

function serverAction(server, command, body, ok, res) {
  const busy = () => error(res, 423, "locked", "server is locked by another running action")
  const resources = serverResource(server)
  switch (command) {
    case "poweron": {
      if (running(server)) return busy()
      if (server.status === "running") return ok({ action: startAction("start_server", resources) }, 201)
      server.status = "starting"
      return ok({ action: startAction("start_server", resources, () => (server.status = "running")) }, 201)
    }
    case "poweroff": {
      if (running(server)) return busy()
      server.status = "stopping"
      return ok({ action: startAction("stop_server", resources, () => (server.status = "off")) }, 201)
    }
    case "shutdown": {
      if (running(server)) return busy()
      server.status = "stopping"
      return ok({ action: startAction("shutdown_server", resources, () => (server.status = "off")) }, 201)
    }
    case "reboot":
      if (running(server)) return busy()
      return ok({ action: startAction("reboot_server", resources) }, 201)
    case "reset":
      if (running(server)) return busy()
      return ok({ action: startAction("reset_server", resources, () => {
        server.status = "running"
        if (server.rescue_enabled) server.rescue_enabled = false
      }) }, 201)
    case "request_console":
      return ok({
        wss_url: `ws://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}/console?server_id=${server.id}&token=${crypto.randomBytes(12).toString("hex")}`,
        password: crypto.randomBytes(6).toString("hex"),
        action: startAction("request_console", resources),
      }, 201)
    case "reset_password":
      if (server.status !== "running") return error(res, 409, "conflict", "server must be running")
      return ok({ root_password: randomPassword(), action: startAction("reset_password", resources) }, 201)
    case "rebuild": {
      if (running(server)) return busy()
      if (server.protection.rebuild) return error(res, 423, "protected", "server is protected against rebuild")
      const image = state.images.find((i) => String(i.id) === String(body.image) || i.name === body.image)
      if (!image) return error(res, 404, "not_found", "image not found")
      server.status = "rebuilding"
      if (body.user_data) server._user_data = body.user_data
      return ok({
        root_password: randomPassword(),
        action: startAction("rebuild_server", resources, () => {
          server.status = "running"
          server.image = image.type === "system" || image.type === "app" ? image : { ...image }
        }),
      }, 201)
    }
    case "enable_rescue": {
      if (running(server)) return busy()
      server.rescue_enabled = true
      return ok({ root_password: randomPassword(), action: startAction("enable_rescue", resources) }, 201)
    }
    case "disable_rescue":
      server.rescue_enabled = false
      return ok({ action: startAction("disable_rescue", resources) }, 201)
    case "attach_iso": {
      const iso = ISOS.find((i) => String(i.id) === String(body.iso) || i.name === body.iso)
      if (!iso) return error(res, 404, "not_found", "iso not found")
      return ok({ action: startAction("attach_iso", resources, () => (server.iso = iso)) }, 201)
    }
    case "detach_iso":
      return ok({ action: startAction("detach_iso", resources, () => (server.iso = null)) }, 201)
    case "change_dns_ptr": {
      if (!("dns_ptr" in body)) return error(res, 422, "invalid_input", "dns_ptr is required", { fields: [{ name: "dns_ptr", messages: ["is required"] }] })
      const v4 = server.public_net.ipv4
      return ok({
        action: startAction("change_dns_ptr", resources, () => {
          if (body.ip === v4.ip) v4.dns_ptr = body.dns_ptr ?? `static.${v4.ip.split(".").reverse().join(".")}.clients.your-server.de`
          else {
            const v6 = server.public_net.ipv6
            v6.dns_ptr = v6.dns_ptr.filter((p) => p.ip !== body.ip)
            if (body.dns_ptr) v6.dns_ptr.push({ ip: body.ip, dns_ptr: body.dns_ptr })
          }
        }),
      }, 201)
    }
    case "create_image": {
      if (running(server)) return busy()
      const image = {
        ...systemImage(null, body.description || `${server.name}-${Date.now()}`, server.image?.os_flavor ?? "unknown", server.image?.os_version ?? null, server.server_type.architecture),
        id: nextImage++,
        type: body.type === "backup" ? "backup" : "snapshot",
        status: "creating",
        name: null,
        rapid_deploy: false,
        image_size: null,
        disk_size: server.primary_disk_size,
        created: new Date().toISOString(),
        created_from: { id: server.id, name: server.name },
        bound_to: body.type === "backup" ? server.id : null,
        labels: body.labels ?? {},
      }
      state.images.push(image)
      return ok({
        image,
        action: startAction("create_image", resources, () => {
          image.status = "available"
          image.image_size = Math.round((1 + Math.random() * 3) * 100) / 100
        }),
      }, 201)
    }
    case "change_protection":
      return ok({ action: startAction("change_protection", resources, () => (server.protection = { delete: !!body.delete, rebuild: !!body.rebuild })) }, 201)
    case "enable_backup":
      return ok({ action: startAction("enable_backup", resources, () => (server.backup_window = "22-02")) }, 201)
    case "disable_backup":
      return ok({
        action: startAction("disable_backup", resources, () => {
          server.backup_window = null
          state.images = state.images.filter((i) => !(i.type === "backup" && i.bound_to === server.id))
        }),
      }, 201)
    case "change_type": {
      if (server.status !== "off") return error(res, 422, "server_not_stopped", "the action requires a stopped server")
      const type = typeByName(body.server_type)
      if (!type) return error(res, 422, "invalid_server_type", "the server type does not fit for the given server")
      server.status = "migrating"
      return ok({
        action: startAction("change_server_type", resources, () => {
          server.server_type = type
          if (body.upgrade_disk) server.primary_disk_size = type.disk
          server.status = "off"
        }),
      }, 201)
    }
    default:
      return error(res, 404, "not_found", `action ${command} is not in the mock`)
  }
}

/* ------------------------------------------------------------------ VNC console */

// A tiny VNC server over WebSocket, so the noVNC console can be tried. It draws
// a screen in the panel's colours and a block for every key press.

function wsAccept(key) {
  return crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64")
}

function wsFrame(payload, opcode = 0x2) {
  const len = payload.length
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10)
  if (len >= 126 && len < 65536) {
    head[0] = 0x80 | opcode
    head[1] = 126
    head.writeUInt16BE(len, 2)
  } else if (len >= 65536) {
    head[0] = 0x80 | opcode
    head[1] = 127
    head.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([head, payload])
}

function vnc(socket, serverId) {
  const server = state.servers.find((s) => s.id === serverId)
  const W = 1024
  const H = 640
  let incoming = Buffer.alloc(0)
  let rfb = Buffer.alloc(0)
  let phase = "version"
  let format = { bpp: 32, big: false, rs: 16, gs: 8, bs: 0 }
  let pending = null
  let cursor = 0
  const typed = []
  const sendRfb = (buf) => socket.write(wsFrame(buf))

  const pixel = (r, g, b) => {
    const v = (r << format.rs) | (g << format.gs) | (b << format.bs)
    const out = Buffer.alloc(4)
    if (format.big) out.writeUInt32BE(v >>> 0)
    else out.writeUInt32LE(v >>> 0)
    return out
  }

  function rect(x, y, w, h, [r, g, b]) {
    const head = Buffer.alloc(12)
    head.writeUInt16BE(x, 0)
    head.writeUInt16BE(y, 2)
    head.writeUInt16BE(w, 4)
    head.writeUInt16BE(h, 6)
    head.writeInt32BE(0, 8)
    const px = pixel(r, g, b)
    const data = Buffer.alloc(w * h * 4)
    for (let i = 0; i < w * h; i++) px.copy(data, i * 4)
    return Buffer.concat([head, data])
  }

  function screen() {
    const rects = [
      rect(0, 0, W, H, [17, 17, 17]),
      rect(0, 0, W, 28, [47, 95, 134]),
      rect(24, 60, 360, 14, [220, 220, 220]),
      rect(24, 84, 220, 14, [140, 140, 140]),
      rect(24, 120, 520, 10, [98, 181, 135]),
      rect(24, 140, 300, 10, [98, 181, 135]),
      rect(24, 180, 120, 14, [220, 220, 220]),
    ]
    typed.forEach((on, i) => rects.push(rect(24 + (i % 90) * 11, 210 + Math.floor(i / 90) * 18, 9, 14, on ? [133, 174, 208] : [17, 17, 17])))
    rects.push(rect(24 + (cursor % 90) * 11, 222 + Math.floor(cursor / 90) * 18, 9, 3, [242, 242, 242]))
    return rects
  }

  function update(rects) {
    const head = Buffer.alloc(4)
    head[0] = 0
    head.writeUInt16BE(rects.length, 2)
    sendRfb(Buffer.concat([head, ...rects]))
  }

  function onRfb() {
    for (;;) {
      if (phase === "version") {
        if (rfb.length < 12) return
        rfb = rfb.subarray(12)
        sendRfb(Buffer.from([1, 2]))
        phase = "security"
      } else if (phase === "security") {
        if (rfb.length < 1) return
        rfb = rfb.subarray(1)
        sendRfb(crypto.randomBytes(16))
        phase = "challenge"
      } else if (phase === "challenge") {
        if (rfb.length < 16) return
        rfb = rfb.subarray(16)
        sendRfb(Buffer.from([0, 0, 0, 0]))
        phase = "init"
      } else if (phase === "init") {
        if (rfb.length < 1) return
        rfb = rfb.subarray(1)
        const name = Buffer.from(`${server?.name ?? "server"} (mock)`)
        const init = Buffer.alloc(24)
        init.writeUInt16BE(W, 0)
        init.writeUInt16BE(H, 2)
        Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0]).copy(init, 4)
        init.writeUInt32BE(name.length, 20)
        sendRfb(Buffer.concat([init, name]))
        phase = "normal"
      } else {
        if (rfb.length < 1) return
        const type = rfb[0]
        let size = 0
        if (type === 0) size = 20
        else if (type === 2) {
          if (rfb.length < 4) return
          size = 4 + 4 * rfb.readUInt16BE(2)
        } else if (type === 3) size = 10
        else if (type === 4) size = 8
        else if (type === 5) size = 6
        else if (type === 6) {
          if (rfb.length < 8) return
          size = 8 + rfb.readUInt32BE(4)
        } else if (type === 255) {
          if (rfb.length < 2) return
          size = rfb[1] === 0 ? 12 : 4
        } else size = rfb.length
        if (rfb.length < size) return
        const msg = rfb.subarray(0, size)
        rfb = rfb.subarray(size)
        if (type === 0) {
          format = { bpp: msg[4], big: msg[6] === 1, rs: msg[14], gs: msg[15], bs: msg[16] }
        } else if (type === 3) {
          const incremental = msg[1] === 1
          if (!incremental) update(screen())
          else pending = true
        } else if (type === 4 || (type === 255 && msg[1] === 0)) {
          const down = type === 4 ? msg[1] === 1 : msg.readUInt16BE(2) === 1
          const keysym = type === 4 ? msg.readUInt32BE(4) : msg.readUInt32BE(4)
          if (down && keysym !== 0xffe1 && keysym !== 0xffe3 && keysym !== 0xffe9) {
            if (keysym === 0xff08) {
              cursor = Math.max(0, cursor - 1)
              typed[cursor] = false
            } else if (keysym === 0xff0d) {
              cursor = (Math.floor(cursor / 90) + 1) * 90
            } else {
              typed[cursor] = true
              cursor++
            }
            if (pending) {
              pending = null
              update(screen())
            }
          }
        }
      }
    }
  }

  socket.on("data", (chunk) => {
    incoming = Buffer.concat([incoming, chunk])
    while (incoming.length >= 2) {
      const opcode = incoming[0] & 0x0f
      const masked = (incoming[1] & 0x80) !== 0
      let len = incoming[1] & 0x7f
      let offset = 2
      if (len === 126) {
        if (incoming.length < 4) return
        len = incoming.readUInt16BE(2)
        offset = 4
      } else if (len === 127) {
        if (incoming.length < 10) return
        len = Number(incoming.readBigUInt64BE(2))
        offset = 10
      }
      const maskLen = masked ? 4 : 0
      if (incoming.length < offset + maskLen + len) return
      const mask = masked ? incoming.subarray(offset, offset + 4) : null
      const payload = Buffer.from(incoming.subarray(offset + maskLen, offset + maskLen + len))
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]
      incoming = incoming.subarray(offset + maskLen + len)
      if (opcode === 0x8) {
        socket.end(wsFrame(Buffer.alloc(0), 0x8))
        return
      }
      if (opcode === 0x9) socket.write(wsFrame(payload, 0xa))
      if (opcode === 0x2 || opcode === 0x0) {
        rfb = Buffer.concat([rfb, payload])
        onRfb()
      }
    }
  })
  socket.on("error", () => socket.destroy())
  sendRfb(Buffer.from("RFB 003.008\n"))
}

/* ------------------------------------------------------------------ start */

const httpServer = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e)
    error(res, 500, "server_error", "mock failed")
  })
})

httpServer.on("upgrade", (req, socket) => {
  const url = new URL(req.url, "http://localhost")
  const server = state.servers.find((s) => String(s.id) === url.searchParams.get("server_id"))
  if (url.pathname !== "/console" || !server || !req.headers["sec-websocket-key"]) {
    socket.end("HTTP/1.1 404 Not Found\r\n\r\n")
    return
  }
  const protocol = req.headers["sec-websocket-protocol"]?.split(",")[0]?.trim()
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${wsAccept(req.headers["sec-websocket-key"])}`,
      ...(protocol ? [`Sec-WebSocket-Protocol: ${protocol}`] : []),
      "",
      "",
    ].join("\r\n")
  )
  vnc(socket, server.id)
})

httpServer.listen(PORT, HOST, () => {
  console.log(`Mock Hetzner Cloud API on http://${HOST}:${PORT}/v1`)
  console.log("Tokens (each one is a project):")
  for (const [token, project] of Object.entries(TOKENS)) console.log(`  ${project.padEnd(10)} ${token}`)
  console.log(`Mock Hetzner Robot webservice on http://${HOST}:${PORT}/robot`)
  console.log("Webservice users (each one is a Robot account), with their passwords:")
  for (const [user, { password, account }] of Object.entries(ROBOT_USERS)) console.log(`  ${account.padEnd(10)} ${user}  ${password}`)
})
