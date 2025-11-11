"use client"

import { memo } from "react"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { ThreatAnomalyPoint } from "@/hooks/useThreatAnalytics"

type Props = {
  data: ThreatAnomalyPoint[]
  loading?: boolean
}

function AnomalyTimelineComponent({ data, loading }: Props) {
  if (loading) {
    return <div className="h-full animate-pulse rounded bg-neutral-800/40" />
  }

  const chartData = data.map((point) => ({
    time: point.timestamp,
    value: point.value,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="threatAnomalyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--brand-orange)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--brand-orange)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="rgba(243, 91, 4, 0.1)" />
        <XAxis dataKey="time" stroke="rgba(243, 91, 4, 0.35)" tick={{ fontSize: 10 }} />
        <YAxis stroke="rgba(243, 91, 4, 0.35)" tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(15, 15, 15, 0.94)",
            border: "1px solid rgba(243, 91, 4, 0.45)",
            borderRadius: "6px",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "12px",
            color: "var(--text)",
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--brand-orange)"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#threatAnomalyGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export const AnomalyTimeline = memo(AnomalyTimelineComponent)

export default AnomalyTimeline


