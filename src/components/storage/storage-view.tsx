"use client"

import * as React from "react"
import { PlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Board, Facts, Tile, TileLabel } from "@/components/board"
import { ConfirmAction, CopyButton, ErrorNote, Loading, Notice, StateMark, useAction } from "@/components/common"
import { Flag } from "@/components/flag"
import { BackLink, RenameButton } from "@/components/server/header"
import { SecretDialog, SectionTitle, type Secret } from "@/components/server/parts"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useStorage } from "@/hooks/use-api"
import { api, errorMessage, storageCall, storageUrl } from "@/lib/client"
import { formatBytes, formatDateTime, humanize, timeAgo } from "@/lib/format"
import type { HzAction } from "@/lib/hz-types"
import type { Dict } from "@/lib/summary"

type Access = { ssh_enabled: boolean; samba_enabled: boolean; webdav_enabled: boolean; zfs_enabled: boolean; reachable_externally: boolean }
type Box = Dict & {
  name: string
  status: string
  username: string | null
  server: string | null
  access_settings: Access
  snapshot_plan: { max_snapshots: number; minute: number; hour: number; day_of_week: number | null; day_of_month: number | null } | null
  stats: { size: number; size_data: number; size_snapshots: number }
  storage_box_type: { name: string; size: number; snapshot_limit: number | null; subaccounts_limit: number }
  location: { city?: string; name?: string; country?: string }
  protection: { delete: boolean }
}
type Snapshot = { id: number; name: string; description: string; is_automatic: boolean; created: string; stats: { size: number } }
type SubAccount = { id: number; username: string; home_directory: string; description: string; server: string; access_settings: Omit<Access, "zfs_enabled"> & { readonly: boolean } }

type Ctx = { project: number; id: number; canChange: boolean; isAdmin: boolean; box: Box; refresh: () => void; watch: (a: HzAction | undefined, done: string) => void; secret: (s: Secret) => void }
const StorageContext = React.createContext<Ctx | null>(null)
const useBox = () => React.useContext(StorageContext)!

