"use client"

import clsx from "clsx"
import type { ReactNode } from "react"
import { memo, useEffect, useMemo, useRef, useState } from "react"

import { motion } from "framer-motion"

import { useTheme } from "@/components/ThemeProvider"
import StatSparkline from "@/components/ui/StatSparkline"
import { useCountUp } from "@/hooks/useCountUp"

type StatSeverity = "normal" | "warning" | "critical"

export type { StatSeverity }

type StatBoxProps = {
  label: string
  value: number | string | null | undefined
  hint?: string
  icon?: ReactNode
  sparkline?: number[]
  severity?: StatSeverity
  loading?: boolean
}

const severityColors: Record<StatSeverity, string> = {
  normal: "var(--accent-green)",
  warning: "var(--accent-yellow)",
  critical: "var(--accent-red)",
}

export const StatBox = memo(function StatBox({
  label,
  value,
  hint,
  icon,
  sparkline,
  severity = "normal",
  loading = false,
}: StatBoxProps) {
  const { reducedMotion } = useTheme()
  const isNumeric = typeof value === "number" && Number.isFinite(value)
  const isInactive = value === 0 || value === "OFF"
  const animatedNumber = useCountUp(isNumeric ? (value as number) : 0)
  const [changePulse, setChangePulse] = useState(false)
  const prevValueRef = useRef<number | null>(null)
  const numericValue = isNumeric ? (value as number) : null

  useEffect(() => {
    if (!isNumeric) return
    const current = value as number
    const prev = prevValueRef.current
    if (prev !== null && prev !== 0) {
      const delta = Math.abs(current - prev) / Math.abs(prev)
      if (delta > 0.04) {
        setChangePulse(true)
      }
    }
    prevValueRef.current = current
  }, [isNumeric, value])

  useEffect(() => {
    if (!changePulse) return
    const timeout = window.setTimeout(() => setChangePulse(false), 420)
    return () => window.clearTimeout(timeout)
  }, [changePulse])

  const displayValue = useMemo(() => {
    if (!isNumeric) return value
    return new Intl.NumberFormat().format(Math.round(animatedNumber))
  }, [animatedNumber, isNumeric, value])

  const seriesRange = useMemo(() => {
    const series: number[] = []
    if (Array.isArray(sparkline)) {
      for (const point of sparkline) {
        if (typeof point === "number" && Number.isFinite(point)) {
          series.push(point)
        }
      }
    }
    if (typeof numericValue === "number") {
      series.push(numericValue)
    }
    if (series.length === 0) return undefined
    return {
      min: Math.min(...series),
      max: Math.max(...series),
    }
  }, [numericValue, sparkline])

  const showSkeleton =
    loading || (!isInactive && (displayValue === undefined || displayValue === null || displayValue === "--"))
  const severityColor = severityColors[severity] ?? severityColors.normal

  return (
    <motion.article
      className={clsx("panel relative flex h-full flex-col gap-4 bg-transparent p-5 transition-transform")}
      whileHover={reducedMotion ? undefined : { rotateX: -2.5, rotateY: 2.5, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      data-testid="stat-box"
      role="log"
      aria-label="Live IDS Log Feed"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
      <motion.span
        className="pointer-events-none absolute inset-0 rounded-[var(--radius)]"
        style={{ backgroundColor: "rgba(var(--brand-rgb),0.05)" }}
        animate={{ opacity: changePulse ? 1 : 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted">{label}</p>
          <div className="flex items-center gap-2">
            {showSkeleton ? (
              <div className="h-12 w-28 animate-pulse rounded bg-brand-soft" aria-hidden />
            ) : isInactive ? (
              <span className="text-sm font-mono text-muted italic">Inactive</span>
            ) : (
              <motion.output
                key={displayValue as React.Key}
                initial={{ opacity: 0.6, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="font-mono text-4xl font-semibold leading-none text-text-primary md:text-[44px]"
                aria-valuenow={typeof numericValue === "number" ? Number(numericValue.toFixed(2)) : undefined}
                aria-valuemin={seriesRange?.min}
                aria-valuemax={seriesRange?.max}
                aria-live="polite"
              >
                {displayValue}
              </motion.output>
            )}
          </div>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
        {icon && (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--brand-soft)", color: "var(--brand)" }}
            aria-hidden
          >
            {icon}
          </div>
        )}
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="pointer-events-none absolute inset-x-3 bottom-2 h-10 opacity-80">
          <StatSparkline data={sparkline} accent={severityColor} />
        </div>
      )}
      <div className="mt-auto flex items-center justify-between pt-6">
        <span
          className="flex items-center gap-2 text-[10px] uppercase tracking-[0.45em] text-muted"
          aria-hidden="true"
        >
          <span
            className="h-2.5 w-2.5 rounded-full shadow-[0_0_12px_rgba(0,0,0,0.35)]"
            style={{ backgroundColor: severityColor }}
          />
          {severity === "critical" ? "Critical" : severity === "warning" ? "Warning" : "Stable"}
        </span>
      </div>
    </motion.article>
  )
})

