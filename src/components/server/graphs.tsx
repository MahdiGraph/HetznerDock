"use client"

import * as React from "react"
import { Area, AreaChart, XAxis, YAxis } from "recharts"
import { Tile } from "@/components/board"
import { ErrorNote, Loading } from "@/components/common"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useHz } from "@/hooks/use-api"
import { formatBits, formatBytes, formatNumber } from "@/lib/format"
import { get } from "@/lib/summary"
import { useServer } from "./context"

type Series = { values?: [number, string][] }
type MetricsResponse = { metrics?: { step?: number; time_series?: Record<string, Series> } }
type Row = { t: number } & Record<string, number>

const HOUR = 3600 * 1000
const RANGES: Record<string, { ms: number; label: string }> = {
  "1h": { ms: HOUR, label: "Last hour" },
  "24h": { ms: 24 * HOUR, label: "Last 24 hours" },
  "7d": { ms: 7 * 24 * HOUR, label: "Last 7 days" },
  "30d": { ms: 30 * 24 * HOUR, label: "Last 30 days" },
}

/** Folds the named time series of a metrics response into rows keyed by time. */
function toRows(series: Record<string, Series> | undefined, names: Record<string, string>, scale: (v: number) => number = (v) => v): Row[] {
  const rows = new Map<number, Row>()
  for (const [key, name] of Object.entries(names)) {
    for (const [ts, value] of series?.[key]?.values ?? []) {
      const t = Math.round(Number(ts) * 1000)
      const row = rows.get(t) ?? ({ t } as Row)
      const n = Number(value)
      row[name] = Number.isFinite(n) ? scale(n) : 0
      rows.set(t, row)
    }
  }
  return [...rows.values()].sort((a, b) => a.t - b.t)
}

function Chart({ rows, config, format, range }: { rows: Row[]; config: ChartConfig; format: (v: number) => string; range: string }) {
  const tick = (t: number) => {
    const d = new Date(t)
    return range === "1h" || range === "24h"
      ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
  }
  if (!rows.length) return <p className="prose-serif py-10 text-base text-muted-foreground">No data for this period.</p>
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={rows} margin={{ left: 4, right: 4, top: 8 }}>
        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={40} tickMargin={8} />
        <YAxis tickFormatter={(v) => format(Number(v))} width={84} tickLine={false} axisLine={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.t
                return t ? new Date(t).toLocaleString() : ""
              }}
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-6">
                  <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
                  <span className="font-medium tabular">{format(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        {Object.keys(config).map((key) => (
          <Area
            key={key}
            dataKey={key}
            type="monotone"
            stroke={`var(--color-${key})`}
            fill={`var(--color-${key})`}
            fillOpacity={0.18}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
        {Object.keys(config).length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </AreaChart>
    </ChartContainer>
  )
}

function useMetrics(type: "cpu" | "disk" | "network", range: string, now: number) {
  const { project, id } = useServer()
  return useHz<MetricsResponse>(project, id, "metrics", {
    type,
    start: new Date(now - RANGES[range].ms).toISOString(),
    end: new Date(now).toISOString(),
  })
}

function Panel({
  title,
  note,
  controls,
  children,
}: {
  title: string
  note?: React.ReactNode
  controls?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Tile className="lg:p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="display text-3xl">{title}</h2>
          {note ? <p className="mt-2 text-sm text-muted-foreground">{note}</p> : null}
        </div>
        {controls ? <div className="flex flex-wrap gap-2">{controls}</div> : null}
      </div>
      {children}
    </Tile>
  )
}

function Switcher({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList>
        {options.map(([v, label]) => (
          <TabsTrigger key={v} value={v} className="px-3">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

const cpuConfig = { cpu: { label: "CPU", color: "var(--chart-1)" } } satisfies ChartConfig
const netConfig = { in: { label: "In", color: "var(--chart-2)" }, out: { label: "Out", color: "var(--chart-1)" } } satisfies ChartConfig
const diskConfig = { read: { label: "Read", color: "var(--chart-2)" }, write: { label: "Write", color: "var(--chart-1)" } } satisfies ChartConfig

function Cpu({ range, now }: { range: string; now: number }) {
  const { server } = useServer()
  const cores = Number(get(server, "server_type.cores")) || 1
  const data = useMetrics("cpu", range, now)
  // Hetzner reports 100 per busy vCPU; divide so 100% means every vCPU is busy.
  const rows = toRows(data.data?.metrics?.time_series, { cpu: "cpu" }, (v) => v / cores)
  return (
    <Panel title="CPU" note={`100% means all ${cores} vCPU${cores === 1 ? " is" : "s are"} busy.`}>
      <ErrorNote error={data.error} />
      {data.isLoading && !data.data ? <Loading /> : <Chart rows={rows} config={cpuConfig} format={(v) => `${v.toFixed(v < 10 ? 1 : 0)}%`} range={range} />}
    </Panel>
  )
}

function NetworkGraph({ range, now }: { range: string; now: number }) {
  const [view, setView] = React.useState("bandwidth")
  const data = useMetrics("network", range, now)
  const series = data.data?.metrics?.time_series
  const rows =
    view === "bandwidth"
      ? toRows(series, { "network.0.bandwidth.in": "in", "network.0.bandwidth.out": "out" }, (v) => v * 8)
      : toRows(series, { "network.0.pps.in": "in", "network.0.pps.out": "out" })
  return (
    <Panel
      title="Network"
      note="The public interface."
      controls={<Switcher value={view} onChange={setView} options={[["bandwidth", "Bandwidth"], ["pps", "Packets"]]} />}
    >
      <ErrorNote error={data.error} />
      {data.isLoading && !data.data ? (
        <Loading />
      ) : (
        <Chart rows={rows} config={netConfig} format={view === "bandwidth" ? formatBits : (v) => `${formatNumber(v)}/s`} range={range} />
      )}
    </Panel>
  )
}

function Disk({ range, now }: { range: string; now: number }) {
  const [view, setView] = React.useState("bandwidth")
  const data = useMetrics("disk", range, now)
  const series = data.data?.metrics?.time_series
  const rows =
    view === "bandwidth"
      ? toRows(series, { "disk.0.bandwidth.read": "read", "disk.0.bandwidth.write": "write" })
      : toRows(series, { "disk.0.iops.read": "read", "disk.0.iops.write": "write" })
  return (
    <Panel
      title="Disk"
      controls={<Switcher value={view} onChange={setView} options={[["bandwidth", "Throughput"], ["iops", "IOPS"]]} />}
    >
      <ErrorNote error={data.error} />
      {data.isLoading && !data.data ? (
        <Loading />
      ) : (
        <Chart
          rows={rows}
          config={diskConfig}
          format={view === "bandwidth" ? (v) => `${formatBytes(v)}/s` : (v) => `${formatNumber(v)} IOPS`}
          range={range}
        />
      )}
    </Panel>
  )
}

export function Graphs() {
  const [range, setRange] = React.useState("24h")
  // Rounded to the minute so the requests (and their cache keys) stay the same between renders.
  const [now, setNow] = React.useState(() => Math.floor(Date.now() / 60_000) * 60_000)
  return (
    <div className="grid gap-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Hetzner keeps 30 days of measurements.</p>
        <Select
          value={range}
          onValueChange={(v) => {
            setRange(v)
            setNow(Math.floor(Date.now() / 60_000) * 60_000)
          }}
        >
          <SelectTrigger className="w-44 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RANGES).map(([v, r]) => (
              <SelectItem key={v} value={v}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Cpu range={range} now={now} />
      <NetworkGraph range={range} now={now} />
      <Disk range={range} now={now} />
    </div>
  )
}
