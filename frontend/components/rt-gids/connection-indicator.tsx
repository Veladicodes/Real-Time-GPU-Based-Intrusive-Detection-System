import { memo } from "react"

import type { ConnectionState } from "@/hooks/useWebSocketLogs"

interface ConnectionIndicatorProps {
  state: ConnectionState
}

const labelMap: Record<ConnectionState, string> = {
  connecting: "CONNECTING",
  open: "CONNECTED",
  closed: "DISCONNECTED",
  error: "ERROR",
}

const colorMap: Record<ConnectionState, string> = {
  connecting: "bg-brand/70",
  open: "bg-brand",
  closed: "bg-brand/40",
  error: "bg-brand/30",
}

export const ConnectionIndicator = memo(function ConnectionIndicator({ state }: ConnectionIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.3em] text-muted">
      <span className={`inline-flex h-2 w-2 animate-ping rounded-full ${colorMap[state]} opacity-75`} />
      <span className={`inline-flex h-2 w-2 rounded-full ${colorMap[state]}`} />
      <span className="text-text">{labelMap[state]}</span>
    </div>
  )
})


