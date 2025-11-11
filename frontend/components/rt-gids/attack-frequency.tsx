import { memo } from "react"

import { motion } from "framer-motion"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { AttackFrequencyResponse } from "@/hooks/useAttackFrequency"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface AttackFrequencyProps {
  data: AttackFrequencyResponse
  loading?: boolean
}

const tooltipStyle = {
  backgroundColor: "rgba(0, 0, 0, 0.92)",
  border: "1px solid rgba(var(--brand-rgb), 0.4)",
  borderRadius: "6px",
  color: "var(--text-primary)",
  fontFamily: "var(--mono-font)",
  fontSize: "12px",
} as const

export const AttackFrequency = memo(function AttackFrequency({ data, loading }: AttackFrequencyProps) {
  const chartData = data.points.map((point) => ({ time: point.minute, count: point.count }))
  const windowLabel = `${data.windowMinutes}m window`

  return (
    <Card className="border border-[rgba(var(--brand-rgb),0.12)] bg-panel/90 shadow-glow">
      <CardHeader className="border-b border-[rgba(var(--brand-rgb),0.08)] pb-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">
          ATTACK FREQUENCY
        </CardTitle>
        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted">{windowLabel}</span>
      </CardHeader>
      <CardContent className="h-56">
        {loading ? (
          <div className="h-full animate-pulse rounded bg-[rgba(var(--brand-rgb),0.06)]" />
        ) : (
          <motion.div initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="attackGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--brand-rgb), 0.12)" />
                <XAxis dataKey="time" stroke="rgba(var(--brand-rgb), 0.35)" tickFormatter={(value) => value.slice(-5)} />
                <YAxis stroke="rgba(var(--brand-rgb), 0.35)" allowDecimals={false} width={40} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => `Minute ${label}`}
                  formatter={(value: number) => [`${value} incidents`, "Detections"]}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#attackGradient)"
                  isAnimationActive
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </CardContent>
      <div className="px-6 pb-4 text-[11px] font-mono uppercase tracking-[0.25em] text-muted">
        <span>Total events: </span>
        <span className="text-text-primary">{data.totalEvents}</span>
        <span className="ml-4">Rate: {(data.attackRate ?? 0).toFixed(2)} / min</span>
      </div>
    </Card>
  )
})

