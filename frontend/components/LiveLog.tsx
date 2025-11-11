"use client"

import clsx from "clsx"
import { useEffect, useMemo, useRef, useState } from "react"

import { useVirtualizer } from "@tanstack/react-virtual"
import { motion } from "framer-motion"
import { Pause, Play, RefreshCw } from "lucide-react"

import type { LogMessage } from "@/hooks/useWebSocketLogs"

type Severity = "info" | "warning" | "alert"

type NormalisedLog = {
  id: string
  timestamp: string
  message: string
  detail?: string
  severity: Severity
}

type LiveLogProps = {
  title?: string
  logs: LogMessage[]
  connected: boolean
  paused: boolean
  onTogglePause: () => void
  onClear?: () => void
  className?: string
  limit?: number
}

const ROW_HEIGHT = 88
const VIRTUALIZATION_THRESHOLD = 50

const severityTone: Record<
  Severity,
  {
    label: string
    border: string
    glow?: string
    badgeBg: string
    badgeText: string
    background?: string
    text?: string
    messageColor?: string
    detailColor?: string
  }
> = {
  info: {
    label: "INFO",
    border: "rgb(var(--muted-rgb) / 35%)",
    badgeBg: "rgb(var(--muted-rgb) / 0.18)",
    badgeText: "var(--muted)",
    background: "linear-gradient(135deg, rgb(20 20 20 / 80%), rgb(12 12 12 / 78%))",
    text: "var(--muted)",
    messageColor: "rgb(var(--muted-rgb) / 95%)",
    detailColor: "rgb(var(--muted-rgb) / 75%)",
  },
  warning: {
    label: "WARNING",
    border: "var(--accent-yellow)",
    glow: "rgba(255, 204, 51, 0.22)",
    badgeBg: "rgb(var(--accent-yellow-rgb) / 0.18)",
    badgeText: "var(--accent-yellow)",
  },
  alert: {
    label: "ALERT",
    border: "var(--accent-red)",
    glow: "rgba(255, 59, 59, 0.25)",
    badgeBg: "rgb(var(--accent-red-rgb) / 0.18)",
    badgeText: "var(--accent-red)",
  },
}

function formatTime(value?: string) {
  if (!value) return "--:--:--"
  const d = new Date(value)
  if (Number.isNaN(d.valueOf())) return "--:--:--"
  return d.toLocaleTimeString("en-US", { hour12: false })
}

function mapSeverity(raw?: string | null): Severity {
  const normalised = (raw ?? "").toLowerCase()
  if (normalised === "alert" || normalised === "critical") return "alert"
  if (normalised === "warning") return "warning"
  return "info"
}

function createMessage(log: LogMessage): NormalisedLog {
  const severity = mapSeverity(log.type as string | undefined)
  const message = log.threat ?? (log as any).message ?? "Event received"
  const detailParts: string[] = []
  if (typeof log.confidence === "number") {
    detailParts.push(`confidence ${Math.round(log.confidence)}%`)
  }
  if (log.src_ip) detailParts.push(`src ${log.src_ip}`)
  if (log.dst_ip) detailParts.push(`dst ${log.dst_ip}`)

  return {
    id: log.id,
    timestamp: log.timestamp ?? new Date().toISOString(),
    message,
    detail: detailParts.length > 0 ? detailParts.join(" • ") : undefined,
    severity,
  }
}

function LogRow({ entry, isLatest }: { entry: NormalisedLog; isLatest: boolean }) {
  const tone = severityTone[entry.severity]
  return (
    <motion.article
      layout="position"
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={clsx("log-entry", `log-${entry.severity}`, isLatest && "log-entry--fresh")}
      data-level={entry.severity}
      style={{
        borderLeftColor: tone.border,
        boxShadow: tone.glow ? `0 0 12px ${tone.glow}` : undefined,
        background: tone.background,
        color: tone.text,
      }}
      aria-live="polite"
      aria-relevant="additions text"
    >
      <header className="log-entry__meta">
        <span>{formatTime(entry.timestamp)}</span>
        <span className="log-entry__badge" style={{ backgroundColor: tone.badgeBg, color: tone.badgeText }}>
          {tone.label}
        </span>
      </header>
      <p className="log-entry__message" style={{ color: tone.messageColor }}>
        {entry.message}
      </p>
      {entry.detail && (
        <p className="log-entry__detail" style={{ color: tone.detailColor }}>
          {entry.detail}
        </p>
      )}
    </motion.article>
  )
}

export function LiveLog({
  title = "Live Activity Log",
  logs,
  connected,
  paused,
  onTogglePause,
  onClear,
  className = "",
  limit = 200,
}: LiveLogProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [showInfo, setShowInfo] = useState(true)

  const mappedItems = useMemo(() => {
    if (!Array.isArray(logs)) return []
    const max = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : logs.length
    return logs
      .slice(-max)
      .map(createMessage)
      .reverse()
  }, [limit, logs])

  const items = useMemo(
    () => (showInfo ? mappedItems : mappedItems.filter((entry) => entry.severity !== "info")),
    [mappedItems, showInfo],
  )

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  })

  const shouldVirtualize = items.length > VIRTUALIZATION_THRESHOLD
  const totalHeight = virtualizer.getTotalSize()
  const virtualItems = virtualizer.getVirtualItems()
  const latestId = items[0]?.id

  useEffect(() => {
    if (paused || items.length === 0) return
    if (shouldVirtualize) {
      virtualizer.scrollToIndex(0, { align: "start", behavior: "smooth" })
    } else if (viewportRef.current) {
      viewportRef.current.scrollTop = 0
    }
  }, [items, paused, shouldVirtualize, virtualizer])

  return (
    <section
      className={clsx("live-log panel relative flex h-full flex-col", className)}
      role="log"
      aria-label="Live IDS Log Feed"
    >
      <header className="live-log__header">
        <div className="live-log__title">
          <span className={clsx("status-led", connected ? "status-led--online" : "status-led--offline")} aria-hidden />
          <span>{title}</span>
        </div>
        <div className="live-log__actions">
          <button type="button" onClick={onTogglePause} className="live-log__action-btn">
            {paused ? (
              <span className="flex items-center gap-1">
                <Play className="h-3 w-3" aria-hidden /> Resume
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Pause className="h-3 w-3" aria-hidden /> Pause
              </span>
            )}
          </button>
          {onClear && (
            <button type="button" onClick={onClear} className="live-log__action-btn">
              <RefreshCw className="mr-1 inline h-3 w-3" aria-hidden />
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowInfo((prev) => !prev)}
            className="live-log__action-btn"
            aria-pressed={showInfo}
          >
            {showInfo ? "Hide INFO" : "Show INFO"}
          </button>
        </div>
      </header>

      <div ref={viewportRef} className="live-log__viewport" data-virtualized={shouldVirtualize}>
        {items.length === 0 ? (
          <div className="live-log__empty">Awaiting telemetry…</div>
        ) : shouldVirtualize ? (
          <div style={{ height: totalHeight, position: "relative" }}>
            {virtualItems.map((virtualRow) => {
              const entry = items[virtualRow.index]
              return (
                <div
                  key={entry.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="live-log__virtual-row"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <LogRow entry={entry} isLatest={entry.id === latestId} />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="live-log__list">
            {items.map((entry, index) => (
              <LogRow entry={entry} key={entry.id} isLatest={index === 0} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default LiveLog
