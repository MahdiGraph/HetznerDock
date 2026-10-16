"use client"

import * as React from "react"
import { toast } from "sonner"
import { Board, Tile } from "@/components/board"
import { ConfirmAction, ErrorNote, Loading, useAction } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useHz } from "@/hooks/use-api"
import { errorMessage, hzCall } from "@/lib/client"
import { formatMoney } from "@/lib/format"
import type { HzAction, ServerTypeOption } from "@/lib/hz-types"
import { get } from "@/lib/summary"
import { cn } from "@/lib/utils"
import { useServer } from "./context"

function Rename() {
  const { server, project, id, refresh } = useServer()
  const [name, setName] = React.useState(String(server.name ?? ""))
  const [busy, setBusy] = React.useState(false)
  return (
    <Tile className="col-span-12 lg:col-span-6 lg:p-8">
      <h2 className="display text-3xl">Name at Hetzner</h2>
      <p className="prose-serif mt-2 text-base text-muted-foreground">
        The server&apos;s name in the Hetzner Console and its host name in the metadata. Users who gave the server their own
        name keep seeing theirs.
      </p>
      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await hzCall(project, id, "PUT", "", { name: name.trim() })
            toast.success("Renamed at Hetzner")
            refresh()
          } catch (err) {
            toast.error(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={63} className="bg-background" />
        <Button type="submit" disabled={busy || !name.trim() || name.trim() === server.name} className="shrink-0">
          {busy ? <Spinner /> : null} Rename
        </Button>
      </form>
    </Tile>
  )
}

function Protection() {
  const { server, project, id, watch } = useServer()
  const on = get(server, "protection.delete") === true || get(server, "protection.rebuild") === true
  const { busy, run } = useAction()
  return (
    <Tile tone="tile" className="col-span-12 lg:col-span-6 lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <h2 className="display text-3xl">Protection</h2>
        {busy ? (
          <Spinner />
        ) : (
          <Switch
            checked={on}
            aria-label="Protect the server"
            onCheckedChange={(enabled) =>
              run("protect", async () => {
                const res = await hzCall<{ action?: HzAction }>(project, id, "POST", "actions/change_protection", { enabled })
                watch(res.action, {
                  pending: enabled ? "Turning protection on…" : "Turning protection off…",
                  success: enabled ? "The server is protected" : "Protection is off",
                })
              })
            }
          />
        )}
      </div>
      <p className="prose-serif mt-2 text-base text-muted-foreground">
        While it is on, nobody can delete or rebuild the server, not even by accident in the Hetzner Console. Users then
        cannot rebuild it either.
      </p>
    </Tile>
  )
}

function Backups() {
  const { server, project, id, watch } = useServer()
  const on = !!server.backup_window
  return (
    <Tile className="col-span-12 lg:col-span-6 lg:p-8">
      <h2 className="display text-3xl">Backups</h2>
      <p className="prose-serif mt-2 text-base text-muted-foreground">
        {on
          ? `On. Hetzner backs the server up every day between ${server.backup_window} UTC and keeps seven. Users can rebuild from them.`
          : "Daily backups cost 20% of the server's price and keep the last seven days."}
      </p>
      <div className="mt-6">
        {on ? (
          <ConfirmAction
            title="Turn backups off?"
            description="Hetzner deletes every backup of this server right away. Keep one as a snapshot first if you need it."
            confirmLabel="Turn off and delete backups"
            destructive
            onConfirm={async () => {
              const res = await hzCall<{ action?: HzAction }>(project, id, "POST", "actions/disable_backup")
              watch(res.action, { pending: "Turning backups off…", success: "Backups are off" })
            }}
          >
            <Button variant="secondary">Turn backups off</Button>
          </ConfirmAction>
        ) : (
          <ConfirmAction
            title="Turn backups on?"
            description="The server's price goes up by 20%. The first backup runs in the next backup window."
            confirmLabel="Turn backups on"
            onConfirm={async () => {
              const res = await hzCall<{ action?: HzAction }>(project, id, "POST", "actions/enable_backup")
              watch(res.action, { pending: "Turning backups on…", success: "Backups are on" })
            }}
          >
            <Button variant="secondary">Turn backups on</Button>
          </ConfirmAction>
        )}
      </div>
    </Tile>
  )
}

function Rescale({ currency }: { currency: string }) {
  const { server, project, id, watch, refresh } = useServer()
  const types = useHz<{ types: ServerTypeOption[] }>(project, id, "server-types")
  const [choice, setChoice] = React.useState<string | null>(null)
  const [upgradeDisk, setUpgradeDisk] = React.useState(false)
  const current = (server.server_type ?? {}) as Record<string, unknown>
  const off = server.status === "off"
  const currentDisk = Number(server.primary_disk_size ?? current.disk ?? 0)
  const chosen = types.data?.types.find((t) => t.name === choice)
  // Without a disk upgrade the new type only needs a disk at least as big as the current one.
  const fits = (t: ServerTypeOption) => t.disk >= currentDisk

  return (
    <Tile tone="tile" className="col-span-12 lg:col-span-6 lg:p-8">
      <h2 className="display text-3xl">Server type</h2>
      <p className="prose-serif mt-2 text-base text-muted-foreground">
        Move the server to more or fewer cores and memory. Hetzner copies the disk over; the server has to be off. Without
        a bigger disk, you can move back down later.
      </p>
      <ErrorNote error={types.error} className="mt-4" />
      {types.isLoading && !types.data ? (
        <Loading />
      ) : types.data ? (
        <FieldGroup className="mt-6">
          <div role="radiogroup" aria-label="Server types" className="grid max-h-72 gap-1 overflow-y-auto">
            {types.data.types.map((t) => {
              const isCurrent = t.name === current.name
              const disabled = isCurrent || !t.available || t.deprecated || !fits(t)
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={choice === t.name}
                  disabled={disabled}
                  onClick={() => setChoice(t.name)}
                  className={cn(
                    "grid grid-cols-[5rem_1fr_auto] items-baseline gap-3 px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                    choice === t.name ? "bg-primary text-primary-foreground" : "bg-background/70 hover:bg-accent"
                  )}
                >
                  <span className="font-medium uppercase">{t.name}</span>
                  <span className="truncate">
                    {t.cores} vCPU · {t.memory} GB · {t.disk} GB {t.cpuType === "dedicated" ? "· dedicated" : ""}
                    {isCurrent ? " · current" : !t.available ? " · sold out here" : ""}
                  </span>
                  <span className="tabular">{formatMoney(t.price, currency)}</span>
                </button>
              )
            })}
          </div>
          <Field orientation="horizontal">
            <Checkbox id="upgrade-disk" checked={upgradeDisk} onCheckedChange={(v) => setUpgradeDisk(!!v)} />
            <FieldLabel htmlFor="upgrade-disk">Grow the disk to the new type&apos;s size</FieldLabel>
          </Field>
          <FieldDescription>A grown disk cannot shrink again, so the server can no longer move to a smaller type.</FieldDescription>
          <div>
            <ConfirmAction
              title={`Change to ${chosen?.name.toUpperCase() ?? "the new type"}?`}
              description={`The server stays off while Hetzner moves it, usually a few minutes. The new price is ${formatMoney(chosen?.price ?? null, currency)} a month.`}
              confirmLabel="Change type"
              onConfirm={async () => {
                const res = await hzCall<{ action?: HzAction }>(project, id, "POST", "actions/change_type", {
                  server_type: chosen!.name,
                  upgrade_disk: upgradeDisk,
                })
                refresh()
                watch(res.action, { pending: `Moving to ${chosen!.name.toUpperCase()}…`, success: "Server type changed. Power it on when you are ready." })
              }}
            >
              <Button disabled={!chosen || !off}>Change type</Button>
            </ConfirmAction>
            {!off ? <p className="mt-2 text-sm text-muted-foreground">Shut the server down first.</p> : null}
          </div>
        </FieldGroup>
      ) : null}
    </Tile>
  )
}

export function AdminTools({ currency }: { currency: string }) {
  return (
    <Board>
      <Rename />
      <Protection />
      <Rescale currency={currency} />
      <Backups />
    </Board>
  )
}
