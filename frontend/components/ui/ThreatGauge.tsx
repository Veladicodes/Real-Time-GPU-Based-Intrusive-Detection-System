"use client"

import clsx from "clsx"
import type { CSSProperties } from "react"
import { memo, useMemo } from "react"

import { motion, useSpring } from "framer-motion"

import { useTheme } from "@/components/ThemeProvider"
import { useCountUp } from "@/hooks/useCountUp"
import { useWebSocketLogs } from "@/hooks/useWebSocketLogs"

type ThreatGaugeProps = {
  value: number
  label?: string
  lastUpdated?: string | number | Date | null
}

const SIZE = 220
const RADIUS = 92
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function clamp(value: number) {
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function formatRelativeTime(timestamp?: string | number | Date | null) {
  if (!timestamp) return "Awaiting telemetry"
  const value = typeof timestamp === "string" || typeof timestamp === "number" ? new Date(timestamp) : timestamp
  if (Number.isNaN(value.getTime())) return "Awaiting telemetry"
  const diffSeconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1000))
  if (diffSeconds < 5) return "Updated moments ago"
  if (diffSeconds < 60) return `Updated ${diffSeconds}s ago`
  const minutes = Math.floor(diffSeconds / 60)
  return `Updated ${minutes}m ago`
}

function resolveColor(score: number) {
  if (score < 40) return "var(--accent-green)"
  if (score < 70) return "var(--accent-yellow)"
  return "var(--accent-red)"
}

function ThreatGaugeComponent({ value, label = "Threat Level", lastUpdated }: ThreatGaugeProps) {
  const { alertMessages } = useWebSocketLogs({ muteAudio: true })
  const activeAlerts = alertMessages.length
  const computedValue = activeAlerts > 0 ? Math.min(100, activeAlerts * 10) : 0
  const latestTimestamp = activeAlerts ? alertMessages[activeAlerts - 1]?.timestamp ?? null : null
  const clampedValue = clamp(computedValue || value || 0)
  const dashOffsetSpring = useSpring(CIRCUMFERENCE, { stiffness: 120, damping: 18 })
  const { reducedMotion } = useTheme()
  const count = useCountUp(clampedValue)

  dashOffsetSpring.set(CIRCUMFERENCE - (clampedValue / 100) * CIRCUMFERENCE)

  const updatedLabel = useMemo(
    () => formatRelativeTime(latestTimestamp ?? lastUpdated ?? undefined),
    [lastUpdated, latestTimestamp],
  )
  const toneColor = useMemo(() => resolveColor(clampedValue), [clampedValue])
  const trackColor = useMemo(
    () => `color-mix(in srgb, ${toneColor} 20%, transparent)`,
    [toneColor],
  )

  const panelStyle = useMemo<CSSProperties>(
    () => ({
      borderColor: `color-mix(in srgb, ${toneColor} 25%, transparent)`,
      boxShadow: `0 0 24px color-mix(in srgb, ${toneColor} 25%, transparent)`,
      background: "linear-gradient(180deg, rgb(16 16 16 / 92%), rgb(10 10 10 / 88%))",
    }),
    [toneColor],
  )

  return (
    <section
      className={clsx("panel threat-index relative flex w-full max-w-sm flex-col items-center gap-4 bg-transparent p-6")}
      style={panelStyle}
      role="status"
      aria-live="polite"
    >
      <div className="relative w-full">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={trackColor} strokeWidth="14" fill="none" />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={toneColor}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            style={{
              strokeDashoffset: dashOffsetSpring,
            }}
            className="origin-center -rotate-90"
          />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={toneColor}
            strokeWidth="22"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            style={{
              strokeDashoffset: dashOffsetSpring,
              opacity: 0.28,
            }}
            className="origin-center -rotate-90"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <motion.div
            className="absolute left-1/2 top-1/2 h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl"
            style={{
              background: `radial-gradient(circle, color-mix(in srgb, ${toneColor} 55%, transparent) 0%, transparent 75%)`,
              opacity: 0.35,
            }}
            animate={
              reducedMotion
                ? undefined
                : {
                    opacity: [0.2, 0.45, 0.2],
                    scale: [0.9, 1.08, 0.9],
                  }
            }
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.span
            key={Math.round(clampedValue)}
            initial={{ opacity: 0.6, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="font-display text-5xl font-semibold tracking-[0.18em]"
            style={{ color: toneColor }}
          >
            {Math.round(count)}%
          </motion.span>
          <p className="mt-3 font-display text-xs uppercase tracking-[0.35em] text-muted">{label}</p>
        </div>
      </div>
      <p className="text-xs font-mono uppercase tracking-[0.35em] text-muted">{updatedLabel}</p>
    </section>
  )
}

export const ThreatGauge = memo(ThreatGaugeComponent)

export default ThreatGauge

