import { useMemo } from "react"

import { useApi } from "@/hooks/useApi"

export interface SystemHealthResponse {
  status: string
  latency_ms?: number
  backend_time?: string
  service?: string
}

export function useSystemHealth(pollIntervalMs = 5_000) {
  const { data, loading, error, lastUpdated, refresh } = useApi<SystemHealthResponse>("/api/health", {
    pollInterval: pollIntervalMs,
    initialData: { status: "unknown" },
  })

  const status = data?.status ?? "unknown"

  const normalized = useMemo(
    () => ({
      ...(data ?? { status: "unknown" }),
      status,
    }),
    [data, status],
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

