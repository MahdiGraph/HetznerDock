import http from "node:http"
import https from "node:https"
import { HttpsProxyAgent } from "https-proxy-agent"
import { SocksProxyAgent } from "socks-proxy-agent"
import { APP_VERSION } from "./config"
import { projectToken } from "./projects"
import { getBaseUrl, getHetznerApiUrl, getProxySettings, type ProxySettings } from "./settings"

/**
 * Every request to Hetzner goes through this module: the Cloud API client below,
 * and through `send` also the Robot webservice client in robot.ts. When the proxy
 * is enabled the request is sent through it and only through it: there is no
 * direct fallback, so a broken proxy fails loudly instead of leaking traffic.
 */

export class HetznerError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(status: number, message: string, extra?: { code?: string; details?: unknown }) {
    super(message)
    this.status = status
    this.code = extra?.code
    this.details = extra?.details
  }
}

type QueryValue = string | number | boolean | null | undefined | (string | number)[]
export type Query = Record<string, QueryValue> | URLSearchParams

export type HzRequest = {
  /** The project (API token) to use. */
  projectId?: number
  method?: "GET" | "POST" | "PUT" | "DELETE"
  /** Path below the base URL, starting with a slash, e.g. /servers/42/actions/reboot */
  path: string
  query?: Query
  body?: unknown
  timeoutMs?: number
  /** Use these values instead of the saved ones (for "test connection"). */
  override?: { token: string | null; baseUrl: string; proxy: ProxySettings }
  /** "hetzner" sends the request to the Hetzner API (Storage Boxes) instead of the Cloud API. */
  api?: "cloud" | "hetzner"
}

export type HzResponse<T> = { status: number; data: T }

/** The last rate limit headers Hetzner sent for each project. */
export type RateLimit = { limit: number; remaining: number; reset: number; at: number }

const globals = globalThis as unknown as {
  __hzdockAgent?: { key: string; agent: http.Agent }
  __hzdockRate?: Map<number, RateLimit>
}

export function rateLimitOf(projectId: number): RateLimit | null {
  return globals.__hzdockRate?.get(projectId) ?? null
}

function recordRateLimit(projectId: number | undefined, headers: http.IncomingHttpHeaders) {
  if (projectId === undefined) return
  const limit = Number(headers["ratelimit-limit"])
  const remaining = Number(headers["ratelimit-remaining"])
  const reset = Number(headers["ratelimit-reset"])
  if (!Number.isFinite(limit) || !Number.isFinite(remaining)) return
  ;(globals.__hzdockRate ??= new Map()).set(projectId, {
    limit,
    remaining,
    reset: Number.isFinite(reset) ? reset * 1000 : 0,
    at: Date.now(),
  })
}

export function proxyUrl(p: ProxySettings, redact = false): string {
  const user = p.username
    ? `${encodeURIComponent(p.username)}${p.password ? `:${redact ? "***" : encodeURIComponent(p.password)}` : ""}@`
    : ""
  const host = p.host.includes(":") && !p.host.startsWith("[") ? `[${p.host}]` : p.host
  return `${p.protocol}://${user}${host}:${p.port}`
}

function createAgent(p: ProxySettings): http.Agent {
  if (!p.enabled) return new https.Agent({ keepAlive: true, maxSockets: 16 })
  if (!p.host || !p.port) {
    throw new HetznerError(503, "The proxy is enabled but its host or port is missing. Fix it under Settings.")
  }
  const url = proxyUrl(p)
  if (p.protocol.startsWith("socks")) return new SocksProxyAgent(url, { keepAlive: true, timeout: 20_000 })
  return new HttpsProxyAgent(url, { keepAlive: true })
}

function sharedAgent(p: ProxySettings) {
  const key = JSON.stringify(p)
  const cached = globals.__hzdockAgent
  if (cached?.key === key) return cached.agent
  cached?.agent.destroy()
  const agent = createAgent(p)
  globals.__hzdockAgent = { key, agent }
  return agent
}

/** Plain http is only accepted for a mock API on this machine, never for Hetzner itself. */
function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1"
}

