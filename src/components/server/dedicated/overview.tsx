"use client"

import * as React from "react"
import { Board, Facts, Tile } from "@/components/board"
import { Flag } from "@/components/flag"
import { formatDate, humanize } from "@/lib/format"
import { countryName } from "@/lib/geo"
import { useDedicated, rescueLabel } from "./context"
import { SectionTitle } from "../parts"

const offered = (value: boolean | undefined) => (value === undefined ? null : value ? "Yes" : "No")

/** What the server boots next: its disks, or what is set up in Robot. */
export function nextBoot(boot: ReturnType<typeof useDedicated>["boot"]): string | null {
  if (!boot) return null
  if (boot.active === "rescue") return rescueLabel(boot.rescue?.activeOs ?? "linux")
  if (boot.active === "linux") return `Install ${boot.linux?.activeDist ?? "Linux"}`
  if (boot.active === "vnc") return "A VNC installation"
  if (boot.active === "windows") return "A Windows installation"
  return "From its disks"
}

export function DedicatedOverview() {
  const { server, isAdmin, boot } = useDedicated()
  const traffic = server.traffic ? (server.traffic.toLowerCase() === "unlimited" ? "Unlimited" : `${server.traffic} a month`) : null
  const features = server.features ?? undefined

  const plan: [string, React.ReactNode][] = [
    ["Product", server.product],
    ["Server number", <span key="n" className="tabular">#{server.number}</span>],
    ["Status", server.status ? humanize(server.status.replace(/\s+/g, "_")) : null],
    ["Included traffic", traffic],
    ["Next boot", nextBoot(boot)],
    ["Rescue system", offered(features?.rescue)],
    ["Reset through Robot", offered(features?.reset)],
    ["Wake on LAN", offered(features?.wol)],
  ]
  if (isAdmin) {
    plan.push(["Paid until", server.paidUntil ? formatDate(server.paidUntil) : null])
    plan.push(["Cancelled", server.cancelled ? "Yes" : "No"])
  }

  return (
    <Board>
      <Tile className="col-span-12 lg:col-span-7">
        <SectionTitle>Server</SectionTitle>
        <Facts items={plan} />
        {isAdmin ? <p className="mt-6 text-[13px] text-muted-foreground">Only admins see when the server is paid until and whether it is cancelled.</p> : null}
      </Tile>
      <Tile tone="tile" className="col-span-12 lg:col-span-5">
        <SectionTitle>Location</SectionTitle>
        <Facts
          items={[
            ["City", server.city],
            [
              "Country",
              server.country ? (
                <span key="c">
                  <Flag country={server.country} className="mr-1.5" />
                  {countryName(server.country)}
                </span>
              ) : null,
            ],
            ["Data center", server.dc],
          ]}
        />
      </Tile>
    </Board>
  )
}
