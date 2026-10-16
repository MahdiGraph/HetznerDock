"use client"

import * as React from "react"
import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { Board, Tile } from "@/components/board"
import { ErrorNote, Loading, useAction } from "@/components/common"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { useHz } from "@/hooks/use-api"
import { hzCall } from "@/lib/client"
import type { HzAction, IsoInfo } from "@/lib/hz-types"
import { get } from "@/lib/summary"
import { cn } from "@/lib/utils"
import { useServer } from "./context"
import { openConsole } from "./power"
import { Aside } from "./parts"

export function Iso() {
  const { server, project, id, refresh, watch, can } = useServer()
  const arch = String(get(server, "server_type.architecture") ?? "x86")
  const isos = useHz<{ isos: IsoInfo[] }>(project, id, "isos", { arch })
  const [query, setQuery] = React.useState("")
  const [isoId, setIsoId] = React.useState<number | null>(null)
  const { busy, run } = useAction()
  const current = server.iso as { id?: number; name?: string | null; description?: string } | null

  const list = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = isos.data?.isos ?? []
    return q ? all.filter((i) => `${i.description} ${i.name ?? ""}`.toLowerCase().includes(q)) : all
  }, [isos.data, query])
  const chosen = isos.data?.isos.find((i) => i.id === isoId)

  return (
    <Board>
      <Tile className="col-span-12 lg:col-span-8 lg:p-8">
        <h2 className="display text-3xl">ISO image</h2>
        <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
          Put an installer or tool ISO in the server&apos;s virtual CD drive, then restart and install through the console.
          The server boots from the ISO first while it is attached.
        </p>
        {current?.id ? (
          <div className="mt-6 flex flex-col gap-3 bg-tile p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base">
              In the drive: <span className="font-medium">{current.description || current.name}</span>
            </p>
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() =>
                run("detach", async () => {
                  const res = await hzCall<{ action?: HzAction }>(project, id, "POST", "actions/detach_iso")
                  watch(res.action, { pending: "Ejecting the ISO…", success: "ISO ejected" })
                  refresh()
                })
              }
            >
              {busy === "detach" ? <Spinner /> : null} Eject
            </Button>
          </div>
        ) : null}
        <ErrorNote error={isos.error} className="mt-4" />
        {isos.isLoading && !isos.data ? (
          <Loading label="Loading ISO images…" />
        ) : isos.data ? (
          <div className="mt-6 grid max-w-2xl gap-3">
            <InputGroup className="h-9 bg-background">
              <InputGroupAddon>
                <MagnifyingGlassIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder={`Search ${isos.data.isos.length} images, for example Windows or FreeBSD`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </InputGroup>
            <div role="radiogroup" aria-label="ISO images" className="grid max-h-80 gap-1 overflow-y-auto">
              {list.map((iso) => (
                <button
                  key={iso.id}
                  type="button"
                  role="radio"
                  aria-checked={iso.id === isoId}
                  onClick={() => setIsoId(iso.id)}
                  className={cn(
                    "px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    iso.id === isoId ? "bg-primary text-primary-foreground" : "bg-tile hover:bg-accent"
                  )}
                >
                  {iso.description}
                  {iso.type === "private" ? <span className="opacity-70"> · private</span> : null}
                </button>
              ))}
              {!list.length ? <p className="text-sm text-muted-foreground">No ISO matches.</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!chosen || !!busy}
                onClick={() =>
                  run("attach", async () => {
                    const res = await hzCall<{ action?: HzAction }>(project, id, "POST", "iso", { iso: chosen!.id })
                    watch(res.action, { pending: "Inserting the ISO…", success: `${chosen!.description} is in the drive` })
                    refresh()
                  })
                }
              >
                {busy === "attach" ? <Spinner /> : null} {current?.id ? "Swap ISO" : "Insert ISO"}
              </Button>
              {can("console") ? (
                <Button variant="secondary" onClick={() => openConsole(project, id)}>
                  Open console
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Tile>
      <Aside title="Booting from it">
        <p>After inserting, reset the server from the State tile and watch the console: it starts the ISO.</p>
        <p>Eject the ISO when the installation is done, or the server keeps starting the installer.</p>
        <p>An ISO only fits servers of the same processor architecture; this list shows the ones that fit.</p>
      </Aside>
    </Board>
  )
}
