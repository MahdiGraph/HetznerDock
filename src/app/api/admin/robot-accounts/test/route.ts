import { z } from "zod"
import { HttpError, json, readJson, requireApiAdmin, route } from "@/lib/http"
import { HetznerError } from "@/lib/hetzner"
import { robotRequest } from "@/lib/robot"
import { getRobotAccount, robotCredentials } from "@/lib/robot-accounts"
import { getProxySettings, getRobotUrl } from "@/lib/settings"

const Body = z.object({
  /** Test a saved account. */
  accountId: z.number().int().positive().optional(),
  /** Or values typed on screen, which replace the saved ones. */
  username: z.string().trim().max(100).optional(),
  password: z.string().max(256).optional(),
  baseUrl: z.string().trim().url().optional(),
})

/**
 * Signs in to the Robot webservice with the values on screen and counts the
 * account's servers. Unlike the Cloud API test there is no probe without
 * credentials: Robot blocks an address for ten minutes after three failed
 * sign-ins, and a made-up user would count as one.
 */
export const POST = route(async (req) => {
  requireApiAdmin(req)
  const body = await readJson(req, Body)
  if (body.accountId && !getRobotAccount(body.accountId)) throw new HttpError(404, "Robot account not found.")
  const saved = body.accountId ? robotCredentials(body.accountId) : null
  const username = body.username || saved?.username
  const password = body.password || saved?.password
  if (!username || !password) throw new HttpError(400, "Enter the webservice user and its password first.")

  const proxy = getProxySettings()
  const started = Date.now()
  try {
    let count = 0
    try {
      const { data } = await robotRequest<unknown[]>({
        path: "/server",
        timeoutMs: 20_000,
        override: { username, password, baseUrl: body.baseUrl || getRobotUrl(), proxy },
      })
      count = Array.isArray(data) ? data.length : 0
    } catch (e) {
      // Robot answers 404 for an account without servers.
      if (!(e instanceof HetznerError && e.code === "SERVER_NOT_FOUND")) throw e
    }
    return json({
      ok: true,
      ms: Date.now() - started,
      viaProxy: proxy.enabled,
      message: `Signed in${proxy.enabled ? " through the proxy" : ""}. The account has ${count} dedicated server${count === 1 ? "" : "s"}.`,
    })
  } catch (e) {
    const err = e instanceof HetznerError ? e : new HetznerError(500, "Unexpected error")
    // An HTTP answer from Robot means the network path (and proxy) works.
    const reachable = err.status === 401 || err.status === 403 || err.status === 429
    return json({
      ok: false,
      ms: Date.now() - started,
      viaProxy: proxy.enabled,
      reachable,
      message: reachable ? `${proxy.enabled ? "The proxy works and " : ""}Robot answered, but: ${err.message}` : err.message,
    })
  }
})
