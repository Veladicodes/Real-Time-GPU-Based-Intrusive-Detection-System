import { useEffect, useMemo, useRef, useState } from "react"

import apiClient from "@/lib/api"

export interface MetricsResponse {
  total_packets: number
  attack_packets?: number
  attacks_blocked?: number
  normal_packets?: number
  unique_ips_blocked?: number
  ips_blocked?: number
  gpu_mode?: boolean
  uptime?: string
}

const METRICS_CACHE_KEY = "rtgids_metrics_v1"

const DEFAULT_DATA: MetricsResponse = {
  total_packets: 0,
  attack_packets: 0,
  unique_ips_blocked: 0,
  normal_packets: 0,
}

export function useFetchMetrics(pollIntervalMs = 5_000) {
  const [data, setData] = useState<MetricsResponse>(() => {
    if (typeof window === "undefined") return DEFAULT_DATA
    try {
      const cached = window.localStorage.getItem(METRICS_CACHE_KEY)
      if (cached) {
        return { ...DEFAULT_DATA, ...JSON.parse(cached) }
      }
    } catch (error) {
      console.warn("Failed to read metrics cache", error)
    }
    return DEFAULT_DATA
  })

  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchMetrics = async () => {
      setIsLoading(true)
      try {
        const response = await apiClient.get<MetricsResponse>("/api/metrics")
        if (!isMounted) return
        const nextData = { ...DEFAULT_DATA, ...response.data }
        setData(nextData)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(METRICS_CACHE_KEY, JSON.stringify(nextData))
        }
        setError(null)
      } catch (err) {
        if (!isMounted) return
        const message = err instanceof Error ? err : new Error("Failed to fetch metrics")
        setError(message)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchMetrics()
    timerRef.current = setInterval(fetchMetrics, pollIntervalMs)

    return () => {
      isMounted = false
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [pollIntervalMs])

  const derived = useMemo(() => {
    const attacksBlocked = data.attacks_blocked ?? data.attack_packets ?? 0
    const ipsBlocked = data.ips_blocked ?? data.unique_ips_blocked ?? 0
    const normalPackets = data.normal_packets ?? Math.max(data.total_packets - attacksBlocked, 0)

    return {
      ...data,
      attacks_blocked: attacksBlocked,
      ips_blocked: ipsBlocked,
      normal_packets: normalPackets,
    }
  }, [data])

  return {
    data: derived,
    isLoading,
    error,
  }
}


