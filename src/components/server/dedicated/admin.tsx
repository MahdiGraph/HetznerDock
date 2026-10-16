"use client"

import * as React from "react"
import { toast } from "sonner"
import { Board, Facts, Tile } from "@/components/board"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage, robotCall } from "@/lib/client"
import { formatDate } from "@/lib/format"
import { useDedicated } from "./context"

function Rename() {
  const { server, project, id, refresh } = useDedicated()
  const [name, setName] = React.useState(server.name)
  const [busy, setBusy] = React.useState(false)
  return (
    <Tile className="col-span-12 lg:col-span-6 lg:p-8">
      <h2 className="display text-3xl">Name at Hetzner</h2>
      <p className="prose-serif mt-2 text-base text-muted-foreground">
        The server&apos;s name in Robot. Users who gave the server their own name keep seeing theirs.
      </p>
      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await robotCall(project, id, "PUT", "", { name: name.trim() })
            toast.success("Renamed in Robot")
            refresh()
          } catch (err) {
            toast.error(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="bg-background" />
        <Button type="submit" disabled={busy || !name.trim() || name.trim() === server.name} className="shrink-0">
          {busy ? <Spinner /> : null} Rename
        </Button>
      </form>
    </Tile>
  )
}

function Billing() {
  const { server } = useDedicated()
  return (
    <Tile tone="tile" className="col-span-12 lg:col-span-6 lg:p-8">
      <h2 className="display text-3xl">Contract</h2>
      <Facts
        className="mt-6"
        items={[
          ["Paid until", server.paidUntil ? formatDate(server.paidUntil) : null],
          ["Cancelled", server.cancelled ? "Yes" : "No"],
          ["Product", server.product],
        ]}
      />
      <p className="mt-6 text-[13px] text-muted-foreground">
        Robot does not report what the server costs. Orders, cancellations, failover IPs and vSwitches stay in Robot.
      </p>
    </Tile>
  )
}

export function DedicatedAdminTools() {
  return (
    <Board>
      <Rename />
      <Billing />
    </Board>
  )
}
