import { useEffect, useMemo, useRef, useState } from "react"

import { fetchThreatIndex } from "@/lib/api"
import { useUIAudio } from "@/hooks/useUIAudio"

export type ThreatStatus = "normal" | "warn" | "critical"

export interface MetricsStreamResult {
  threatLevel: number
  threatStatus: ThreatStatus
  count: number
  loading: boolean
  error: Error | null
  lastUpdated: Date | null
  refresh: () => Promise<void>
}

const INITIAL_STATE: MetricsStreamResult = {
  threatLevel: 0,
  threatStatus: "normal",
  count: 0,
  loading: true,
  error: null,
  lastUpdated: null,
  refresh: async () => {},
}

function clampLevel(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, numeric))
}

function deriveThreatStatus(level: number, status?: string): ThreatStatus {
  if (status) {
    const normalized = status.toLowerCase()
    if (["critical", "high"].includes(normalized)) return "critical"
    if (["warn", "warning", "elevated"].includes(normalized)) return "warn"
    if (["normal", "idle", "nominal"].includes(normalized)) return "normal"
  }
  if (level >= 70) return "critical"
  if (level >= 30) return "warn"
  return "normal"
}

export function useMetricsStream(pollIntervalMs = 6_000): MetricsStreamResult {
  const [state, setState] = useState<MetricsStreamResult>(INITIAL_STATE)
  const mountedRef = useRef<boolean>(true)
  const previousLevelRef = useRef<number>(0)
  const lastToneRef = useRef<number>(0)
  const { play, muted } = useUIAudio()

  const fetchData = useMemo(
    () => async () => {
      try {
        const payload = await fetchThreatIndex()
        if (!mountedRef.current) return

        const threatLevel = clampLevel(payload?.threat_index)
        const threatStatus = deriveThreatStatus(threatLevel, payload?.status as string | undefined)
        const threatCount = Number(payload?.count ?? payload?.total ?? 0)

        setState({
          threatLevel,
          threatStatus,
          count: threatCount,
          loading: false,
          error: null,
          lastUpdated: new Date(),
          refresh: fetchData,
        })

        if (!muted) {
          const previous = previousLevelRef.current
          const now = Date.now()

          if (threatLevel - previous >= 15 && now - lastToneRef.current > 2_500) {
            play(threatStatus === "critical" ? "alert" : "warning")
            lastToneRef.current = now
          } else if (previous - threatLevel >= 20 && now - lastToneRef.current > 4_000) {
            play("info")
            lastToneRef.current = now
          }
        }

        previousLevelRef.current = threatLevel
      } catch (err) {
        if (!mountedRef.current) return
        const normalizedError = err instanceof Error ? err : new Error("Failed to fetch threat metrics")
        setState((prev) => ({
          ...prev,
          error: normalizedError,
          loading: false,
        }))
      }
    },
    [muted, play],
  )

  useEffect(() => {
    mountedRef.current = true
    fetchData()

    if (pollIntervalMs > 0) {
      const timer = setInterval(fetchData, pollIntervalMs)
      return () => {
        mountedRef.current = false
        clearInterval(timer)
      }
    }

    return () => {
      mountedRef.current = false
    }
  }, [fetchData, pollIntervalMs])

  return useMemo(
    () => ({
      ...state,
      refresh: fetchData,
    }),
    [fetchData, state],
  )
}


