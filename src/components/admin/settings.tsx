"use client"

import * as React from "react"
import { CheckCircleIcon, PlugsConnectedIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Board, PageHeader, Tile } from "@/components/board"
import { ConfirmAction, ErrorNote } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { api, errorMessage } from "@/lib/client"
import { formatDate } from "@/lib/format"
import { PERMISSION_KEYS, PERMISSION_META, SNAPSHOT_LIMITS, type Permissions } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import type { ProjectInfo } from "@/lib/projects"
import type { PublicSettings } from "@/lib/settings"

const DEFAULT_BASE_URL = "https://api.hetzner.cloud/v1"

const PROTOCOLS = [
  { value: "socks5h", label: "SOCKS5, DNS resolved by the proxy", port: 1080 },
  { value: "socks5", label: "SOCKS5, DNS resolved locally", port: 1080 },
  { value: "socks4", label: "SOCKS4", port: 1080 },
  { value: "http", label: "HTTP proxy (CONNECT)", port: 8080 },
  { value: "https", label: "HTTPS proxy (TLS to the proxy)", port: 443 },
] as const

type TestResult = { ok: boolean; message: string; ms: number; viaProxy: boolean; reachable?: boolean }

function TestNote({ result, className }: { result: TestResult | null; className?: string }) {
  if (!result) return null
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 p-3 text-sm",
        result.ok ? "bg-success/10 text-success" : result.reachable ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive",
        className
      )}
    >
      {result.ok ? <CheckCircleIcon className="mt-0.5 size-4 shrink-0" /> : <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />}
      <span>
        {result.message} <span className="opacity-70 tabular">({result.ms} ms)</span>
      </span>
    </div>
  )
}

async function runTest(body: Record<string, unknown>): Promise<TestResult> {
  try {
    return await api<TestResult>("/api/admin/settings/test", { method: "POST", body })
  } catch (err) {
    return { ok: false, message: errorMessage(err), ms: 0, viaProxy: false }
  }
}

export function SettingsForms({ initial }: { initial: PublicSettings }) {
  const [projects, setProjects] = React.useState(initial.hetzner.projects)

  return (
    <>
      <PageHeader title="Settings" description="How Hetzner Dock talks to the Hetzner Cloud API, and what your users may do." />
      <Board>
        <Tile className="col-span-12 lg:col-span-7 lg:p-8">
          <Projects projects={projects} onChange={setProjects} />
          <BaseUrlForm initial={initial.hetzner.baseUrl} />
        </Tile>
        <Tile tone="tile" className="col-span-12 lg:col-span-5 lg:p-8">
          <ProxyForm initial={initial.proxy} />
        </Tile>
        <Tile className="col-span-12 lg:p-8">
          <PermissionsForm initial={initial.permissions} />
        </Tile>
      </Board>
    </>
  )
}

/* ------------------------------------------------------------------ projects */

