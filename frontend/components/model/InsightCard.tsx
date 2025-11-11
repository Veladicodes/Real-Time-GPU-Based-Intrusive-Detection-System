"use client"

import { memo } from "react"

import { motion } from "framer-motion"

import type { InsightPattern } from "@/hooks/useModelInsightsData"

type InsightCardProps = {
  insight: InsightPattern
}

function InsightCardComponent({ insight }: InsightCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative overflow-hidden rounded-lg border border-brand/20 bg-surface/90 p-4 text-text shadow-glow backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between text-xs font-mono uppercase tracking-[0.3em] text-muted">
        <span>{insight.last_seen}</span>
        <span>{Math.round(insight.confidence * 100)}% CONF.</span>
      </div>
      <h3 className="text-lg font-bold tracking-[0.2em] text-brand">{insight.title}</h3>
      <p className="mt-3 text-sm text-text/80">{insight.summary}</p>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
    </motion.div>
  )
}

export const InsightCard = memo(InsightCardComponent)

export default InsightCard


