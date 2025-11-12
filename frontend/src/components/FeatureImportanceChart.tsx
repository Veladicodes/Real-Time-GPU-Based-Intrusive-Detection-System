"use client"

import { useMemo } from "react"

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import type { FeatureImportancePoint } from "@/src/hooks/useModelInsights"

type FeatureImportanceChartProps = {
  data: FeatureImportancePoint[]
  onSelect?: (feature: FeatureImportancePoint) => void
  onExportCsv?: (csv: string) => void
  highlight?: string | null
  compareMode?: boolean
}

function formatCsv(data: FeatureImportancePoint[]): string {
  const header = "feature,score,normalized_score\n"
  const rows = data.map((item) => `${item.name},${item.score},${item.normalized_score}`)
  return `${header}${rows.join("\n")}`
}

export function FeatureImportanceChart({
  data,
  onSelect,
  onExportCsv,
  highlight = null,
  compareMode = false,
}: FeatureImportanceChartProps) {
  const chartData = useMemo(
    () =>
      data
        .slice()
        .sort((a, b) => b.normalized_score - a.normalized_score)
        .map((item, index) => ({
          ...item,
          display_rank: index + 1,
          normalized_percent: Math.round(item.normalized_score * 1000) / 10,
        })),
    [data],
  )

  const handleExport = () => {
    const csv = formatCsv(chartData)
    if (onExportCsv) {
      onExportCsv(csv)
      return
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "feature_importance.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted">TOP FEATURES</span>
        <div className="flex items-center gap-2">
          {compareMode && (
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-brand">Comparing windows</span>
          )}
          <Button
            variant="ghost"
            size="xs"
            className="h-7 rounded border border-brand/20 px-2 text-[11px] font-mono uppercase tracking-[0.25em]"
            onClick={handleExport}
          >
            Export CSV
          </Button>
        </div>
      </div>
      <div className="flex-1 rounded-lg border border-brand/10 bg-black/40 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 12, bottom: 8 }}
            barSize={18}
            barGap={6}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(243,91,4,0.12)" horizontal={false} />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={{ stroke: "rgba(243,91,4,0.12)" }}
              stroke="rgba(255,255,255,0.35)"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.65)" }}
              domain={[0, 100]}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "rgba(255,255,255,0.7)" }}
            />
            <ReferenceLine x={50} stroke="rgba(243,91,4,0.2)" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ fill: "rgba(243,91,4,0.08)" }}
              contentStyle={{
                backgroundColor: "rgba(5,5,5,0.92)",
                border: "1px solid rgba(243,91,4,0.3)",
                borderRadius: "8px",
                padding: "10px",
              }}
              labelStyle={{ color: "var(--text)", fontFamily: "JetBrains Mono" }}
              formatter={(value: number, name: string, payload) => {
                if (name === "normalized_percent") {
                  return [`${value.toFixed(1)}%`, "Normalised impact"]
                }
                if (name === "score") {
                  return [value.toFixed(4), "Gain"]
                }
                if (name === "delta") {
                  const delta = payload?.payload?.delta ?? 0
                  const sign = delta >= 0 ? "+" : ""
                  return [`${sign}${(delta * 100).toFixed(1)}%`, "Window Δ"]
                }
                return [value, name]
              }}
            />
            <Bar dataKey="normalized_percent" radius={[4, 4, 4, 4]} fill="url(#featureImportanceGradient)" className="cursor-pointer">
              {chartData.map((item) => (
                <Cell
                  key={item.name}
                  fill={highlight && item.name === highlight ? "rgba(0,255,170,0.9)" : "url(#featureImportanceGradient)"}
                  onClick={() => {
                    const matched = data.find((feature) => feature.name === item.name)
                    if (matched && onSelect) {
                      onSelect(matched)
                    }
                  }}
                />
              ))}
            </Bar>
            <defs>
              <linearGradient id="featureImportanceGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(243,91,4,0.1)" />
                <stop offset="100%" stopColor="rgba(243,91,4,0.95)" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default FeatureImportanceChart


