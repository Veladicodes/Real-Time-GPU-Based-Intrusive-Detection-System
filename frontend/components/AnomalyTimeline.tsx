"use client"

import { useMemo } from "react"

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"

import type { TimelinePoint } from "@/hooks/useThreatTelemetry"

type AnomalyTimelineProps = {
  data: TimelinePoint[]
}

export default function AnomalyTimeline({ data }: AnomalyTimelineProps) {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        time: new Date(point.timestamp).toLocaleTimeString("en-GB", { hour12: false }),
        value: point.value,
      })),
    [data],
  )

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData}>
        <defs>
          <linearGradient id="timeline-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="rgba(255,74,0,0.9)" stopOpacity={0.6} />
            <stop offset="95%" stopColor="rgba(255,74,0,0.05)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,74,0,0.1)" strokeDasharray="4 4" />
        <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 10 }} />
        <YAxis stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(10, 10, 10, 0.92)",
            border: "1px solid rgba(255,74,0,0.35)",
            borderRadius: "8px",
            color: "#f2f2f2",
            fontFamily: "var(--mono-font)",
            fontSize: "12px",
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#ff4a00"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          fill="url(#timeline-gradient)"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}


