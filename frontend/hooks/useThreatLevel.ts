import { useEffect, useState } from "react"

import apiClient from "@/lib/api"

export interface ThreatLevelResponse {
  value: number
  updated_at?: string
}

const CACHE_KEY = "rtgids_threat_level_v1"

export function useThreatLevel(pollIntervalMs = 5_000) {
  const [data, setData] = useState<ThreatLevelResponse>(() => {
    if (typeof window === "undefined") return { value: 0 }
    const cachedRaw = window.localStorage.getItem(CACHE_KEY)
    if (cachedRaw) {
      try {
        return JSON.parse(cachedRaw) as ThreatLevelResponse
      } catch (error) {
        console.warn("Failed to parse threat level cache", error)
      }
    }
    return { value: 0 }
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let isMounted = true
    let timer: NodeJS.Timeout | null = null

    const fetchThreatLevel = async () => {
      setIsLoading(true)
      try {
        const response = await apiClient.get<ThreatLevelResponse>("/api/threat-level")
        if (!isMounted) return
        const sanitized = {
          value: Math.max(0, Math.min(100, response.data?.value ?? 0)),
          updated_at: response.data?.updated_at ?? new Date().toISOString(),
        }
        setData(sanitized)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(CACHE_KEY, JSON.stringify(sanitized))
        }
        setError(null)
      } catch (err) {
        if (!isMounted) return
        setError(err instanceof Error ? err : new Error("Failed to fetch threat level"))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchThreatLevel()
    timer = setInterval(fetchThreatLevel, pollIntervalMs)

    return () => {
      isMounted = false
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [pollIntervalMs])

  return {
    data,
    isLoading,
    error,
  }
}


