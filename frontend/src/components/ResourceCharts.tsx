"use client"

import { useMemo } from "react"

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MetricsHistoryPoint } from "@/src/hooks/useSystemDiagnostics"

type ResourceChartsProps = {
  history: MetricsHistoryPoint[]
}

function formatLabel(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, { hour12: false, minute: "2-digit", second: "2-digit" })
  } catch {
    return timestamp
  }
}

export function ResourceCharts({ history }: ResourceChartsProps) {
  const timeSeries = useMemo(
    () =>
      history.map((point) => ({
        ...point,
        label: formatLabel(point.timestamp),
      })),
    [history],
  )

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="border border-brand/15 bg-black/40">
        <CardHeader className="border-b border-brand/15 pb-3">
          <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">Compute Utilisation</CardTitle>
        </CardHeader>
        <CardContent className="h-72 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(243,91,4,0.12)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
              <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(5,5,5,0.92)",
                  border: "1px solid rgba(243,91,4,0.3)",
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="cpu" stroke="rgba(243,91,4,0.85)" strokeWidth={2} dot={false} name="CPU %" />
              <Line type="monotone" dataKey="memory" stroke="rgba(0,255,170,0.75)" strokeWidth={2} dot={false} name="Memory %" />
              <Line type="monotone" dataKey="gpu" stroke="rgba(80,200,255,0.85)" strokeWidth={2} dot={false} name="GPU %" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border border-brand/15 bg-black/40">
        <CardHeader className="border-b border-brand/15 pb-3">
          <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">Cache & Latency</CardTitle>
        </CardHeader>
        <CardContent className="h-72 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeSeries}>
              <defs>
                <linearGradient id="cacheGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(243,91,4,0.4)" />
                  <stop offset="100%" stopColor="rgba(243,91,4,0.05)" />
                </linearGradient>
                <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(0,255,170,0.35)" />
                  <stop offset="100%" stopColor="rgba(0,255,170,0.05)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,170,0.12)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} domain={[0, 100]} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }}
                domain={[0, "auto"]}
                allowDataOverflow
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(5,5,5,0.92)",
                  border: "1px solid rgba(0,255,170,0.3)",
                }}
              />
              <Legend />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="cacheHit"
                stroke="rgba(243,91,4,0.85)"
                fill="url(#cacheGradient)"
                name="Cache Hit %"
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="latency"
                stroke="rgba(0,255,170,0.85)"
                fill="url(#latencyGradient)"
                name="Latency ms"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

export default ResourceCharts

"use client"

import { memo, useMemo } from "react"

import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import type { MetricsHistoryPoint } from "@/src/hooks/useSystemDiagnostics"

type ResourceChartsProps = {
  data: MetricsHistoryPoint[]
}

function formatLabel(timestamp: string) {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString(undefined, { minute: "2-digit", second: "2-digit" })
  } catch {
    return timestamp.slice(11, 19)
  }
}

function ResourceChartsComponent({ data }: ResourceChartsProps) {
  const chartData = useMemo(() => data.slice(-60), [data])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-brand/20 bg-black/40 p-4">
        <h3 className="mb-4 text-xs font-mono uppercase tracking-[0.3em] text-muted">CPU / MEMORY / GPU</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(243,91,4,0.15)" />
              <XAxis dataKey="timestamp" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }} tickFormatter={formatLabel} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "rgba(5,5,5,0.92)", border: "1px solid rgba(243,91,4,0.35)", color: "#fff" }}
                labelFormatter={formatLabel}
              />
              <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.3em" }} />
              <Line type="monotone" dataKey="cpu" stroke="rgba(0,255,170,0.85)" strokeWidth={2} dot={false} name="CPU" />
              <Line type="monotone" dataKey="memory" stroke="rgba(243,91,4,0.85)" strokeWidth={2} dot={false} name="Memory" />
              <Line type="monotone" dataKey="gpu" stroke="rgba(120,94,255,0.85)" strokeWidth={2} dot={false} name="GPU" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-brand/20 bg-black/40 p-4">
        <h3 className="mb-4 text-xs font-mono uppercase tracking-[0.3em] text-muted">CACHE HIT / LATENCY</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="cacheGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgba(0,255,170,0.8)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="rgba(0,255,170,0.3)" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(243,91,4,0.15)" />
              <XAxis dataKey="timestamp" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }} tickFormatter={formatLabel} />
              <YAxis yAxisId="percentage" domain={[0, 100]} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
              <YAxis yAxisId="latency" orientation="right" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "rgba(5,5,5,0.92)", border: "1px solid rgba(243,91,4,0.35)", color: "#fff" }}
                labelFormatter={formatLabel}
                formatter={(value: number, name: string) => {
                  if (typeof value !== "number" || Number.isNaN(value)) {
                    return ["--", name === "cacheHit" ? "Cache Hit" : "Latency"]
                  }
                  const suffix = name === "cacheHit" ? "%" : " ms"
                  const label = name === "cacheHit" ? "Cache Hit" : "Latency"
                  return [`${value.toFixed(1)}${suffix}`, label]
                }}
              />
              <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.3em" }} />
              <Area
                yAxisId="percentage"
                type="monotone"
                dataKey="cacheHit"
                stroke="rgba(0,255,170,0.85)"
                fill="url(#cacheGradient)"
                fillOpacity={1}
                name="Cache Hit"
              />
              <Line
                yAxisId="latency"
                type="natural"
                dataKey="latency"
                stroke="rgba(243,91,4,0.95)"
                strokeWidth={2}
                dot={false}
                name="Latency"
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export const ResourceCharts = memo(ResourceChartsComponent)
export default ResourceCharts


