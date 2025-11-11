"use client"

import { memo } from "react"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { FeatureImportance } from "@/hooks/useModelInsightsData"

type Props = {
  data: FeatureImportance[]
}

function FeatureImportanceChartComponent({ data }: Props) {
  const chartData = data
    .slice(0, 10)
    .map((feature) => ({ name: feature.name, value: Math.round(feature.importance * 1000) / 10 }))
    .reverse()

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 18, left: 4, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(243,91,4,0.15)" />
        <XAxis
          type="number"
          stroke="rgba(243,91,4,0.35)"
          tick={{ fontSize: 10 }}
          domain={[0, (dataMax: number) => Math.ceil(dataMax / 5) * 5]}
        />
        <YAxis
          dataKey="name"
          type="category"
          stroke="rgba(243,91,4,0.35)"
          tick={{ fontSize: 10 }}
          width={140}
        />
        <Tooltip
          cursor={{ fill: "rgba(243,91,4,0.08)" }}
          contentStyle={{
            backgroundColor: "rgba(15,15,15,0.92)",
            border: "1px solid rgba(243,91,4,0.35)",
            borderRadius: "6px",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "12px",
            color: "var(--text)",
          }}
          formatter={(value: number, name: string) => [`${value}%`, `${name} | Impact`]}
        />
        <defs>
          <linearGradient id="featureGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(243,91,4,0.2)" />
            <stop offset="100%" stopColor="var(--brand-orange)" />
          </linearGradient>
        </defs>
        <Bar dataKey="value" fill="url(#featureGradient)" radius={6} isAnimationActive animationDuration={800} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export const FeatureImportanceChart = memo(FeatureImportanceChartComponent)

export default FeatureImportanceChart


