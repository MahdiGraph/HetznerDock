import { z } from "zod"
import { clientIp, HttpError, json, readJson, requireApiAdmin, route } from "@/lib/http"
import { createRobotAccount, listRobotAccounts } from "@/lib/robot-accounts"
import { ProjectName, RobotPassword, RobotUser } from "@/lib/schemas"
import { audit } from "@/lib/audit"

export const GET = route(async (req) => {
  requireApiAdmin(req)
  return json({ accounts: listRobotAccounts() })
})

const Body = z.object({ name: ProjectName, username: RobotUser, password: RobotPassword })

export const POST = route(async (req) => {
  const admin = requireApiAdmin(req)
  const body = await readJson(req, Body)
  const accounts = listRobotAccounts()
  if (accounts.some((a) => a.name.toLowerCase() === body.name.toLowerCase())) {
    throw new HttpError(409, "A Robot account with that name already exists.")
  }
  if (accounts.some((a) => a.username === body.username)) throw new HttpError(409, "That webservice user is already added.")
  const id = createRobotAccount(body.name, body.username, body.password)
  audit({ user: admin, action: `Added Robot account "${body.name}" (${body.username})`, ip: clientIp(req), status: 200 })
  return json({ ok: true, id, accounts: listRobotAccounts() })
})