function networkMessage(err: NodeJS.ErrnoException, proxy: ProxySettings, target: string): string {
  const where = proxy.enabled ? `the ${proxy.protocol.toUpperCase()} proxy at ${proxy.host}:${proxy.port}` : target
  const code = err.code ?? ""
  const text = err.message ?? ""
  if (code === "ECONNREFUSED" || text.includes("ECONNREFUSED")) return `Connection refused by ${where}.`
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || text.includes("ENOTFOUND")) return `A host name could not be resolved while connecting to ${where}.`
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || /timed? ?out/i.test(text)) return `Timed out while talking to ${where}.`
  if (code === "ECONNRESET" || text.includes("ECONNRESET")) return `The connection to ${where} was reset.`
  if (code === "EPROTO" || code.startsWith("ERR_SSL") || /SSL|TLS/i.test(text)) return `The TLS handshake with ${where} failed. Check the protocol.`
  if (/authentication/i.test(text)) return `${where.charAt(0).toUpperCase() + where.slice(1)} rejected the username or password.`
  return proxy.enabled ? `${text || "Network error"} (via ${where}).` : `${text || "Network error"}.`
}

function minutesUntil(ms: number) {
  const min = Math.max(1, Math.ceil((ms - Date.now()) / 60_000))
  return min === 1 ? "a minute" : `${min} minutes`
}

/** Hetzner's invalid_input details name the fields that failed; turn them into one line. */
function fieldMessages(details: unknown): string | null {
  const fields = (details as { fields?: { name?: string; messages?: string[] }[] } | null)?.fields
  if (!Array.isArray(fields) || !fields.length) return null
  return fields
    .map((f) => [f.name, f.messages?.join(", ")].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("; ")
}

function errorFromResponse(status: number, data: unknown, headers: http.IncomingHttpHeaders): HetznerError {
  if (status === 407) return new HetznerError(502, "The proxy rejected the credentials (HTTP 407).")
  const err = ((data as { error?: unknown } | null)?.error ?? {}) as { code?: unknown; message?: unknown; details?: unknown }
  const code = typeof err.code === "string" ? err.code : undefined
  const said = typeof err.message === "string" && err.message.trim() ? err.message.trim() : null
  const extra = { code, details: err.details }

  switch (code) {
    case "unauthorized":
      return new HetznerError(status, "Hetzner rejected the API token. It may have been deleted; enter a new one under Settings.", extra)
    case "forbidden":
      return new HetznerError(
        status,
        `Hetzner refused this request${said ? ` (${said})` : ""}. The project's API token needs Read & Write permission.`,
        extra
      )
    case "rate_limit_exceeded": {
      const reset = Number(headers["ratelimit-reset"]) * 1000
      const when = Number.isFinite(reset) && reset > Date.now() ? ` It recovers in about ${minutesUntil(reset)}.` : ""
      return new HetznerError(status, `Hetzner's hourly request limit for this project is used up.${when}`, extra)
    }
    case "locked":
      return new HetznerError(status, "Another action is still running on this server. Wait until it finishes and try again.", extra)
    case "protected":
      return new HetznerError(status, "The server's protection blocks this. An admin can turn the protection off.", extra)
    case "invalid_input":
      return new HetznerError(status, fieldMessages(err.details) ? `Hetzner did not accept this: ${fieldMessages(err.details)}` : said ?? "Hetzner did not accept the input.", extra)
    case "maintenance":
      return new HetznerError(status, `Hetzner is doing maintenance here.${said ? ` ${said}` : ""} Try again later.`, extra)
    case "server_error":
    case "bad_gateway":
    case "timeout":
    case "unavailable":
      return new HetznerError(status, `${said ?? "Hetzner had a problem with this request"}. Try again in a moment.`, extra)
  }

  const fallback =
    status === 401
      ? "Hetzner rejected the API token (HTTP 401)."
      : status === 403
        ? "The API token is not allowed to do this (HTTP 403)."
        : status === 404
          ? "Not found at Hetzner. It may have been deleted."
          : `Hetzner returned HTTP ${status}.`
  return new HetznerError(status, said ?? fallback, extra)
}

/** A request address below an API's base URL: https, or plain http to this machine only. */
export function buildUrl(baseUrl: string, path: string, query?: Query) {
  const url = new URL(baseUrl.replace(/\/+$/, "") + path)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
    throw new HetznerError(500, "The API address must use https.")
  }
  if (query) {
    const entries: [string, QueryValue][] = query instanceof URLSearchParams ? [...query.entries()] : Object.entries(query)
    for (const [k, v] of entries) {
      if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, String(item))
      else if (v !== undefined && v !== null && v !== "") url.searchParams.append(k, String(v))
    }
  }
  return url
}