function Projects({ projects, onChange }: { projects: ProjectInfo[]; onChange: (p: ProjectInfo[]) => void }) {
  const [editing, setEditing] = React.useState<ProjectInfo | null>(null)
  const [results, setResults] = React.useState<Record<number, TestResult | null>>({})
  const [testing, setTesting] = React.useState<number | null>(null)

  async function test(project: ProjectInfo) {
    setTesting(project.id)
    setResults((r) => ({ ...r, [project.id]: null }))
    const result = await runTest({ projectId: project.id })
    setResults((r) => ({ ...r, [project.id]: result }))
    setTesting(null)
  }

  return (
    <section>
      <h2 className="display text-3xl">Hetzner projects</h2>
      <p className="prose-serif mt-2 text-base text-muted-foreground">
        Hetzner ties every API token to one project. Add a token for each project whose servers you want to share; their
        servers are listed together. Create tokens in the Hetzner Console under Security, API tokens, with Read &amp; Write
        permission.
      </p>

      {projects.length ? (
        <ul className="mt-6 grid gap-2">
          {projects.map((p) => (
            <li key={p.id} className="bg-background/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-medium">{p.name}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {p.unreadable ? (
                      <span className="text-destructive">The token cannot be decrypted. Enter it again.</span>
                    ) : (
                      <>
                        Token {p.tokenHint} · added {formatDate(p.created_at)}
                      </>
                    )}
                    {p.assignments ? ` · ${p.assignments} assignment${p.assignments === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <Button size="sm" variant="secondary" onClick={() => test(p)} disabled={testing === p.id}>
                    {testing === p.id ? <Spinner /> : <PlugsConnectedIcon />} Test
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <ConfirmAction
                    title={`Remove ${p.name}?`}
                    description={
                      p.assignments
                        ? `Its servers disappear from the panel and ${p.assignments} assignment${p.assignments === 1 ? " is" : "s are"} removed. The servers themselves are not touched.`
                        : "Its servers disappear from the panel. The servers themselves are not touched."
                    }
                    confirmLabel="Remove project"
                    destructive
                    onConfirm={async () => {
                      const res = await api<{ projects: ProjectInfo[] }>(`/api/admin/projects/${p.id}`, { method: "DELETE" })
                      onChange(res.projects)
                      toast.success(`${p.name} removed`)
                    }}
                  >
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                      Remove
                    </Button>
                  </ConfirmAction>
                </div>
              </div>
              <TestNote result={results[p.id] ?? null} className="mt-3" />
            </li>
          ))}
        </ul>
      ) : null}

      <AddProjectForm first={projects.length === 0} onAdded={onChange} />
      <EditProjectDialog project={editing} onClose={() => setEditing(null)} onSaved={onChange} />
    </section>
  )
}

function AddProjectForm({ first, onAdded }: { first: boolean; onAdded: (p: ProjectInfo[]) => void }) {
  const [name, setName] = React.useState(first ? "Default" : "")
  const [token, setToken] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [result, setResult] = React.useState<TestResult | null>(null)
  const [error, setError] = React.useState<unknown>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ projects: ProjectInfo[] }>("/api/admin/projects", { method: "POST", body: { name, token } })
      onAdded(res.projects)
      toast.success(`${name} added`)
      setName("")
      setToken("")
      setResult(null)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form method="post" onSubmit={submit} className="mt-6 bg-background/70 p-4">
      <p className="text-base font-medium">{first ? "Add your first project" : "Add another project"}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Field>
          <FieldLabel htmlFor="project-name">Name</FieldLabel>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Customers"
            maxLength={60}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="project-token">API token</FieldLabel>
          <Input
            id="project-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste the token"
            required
          />
        </Field>
      </div>
      <TestNote result={result} className="mt-3" />
      <ErrorNote error={error} className="mt-3" />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !name.trim() || !token.trim()}>
          {busy ? <Spinner /> : <PlusIcon />} Add project
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={testing || !token.trim()}
          onClick={async () => {
            setTesting(true)
            setResult(await runTest({ token }))
            setTesting(false)
          }}
        >
          {testing ? <Spinner /> : <PlugsConnectedIcon />} Test token
        </Button>
      </div>
    </form>
  )
}

function EditProjectDialog({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectInfo | null
  onClose: () => void
  onSaved: (p: ProjectInfo[]) => void
}) {
  return (
    <Dialog open={!!project} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        {project ? <EditProjectForm key={project.id} project={project} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function EditProjectForm({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectInfo
  onClose: () => void
  onSaved: (p: ProjectInfo[]) => void
}) {
  const [name, setName] = React.useState(project.name)
  const [token, setToken] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<unknown>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ projects: ProjectInfo[] }>(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        body: { name, ...(token.trim() ? { token } : {}) },
      })
      onSaved(res.projects)
      toast.success("Project saved")
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form method="post" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle className="display text-2xl">{project.name}</DialogTitle>
        <DialogDescription className="prose-serif text-[15px]">
          Rename the project or replace its API token. Assignments stay as they are, as long as the new token belongs to
          the same Hetzner project.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="my-6">
        <Field>
          <FieldLabel htmlFor="ep-name">Name</FieldLabel>
          <Input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="ep-token">New API token</FieldLabel>
          <Input
            id="ep-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={project.tokenHint ? `Leave empty to keep ${project.tokenHint}` : "Paste the token"}
          />
        </Field>
        <ErrorNote error={error} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner /> : null} Save
        </Button>
      </DialogFooter>
    </form>
  )
}

function BaseUrlForm({ initial }: { initial: string }) {
  const [baseUrl, setBaseUrl] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api("/api/admin/settings", { method: "PUT", body: { hetzner: { baseUrl: baseUrl.trim() || DEFAULT_BASE_URL } } })
      toast.success("API address saved")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="mt-8">
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">API address</summary>
      <form method="post" onSubmit={submit} className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
        <Field className="flex-1">
          <FieldLabel htmlFor="base-url">Address used for every project</FieldLabel>
          <Input id="base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="bg-background" />
          <FieldDescription>Leave as {DEFAULT_BASE_URL} unless you test against a mock API.</FieldDescription>
        </Field>
        <Button type="submit" variant="secondary" disabled={busy} className="sm:mb-6">
          {busy ? <Spinner /> : null} Save
        </Button>
      </form>
    </details>
  )
}

/* ------------------------------------------------------------------ proxy */

function ProxyForm({ initial }: { initial: PublicSettings["proxy"] }) {
  const [enabled, setEnabled] = React.useState(initial.enabled)
  const [protocol, setProtocol] = React.useState<string>(initial.protocol)
  const [host, setHost] = React.useState(initial.host)
  const [port, setPort] = React.useState(initial.port ? String(initial.port) : "")
  const [username, setUsername] = React.useState(initial.username)
  const [password, setPassword] = React.useState("")
  const [hasPassword, setHasPassword] = React.useState(initial.hasPassword)
  const [clearPassword, setClearPassword] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [result, setResult] = React.useState<TestResult | null>(null)

  const proxyBody = () => ({
    enabled,
    protocol,
    host: host.trim(),
    port: port ? Number(port) : null,
    username,
    ...(clearPassword ? { password: "" } : password ? { password } : {}),
  })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const next = await api<PublicSettings>("/api/admin/settings", { method: "PUT", body: { proxy: proxyBody() } })
      setHasPassword(next.proxy.hasPassword)
      setPassword("")
      setClearPassword(false)
      toast.success(enabled ? "Proxy saved. All Hetzner traffic now goes through it." : "Proxy saved and turned off")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form method="post" onSubmit={save}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="display text-3xl">Outbound proxy</h2>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Use a proxy" />
      </div>
      <p className="prose-serif mt-2 text-base text-muted-foreground">
        When this is on, every request to Hetzner, for every project, goes through the proxy and only through it. If the
        proxy is down, requests fail instead of going direct. The console connects the browser to Hetzner directly.
      </p>
      <FieldGroup className={cn("mt-6", !enabled && "opacity-60")}>
        <Field>
          <FieldLabel>Protocol</FieldLabel>
          <Select
            value={protocol}
            onValueChange={(v) => {
              setProtocol(v)
              if (!port) setPort(String(PROTOCOLS.find((x) => x.value === v)?.port ?? ""))
            }}
          >
            <SelectTrigger className="w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROTOCOLS.map((x) => (
                <SelectItem key={x.value} value={x.value}>
                  {x.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field>
            <FieldLabel htmlFor="proxy-host">Host</FieldLabel>
            <Input id="proxy-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="proxy.example.com" className="bg-background" />
          </Field>
          <Field>
            <FieldLabel htmlFor="proxy-port">Port</FieldLabel>
            <Input
              id="proxy-port"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className="bg-background tabular"
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="proxy-user">Username</FieldLabel>
            <Input id="proxy-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Optional" autoComplete="off" className="bg-background" />
          </Field>
          <Field>
            <FieldLabel htmlFor="proxy-pass">Password</FieldLabel>
            <Input
              id="proxy-pass"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setClearPassword(false)
              }}
              placeholder={hasPassword ? "Saved. Leave empty to keep." : "Optional"}
              autoComplete="new-password"
              className="bg-background"
            />
          </Field>
        </div>
        {hasPassword ? (
          <Field orientation="horizontal">
            <Switch id="proxy-clear" checked={clearPassword} onCheckedChange={setClearPassword} />
            <FieldLabel htmlFor="proxy-clear">Remove the saved password</FieldLabel>
          </Field>
        ) : null}
        <TestNote result={result} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner /> : null} Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={testing}
            onClick={async () => {
              setTesting(true)
              setResult(null)
              setResult(await runTest({ proxy: proxyBody() }))
              setTesting(false)
            }}
          >
            {testing ? <Spinner /> : <PlugsConnectedIcon />} {enabled ? "Test through proxy" : "Test direct"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

/* ------------------------------------------------------------------ permissions */

function PermissionsForm({ initial }: { initial: Permissions }) {
  const [value, setValue] = React.useState<Permissions>(initial)
  const [saved, setSaved] = React.useState<Permissions>(initial)
  const [busy, setBusy] = React.useState(false)
  const dirty = JSON.stringify(value) !== JSON.stringify(saved)

  async function save() {
    setBusy(true)
    try {
      const next = await api<PublicSettings>("/api/admin/settings", { method: "PUT", body: { permissions: value } })
      setValue(next.permissions)
      setSaved(next.permissions)
      toast.success("Saved. It applies to every user right away.")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="display text-3xl">What users can do</h2>
          <p className="prose-serif mt-2 max-w-3xl text-base text-muted-foreground">
            Users can always see their servers, power them on and off, reboot them, read their graphs and give them their
            own name. The rest is up to you. Admins can always do everything.
          </p>
        </div>
        <Button onClick={save} disabled={busy || !dirty} className="shrink-0">
          {busy ? <Spinner /> : null} Save
        </Button>
      </div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {PERMISSION_KEYS.map((key) => (
          <label key={key} className="flex cursor-pointer items-start justify-between gap-4 bg-tile p-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{PERMISSION_META[key].label}</span>
              <span className="mt-1 block text-[13px] text-muted-foreground">{PERMISSION_META[key].description}</span>
            </span>
            <Switch checked={value[key]} onCheckedChange={(v) => setValue({ ...value, [key]: v })} aria-label={PERMISSION_META[key].label} />
          </label>
        ))}
        <div className="flex flex-col justify-between gap-3 bg-tile p-4">
          <span>
            <span className="block text-sm font-medium">Snapshots</span>
            <span className="mt-1 block text-[13px] text-muted-foreground">
              How many snapshots a user may keep of each server. Hetzner bills them by size.
            </span>
          </span>
          <Select value={String(value.snapshots)} onValueChange={(v) => setValue({ ...value, snapshots: Number(v) })}>
            <SelectTrigger className="w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SNAPSHOT_LIMITS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n === 0 ? "None, snapshots are off" : `Up to ${n} per server`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  )
}
