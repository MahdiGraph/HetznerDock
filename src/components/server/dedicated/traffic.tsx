"use client"

import * as React from "react"
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react"
import { Bar, BarChart, XAxis, YAxis } from "recharts"
import { Board, Facts, Tile } from "@/components/board"
import { ErrorNote, Loading } from "@/components/common"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRobot } from "@/hooks/use-api"
import { formatBytes } from "@/lib/format"
import type { TrafficPeriod, TrafficReport } from "@/lib/robot-types"
import { useDedicated } from "./context"

const config = { out: { label: "Out", color: "var(--chart-1)" }, in: { label: "In", color: "var(--chart-2)" } } satisfies ChartConfig

const PERIODS: [TrafficPeriod, string][] = [
  ["day", "Day"],
  ["month", "Month"],
  ["year", "Year"],
]

/** Robot names hours, days and months in its own calendar; the panel shows them as they are, in UTC. */
const utc = (t: number, opts: Intl.DateTimeFormatOptions) => new Date(t).toLocaleString(undefined, { ...opts, timeZone: "UTC" })

function current(period: TrafficPeriod) {
  const now = new Date().toISOString()
  return period === "day" ? now.slice(0, 10) : period === "month" ? now.slice(0, 7) : now.slice(0, 4)
}

function step(period: TrafficPeriod, date: string, delta: number) {
  if (period === "day") {
    const d = new Date(`${date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + delta)
    return d.toISOString().slice(0, 10)
  }
  if (period === "month") {
    const [y, m] = date.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
  }
  return String(Number(date) + delta)
}

function title(period: TrafficPeriod, date: string) {
  if (period === "day") return utc(Date.parse(`${date}T00:00:00Z`), { day: "numeric", month: "long", year: "numeric" })
  if (period === "month") return utc(Date.parse(`${date}-01T00:00:00Z`), { month: "long", year: "numeric" })
  return date
}

/** Every hour, day or month of the period that has begun, with Robot's numbers where it has them. */
function slots(report: TrafficReport) {
  const [y, m, d] = report.date.split("-").map(Number)
  const starts: number[] = []
  if (report.period === "day") for (let h = 0; h < 24; h++) starts.push(Date.UTC(y, m - 1, d, h))
  else if (report.period === "month") for (let day = 1; day <= new Date(Date.UTC(y, m, 0)).getUTCDate(); day++) starts.push(Date.UTC(y, m - 1, day))
  else for (let month = 0; month < 12; month++) starts.push(Date.UTC(y, month, 1))
  const known = new Map(report.rows.map((r) => [r.t, r]))
  return starts
    .filter((t) => t <= Date.now())
    .map((t) => ({
      t,
      label:
        report.period === "day"
          ? utc(t, { hour: "2-digit", minute: "2-digit" })
          : report.period === "month"
            ? utc(t, { day: "numeric" })
            : utc(t, { month: "short" }),
      in: known.get(t)?.in ?? 0,
      out: known.get(t)?.out ?? 0,
    }))
}

export function DedicatedTraffic() {
  const { project, id, server } = useDedicated()
  const [period, setPeriod] = React.useState<TrafficPeriod>("month")
  const [date, setDate] = React.useState(() => current("month"))
  const report = useRobot<TrafficReport>(project, id, "traffic", { period, date })
  const data = report.data && report.data.period === period && report.data.date === date ? report.data : undefined
  const rows = data ? slots(data) : []
  const latest = date === current(period)
  const included = server.traffic ? (server.traffic.toLowerCase() === "unlimited" ? "Unlimited" : `${server.traffic} a month`) : null

  return (
    <Board>
      <Tile className="col-span-12 lg:col-span-8 lg:p-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="display text-3xl">{title(period, date)}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Traffic of all the server&apos;s addresses, per {period === "day" ? "hour" : period === "month" ? "day" : "month"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              value={period}
              onValueChange={(v) => {
                setPeriod(v as TrafficPeriod)
                setDate(current(v as TrafficPeriod))
              }}
            >
              <TabsList>
                {PERIODS.map(([value, label]) => (
                  <TabsTrigger key={value} value={value} className="px-3">
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button variant="secondary" size="icon" aria-label="Earlier" onClick={() => setDate(step(period, date, -1))}>
              <CaretLeftIcon />
            </Button>
            <Button variant="secondary" size="icon" aria-label="Later" disabled={latest} onClick={() => setDate(step(period, date, 1))}>
              <CaretRightIcon />
            </Button>
          </div>
        </div>
        <ErrorNote error={report.error} />
        {!data && !report.error ? (
          <Loading label="Asking Robot for the traffic…" />
        ) : data && !rows.some((r) => r.in || r.out) ? (
          <p className="prose-serif py-10 text-base text-muted-foreground">No traffic recorded for this period yet.</p>
        ) : data ? (
          <ChartContainer config={config} className="aspect-auto h-64 w-full">
            <BarChart data={rows} margin={{ left: 4, right: 4, top: 8 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
              <YAxis tickFormatter={(v) => formatBytes(Number(v), { binary: true })} width={84} tickLine={false} axisLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const t = payload?.[0]?.payload?.t
                      if (!t) return ""
                      return period === "day"
                        ? utc(t, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                        : period === "month"
                          ? utc(t, { day: "numeric", month: "long" })
                          : utc(t, { month: "long", year: "numeric" })
                    }}
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-6">
                        <span className="text-muted-foreground">{config[name as keyof typeof config]?.label ?? String(name)}</span>
                        <span className="font-medium tabular">{formatBytes(Number(value), { binary: true })}</span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="out" fill="var(--color-out)" isAnimationActive={false} />
              <Bar dataKey="in" fill="var(--color-in)" isAnimationActive={false} />
              <ChartLegend content={<ChartLegendContent />} />
            </BarChart>
          </ChartContainer>
        ) : null}
      </Tile>
      <Tile tone="tile" className="col-span-12 lg:col-span-4 lg:p-8">
        <h2 className="display text-xl">In this period</h2>
        <p className="display mt-6 text-4xl tabular">{data ? formatBytes(data.total.out, { binary: true }) : "—"}</p>
        <p className="mt-1 text-sm text-muted-foreground">out</p>
        <Facts
          className="mt-6"
          items={[
            ["Incoming", data ? formatBytes(data.total.in, { binary: true }) : null],
            ["Included", included],
          ]}
        />
        <p className="mt-6 text-[13px] text-muted-foreground">
          Robot counts an hour, a day or a month once it is over, so the latest one fills in later.
        </p>
      </Tile>
    </Board>
  )
}
