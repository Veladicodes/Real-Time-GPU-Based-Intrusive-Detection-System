"use client"

import { useMemo, useState } from "react"

import { Area, AreaChart, Bar, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import type { FeatureDistribution as FeatureDistributionType } from "@/src/hooks/useModelInsights"

type FeatureDistributionProps = {
  feature: string | null
  distribution: FeatureDistributionType | null
  loading?: boolean
  onRefresh?: () => void
}

const DEFAULT_PERCENTILES = ["10", "25", "50", "75", "90"]

function toDensity(counts: number[]): number[] {
  const total = counts.reduce((acc, value) => acc + value, 0) || 1
  return counts.map((value) => value / total)
}

export function FeatureDistribution({ feature, distribution, loading = false, onRefresh }: FeatureDistributionProps) {
  const [viewMode, setViewMode] = useState<"count" | "density">("count")

  const chartData = useMemo(() => {
    if (!distribution) return []
    const bins = distribution.histogram_bins
    const counts = viewMode === "count" ? distribution.counts : toDensity(distribution.counts)
    return bins.map((bin, index) => ({
      bucket: bin,
      count: counts[index] ?? 0,
    }))
  }, [distribution, viewMode])

  const handleDownload = () => {
    if (!distribution) return
    const header = "bucket,count\n"
    const rows = chartData.map((row) => `${row.bucket},${row.count}`)
    const csv = `${header}${rows.join("\n")}`
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${distribution.feature}_distribution.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const percentiles = distribution?.sample_percentiles ?? {}

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted">Feature Distribution</span>
          <strong className="font-mono text-sm tracking-[0.3em] text-brand">{feature ?? "Select a feature"}</strong>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant={viewMode === "count" ? "default" : "ghost"}
            className="h-7 px-3 text-[11px] font-mono uppercase tracking-[0.25em]"
            onClick={() => setViewMode("count")}
          >
            Counts
          </Button>
          <Button
            size="xs"
            variant={viewMode === "density" ? "default" : "ghost"}
            className="h-7 px-3 text-[11px] font-mono uppercase tracking-[0.25em]"
            onClick={() => setViewMode("density")}
          >
            Density
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="h-7 rounded border border-brand/20 px-3 text-[11px] font-mono uppercase tracking-[0.25em]"
            onClick={handleDownload}
            disabled={!distribution}
          >
            Download
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="h-7 rounded border border-brand/20 px-3 text-[11px] font-mono uppercase tracking-[0.25em]"
            onClick={onRefresh}
            disabled={!feature || loading}
          >
            Refresh
          </Button>
        </div>
      </div>
      <div className="flex-1 rounded-lg border border-brand/10 bg-black/40 p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted">Loading…</span>
          </div>
        ) : distribution ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <defs>
                <linearGradient id="distributionGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(243,91,4,0.4)" />
                  <stop offset="100%" stopColor="rgba(243,91,4,0.05)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(243,91,4,0.12)" />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }}
                stroke="rgba(243,91,4,0.2)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }}
                stroke="rgba(243,91,4,0.2)"
                domain={["auto", "auto"]}
              />
              {DEFAULT_PERCENTILES.map((percentile) => {
                const value = percentiles[percentile]
                if (value === undefined) return null
                return (
                  <ReferenceLine
                    key={percentile}
                    x={value}
                    stroke="rgba(0,255,170,0.4)"
                    strokeDasharray="4 4"
                    label={{
                      value: `${percentile}th`,
                      position: "top",
                      fill: "rgba(0,255,170,0.7)",
                      style: { fontSize: 10, fontFamily: "JetBrains Mono" },
                    }}
                  />
                )
              })}
              <Tooltip
                cursor={{ stroke: "rgba(243,91,4,0.25)" }}
                contentStyle={{
                  backgroundColor: "rgba(5,5,5,0.92)",
                  border: "1px solid rgba(243,91,4,0.25)",
                  borderRadius: "8px",
                  padding: "10px",
                }}
                labelFormatter={(label) => `${feature} ≈ ${Number(label).toFixed(2)}`}
                formatter={(value: number) => [
                  viewMode === "density" ? value.toFixed(4) : value.toFixed(0),
                  viewMode === "density" ? "Density" : "Count",
                ]}
              />
              <Area type="monotone" dataKey="count" stroke="rgba(243,91,4,0.6)" fill="url(#distributionGradient)" />
              <Bar dataKey="count" fill="rgba(243,91,4,0.25)" barSize={8} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted">
              Select a feature to view distribution
            </span>
          </div>
        )}
      </div>
      {distribution && (
        <div className="grid grid-cols-2 gap-3 rounded border border-brand/10 bg-black/30 p-3 text-xs font-mono tracking-[0.2em] text-muted">
          <div>
            <strong className="block text-brand">Percentiles</strong>
            <div className="mt-1 space-y-1">
              {DEFAULT_PERCENTILES.map((percentile) => (
                <div key={percentile} className="flex items-center justify-between text-[11px]">
                  <span>{percentile}th</span>
                  <span>{percentiles[percentile]?.toFixed(2) ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <strong className="block text-brand">Stats</strong>
            <div className="mt-1 space-y-1 text-[11px]">
              {Object.entries(distribution.statistics).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span>{key}</span>
                  <span>{value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FeatureDistribution


