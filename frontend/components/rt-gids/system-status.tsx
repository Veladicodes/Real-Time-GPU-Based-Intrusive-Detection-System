import { memo } from "react"

import clsx from "clsx"

import type { SystemHealthResponse } from "@/hooks/useSystemHealth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface SystemStatusProps {
  health: SystemHealthResponse
  connectionState: string
  isLoading?: boolean
}

const STATUS_BADGE: Record<string, { text: string; tone: string; led: "green" | "yellow" | "red" }> = {
  online: { text: "ONLINE", tone: "var(--accent-green)", led: "green" },
  degraded: { text: "DEGRADED", tone: "var(--accent-yellow)", led: "yellow" },
  offline: { text: "OFFLINE", tone: "var(--accent-red)", led: "red" },
}

export const SystemStatus = memo(function SystemStatus({ health, connectionState, isLoading }: SystemStatusProps) {
  const statusKey = health.status?.toLowerCase() ?? "unknown"
  const badge = STATUS_BADGE[statusKey] ?? { text: statusKey.toUpperCase(), tone: "var(--muted)", led: "yellow" as const }
  const latency = health.latency_ms != null ? `${health.latency_ms} ms` : "—"
  const backendTime = health.backend_time ? new Date(health.backend_time).toLocaleTimeString() : "—"
  const socketTone = connectionState === "open" ? "var(--accent-green)" : "var(--accent-red)"

  return (
    <Card className="panel bg-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">
          SYSTEM STATUS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs font-mono">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-6 animate-pulse rounded bg-[rgba(var(--brand-rgb),0.06)]" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted">Status</span>
              <span className="flex items-center gap-2" style={{ color: badge.tone }}>
                <span className={clsx("led", badge.led)} />
                {badge.text}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted">
              <span>Latency</span>
              <span>{latency}</span>
            </div>
            <div className="flex items-center justify-between text-muted">
              <span>Backend Time</span>
              <span>{backendTime}</span>
            </div>
            <div className="flex items-center justify-between text-muted">
              <span>WebSocket</span>
              <span style={{ color: socketTone }}>{connectionState.toUpperCase()}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
})


