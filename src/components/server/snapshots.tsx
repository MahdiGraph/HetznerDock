"use client"

import * as React from "react"
import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Tile } from "@/components/board"
import { ConfirmAction, ErrorNote, Loading, StateMark, useAction } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useHz } from "@/hooks/use-api"
import { errorMessage, hzCall } from "@/lib/client"
import { formatDateTime } from "@/lib/format"
import type { HzAction, ImageInfo, SnapshotList } from "@/lib/hz-types"
import { useServer } from "./context"

function sizeText(image: ImageInfo) {
  return [image.imageSize ? `${image.imageSize.toFixed(2)} GB stored` : null, image.diskSize ? `from a ${image.diskSize} GB disk` : null]
    .filter(Boolean)
    .join(", ")
}

export function Snapshots() {
  const { project, id, can, isAdmin, server, watch, openTab, setRebuildImage } = useServer()
  const list = useHz<SnapshotList>(project, id, "snapshots", undefined, {
    refreshInterval: (d) => ([...(d?.snapshots ?? []), ...(d?.backups ?? [])].some((s) => s.status === "creating") ? 5000 : 0),
  })
  const [name, setName] = React.useState("")
  const [renaming, setRenaming] = React.useState<ImageInfo | null>(null)
  const { busy, run } = useAction()
  const snapshots = list.data?.snapshots ?? []
  const backups = list.data?.backups ?? []
  const limit = list.data?.limit ?? null
  const full = limit !== null && snapshots.length >= limit
  const canTake = can("snapshots") && !full

  const rebuildFrom = (image: ImageInfo) => {
    setRebuildImage(image.id)
    openTab("rebuild")
  }

  return (
    <div className="grid gap-2">
      <Tile className="lg:p-8">
        <h2 className="display text-3xl">Snapshots</h2>
        <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
          A snapshot is a copy of the whole disk at one moment. Rebuild the server from it to go back to that moment. Shut
          the server down first for a clean copy.
        </p>
        {can("snapshots") ? (
          <form
            className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              run(
                "create",
                async () => {
                  const res = await hzCall<{ action?: HzAction }>(project, id, "POST", "snapshots", {
                    description: name.trim() || undefined,
                  })
                  setName("")
                  await list.mutate()
                  watch(res.action, { pending: "Taking the snapshot…", success: "Snapshot ready" }, () => list.mutate())
                },
                undefined
              )
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Name, for example ${String(server.name ?? "server")}-before-upgrade`}
              maxLength={100}
              className="bg-background"
              disabled={!canTake}
            />
            <Button type="submit" disabled={!!busy || !canTake} className="shrink-0">
              {busy === "create" ? <Spinner /> : <PlusIcon />} Take snapshot
            </Button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Your admin has turned snapshots off.</p>
        )}
        {limit !== null && limit > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground tabular">
            {snapshots.length} of {limit} snapshot{limit === 1 ? "" : "s"} used{full ? ". Delete one to take another." : "."}
          </p>
        ) : null}
        {isAdmin ? <p className="mt-3 text-sm text-muted-foreground">Hetzner bills snapshots by their stored size each month.</p> : null}
      </Tile>

      <ErrorNote error={list.error} />
      {list.isLoading && !list.data ? (
        <Loading />
      ) : snapshots.length ? (
        <ul className="grid gap-2">
          {snapshots.map((snap) => (
            <li key={snap.id} className="flex flex-col gap-3 bg-card p-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="truncate text-base font-medium">{snap.description}</p>
                <p className="text-[13px] text-muted-foreground">
                  {formatDateTime(snap.created)}
                  {sizeText(snap) ? ` · ${sizeText(snap)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StateMark state={snap.status} className="mr-2" />
                {can("rebuild") ? (
                  <Button size="sm" variant="secondary" disabled={snap.status !== "available"} onClick={() => rebuildFrom(snap)}>
                    Rebuild from it
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => setRenaming(snap)} aria-label="Rename">
                  <PencilSimpleIcon /> Rename
                </Button>
                <ConfirmAction
                  title="Delete this snapshot?"
                  description={snap.protected ? "It is protected against deletion; an admin has to lift that in the Hetzner Console first." : "It cannot be brought back."}
                  confirmLabel="Delete"
                  destructive
                  onConfirm={async () => {
                    await hzCall(project, id, "DELETE", `snapshots/${snap.id}`)
                    toast.success("Snapshot deleted")
                    await list.mutate()
                  }}
                >
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={snap.status === "creating"}>
                    Delete
                  </Button>
                </ConfirmAction>
              </div>
            </li>
          ))}
        </ul>
      ) : list.data ? (
        <Tile>
          <p className="prose-serif text-base text-muted-foreground">No snapshots of this server yet.</p>
        </Tile>
      ) : null}

      {backups.length || server.backup_window ? (
        <Tile className="mt-6 lg:p-8">
          <h2 className="display text-3xl">Backups</h2>
          <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
            {server.backup_window
              ? `Hetzner backs the server up every day between ${server.backup_window} UTC and keeps the last seven.`
              : "Backups are off for this server. These are left from before."}
          </p>
          <ul className="mt-6 grid gap-2">
            {backups.map((b) => (
              <li key={b.id} className="flex flex-col gap-3 bg-tile p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium">{b.description}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatDateTime(b.created)}
                    {sizeText(b) ? ` · ${sizeText(b)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StateMark state={b.status} className="mr-2" />
                  {can("rebuild") ? (
                    <Button size="sm" variant="secondary" disabled={b.status !== "available"} onClick={() => rebuildFrom(b)}>
                      Rebuild from it
                    </Button>
                  ) : null}
                  {isAdmin ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                      onClick={() =>
                        run(`keep-${b.id}`, async () => {
                          await hzCall(project, id, "POST", `snapshots/${b.id}/keep`)
                          await list.mutate()
                        }, "Kept as a snapshot; it no longer expires")
                      }
                    >
                      {busy === `keep-${b.id}` ? <Spinner /> : null} Keep as snapshot
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
            {!backups.length ? <li className="text-sm text-muted-foreground">The first backup has not run yet.</li> : null}
          </ul>
        </Tile>
      ) : null}

      <RenameDialog
        image={renaming}
        onClose={() => setRenaming(null)}
        onSaved={() => list.mutate()}
      />
    </div>
  )
}

function RenameDialog({ image, onClose, onSaved }: { image: ImageInfo | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={!!image} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        {image ? <RenameForm key={image.id} image={image} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function RenameForm({ image, onClose, onSaved }: { image: ImageInfo; onClose: () => void; onSaved: () => void }) {
  const { project, id } = useServer()
  const [value, setValue] = React.useState(image.description)
  const [busy, setBusy] = React.useState(false)
  return (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              await hzCall(project, id, "PUT", `snapshots/${image.id}`, { description: value.trim() })
              toast.success("Snapshot renamed")
              onSaved()
              onClose()
            } catch (err) {
              toast.error(errorMessage(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="display text-2xl">Rename snapshot</DialogTitle>
            <DialogDescription className="prose-serif text-[15px]">The name is stored at Hetzner.</DialogDescription>
          </DialogHeader>
          <Input className="my-6" value={value} onChange={(e) => setValue(e.target.value)} maxLength={100} autoFocus />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !value.trim()}>
              {busy ? <Spinner /> : null} Save
            </Button>
          </DialogFooter>
        </form>
  )
}
