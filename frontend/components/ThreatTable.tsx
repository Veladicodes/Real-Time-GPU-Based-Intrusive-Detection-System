"use client"

import { useMemo, useRef } from "react"

import { useVirtualizer } from "@tanstack/react-virtual"
import clsx from "clsx"

import type { ThreatEvent } from "@/hooks/useThreatTelemetry"
import { Button } from "@/components/ui/button"

type ThreatTableProps = {
  events: ThreatEvent[]
  onExplain?: (event: ThreatEvent) => void
  explainingId?: string | null
}

export default function ThreatTable({ events, onExplain, explainingId }: ThreatTableProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)

  const rowVirtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const rows = useMemo(() => events, [events])

  return (
    <div ref={parentRef} className="max-h-[460px] overflow-auto">
      <div style={{ height: totalSize, position: "relative" }}>
        {virtualRows.map((virtualRow) => {
          const event = rows[virtualRow.index]
          if (!event) return null
          return (
            <div
              key={event.id}
              className={clsx(
                "absolute left-0 right-0 border-b border-[rgba(255,74,0,0.12)] bg-black/50 px-4 py-3 text-sm font-mono transition",
                event.confidence >= 0.8 || event.status.toLowerCase() === "active"
                  ? "bg-[rgba(255,74,0,0.12)] shadow-[0_0_12px_rgba(255,74,0,0.25)]"
                  : "hover:bg-[rgba(255,74,0,0.05)]",
              )}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1fr_auto] items-center gap-4 text-xs uppercase tracking-[0.2em] text-muted">
                <span className="truncate text-sm text-orange-400">{event.ip}</span>
                <span className="text-neutral-200">{event.threat_type}</span>
                <ConfidenceBar confidence={event.confidence} />
                <span className="text-neutral-300">{event.geo ?? "Unknown"}</span>
                <StatusBadge status={event.status} />
                <Sparkline values={event.activity} />
                <div className="flex justify-end">
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-7 rounded border border-brand/20 px-3 text-[11px] font-mono uppercase tracking-[0.2em]"
                    onClick={() => onExplain?.(event)}
                    disabled={!onExplain || Boolean(explainingId && explainingId !== event.id)}
                  >
                    {explainingId === event.id ? "Explaining…" : "Explain"}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {events.length === 0 && (
        <div className="flex h-32 items-center justify-center text-xs uppercase tracking-[0.35em] text-neutral-500">
          Awaiting threat telemetry…
        </div>
      )}
    </div>
  )
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100)
  return (
    <div className="flex h-6 w-full items-center gap-2">
      <div className="relative h-2 flex-1 rounded-full bg-[rgba(255,74,0,0.12)]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[rgba(255,74,0,0.85)] transition-all" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-[10px] text-neutral-300">{percent}%</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase()
  const tone =
    normalized === "ACTIVE"
      ? "border-[rgba(255,74,0,0.6)] text-[rgba(255,74,0,0.95)]"
      : normalized === "BLOCKED"
        ? "border-[rgba(0,255,170,0.35)] text-[rgba(0,255,170,0.9)]"
        : "border-[rgba(255,214,0,0.35)] text-[rgba(255,214,0,0.9)]"
  return (
    <span className={clsx("inline-flex items-center justify-center rounded-full border px-3 py-1 text-[10px]", tone)}>
      {normalized}
    </span>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) {
    return <div className="h-6 w-24 rounded bg-[rgba(255,74,0,0.08)]" />
  }

  const max = Math.max(...values, 1)
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * 100
      const y = 100 - (value / max) * 100
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg viewBox="0 0 100 100" className="h-6 w-24">
      <polyline points={points} fill="none" stroke="rgba(255,74,0,0.65)" strokeWidth={3} />
    </svg>
  )
}


