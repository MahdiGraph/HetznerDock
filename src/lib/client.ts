/** Browser-side helpers for talking to the panel's own API. */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = opts.body !== undefined
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { error: text.slice(0, 300) }
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
      window.location.href = "/login"
    }
    const message = (data as { error?: string } | null)?.error || `Request failed (HTTP ${res.status})`
    throw new ApiError(res.status, message)
  }
  return data as T
}

export const fetcher = <T,>(url: string) => api<T>(url)

type Query = Record<string, string | number | boolean | undefined | null>

function qs(query?: Query) {
  if (!query) return ""
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") params.set(k, String(v))
  const s = params.toString()
  return s ? `?${s}` : ""
}

/** Address of a server page in the panel. */
export function serverHref(project: number, id: number) {
  return `/servers/${project}/${id}`
}

/** Address of the full-window console of a server. */
export function consoleHref(project: number, id: number) {
  return `/console/${project}/${id}`
}

/** A call for one server through the panel's gateway. */
export function hzUrl(project: number, id: number, sub = "", query?: Query) {
  return `/api/hz/${project}/${id}${sub ? `/${sub}` : ""}${qs(query)}`
}

export function hzCall<T = unknown>(
  project: number,
  id: number,
  method: "GET" | "POST" | "PUT" | "DELETE",
  sub = "",
  body?: unknown
) {
  return api<T>(hzUrl(project, id, sub), { method, body })
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong."
}
