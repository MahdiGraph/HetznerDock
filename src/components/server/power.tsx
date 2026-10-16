"use client"

import { ArrowClockwiseIcon, CaretDownIcon, MonitorIcon, PlayIcon, PowerIcon } from "@phosphor-icons/react"
import { Tile, TileLabel } from "@/components/board"
import { ConfirmAction, StateMark, useAction } from "@/components/common"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { consoleHref, hzCall } from "@/lib/client"
import type { HzAction } from "@/lib/hz-types"
import { TRANSITIONAL } from "@/lib/summary"
import { cn } from "@/lib/utils"
import { useServer } from "./context"

const LABELS: Record<string, { pending: string; success: string; sent: string }> = {
  poweron: { pending: "Powering on…", success: "The server is on", sent: "Power on sent" },
  reboot: { pending: "Rebooting…", success: "Reboot sent to the system", sent: "Reboot sent" },
  shutdown: { pending: "Shutting down…", success: "Shutdown sent to the system", sent: "Shutdown sent" },
  reset: { pending: "Resetting…", success: "The server was reset", sent: "Reset sent" },
  poweroff: { pending: "Powering off…", success: "The server is off", sent: "Power off sent" },
}

/** Opens the console in its own window; the page there asks Hetzner for the connection. */
export function openConsole(project: number, id: number) {
  window.open(consoleHref(project, id), `hzdock-console-${project}-${id}`, "noopener")
}

export function PowerTile({ className }: { className?: string }) {
  const { server, project, id, refresh, watch, can } = useServer()
  const { busy, run } = useAction()
  const status = String(server.status ?? "unknown")
  const running = status === "running"
  const moving = TRANSITIONAL.includes(status)

  const act = (command: string) =>
    run(command, async () => {
      const res = await hzCall<{ action?: HzAction }>(project, id, "POST", `actions/${command}`)
      refresh()
      watch(res.action, LABELS[command])
    })

  return (
    <Tile className={cn("flex flex-col justify-between gap-6", className)}>
      <TileLabel>State</TileLabel>
      <div>
        <StateMark state={status} className="display text-3xl [&>span:first-child]:size-3.5" />
        <div className="mt-5 flex flex-wrap gap-2">
          {moving ? (
            <Button disabled>
              <Spinner /> Working…
            </Button>
          ) : running ? (
            <ConfirmAction
              title="Reboot the server?"
              description="Hetzner asks the operating system to restart, like pressing the power button briefly. If the system hangs, use Reset instead."
              confirmLabel="Reboot"
              onConfirm={() => act("reboot")}
            >
              <Button disabled={!!busy || moving}>
                {busy === "reboot" ? <Spinner /> : <ArrowClockwiseIcon />} Reboot
              </Button>
            </ConfirmAction>
          ) : (
            <Button disabled={!!busy || status !== "off"} onClick={() => act("poweron")}>
              {busy === "poweron" ? <Spinner /> : <PlayIcon />} Power on
            </Button>
          )}
          {running ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" disabled={!!busy || moving}>
                  <PowerIcon /> Stop <CaretDownIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel className="text-[13px] font-normal text-muted-foreground">The system is told first</DropdownMenuLabel>
                <ConfirmAction
                  title="Shut the server down?"
                  description="Hetzner asks the operating system to shut down cleanly. The server stays off until someone powers it on."
                  confirmLabel="Shut down"
                  onConfirm={() => act("shutdown")}
                >
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Shut down</DropdownMenuItem>
                </ConfirmAction>
                <DropdownMenuLabel className="text-[13px] font-normal text-muted-foreground">Like pulling the plug</DropdownMenuLabel>
                <ConfirmAction
                  title="Reset the server?"
                  description="The power is cut and turned back on at once. Unsaved data on the server can be lost. Use it when the system no longer answers."
                  confirmLabel="Reset"
                  destructive
                  onConfirm={() => act("reset")}
                >
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Reset (hard reboot)</DropdownMenuItem>
                </ConfirmAction>
                <ConfirmAction
                  title="Power the server off?"
                  description="The power is cut without telling the system. Unsaved data can be lost. The server stays off until someone powers it on."
                  confirmLabel="Power off"
                  destructive
                  onConfirm={() => act("poweroff")}
                >
                  <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                    Power off (hard)
                  </DropdownMenuItem>
                </ConfirmAction>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {can("console") ? (
            <Button variant="secondary" onClick={() => openConsole(project, id)}>
              <MonitorIcon /> Console
            </Button>
          ) : null}
        </div>
      </div>
    </Tile>
  )
}
