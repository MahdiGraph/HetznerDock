import { z } from "zod"
import { clientIp, HttpError, json, readJson, requireApiAdmin, route } from "@/lib/http"
import { invalidateAccount } from "@/lib/dedicated"
import {
  deleteRobotAccount,
  getRobotAccount,
  listRobotAccounts,
  robotAssignmentCount,
  updateRobotAccount,
} from "@/lib/robot-accounts"
import { ProjectName, RobotPassword, RobotUser } from "@/lib/schemas"
import { audit } from "@/lib/audit"

type Ctx = { params: Promise<{ id: string }> }

async function load(ctx: Ctx) {
  const account = getRobotAccount(Number((await ctx.params).id))
  if (!account) throw new HttpError(404, "Robot account not found.")
  return account
}

const Patch = z.object({ name: ProjectName.optional(), username: RobotUser.optional(), password: RobotPassword.optional() })

export const PATCH = route<Ctx>(async (req, ctx) => {
  const admin = requireApiAdmin(req)
  const account = await load(ctx)
  const body = await readJson(req, Patch)
  const others = listRobotAccounts().filter((a) => a.id !== account.id)
  if (body.name && others.some((a) => a.name.toLowerCase() === body.name!.toLowerCase())) {
    throw new HttpError(409, "A Robot account with that name already exists.")
  }
  if (body.username && others.some((a) => a.username === body.username)) throw new HttpError(409, "That webservice user is already added.")
  updateRobotAccount(account.id, body)
  if (body.username || body.password) invalidateAccount(account.id)
  const changes = [
    body.name && body.name !== account.name ? `renamed to "${body.name}"` : null,
    body.username && body.username !== account.username ? `webservice user ${body.username}` : null,
    body.password ? "new password" : null,
  ]
  audit({
    user: admin,
    action: `Updated Robot account "${account.name}" (${changes.filter(Boolean).join(", ") || "no changes"})`,
    ip: clientIp(req),
    status: 200,
  })
  return json({ ok: true, accounts: listRobotAccounts() })
})

export const DELETE = route<Ctx>(async (req, ctx) => {
  const admin = requireApiAdmin(req)
  const account = await load(ctx)
  const assigned = robotAssignmentCount(account.id)
  deleteRobotAccount(account.id)
  invalidateAccount(account.id)
  audit({
    user: admin,
    action: `Removed Robot account "${account.name}"${assigned ? ` and ${assigned} assignment(s)` : ""}`,
    ip: clientIp(req),
    status: 200,
  })
  return json({ ok: true, accounts: listRobotAccounts() })
})
