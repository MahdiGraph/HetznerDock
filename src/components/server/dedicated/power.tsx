"use client"

import * as React from "react"
import { ArrowClockwiseIcon, CaretDownIcon, PowerIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Tile, TileLabel } from "@/components/board"
import { ConfirmAction, StateMark, useAction } from "@/components/common"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { robotCall } from "@/lib/client"
import { RESET_META, type ResetType } from "@/lib/robot-types"
import { cn } from "@/lib/utils"
import { useDedicated } from "./context"

const SENT: Record<ResetType, string> = {
  sw: "Ctrl+Alt+Del sent",
  hw: "The server is being reset",
  power: "Power button pressed",
  power_long: "Power button held: the server turns off",
  man: "A technician will reset the server",
}

/** The reset menu, grouped by how hard each one is on the running system. */
const GROUPS: { label: string; types: ResetType[] }[] = [
  { label: "Through the system", types: ["sw"] },
  { label: "At once, like a button on the case", types: ["hw", "power", "power_long"] },
  { label: "By hand", types: ["man"] },
]

export function DedicatedPowerTile({ className }: { className?: string }) {
  const { server, project, id, reset, refresh } = useDedicated()
  const { busy, run } = useAction()
  const types = reset?.types ?? []
  const state = reset?.operatingStatus ?? server.status ?? "unknown"

  const send = (type: ResetType) =>
    run(type, async () => {
      await robotCall(project, id, "POST", "reset", { type })
      toast.success(SENT[type])
      // Robot reports the new power state after a moment.
      setTimeout(refresh, 6000)
    })

  return (
    <Tile className={cn("flex flex-col justify-between gap-6", className)}>
      <TileLabel>State</TileLabel>
      <div>
        <StateMark state={state} className="display text-3xl [&>span:first-child]:size-3.5" />
        <div className="mt-5 flex flex-wrap gap-2">
          {!reset ? (
            <Button disabled>
              <Spinner /> Reset
            </Button>
          ) : types.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={!!busy}>
                  {busy && busy !== "wol" ? <Spinner /> : <ArrowClockwiseIcon />} Reset <CaretDownIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {GROUPS.map((group) => {
                  const offered = group.types.filter((t) => types.includes(t))
                  if (!offered.length) return null
                  return (
                    <React.Fragment key={group.label}>
                      <DropdownMenuLabel className="text-[13px] font-normal text-muted-foreground">{group.label}</DropdownMenuLabel>
                      {offered.map((type) => (
                        <ConfirmAction
                          key={type}
                          title={`${RESET_META[type].label}?`}
                          description={RESET_META[type].description}
                          confirmLabel={RESET_META[type].label}
                          destructive={type !== "sw"}
                          onConfirm={() => send(type)}
                        >
                          <DropdownMenuItem
                            variant={type === "power_long" ? "destructive" : "default"}
                            onSelect={(e) => e.preventDefault()}
                          >
                            {RESET_META[type].label}
                          </DropdownMenuItem>
                        </ConfirmAction>
                      ))}
                    </React.Fragment>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <p className="text-sm text-muted-foreground">Robot cannot reset this server.</p>
          )}
          {server.features?.wol ? (
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() =>
                run(
                  "wol",
                  async () => {
                    await robotCall(project, id, "POST", "wol")
                    setTimeout(refresh, 6000)
                  },
                  "Wake on LAN packet sent"
                )
              }
            >
              {busy === "wol" ? <Spinner /> : <PowerIcon />} Wake on LAN
            </Button>
          ) : null}
        </div>
      </div>
    </Tile>
  )
}
