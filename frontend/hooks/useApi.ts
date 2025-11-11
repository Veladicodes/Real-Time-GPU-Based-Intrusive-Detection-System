import { useCallback, useEffect, useRef, useState } from "react"

import apiClient from "@/lib/api"

export interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
  lastUpdated: Date | null
  refresh: () => Promise<void>
}

interface UseApiOptions<T> {
  pollInterval?: number
  enabled?: boolean
  initialData?: T | null
  transform?: (payload: unknown) => T
}

export function useApi<T = unknown>(endpoint: string, options: UseApiOptions<T> = {}): UseApiResult<T> {
  const { pollInterval = 10_000, enabled = true, initialData = null, transform } = options
  const [data, setData] = useState<T | null>(initialData)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const mountedRef = useRef<boolean>(true)
  const controllerRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async () => {
    if (!enabled || !endpoint) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    try {
      const response = await apiClient.get(endpoint, { signal: controller.signal })
      if (!mountedRef.current) return
      const payload = transform ? transform(response.data) : (response.data as T)
      setData(payload ?? null)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      if (!mountedRef.current) return
      if (err instanceof DOMException && err.name === "AbortError") return
      const normalized = err instanceof Error ? err : new Error("Request failed")
      setError(normalized)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [enabled, endpoint, transform])

  useEffect(() => {
    mountedRef.current = true
    fetchData()

    if (!enabled || pollInterval <= 0) {
      return () => {
        mountedRef.current = false
        controllerRef.current?.abort()
      }
    }

    const timer = setInterval(fetchData, pollInterval)
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
      clearInterval(timer)
    }
  }, [enabled, fetchData, pollInterval])

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh: fetchData,
  }
}

