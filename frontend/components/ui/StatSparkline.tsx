"use client"

"use client"

import { memo } from "react"

import { Line, LineChart, ResponsiveContainer } from "recharts"

type StatSparklineProps = {
  data: number[]
  accent?: string
}

export const StatSparkline = memo(function StatSparkline({
  data,
  accent = "var(--brand)",
}: StatSparklineProps) {
  const chartData =
    data.length > 0
      ? data.map((value, index) => ({ index, value }))
      : Array.from({ length: 8 }, (_, i) => ({ index: i, value: 0 }))

  return (
    <div className="absolute inset-x-0 bottom-1 h-10">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={accent}
            strokeWidth={1.6}
            dot={false}
            activeDot={{ r: 2.4, stroke: accent, strokeWidth: 1 }}
            isAnimationActive
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
})

export default StatSparkline

