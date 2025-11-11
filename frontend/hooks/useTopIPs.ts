import { useMemo } from "react"

import { useApi } from "@/hooks/useApi"
import { useWebSocketLogs } from "@/hooks/useWebSocketLogs"

export interface TopIpEntry {
  ip: string
  count: number
}

interface TopIpsResponse {
  ips?: Array<{ ip?: string; count?: number }>
  top?: Array<{ ip?: string; count?: number }>
  top_ips?: Record<string, number>
  data?: Array<{ ip?: string; count?: number }>
}

interface SummaryResponse {
  top_ips?: Record<string, number>
}

function normalizeTopIps(payload: TopIpsResponse | null | undefined): TopIpEntry[] | null {
  if (!payload) return null
  const arrays = payload.ips ?? payload.top ?? payload.data
  if (Array.isArray(arrays) && arrays.length) {
    return arrays
      .map((entry) => ({
        ip: entry.ip ?? "",
        count: Number(entry.count ?? 0),
      }))
      .filter((entry) => entry.ip)
      .sort((a, b) => b.count - a.count)
  }
  if (payload.top_ips) {
    return Object.entries(payload.top_ips)
      .map(([ip, count]) => ({ ip, count: Number(count ?? 0) }))
      .filter((entry) => entry.ip)
      .sort((a, b) => b.count - a.count)
  }
  return null
}

function transformSummary(payload: SummaryResponse | null | undefined): TopIpEntry[] {
  if (!payload || !payload.top_ips) return []
  return Object.entries(payload.top_ips)
    .map(([ip, count]) => ({ ip, count: Number(count ?? 0) }))
    .filter((entry) => entry.ip)
    .sort((a, b) => b.count - a.count)
}

function deriveFromAlerts(alerts: ReturnType<typeof useWebSocketLogs>["alertMessages"]): TopIpEntry[] {
  if (!alerts.length) return []
  const tally = new Map<string, number>()
  alerts.forEach((message) => {
    const ip = message.src_ip ?? "Unknown"
    tally.set(ip, (tally.get(ip) ?? 0) + 1)
  })
  return [...tally.entries()]
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
}

export function useTopIPs(minutes = 5, pollIntervalMs = 10_000) {
  const { alertMessages } = useWebSocketLogs({ muteAudio: true })

  const primary = useApi<TopIpsResponse>("/api/top-ips", {
    pollInterval: pollIntervalMs,
    initialData: null,
  })

  const fallback = useApi<SummaryResponse>(`/api/summary/attacks?minutes=${minutes}`, {
    pollInterval: pollIntervalMs,
    enabled: Boolean(primary.error),
  })

  const parsed = useMemo(() => {
    const primaryData = normalizeTopIps(primary.data)
    if (primaryData && primaryData.length) return primaryData
    const summaryData = transformSummary(fallback.data)
    if (summaryData.length) return summaryData
    return deriveFromAlerts(alertMessages)
  }, [alertMessages, fallback.data, primary.data])

  return {
    data: parsed,
    loading: primary.loading && parsed.length === 0,
    error: primary.error ?? fallback.error,
    lastUpdated: primary.lastUpdated ?? fallback.lastUpdated,
    refresh: async () => {
      await Promise.all([primary.refresh(), fallback.refresh()])
    },
  }
}

