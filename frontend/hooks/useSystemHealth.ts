import { useMemo } from "react"

import { useApi } from "@/hooks/useApi"

export interface SystemHealthResponse {
  status: string
  latency_ms?: number
  backend_time?: string
  service?: string
}

const mapStatus = (input: string | undefined) => {
  if (!input) return "unknown"
  const value = input.toLowerCase()
  if (value.includes("ok") || value.includes("online")) return "online"
  if (value.includes("warn") || value.includes("degrad")) return "degraded"
  if (value.includes("off")) return "offline"
  return value
}

export function useSystemHealth(pollIntervalMs = 5_000) {
  const { data, loading, error, lastUpdated, refresh } = useApi<SystemHealthResponse>("/api/health", {
    pollInterval: pollIntervalMs,
    initialData: { status: "unknown" },
  })

  const status = mapStatus(data?.status)

  const normalized = useMemo(
    () => ({
      status,
      latency_ms: data?.latency_ms ?? null,
      backend_time: data?.backend_time ?? null,
      service: data?.service ?? null,
    }),
    [data?.backend_time, data?.latency_ms, data?.service, status],
  )

  return {
    data: normalized,
    status,
    loading,
    error,
    lastUpdated,
    refresh,
  }
}

