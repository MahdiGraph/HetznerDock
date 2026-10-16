import { z } from "zod"
import { json, readJson, requireApiAdmin, route } from "@/lib/http"
import { getBaseUrl, getProxySettings } from "@/lib/settings"
import { listProjects, projectToken } from "@/lib/projects"
import { HetznerError, hzRequest } from "@/lib/hetzner"
import { ProxyInput } from "@/lib/schemas"

const Body = z.object({
  /** Test a saved project's token. */
  projectId: z.number().int().positive().optional(),
  /** Or a token typed on screen that is not saved yet. */
  token: z.string().trim().max(200).optional(),
  baseUrl: z.string().trim().url().optional(),
  /** Proxy values on screen; the saved proxy is used when left out. */
  proxy: ProxyInput.optional(),
})

type Pagination = { meta?: { pagination?: { total_entries?: number | null } }; servers?: unknown[] }

/**
 * Tests the connection to Hetzner with the values on screen. Without any token
 * it still checks the network path (and proxy): Hetzner answers 401 to a dummy token.
 */
export const POST = route(async (req) => {
  requireApiAdmin(req)
  const body = await readJson(req, Body)
  const savedProxy = getProxySettings()
  const proxy = body.proxy
    ? {
        ...body.proxy,
        username: body.proxy.username ?? "",
        password: body.proxy.password === undefined ? savedProxy.password : body.proxy.password || null,
      }
    : savedProxy

  const firstUsable = listProjects().find((p) => !p.unreadable)
  const token =
    body.token ||
    (body.projectId ? projectToken(body.projectId) : null) ||
    (body.projectId === undefined && firstUsable ? projectToken(firstUsable.id) : null)
  const probeOnly = !token

  const started = Date.now()
  try {
    const { data } = await hzRequest<Pagination>({
      path: "/servers",
      query: { per_page: 1 },
      timeoutMs: 20_000,
      override: { token: token || "hetzner-dock-connectivity-check", baseUrl: body.baseUrl || getBaseUrl(), proxy },
    })
    const count = data?.meta?.pagination?.total_entries ?? data?.servers?.length ?? 0
    return json({
      ok: true,
      ms: Date.now() - started,
      viaProxy: proxy.enabled,
      message: `Connected${proxy.enabled ? " through the proxy" : ""}. The project has ${count} server${count === 1 ? "" : "s"}.`,
    })
  } catch (e) {
    const err = e instanceof HetznerError ? e : new HetznerError(500, "Unexpected error")
    // An HTTP answer from Hetzner means the network path (and proxy) works.
    const reachable = err.status === 401 || err.status === 403
    if (probeOnly && reachable) {
      return json({
        ok: true,
        ms: Date.now() - started,
        viaProxy: proxy.enabled,
        message: `Hetzner is reachable${proxy.enabled ? " through the proxy" : ""}. Add a project's API token to finish.`,
      })
    }
    return json({
      ok: false,
      ms: Date.now() - started,
      viaProxy: proxy.enabled,
      reachable,
      message: reachable ? `${proxy.enabled ? "The proxy works and " : ""}Hetzner answered, but: ${err.message}` : err.message,
    })
  }
})
