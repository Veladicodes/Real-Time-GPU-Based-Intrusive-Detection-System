import { memo, useEffect, useMemo, useRef } from "react"

import { motion } from "framer-motion"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ConnectionState, LogMessage } from "@/hooks/useWebSocketLogs"

interface ActivityLogProps {
  entries: LogMessage[]
  connectionState: ConnectionState
  onClear?: () => void
}

const iconMap: Record<string, string> = {
  attack: "⚔",
  error: "❌",
  warning: "⚠",
  normal: "✅",
  info: "•",
}

const colorMap: Record<string, string> = {
  attack: "text-orange-400",
  error: "text-red-500",
  warning: "text-yellow-400",
  normal: "text-green-400",
  info: "text-neutral-300",
}

export const ActivityLog = memo(function ActivityLog({ entries, connectionState, onClear }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [entries])

  const renderedEntries = useMemo(() => entries.slice(-100), [entries])

  return (
    <Card className="flex h-full flex-col border border-neutral-800 bg-neutral-900/80 scanlines">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-mono tracking-wider text-orange-500">LIVE ACTIVITY LOG</CardTitle>
        <div className="flex items-center gap-3 text-xs font-mono text-neutral-500">
          <span
            className={`flex items-center gap-1 ${
              connectionState === "open" ? "text-green-400" : connectionState === "connecting" ? "text-orange-300" : "text-red-400"
            }`}
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-current animate-pulse" />
            {connectionState.toUpperCase()}
          </span>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-sm border border-neutral-700 px-2 py-1 text-neutral-500 transition hover:border-orange-500/50 hover:text-orange-300"
            >
              CLEAR
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <div ref={scrollRef} className="max-h-96 overflow-y-auto pr-2 font-mono text-xs">
          {renderedEntries.length === 0 ? (
            <div className="py-6 text-center text-neutral-600">Awaiting telemetry...</div>
          ) : (
            renderedEntries.map((entry, index) => (
              <motion.div
                key={`${entry.timestamp}-${index}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: index * 0.02 }}
                className="rounded-sm border-l-2 border-neutral-800 bg-neutral-900/40 px-3 py-2 transition hover:border-orange-500/60 hover:bg-neutral-800/60"
              >
                <div className="text-[10px] text-neutral-500">{new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false })}</div>
                <div className={`flex items-center gap-2 text-sm ${colorMap[entry.type.toLowerCase()] ?? "text-neutral-300"}`}>
                  <span>{iconMap[entry.type.toLowerCase()] ?? iconMap.info}</span>
                  <span className="truncate">{entry.threat ?? JSON.stringify(entry.raw ?? {}, null, 0)}</span>
                </div>
                {(entry.src_ip || entry.dst_ip || entry.raw) && (
                  <div className="mt-1 text-[11px] text-neutral-500">
                    {entry.src_ip && <span className="mr-4">SRC: {entry.src_ip}</span>}
                    {entry.dst_ip && <span className="mr-2">DST: {entry.dst_ip}</span>}
                    {entry.raw && (
                      <span className="block truncate text-neutral-600">
                        {JSON.stringify(entry.raw, null, 0)}
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
})

