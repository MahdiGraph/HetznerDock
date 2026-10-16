import { buildUrl, HetznerError, parseBody, send } from "./hetzner"
import { robotCredentials } from "./robot-accounts"
import { getProxySettings, getRobotUrl, type ProxySettings } from "./settings"

/**
 * Every request to the Hetzner Robot webservice, which manages dedicated
 * servers, goes through this module. Robot takes HTTP basic auth with a
 * webservice user and form-encoded bodies, and answers JSON. Requests leave the
 * panel the way Cloud API requests do: through the proxy, and only through it,
 * when the proxy is on. Errors are HetznerErrors, so they reach the browser and
 * the activity log like Cloud API errors.
 */

type FormValue = string | number | boolean | null | undefined | (string | number)[]
export type Form = Record<string, FormValue>

export type RobotRequest = {
  /** The Robot account whose webservice user to use. */
  accountId?: number
  method?: "GET" | "POST" | "PUT" | "DELETE"
  /** Path below the webservice address, starting with a slash, e.g. /reset/123456 */
  path: string
  query?: Record<string, string | number | undefined>
  form?: Form
  timeoutMs?: number
  /** Use these values instead of the saved ones (for "test connection"). */
  override?: { username: string; password: string; baseUrl: string; proxy: ProxySettings }
}

/** Robot's form encoding: a list goes as name[]=a&name[]=b; empty values are left out. */
export function encodeForm(form: Form): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(form)) {
    if (Array.isArray(value)) for (const item of value) params.append(`${key}[]`, String(item))
    else if (value !== undefined && value !== null && value !== "") params.append(key, String(value))
  }
  return params.toString()
}

const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : [])

/** Robot's own error messages are terse; these say what happened and what to do. */
const MESSAGES: Record<string, string> = {
  SERVER_NOT_FOUND: "Robot does not know this server. It may have been cancelled or moved to another account.",
  RESET_NOT_AVAILABLE: "This server cannot be reset through Robot.",
  RESET_MANUAL_ACTIVE: "A technician is already on the way to reset this server. Wait until that is done.",
  RESET_FAILED: "Robot could not reset the server. Try again in a moment.",
  WOL_NOT_AVAILABLE: "Wake on LAN is not available on this server.",
  WOL_FAILED: "Robot could not send the Wake on LAN packet. Try again in a moment.",
  BOOT_NOT_AVAILABLE: "This boot option is not available for this server.",
  BOOT_ACTIVATION_FAILED: "Robot could not set up the boot. Try again in a moment.",
  BOOT_DEACTIVATION_FAILED: "Robot could not cancel the boot. Try again in a moment.",
  IP_NOT_FOUND: "Robot does not know this IP address.",
  SUBNET_NOT_FOUND: "Robot does not know this subnet.",
  RDNS_NOT_FOUND: "This address has no reverse DNS entry.",
  RDNS_ALREADY_EXISTS: "This address already has a reverse DNS entry.",
  RDNS_CREATE_FAILED: "Robot could not save the reverse DNS entry. Try again in a moment.",
  RDNS_UPDATE_FAILED: "Robot could not save the reverse DNS entry. Try again in a moment.",
  RDNS_DELETE_FAILED: "Robot could not remove the reverse DNS entry. Try again in a moment.",
  KEY_ALREADY_EXISTS: "The Robot account already has this SSH key.",
  KEY_CREATE_FAILED: "Robot could not save the SSH key. Try again in a moment.",
  INTERNAL_ERROR: "Robot had a problem with this request. Try again in a moment.",
}

function robotError(status: number, data: unknown): HetznerError {
  if (status === 407) return new HetznerError(502, "The proxy rejected the credentials (HTTP 407).")
  const err = ((data as { error?: unknown } | null)?.error ?? {}) as Record<string, unknown>
  const code = typeof err.code === "string" ? err.code : undefined
  const said = typeof err.message === "string" && err.message.trim() ? err.message.trim() : null
  const extra = { code, details: { missing: err.missing ?? null, invalid: err.invalid ?? null } }

  if (status === 401 || code === "UNAUTHORIZED") {
    return new HetznerError(
      401,
      "Robot rejected the webservice user. Check its username and password under Settings. After three failed sign-ins Robot blocks the panel's address for ten minutes.",
      extra
    )
  }
  if (code === "RATE_LIMIT_EXCEEDED") {
    const max = Number(err.max_request)
    const minutes = Math.round(Number(err.interval) / 60)
    const limit = Number.isFinite(max) && minutes > 0 ? ` (${max} every ${minutes === 60 ? "hour" : `${minutes} minutes`})` : ""
    return new HetznerError(429, `Robot's request limit for this is used up${limit}. Try again later.`, extra)
  }
  if (code === "INVALID_INPUT") {
    const fields = [...list(err.invalid), ...list(err.missing)]
    return new HetznerError(400, fields.length ? `Robot did not accept this: ${fields.join(", ")}.` : (said ?? "Robot did not accept the input."), extra)
  }
  if (code && MESSAGES[code]) return new HetznerError(status, MESSAGES[code], extra)

  const fallback =
    status === 403
      ? "Robot refused this request (HTTP 403)."
      : status === 404
        ? "Not found at Robot."
        : status === 503
          ? "Robot is down for maintenance. Try again later."
          : `Robot returned HTTP ${status}.`
  return new HetznerError(status, said ?? fallback, extra)
}

export async function robotRequest<T = unknown>(req: RobotRequest): Promise<{ status: number; data: T }> {
  const credentials = req.override ?? (req.accountId !== undefined ? robotCredentials(req.accountId) : null)
  if (!credentials) {
    throw new HetznerError(
      503,
      req.override || req.accountId === undefined
        ? "No Robot webservice user was given."
        : "This Robot account has no usable password. An admin can fix it under Settings."
    )
  }
  const method = req.method ?? "GET"
  // Robot wants a form body on every POST and PUT, even an empty one.
  const body = req.form || method === "POST" || method === "PUT" ? Buffer.from(encodeForm(req.form ?? {})) : undefined
  const res = await send({
    url: buildUrl(req.override?.baseUrl ?? getRobotUrl(), req.path, req.query),
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
    timeoutMs: req.timeoutMs,
    proxy: req.override?.proxy ?? getProxySettings(),
    oneOff: !!req.override,
    target: "the Hetzner Robot webservice",
  })
  const data = parseBody(res.text)
  if (res.status >= 400) throw robotError(res.status, data)
  return { status: res.status, data: data as T }
}

/** Robot wraps every item of a list in an object named after it: [{ server: {…} }, …]. */
export function unwrap<T>(data: unknown, key: string): T[] {
  if (!Array.isArray(data)) return []
  return data.map((item) => (item as Record<string, unknown>)?.[key]).filter((x): x is T => !!x && typeof x === "object")
}