const ACCESS: { key: keyof Access; label: string; detail: string }[] = [
  { key: "ssh_enabled", label: "SSH and SFTP", detail: "rsync, scp, sftp and borg over SSH, port 23." },
  { key: "samba_enabled", label: "Samba (SMB)", detail: "Mount it as a network drive." },
  { key: "webdav_enabled", label: "WebDAV", detail: "HTTPS access from a browser or a client." },
  { key: "zfs_enabled", label: "Snapshot folder", detail: "Snapshots show up read-only in .zfs." },
  { key: "reachable_externally", label: "Outside Hetzner", detail: "Allow connections from outside Hetzner's network." },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function StorageView({
  project,
  projectName,
  id,
  isAdmin,
  canChange,
  canRename,
  nickname: initialNickname,
}: {
  project: number
  projectName: string
  id: number
  isAdmin: boolean
  canChange: boolean
  canRename: boolean
  nickname: string | null
}) {
  const [nickname, setNickname] = React.useState(initialNickname)
  const [secret, setSecret] = React.useState<Secret | null>(null)
  const detail = useStorage<{ storage_box: Box }>(project, id, "", undefined, {
    refreshInterval: (d) => (d?.storage_box?.status === "initializing" ? 5000 : 60_000),
  })
  const { mutate } = detail
  const refresh = React.useCallback(() => void mutate(), [mutate])

  // Follows a Hetzner action with a toast until it finishes, then loads the box again.
  const watch = React.useCallback(
    async (action: HzAction | undefined, done: string) => {
      if (!action?.id) return refresh()
      let current = action
      const toastId = current.status === "running" ? toast.loading("Hetzner is working on it…") : undefined
      for (let i = 0; current.status === "running" && i < 120; i++) {
        await sleep(2000)
        try {
          current = (await api<{ action: HzAction }>(storageUrl(project, id, `actions/${action.id}`))).action
        } catch {
          break
        }
      }
      if (current.status === "error") toast.error(current.error?.message ?? "Hetzner reported an error.", { id: toastId })
      else toast.success(done, { id: toastId })
      refresh()
    },
    [project, id, refresh]
  )

  const box = detail.data?.storage_box
  if (!box) {
    return (
      <>
        <BackLink isAdmin={isAdmin} />
        {detail.error ? <ErrorNote error={detail.error} /> : <Loading label="Loading the Storage Box from Hetzner…" />}
      </>
    )
  }

  const size = box.storage_box_type?.size ?? 0
  const used = box.stats?.size ?? 0
  const share = size ? used / size : 0
  const ctx: Ctx = { project, id, canChange, isAdmin, box, refresh, watch: (a, d) => void watch(a, d), secret: setSecret }

  return (
    <StorageContext.Provider value={ctx}>
      <BackLink isAdmin={isAdmin} />
      <Board className="mb-8">
        <Tile className="col-span-12 flex flex-col justify-between gap-8 lg:col-span-6 lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[13px] text-muted-foreground">
              Storage Box · {projectName} · <span className="tabular">#{id}</span>
            </p>
            {canRename ? (
              <RenameButton kind="storage" project={project} id={id} hetznerName={box.name} nickname={nickname} onSaved={setNickname} />
            ) : null}
          </div>
          <div>
            <h1 className="display text-4xl break-words md:text-6xl">{nickname || box.name}</h1>
            {nickname ? <p className="mt-3 text-sm text-muted-foreground">Hetzner name: {box.name}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <StateMark state={box.status === "active" ? "running" : box.status} label={humanize(box.status)} />
            <span>
              {box.storage_box_type?.name?.toUpperCase()} · {formatBytes(size, { binary: true })}
            </span>
          </div>
        </Tile>
        <Tile tone="tile" className="col-span-12 flex flex-col justify-between gap-6 sm:col-span-6 lg:col-span-3">
          <TileLabel>Used</TileLabel>
          <div>
            <p className="display text-4xl tabular">{Math.round(share * 1000) / 10}%</p>
            <div className="mt-4 h-3 bg-background/70">
              <div className={share >= 0.9 ? "h-3 bg-destructive" : share >= 0.75 ? "h-3 bg-warning" : "h-3 bg-foreground"} style={{ width: `${Math.min(100, Math.max(share * 100, 0.5))}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground tabular">
              {formatBytes(used, { binary: true })} of {formatBytes(size, { binary: true })}, snapshots {formatBytes(box.stats?.size_snapshots ?? 0, { binary: true })}
            </p>
          </div>
        </Tile>
        <Tile tone="tile" className="col-span-12 flex flex-col justify-between gap-6 sm:col-span-6 lg:col-span-3">
          <TileLabel>Connect to</TileLabel>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-lg break-all">{box.server ?? "Being set up"}</p>
              {box.server ? <CopyButton value={box.server} label="Copy host" /> : null}
            </div>
            <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              User {box.username ?? "—"}
              {box.username ? <CopyButton value={box.username} label="Copy user" className="size-6" /> : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              <Flag country={box.location?.country} className="mr-1.5" />
              {[box.location?.city, box.location?.name].filter(Boolean).join(" · ")}
            </p>
          </div>
        </Tile>
      </Board>

      <Tabs defaultValue="overview">
        <div className="no-scrollbar mb-5 overflow-x-auto pb-1.5">
          <TabsList variant="line" className="h-10">
            {["Overview", "Snapshots", "Sub-accounts", "History"].map((t) => (
              <TabsTrigger key={t} value={t.toLowerCase()} className="px-3 text-sm">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="overview">
          <Overview />
        </TabsContent>
        <TabsContent value="snapshots">
          <Snapshots />
        </TabsContent>
        <TabsContent value="sub-accounts">
          <SubAccounts />
        </TabsContent>
        <TabsContent value="history">
          <History />
        </TabsContent>
      </Tabs>
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </StorageContext.Provider>
  )
}

/* ------------------------------------------------------------------ overview */

function Overview() {
  const { project, id, box, canChange, isAdmin, watch, secret } = useBox()
  const { busy, run } = useAction()
  const host = box.server ?? "your-box.your-storagebox.de"
  const user = box.username ?? "u00000"

  const setAccess = (key: keyof Access, value: boolean) =>
    run(key, async () => {
      const res = await storageCall<{ action?: HzAction }>(project, id, "POST", "access", { [key]: value })
      watch(res.action, "Access changed")
    })

  return (
    <Board>
      <Tile className="col-span-12 lg:col-span-7 lg:p-8">
        <SectionTitle>Access</SectionTitle>
        <ul className="grid gap-1">
          {ACCESS.map((a) => (
            <li key={a.key} className="flex items-center justify-between gap-4 bg-tile px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{a.label}</span>
                <span className="block text-[13px] text-muted-foreground">{a.detail}</span>
              </span>
              {busy === a.key ? (
                <Spinner />
              ) : (
                <Switch checked={!!box.access_settings?.[a.key]} disabled={!canChange || !!busy} onCheckedChange={(v) => setAccess(a.key, v)} aria-label={a.label} />
              )}
            </li>
          ))}
        </ul>
        {canChange ? (
          <div className="mt-6">
            <ConfirmAction
              title="Set a new password?"
              description="The current password stops working at once, on every protocol. SSH keys keep working."
              confirmLabel="Set new password"
              onConfirm={async () => {
                const res = await storageCall<{ password: string; action?: HzAction }>(project, id, "POST", "password")
                watch(res.action, "The new password is set")
                secret({ title: "New password", password: res.password, description: `Log in as ${user} with this password.` })
              }}
            >
              <Button variant="secondary">Reset password</Button>
            </ConfirmAction>
          </div>
        ) : null}
      </Tile>
      <Tile tone="tile" className="col-span-12 lg:col-span-5 lg:p-8">
        <SectionTitle>How to connect</SectionTitle>
        <Facts
          className="sm:grid-cols-1"
          items={[
            ["SFTP and rsync", <Command key="s" text={`sftp -P 23 ${user}@${host}`} />],
            ["Samba share", <Command key="m" text={`\\\\${host}\\backup`} />],
            ["WebDAV", <Command key="w" text={`https://${host}`} />],
          ]}
        />
        <p className="mt-6 text-[13px] text-muted-foreground">A protocol only answers while it is switched on under Access.</p>
      </Tile>
      <SnapshotPlan />
      {isAdmin ? <Protection /> : null}
    </Board>
  )
}

function Command({ text }: { text: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <code className="truncate bg-background/70 px-1.5 py-0.5 text-[13px]">{text}</code>
      <CopyButton value={text} className="size-6" />
    </span>
  )
}

function SnapshotPlan() {
  const { project, id, box, canChange, watch } = useBox()
  const plan = box.snapshot_plan
  const [hour, setHour] = React.useState("3")
  const [keep, setKeep] = React.useState("7")
  const { busy, run } = useAction()
  return (
    <Tile className="col-span-12 lg:col-span-7 lg:p-8">
      <SectionTitle>Automatic snapshots</SectionTitle>
      {plan ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base">
            Every {plan.day_of_month ? `month on day ${plan.day_of_month}` : plan.day_of_week ? `week on ${["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][plan.day_of_week]}` : "day"} at{" "}
            {String(plan.hour).padStart(2, "0")}:{String(plan.minute).padStart(2, "0")} UTC, keeping the last {plan.max_snapshots}.
          </p>
          {canChange ? (
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() =>
                run("off", async () => {
                  const res = await storageCall<{ action?: HzAction }>(project, id, "DELETE", "snapshot-plan")
                  watch(res.action, "Automatic snapshots are off")
                })
              }
            >
              {busy === "off" ? <Spinner /> : null} Turn off
            </Button>
          ) : null}
        </div>
      ) : canChange ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            run("on", async () => {
              const res = await storageCall<{ action?: HzAction }>(project, id, "POST", "snapshot-plan", {
                hour: Number(hour),
                minute: 0,
                max_snapshots: Number(keep),
              })
              watch(res.action, "Automatic snapshots are on")
            })
          }}
        >
          <label className="grid gap-1 text-sm">
            Every day at (UTC)
            <Input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(e.target.value)} className="w-24 bg-background tabular" />
          </label>
          <label className="grid gap-1 text-sm">
            Keep the last
            <Input type="number" min={1} max={100} value={keep} onChange={(e) => setKeep(e.target.value)} className="w-24 bg-background tabular" />
          </label>
          <Button type="submit" disabled={!!busy}>
            {busy === "on" ? <Spinner /> : null} Turn on
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Off.</p>
      )}
    </Tile>
  )
}

