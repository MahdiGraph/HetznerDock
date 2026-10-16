import { z } from "zod"
import { clientIp, json, readJson, requireApiAdmin, route } from "@/lib/http"
import {
  getPermissions,
  getProxySettings,
  publicSettings,
  saveBaseUrl,
  savePermissions,
  saveProxySettings,
  saveRobotUrl,
} from "@/lib/settings"
import { PERMISSION_KEYS, PERMISSION_META } from "@/lib/permissions"
import { audit } from "@/lib/audit"
import { HetznerInput, PermissionsInput, ProxyInput, RobotInput } from "@/lib/schemas"

export const GET = route(async (req) => {
  requireApiAdmin(req)
  return json(publicSettings())
})

const Body = z.object({
  hetzner: HetznerInput.optional(),
  robot: RobotInput.optional(),
  proxy: ProxyInput.optional(),
  permissions: PermissionsInput.optional(),
})

export const PUT = route(async (req) => {
  const admin = requireApiAdmin(req)
  const body = await readJson(req, Body)
  const ip = clientIp(req)
  if (body.hetzner) {
    saveBaseUrl(body.hetzner.baseUrl)
    audit({ user: admin, action: `Set the Hetzner API address to ${body.hetzner.baseUrl}`, ip, status: 200 })
  }
  if (body.robot) {
    saveRobotUrl(body.robot.baseUrl)
    audit({ user: admin, action: `Set the Robot webservice address to ${body.robot.baseUrl}`, ip, status: 200 })
  }
  if (body.proxy) {
    const p = body.proxy
    const before = getProxySettings()
    saveProxySettings({
      enabled: p.enabled,
      protocol: p.protocol,
      host: p.host,
      port: p.port,
      username: p.username,
      password: p.password === undefined ? undefined : p.password || null,
    })
    const state = p.enabled ? `on (${p.protocol}://${p.host}:${p.port})` : "off"
    audit({ user: admin, action: `Proxy ${before.enabled === p.enabled ? "updated" : "turned"} ${state}`, ip, status: 200 })
  }
  if (body.permissions) {
    const before = getPermissions()
    savePermissions(body.permissions)
    const after = getPermissions()
    const changes = PERMISSION_KEYS.filter((k) => before[k] !== after[k]).map(
      (k) => `${PERMISSION_META[k].label} ${after[k] ? "on" : "off"}`
    )
    if (before.snapshots !== after.snapshots) changes.push(`snapshots per server: ${after.snapshots || "none"}`)
    if (changes.length) audit({ user: admin, action: `Changed what users can do: ${changes.join(", ")}`, ip, status: 200 })
  }
  return json(publicSettings())
})
