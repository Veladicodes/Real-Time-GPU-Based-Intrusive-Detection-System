"use client"

import clsx from "clsx"
import { memo, useEffect, useRef, useState } from "react"

import { motion } from "framer-motion"

import { useTheme } from "@/components/ThemeProvider"

export type SystemStatus = "ONLINE" | "WARNING" | "MAINTENANCE" | "CRITICAL"

type SystemCardProps = {
  title: string
  cpu: number
  memory: number
  storage: number
  status: SystemStatus
  uptime: string
  location?: string
  highlight?: boolean
  freezeUpdates?: boolean
}

const STATUS_BADGE: Record<SystemStatus, { label: string; tint: string; border: string; text: string; led: string }> = {
  ONLINE: {
    label: "ONLINE",
    tint: "rgba(var(--accent-green-rgb),0.12)",
    border: "rgba(var(--accent-green-rgb),0.5)",
    text: "var(--accent-green)",
    led: "stable",
  },
  WARNING: {
    label: "WARNING",
    tint: "rgba(var(--accent-yellow-rgb),0.12)",
    border: "rgba(var(--accent-yellow-rgb),0.5)",
    text: "var(--accent-yellow)",
    led: "warning",
  },
  MAINTENANCE: {
    label: "MAINTENANCE",
    tint: "rgba(var(--muted-rgb),0.12)",
    border: "rgba(var(--muted-rgb),0.35)",
    text: "var(--muted)",
    led: "warning",
  },
  CRITICAL: {
    label: "CRITICAL",
    tint: "rgba(var(--accent-red-rgb),0.12)",
    border: "rgba(var(--accent-red-rgb),0.6)",
    text: "var(--accent-red)",
    led: "alert",
  },
}

const MetricThreshold = {
  green: 65,
  yellow: 85,
}

const BAR_VARIANT = {
  initial: { width: "0%" },
  animate: (value: number) => ({
    width: `${Math.min(100, Math.max(0, value))}%`,
  }),
}

function getBarColor(value: number) {
  if (value >= MetricThreshold.yellow) return "var(--accent-red)"
  if (value >= MetricThreshold.green) return "var(--accent-yellow)"
  return "var(--accent-green)"
}

function parseMetric(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function SystemCardComponent({
  title,
  cpu,
  memory,
  storage,
  status,
  uptime,
  location,
  highlight = false,
  freezeUpdates = false,
}: SystemCardProps) {
  const { reducedMotion } = useTheme()
  const [flash, setFlash] = useState(false)
  const prevMetrics = useRef({ cpu, memory, storage })

  useEffect(() => {
    if (freezeUpdates) return
    const prev = prevMetrics.current
    if (prev.cpu !== cpu || prev.memory !== memory || prev.storage !== storage) {
      setFlash(true)
      const timeout = window.setTimeout(() => setFlash(false), 450)
      prevMetrics.current = { cpu, memory, storage }
      return () => window.clearTimeout(timeout)
    }
    prevMetrics.current = { cpu, memory, storage }
    return undefined
  }, [cpu, memory, storage, freezeUpdates])

  const badge = STATUS_BADGE[status]

  const interactive = !freezeUpdates && !reducedMotion

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: freezeUpdates ? 0.65 : 1, y: 0 }}
      className={clsx(
        "panel relative flex h-full flex-col gap-4 bg-transparent p-5 transition-transform",
        {
          "ring-2 ring-offset-2 ring-offset-bg ring-[var(--brand)]": highlight,
        },
      )}
      whileHover={interactive ? { rotateX: -3, rotateY: 3, scale: 1.015 } : undefined}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
      data-testid="system-card"
    >
      {flash && !freezeUpdates && (
        <span
          className="pointer-events-none absolute inset-0 rounded-[var(--radius)]"
          style={{ animation: "metricFlash 560ms ease-out" }}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="text-sm font-ui font-semibold uppercase tracking-[0.3em] text-text-primary">{title}</h3>
          <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted">{uptime}</p>
          {location && <p className="text-xs text-muted/80">Location: {location}</p>}
        </div>
        <span
          className="flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-[0.4em]"
          style={{ backgroundColor: badge.tint, border: `1px solid ${badge.border}`, color: badge.text }}
        >
          <span className={clsx("led", badge.led)} aria-hidden />
          {badge.label}
        </span>
      </div>

      <div className="space-y-4">
        <MetricBar label="CPU" value={cpu} />
        <MetricBar label="MEMORY" value={memory} />
        <MetricBar label="STORAGE" value={storage} />
      </div>
    </motion.article>
  )
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const parsed = parseMetric(value)
  const barColor = getBarColor(parsed)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.3em] text-muted">
        <span>{label}</span>
        <span className="text-text-primary">{parsed}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-[rgba(255,255,255,0.05)]">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
          variants={BAR_VARIANT}
          initial="initial"
          animate="animate"
          custom={parsed}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  )
}

export const SystemCard = memo(SystemCardComponent)

export default SystemCard