function Protection() {
  const { project, id, box, watch } = useBox()
  const { busy, run } = useAction()
  return (
    <Tile tone="tile" className="col-span-12 lg:col-span-5 lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <SectionTitle>Protection</SectionTitle>
        {busy ? (
          <Spinner />
        ) : (
          <Switch
            checked={box.protection?.delete === true}
            aria-label="Protect the Storage Box"
            onCheckedChange={(enabled) =>
              run("protect", async () => {
                const res = await storageCall<{ action?: HzAction }>(project, id, "POST", "protection", { enabled })
                watch(res.action, enabled ? "The Storage Box is protected" : "Protection is off")
              })
            }
          />
        )}
      </div>
      <p className="prose-serif text-base text-muted-foreground">While it is on, nobody can delete the Storage Box in the Hetzner Console. Only admins see this.</p>
    </Tile>
  )
}

/* ------------------------------------------------------------------ snapshots */

function Snapshots() {
  const { project, id, box, canChange, watch } = useBox()
  const list = useStorage<{ snapshots: Snapshot[] }>(project, id, "snapshots")
  const [description, setDescription] = React.useState("")
  const { busy, run } = useAction()
  const snapshots = list.data?.snapshots ?? []
  return (
    <div className="grid gap-2">
      <Tile className="lg:p-8">
        <h2 className="display text-3xl">Snapshots</h2>
        <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
          A snapshot freezes every file of the box at one moment. Rolling back to one deletes everything written since, and every newer snapshot.
          {box.storage_box_type?.snapshot_limit ? ` This box keeps up to ${box.storage_box_type.snapshot_limit} manual snapshots.` : ""}
        </p>
        {canChange ? (
          <form
            className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              run("create", async () => {
                const res = await storageCall<{ action?: HzAction }>(project, id, "POST", "snapshots", { description: description.trim() || undefined })
                setDescription("")
                watch(res.action, "Snapshot taken")
                setTimeout(() => list.mutate(), 1500)
              })
            }}
          >
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description, for example before cleanup" maxLength={200} className="bg-background" />
            <Button type="submit" disabled={!!busy} className="shrink-0">
              {busy === "create" ? <Spinner /> : <PlusIcon />} Take snapshot
            </Button>
          </form>
        ) : null}
      </Tile>
      <ErrorNote error={list.error} />
      {list.isLoading && !list.data ? (
        <Loading />
      ) : snapshots.length ? (
        <ul className="grid gap-2">
          {snapshots.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 bg-card p-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="truncate text-base font-medium">{s.description || s.name}</p>
                <p className="text-[13px] text-muted-foreground">
                  {formatDateTime(s.created)} · {formatBytes(s.stats?.size ?? 0, { binary: true })}
                  {s.is_automatic ? " · automatic" : ""}
                </p>
              </div>
              {canChange ? (
                <div className="flex flex-wrap gap-2">
                  <ConfirmAction
                    title="Roll back to this snapshot?"
                    description="Everything written to the box since this snapshot is deleted, and so are all newer snapshots. There is no undo."
                    confirmLabel="Roll back"
                    destructive
                    onConfirm={async () => {
                      const res = await storageCall<{ action?: HzAction }>(project, id, "POST", `snapshots/${s.id}/rollback`)
                      watch(res.action, "Rolled back")
                      setTimeout(() => list.mutate(), 2000)
                    }}
                  >
                    <Button size="sm" variant="secondary">
                      Roll back
                    </Button>
                  </ConfirmAction>
                  <ConfirmAction
                    title="Delete this snapshot?"
                    description="It cannot be brought back."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      await storageCall(project, id, "DELETE", `snapshots/${s.id}`)
                      toast.success("Snapshot deleted")
                      await list.mutate()
                    }}
                  >
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                      Delete
                    </Button>
                  </ConfirmAction>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : list.data ? (
        <Tile>
          <p className="prose-serif text-base text-muted-foreground">No snapshots yet.</p>
        </Tile>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ sub-accounts */

function SubAccounts() {
  const { project, id, box, canChange, watch, secret } = useBox()
  const list = useStorage<{ subaccounts: SubAccount[] }>(project, id, "subaccounts")
  const [home, setHome] = React.useState("")
  const [readonly, setReadonly] = React.useState(false)
  const { busy, run } = useAction()
  const accounts = list.data?.subaccounts ?? []
  return (
    <div className="grid gap-2">
      <Tile className="lg:p-8">
        <h2 className="display text-3xl">Sub-accounts</h2>
        <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
          A sub-account has its own login and only sees one folder of the box: give one to each machine or person that backs up here.
          {box.storage_box_type?.subaccounts_limit ? ` Up to ${box.storage_box_type.subaccounts_limit}.` : ""}
        </p>
        {canChange ? (
          <form
            className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault()
              run("create", async () => {
                const res = await storageCall<{ subaccount: SubAccount | null; password: string; action?: HzAction }>(project, id, "POST", "subaccounts", {
                  home_directory: home.trim(),
                  access_settings: { readonly, ssh_enabled: true },
                })
                setHome("")
                watch(res.action, "Sub-account created")
                setTimeout(() => list.mutate(), 1500)
                secret({
                  title: "Sub-account created",
                  password: res.password,
                  description: res.subaccount?.username ? `Log in as ${res.subaccount.username} with this password.` : "Log in with this password once the sub-account appears in the list.",
                })
              })
            }}
          >
            <Input value={home} onChange={(e) => setHome(e.target.value)} placeholder="Folder, for example backups/laptop" required className="bg-background" />
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <Checkbox checked={readonly} onCheckedChange={(v) => setReadonly(!!v)} /> Read-only
            </label>
            <Button type="submit" disabled={!!busy || !home.trim()} className="shrink-0">
              {busy === "create" ? <Spinner /> : <PlusIcon />} Create
            </Button>
          </form>
        ) : null}
      </Tile>
      <ErrorNote error={list.error} />
      {list.isLoading && !list.data ? (
        <Loading />
      ) : accounts.length ? (
        <ul className="grid gap-2">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 bg-card p-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-base font-medium">
                  {a.username}
                  <CopyButton value={a.username} label="Copy user" className="ml-1 size-6" />
                </p>
                <p className="text-[13px] text-muted-foreground">
                  /{a.home_directory.replace(/^\//, "")}
                  {a.access_settings?.readonly ? " · read-only" : ""}
                  {a.description ? ` · ${a.description}` : ""}
                </p>
              </div>
              {canChange ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      run(`pw-${a.id}`, async () => {
                        const res = await storageCall<{ password: string; action?: HzAction }>(project, id, "POST", `subaccounts/${a.id}/password`)
                        watch(res.action, "The new password is set")
                        secret({ title: "New password", password: res.password, description: `Log in as ${a.username} with this password.` })
                      })
                    }
                  >
                    {busy === `pw-${a.id}` ? <Spinner /> : null} New password
                  </Button>
                  <ConfirmAction
                    title={`Delete ${a.username}?`}
                    description="The login stops working. The files in its folder stay on the box."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      await storageCall(project, id, "DELETE", `subaccounts/${a.id}`)
                      toast.success("Sub-account deleted")
                      setTimeout(() => list.mutate(), 1500)
                    }}
                  >
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                      Delete
                    </Button>
                  </ConfirmAction>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : list.data ? (
        <Tile>
          <p className="prose-serif text-base text-muted-foreground">No sub-accounts yet.</p>
        </Tile>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ history */

function History() {
  const { project, id } = useBox()
  const data = useStorage<{ actions: HzAction[] }>(project, id, "actions", undefined, {
    refreshInterval: (d) => (d?.actions?.some((a) => a.status === "running") ? 3000 : 0),
  })
  if (data.isLoading && !data.data) return <Loading />
  const actions = data.data?.actions ?? []
  return (
    <div className="grid gap-2">
      <ErrorNote error={data.error} />
      {actions.some((a) => a.status === "running") ? <Notice tone="info">Hetzner is working on this box right now.</Notice> : null}
      {actions.length ? (
        <Tile className="p-0">
          <ol className="grid">
            {actions.map((a, i) => (
              <li key={a.id} className={i % 2 ? "bg-tile/50 px-5 py-3" : "px-5 py-3"}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{humanize(a.command)}</p>
                    <p className="text-[13px] text-muted-foreground" title={formatDateTime(a.started)}>
                      {timeAgo(a.started)}
                    </p>
                  </div>
                  <StateMark state={a.status} label={a.status === "running" ? `Running, ${a.progress}%` : a.status === "success" ? "Done" : "Failed"} />
                </div>
                {a.error ? <p className="mt-1 text-[13px] text-destructive">{errorMessage(new Error(a.error.message))}</p> : null}
              </li>
            ))}
          </ol>
        </Tile>
      ) : (
        <Tile>
          <p className="prose-serif text-base text-muted-foreground">Nothing has happened to this box yet.</p>
        </Tile>
      )}
    </div>
  )
}
