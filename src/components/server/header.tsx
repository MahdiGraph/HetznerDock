"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeftIcon, PencilSimpleIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage } from "@/lib/client"
import type { ServerKind } from "@/lib/summary"

/** Shared by the pages of cloud and dedicated servers. */

export function BackLink({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Link
      href={isAdmin ? "/admin/servers" : "/servers"}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" /> {isAdmin ? "All servers" : "My servers"}
    </Link>
  )
}

/** A name for the server that only this user sees. The name at Hetzner is never changed. */
export function RenameButton({
  kind,
  project,
  id,
  hetznerName,
  nickname,
  onSaved,
}: {
  kind: ServerKind
  project: number
  id: number
  hetznerName: string
  nickname: string | null
  onSaved: (nickname: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(nickname ?? "")
  const [busy, setBusy] = React.useState(false)

  async function save(next: string | null) {
    setBusy(true)
    try {
      const res = await api<{ nickname: string | null }>("/api/servers/nickname", {
        method: "PUT",
        body: { kind, projectId: project, serverId: id, nickname: next },
      })
      onSaved(res.nickname)
      toast.success(res.nickname ? "Name saved. Only you see it." : "Back to the Hetzner name")
      setOpen(false)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(nickname ?? "")
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Rename for me">
          <PencilSimpleIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          method="post"
          onSubmit={(e) => {
            e.preventDefault()
            save(value.trim() || null)
          }}
        >
          <DialogHeader>
            <DialogTitle className="display text-2xl">Your name for this server</DialogTitle>
            <DialogDescription className="prose-serif text-[15px]">
              Only you see this name. At Hetzner the server keeps its name, {hetznerName}.
            </DialogDescription>
          </DialogHeader>
          <Input className="my-6" value={value} onChange={(e) => setValue(e.target.value)} placeholder={hetznerName} maxLength={80} autoFocus />
          <DialogFooter>
            {nickname ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => save(null)} className="sm:mr-auto">
                Use the Hetzner name
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