export type Outbound = {
  url: URL
  method: string
  headers: Record<string, string>
  body?: Buffer
  timeoutMs?: number
  proxy: ProxySettings
  /** A connection of its own, closed afterwards: for testing values that are not saved yet. */
  oneOff?: boolean
  /** Who network errors name when there is no proxy, e.g. "the Hetzner API". */
  target: string
}

export type RawResponse = { status: number; headers: http.IncomingHttpHeaders; text: string }

/** Sends one request the way the proxy settings say and returns the answer, whatever its status. */
export async function send(o: Outbound): Promise<RawResponse> {
  const local = o.url.protocol === "http:"
  const agent = local ? new http.Agent() : o.oneOff ? createAgent(o.proxy) : sharedAgent(o.proxy)
  const viaProxy = local ? { ...o.proxy, enabled: false } : o.proxy
  const request = local ? http.request : https.request

  try {
    return await new Promise<RawResponse>((resolve, reject) => {
      const req = request(
        o.url,
        {
          method: o.method,
          agent,
          timeout: o.timeoutMs ?? 30_000,
          headers: {
            "User-Agent": `HetznerDock/${APP_VERSION}`,
            ...o.headers,
            ...(o.body ? { "Content-Length": o.body.length } : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on("data", (c: Buffer) => chunks.push(c))
          res.on("error", (err) => reject(new HetznerError(502, networkMessage(err, viaProxy, o.target))))
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") })
          )
        }
      )
      req.on("timeout", () => {
        const err = new Error("timeout") as NodeJS.ErrnoException
        err.code = "ETIMEDOUT"
        req.destroy(err)
      })
      req.on("error", (err: NodeJS.ErrnoException) => {
        reject(err instanceof HetznerError ? err : new HetznerError(502, networkMessage(err, viaProxy, o.target)))
      })
      if (o.body) req.write(o.body)
      req.end()
    })
  } finally {
    if (o.oneOff || local) agent.destroy()
  }
}

/** The answer as JSON, or the start of its text when it is not JSON. */
export function parseBody(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 2000) }
  }
}

export async function hzRequest<T = unknown>(req: HzRequest): Promise<HzResponse<T>> {
  const baseUrl = req.override?.baseUrl ?? (req.api === "hetzner" ? getHetznerApiUrl() : getBaseUrl())
  const proxy = req.override?.proxy ?? getProxySettings()
  const token = req.override ? req.override.token : req.projectId !== undefined ? projectToken(req.projectId) : null
  if (!token) {
    throw new HetznerError(
      503,
      req.override || req.projectId === undefined
        ? "No Hetzner API token was given."
        : "This project has no usable API token. An admin can fix it under Settings."
    )
  }

  const body = req.body === undefined ? undefined : Buffer.from(JSON.stringify(req.body))
  const res = await send({
    url: buildUrl(baseUrl, req.path, req.query),
    method: req.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
    timeoutMs: req.timeoutMs,
    proxy,
    oneOff: !!req.override,
    target: "the Hetzner API",
  })
  if (!req.override) recordRateLimit(req.projectId, res.headers)
  const data = parseBody(res.text)
  if (res.status >= 400) throw errorFromResponse(res.status, data, res.headers)
  return { status: res.status, data: data as T }
}

/** Follows page/per_page pagination and returns every item of a list endpoint. */
export async function hzFetchAll<T>(
  projectId: number,
  path: string,
  key: string,
  query: Record<string, QueryValue> = {},
  max = 5000,
  api: "cloud" | "hetzner" = "cloud"
): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; items.length < max; page++) {
    const { data } = await hzRequest<Record<string, unknown>>({ projectId, path, api, query: { ...query, page, per_page: 50 } })
    const list = (Array.isArray(data?.[key]) ? data[key] : []) as T[]
    items.push(...list)
    const pagination = (data?.meta as { pagination?: { next_page?: number | null } } | undefined)?.pagination
    if (!pagination?.next_page || list.length === 0) break
  }
  return items
}
