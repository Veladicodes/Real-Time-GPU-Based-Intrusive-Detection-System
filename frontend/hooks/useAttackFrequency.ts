import { useMemo } from "react"

import { useApi } from "@/hooks/useApi"
import { useWebSocketLogs } from "@/hooks/useWebSocketLogs"

export interface AttackFrequencyPoint {
  minute: string
  count: number
}

export interface AttackFrequencyResponse {
  points: AttackFrequencyPoint[]
  totalEvents: number
  attackRate: number
  windowMinutes: number
}

interface SummaryResponse {
  attack_rate?: number
  total_events?: number
  timeline?: { minute: string; count: number }[]
}

const EMPTY_RESPONSE: AttackFrequencyResponse = {
  points: [],
  totalEvents: 0,
  attackRate: 0,
  windowMinutes: 5,
}

type AttackFrequencyApiResponse = {
  window?: number
  window_minutes?: number
  windowMinutes?: number
  interval_minutes?: number
  total?: number
  total_events?: number
  attack_rate?: number
  rate?: number
  data?: { timestamp?: string; time?: string; minute?: string; count?: number }[]
  points?: { timestamp?: string; time?: string; minute?: string; count?: number }[]
  history?: { timestamp?: string; time?: string; minute?: string; value?: number; count?: number }[]
}

function mapPoint(entry: Record<string, unknown>, fallbackIndex: number): AttackFrequencyPoint {
  const rawMinute =
    (entry.timestamp as string | undefined) ??
    (entry.time as string | undefined) ??
    (entry.minute as string | undefined) ??
    fallbackIndex.toString()
  const countValue =
    (entry.count as number | undefined) ??
    (entry.value as number | undefined) ??
    Number.parseFloat(String(entry["hits"] ?? 0))
  return {
    minute: rawMinute,
    count: Number.isFinite(Number(countValue)) ? Number(countValue) : 0,
  }
}

function normalizePrimary(payload: AttackFrequencyApiResponse | null | undefined, minutes: number): AttackFrequencyResponse | null {
  if (!payload) return null
  const rawPoints = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.points)
      ? payload.points
      : Array.isArray(payload.history)
        ? payload.history
        : null
  if (!rawPoints) return null

  const points = rawPoints.map((entry, index) => mapPoint(entry as Record<string, unknown>, index))

  const total =
    payload.total ??
    payload.total_events ??
    rawPoints.reduce((acc, entry) => {
      const value =
        (entry as { count?: number }).count ??
        (entry as { value?: number }).value ??
        Number.parseFloat(String((entry as Record<string, unknown>).hits ?? 0))
      return acc + (Number.isFinite(Number(value)) ? Number(value) : 0)
    }, 0)

  return {
    points,
    totalEvents: Number(total ?? 0),
    attackRate: Number(payload.attack_rate ?? payload.rate ?? 0),
    windowMinutes:
      Number(payload.window_minutes ?? payload.windowMinutes ?? payload.window ?? payload.interval_minutes ?? minutes) || minutes,
  }
}

function normalizeSummary(payload: SummaryResponse | null | undefined, minutes: number): AttackFrequencyResponse {
  if (!payload) return { ...EMPTY_RESPONSE, windowMinutes: minutes }
  const points = Array.isArray(payload.timeline)
    ? payload.timeline.map((entry) => ({ minute: String(entry.minute), count: Number(entry.count ?? 0) }))
    : []
  return {
    points,
    totalEvents: Number(payload.total_events ?? 0),
    attackRate: Number(payload.attack_rate ?? 0),
    windowMinutes: minutes,
  }
}

export function useAttackFrequency(minutes = 5, pollIntervalMs = 10_000) {
  const { alertMessages } = useWebSocketLogs({ muteAudio: true })
  const primary = useApi<AttackFrequencyApiResponse>("/api/attack-frequency", {
    pollInterval: pollIntervalMs,
    initialData: null,
  })

  const fallback = useApi<SummaryResponse>(`/api/summary/attacks?minutes=${minutes}`, {
    pollInterval: pollIntervalMs,
    enabled: Boolean(primary.error),
  })

  const fallbackFromAlerts = useMemo<AttackFrequencyResponse>(() => {
    if (!alertMessages.length) return { ...EMPTY_RESPONSE, windowMinutes: minutes }
    const windowMs = minutes * 60_000
    const now = Date.now()
    const buckets = new Map<string, number>()

    alertMessages.forEach((message) => {
      const ts = new Date(message.timestamp).getTime()
      if (Number.isNaN(ts) || now - ts > windowMs) return
      const minuteLabel = new Date(Math.floor(ts / 60_000) * 60_000).toISOString().slice(11, 16)
      buckets.set(minuteLabel, (buckets.get(minuteLabel) ?? 0) + 1)
    })

    const points = [...buckets.entries()]
      .map(([minute, count]) => ({ minute, count }))
      .sort((a, b) => a.minute.localeCompare(b.minute))

    const totalEvents = points.reduce((acc, point) => acc + point.count, 0)
    const attackRate = minutes > 0 ? totalEvents / minutes : totalEvents

    return {
      points,
      totalEvents,
      attackRate,
      windowMinutes: minutes,
    }
  }, [alertMessages, minutes])

  const parsed = useMemo(() => {
    const normalizedPrimary = normalizePrimary(primary.data, minutes)
    if (normalizedPrimary && normalizedPrimary.points.length) return normalizedPrimary
    return normalizeSummary(fallback.data, minutes)
  }, [fallback.data, minutes, primary.data])

  const composed = useMemo(() => {
    if (parsed.points.length) return parsed
    return fallbackFromAlerts
  }, [fallbackFromAlerts, parsed])

  return {
    data: composed,
    loading: primary.loading && !composed.points.length,
    error: primary.error ?? fallback.error,
    lastUpdated: primary.lastUpdated ?? fallback.lastUpdated,
    refresh: async () => {
      await Promise.all([primary.refresh(), fallback.refresh()])
    },
  }
}

