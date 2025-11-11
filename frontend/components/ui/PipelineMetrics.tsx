"use client"

import { memo, useEffect, useMemo, useState } from "react"

import { motion } from "framer-motion"

type Metric = {
  label: string
  value: number
  unit?: string
  description?: string
}

type PipelineMetricsProps = {
  metrics: Metric[]
}

const BAR_COLORS = {
  low: "linear-gradient(90deg, rgba(var(--brand-orange-rgb),0.35), rgba(var(--brand-orange-rgb),0.18))",
  medium: "linear-gradient(90deg, rgba(var(--brand-orange-rgb),0.55), rgba(var(--brand-orange-rgb),0.3))",
  high: "linear-gradient(90deg, rgba(var(--brand-orange-rgb),0.75), rgba(var(--brand-orange-rgb),0.45))",
}

function resolveColor(value: number) {
  if (value < 60) return BAR_COLORS.low
  if (value < 85) return BAR_COLORS.medium
  return BAR_COLORS.high
}

export const PipelineMetrics = memo(function PipelineMetrics({ metrics }: PipelineMetricsProps) {
  const [animatedValues, setAnimatedValues] = useState(metrics.map((metric) => metric.value))

  useEffect(() => {
    setAnimatedValues(metrics.map((metric) => metric.value))
  }, [metrics])

  const items = useMemo(
    () =>
      metrics.map((metric, index) => ({
        ...metric,
        animatedValue: animatedValues[index] ?? metric.value,
        index,
      })),
    [animatedValues, metrics],
  )

  return (
    <div className="pipeline-metrics space-y-4 text-sm">
      {items.map((metric) => (
        <div key={metric.label} className="group">
          <div className="mb-1 flex items-center justify-between text-xs font-mono uppercase tracking-[0.25em] text-muted">
            <span>{metric.label}</span>
            <span className="text-text">
              {Math.round(metric.animatedValue)} {metric.unit ?? ""}
            </span>
          </div>
          <div className="relative h-3 rounded-full bg-surface/70">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              animate={{ width: `${Math.min(100, Math.max(0, metric.animatedValue))}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              style={{
                backgroundImage: resolveColor(metric.animatedValue),
                boxShadow: "0 0 12px rgba(var(--brand-orange-rgb),0.35)",
              }}
            />
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-full opacity-0 group-hover:opacity-80"
              style={{
                backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 40%)",
              }}
              animate={{ backgroundPositionX: metric.index % 2 === 0 ? ["0%", "120%"] : ["120%", "0%"] }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            />
          </div>
          {metric.description && (
            <div className="mt-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted">
              Average over last 5s — {metric.description}
            </div>
          )}
        </div>
      ))}
    </div>
  )
})

export default PipelineMetrics


