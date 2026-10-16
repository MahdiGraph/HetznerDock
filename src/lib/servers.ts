import { db } from "./db"
import type { User } from "./auth"
import { listProjects, projectNames } from "./projects"
import { hzFetchAll, hzRequest, HetznerError } from "./hetzner"
import { cleanupTemporaryKeys } from "./rescue-keys"
import { summarize, type Dict, type ServerSummary } from "./summary"

export type Assignee = { userId: number; username: string; name: string | null }

export function canAccess(user: User, projectId: number, serverId: number): boolean {
  if (user.role === "admin") return true
  return !!db()
    .prepare("SELECT 1 FROM assignments WHERE user_id = ? AND project_id = ? AND server_id = ?")
    .get(user.id, projectId, serverId)
}

/** Assignees of every server, keyed by "projectId:serverId". */
export function assignmentMap(): Map<string, Assignee[]> {
  const rows = db()
    .prepare(
      `SELECT a.project_id, a.server_id, u.id AS userId, u.username, u.name FROM assignments a
       JOIN users u ON u.id = a.user_id ORDER BY u.username`
    )
    .all() as (Assignee & { project_id: number; server_id: number })[]
  const map = new Map<string, Assignee[]>()
  for (const row of rows) {
    const key = `${row.project_id}:${row.server_id}`
    const list = map.get(key) ?? []
    list.push({ userId: row.userId, username: row.username, name: row.name })
    map.set(key, list)
  }
  return map
}

type CacheEntry = { at: number; raw: Dict[] }

const globals = globalThis as unknown as {
  __hzdockServers?: Map<number, CacheEntry>
  __hzdockServersInFlight?: Map<number, Promise<Dict[]>>
  __hzdockCurrency?: Map<number, { at: number; currency: string }>
}

/** The currency Hetzner bills the project's owner in (EUR or USD), cached for six hours. */
export async function projectCurrency(projectId: number): Promise<string> {
  const cache = (globals.__hzdockCurrency ??= new Map())
  const hit = cache.get(projectId)
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.currency
  try {
    const { data } = await hzRequest<{ pricing?: { currency?: string } }>({ projectId, path: "/pricing" })
    const currency = /^[A-Z]{3}$/.test(data.pricing?.currency ?? "") ? data.pricing!.currency! : "EUR"
    cache.set(projectId, { at: Date.now(), currency })
    return currency
  } catch {
    return hit?.currency ?? "EUR"
  }
}

const TTL = 30_000

/**
 * Every server of one project, as Hetzner returns them, cached for half a
 * minute and shared by everyone. One list call covers 50 servers, which keeps
 * the project well inside Hetzner's 3600 requests an hour.
 */
export async function projectServers(projectId: number, refresh = false): Promise<Dict[]> {
  const cache = (globals.__hzdockServers ??= new Map())
  const inFlight = (globals.__hzdockServersInFlight ??= new Map())
  const hit = cache.get(projectId)
  if (!refresh && hit && Date.now() - hit.at < TTL) return hit.raw
  const pending = inFlight.get(projectId)
  if (pending) return pending
  const load = hzFetchAll<Dict>(projectId, "/servers", "servers", { sort: "name:asc" })
    .then((raw) => {
      cache.set(projectId, { at: Date.now(), raw })
      // Rescue keys left over from earlier boots go away in the background.
      void cleanupTemporaryKeys(projectId).catch(() => undefined)
      return raw
    })
    .finally(() => inFlight.delete(projectId))
  inFlight.set(projectId, load)
  return load
}

/** Forgets the cached list after a change, so the next list shows it. */
export function invalidateProject(projectId: number) {
  globals.__hzdockServers?.delete(projectId)
}

/** The server's name from the cached list, if the list has been loaded. */
export function cachedServerName(projectId: number, serverId: number): string | null {
  const hit = globals.__hzdockServers?.get(projectId)
  const raw = hit?.raw.find((s) => Number(s.id) === serverId)
  return typeof raw?.name === "string" ? raw.name : null
}

/** The server's name without asking Hetzner: the cached list, else the name it had when it was assigned. */
export function knownServerName(projectId: number, serverId: number): string | null {
  const cachedName = cachedServerName(projectId, serverId)
  if (cachedName) return cachedName
  const row = db()
    .prepare("SELECT label FROM assignments WHERE project_id = ? AND server_id = ? AND label IS NOT NULL LIMIT 1")
    .get(projectId, serverId) as { label: string } | undefined
  return row?.label ?? null
}

export type ListError = { projectId: number; project: string; message: string }

/** Servers across all projects; a project that fails does not hide the others. */
export async function listAllServers(refresh = false, withPrice = false) {
  const projects = listProjects()
  const results = await Promise.allSettled(projects.map((p) => projectServers(p.id, refresh)))
  const servers: ServerSummary[] = []
  const errors: ListError[] = []
  results.forEach((r, i) => {
    const project = { id: projects[i].id, name: projects[i].name }
    if (r.status === "fulfilled") servers.push(...r.value.map((raw) => summarize(raw, project, { price: withPrice })))
    else
      errors.push({
        projectId: project.id,
        project: project.name,
        message: r.reason instanceof HetznerError ? r.reason.message : "Could not load the servers.",
      })
  })
  return { servers, errors }
}

export type UserServer = ServerSummary & { error?: string; nickname?: string | null }

/** The servers assigned to a user, with live details from Hetzner. */
export async function listUserServers(user: User): Promise<UserServer[]> {
  const rows = db()
    .prepare("SELECT project_id, server_id, label, nickname FROM assignments WHERE user_id = ? ORDER BY created_at")
    .all(user.id) as { project_id: number; server_id: number; label: string | null; nickname: string | null }[]
  const names = projectNames()
  const projectIds = [...new Set(rows.map((r) => r.project_id))]
  const lists = new Map<number, { raw?: Dict[]; error?: string }>()
  await Promise.all(
    projectIds.map(async (id) => {
      try {
        lists.set(id, { raw: await projectServers(id) })
      } catch (e) {
        lists.set(id, { error: e instanceof HetznerError ? e.message : "Could not load this server." })
      }
    })
  )

  return rows.map((row) => {
    const project = { id: row.project_id, name: names.get(row.project_id) ?? "Hetzner" }
    const list = lists.get(row.project_id)
    const raw = list?.raw?.find((s) => Number(s.id) === row.server_id)
    if (raw) {
      const summary = summarize(raw, project)
      // The user's own name for the server wins over the Hetzner name.
      return { ...summary, name: row.nickname || summary.name, nickname: row.nickname }
    }
    return {
      id: row.server_id,
      projectId: project.id,
      projectName: project.name,
      name: row.nickname || row.label || `Server ${row.server_id}`,
      nickname: row.nickname,
      status: null,
      ipv4: null,
      ipv6: null,
      location: null,
      country: null,
      type: null,
      spec: null,
      os: null,
      arch: null,
      created: null,
      traffic: { out: null, in: null, included: null },
      rescue: false,
      error: list?.error ?? "This server no longer exists at Hetzner.",
    }
  })
}
