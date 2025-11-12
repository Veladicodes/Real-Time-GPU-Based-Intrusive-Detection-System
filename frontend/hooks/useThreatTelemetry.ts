import { useEffect, useMemo, useRef, useState } from "react"

import { api } from "@/lib/api"

type ThreatStats = {
  activeThreats: number
  blockedAttacks: number
  suspiciousIPs: number
  avgConfidence: number
}

export type TimelinePoint = {
  timestamp: string
  value: number
}

export type RadarPoint = {
  angle: number
  intensity: number
  geo?: string | null
  timestamp: string
}

export type ThreatEvent = {
  id: string
  timestamp: string
  ip: string
  threat_type: string
  confidence: number
  geo?: string | null
  vector: number
  status: string
  activity: number[]
}

type TelemetryState = {
  stats: ThreatStats
  timeline: TimelinePoint[]
  radarPoints: RadarPoint[]
  events: ThreatEvent[]
  dominantVector: { angle: number; geo?: string | null } | null
  statsConnected: boolean
  eventsConnected: boolean
}

const DEFAULT_STATE: TelemetryState = {
  stats: { activeThreats: 0, blockedAttacks: 0, suspiciousIPs: 0, avgConfidence: 0 },
  timeline: [],
  radarPoints: [],
  events: [],
  dominantVector: null,
  statsConnected: false,
  eventsConnected: false,
}

const MAX_ENTRIES = 100
const TIMELINE_WINDOW_MS = 5 * 60 * 1000

function buildWebSocketUrl(path: string) {
  const explicit = process.env.NEXT_PUBLIC_WS_BASE
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"
  const base = explicit || backend
  try {
    const url = new URL(base)
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
    url.pathname = path
    return url.toString()
  } catch {
    const normalized = base.replace(/^http/, "ws")
    return `${normalized}${path}`
  }
}

export function useThreatTelemetry() {
  const [state, setState] = useState<TelemetryState>(DEFAULT_STATE)
  const timelineCounterRef = useRef<number>(0)
  const activityMapRef = useRef<Map<string, number[]>>(new Map())
  const dominantMapRef = useRef<Map<number, { count: number; geo?: string | null }>>(new Map())

  useEffect(() => {
    let cancelled = false
    const loadInitial = async () => {
      try {
        const [statsResponse, eventsResponse] = await Promise.all([
          api.get("/api/threats/stats"),
          api.get("/api/threats/recent?n=50"),
        ])

        if (cancelled) return

        const statsPayload = statsResponse.data ?? {}
        const eventsPayload: any[] = Array.isArray(eventsResponse.data) ? eventsResponse.data : []

        const stats: ThreatStats = {
          activeThreats: Number(statsPayload.active_threats ?? 0),
          blockedAttacks: Number(statsPayload.blocked_attacks ?? 0),
          suspiciousIPs: Number(statsPayload.suspicious_ips ?? 0),
          avgConfidence: Number(statsPayload.avg_confidence ?? 0),
        }

        const processedEvents = eventsPayload.slice(-MAX_ENTRIES).map((event) =>
          normalizeEvent(event, activityMapRef.current),
        )

        const radarPoints = processedEvents.map((event) => ({
          angle: event.vector,
          intensity: event.confidence,
          geo: event.geo,
          timestamp: event.timestamp,
        }))

        const timeline = processedEvents.map((event, index) => ({
          timestamp: event.timestamp,
          value: index + 1,
        }))
        timelineCounterRef.current = processedEvents.length

        setState((prev) => ({
          ...prev,
          stats,
          events: processedEvents.reverse(),
          radarPoints,
          timeline,
        }))
      } catch (error) {
        console.warn("⚠️ Unable to load initial threat telemetry.", error)
      }
    }

    loadInitial()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const statsSocket = new WebSocket(buildWebSocketUrl("/ws/stats"))

    statsSocket.onopen = () => {
      setState((prev) => ({ ...prev, statsConnected: true }))
    }
    statsSocket.onclose = () => {
      setState((prev) => ({ ...prev, statsConnected: false }))
    }
    statsSocket.onerror = () => {
      setState((prev) => ({ ...prev, statsConnected: false }))
    }
    statsSocket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        setState((prev) => ({
          ...prev,
          stats: {
            activeThreats: Number(payload.active_threats ?? prev.stats.activeThreats),
            blockedAttacks: Number(payload.blocked_attacks ?? prev.stats.blockedAttacks),
            suspiciousIPs: Number(payload.suspicious_ips ?? prev.stats.suspiciousIPs),
            avgConfidence: Number(payload.avg_confidence ?? prev.stats.avgConfidence),
          },
        }))
      } catch (error) {
        console.warn("⚠️ Failed to parse stats websocket payload.", error)
      }
    }

    return () => statsSocket.close()
  }, [])

  useEffect(() => {
    const eventsSocket = new WebSocket(buildWebSocketUrl("/ws/threats"))

    eventsSocket.onopen = () => {
      setState((prev) => ({ ...prev, eventsConnected: true }))
    }
    eventsSocket.onclose = () => {
      setState((prev) => ({ ...prev, eventsConnected: false }))
    }
    eventsSocket.onerror = () => {
      setState((prev) => ({ ...prev, eventsConnected: false }))
    }
    eventsSocket.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data)
        ingestEvent(payload)
      } catch (error) {
        console.warn("⚠️ Failed to parse threat event payload.", error)
      }
    }

    return () => eventsSocket.close()
  }, [])

  const ingestEvent = (event: any) => {
    const normalized = normalizeEvent(event, activityMapRef.current)
    const nextTimelineValue = timelineCounterRef.current + 1
    timelineCounterRef.current = nextTimelineValue

    const point: RadarPoint = {
      angle: normalized.vector,
      intensity: normalized.confidence,
      geo: normalized.geo,
      timestamp: normalized.timestamp,
    }

    updateDominantVector(normalized, dominantMapRef.current, setState)

    setState((prev) => {
      const cutoff = Date.now() - TIMELINE_WINDOW_MS
      const nextTimeline = [...prev.timeline, { timestamp: normalized.timestamp, value: nextTimelineValue }]
        .filter((entry) => new Date(entry.timestamp).getTime() >= cutoff)
        .slice(-MAX_ENTRIES)

      const nextRadar = [...prev.radarPoints, point].slice(-MAX_ENTRIES)
      const nextEvents = [normalized, ...prev.events].slice(0, MAX_ENTRIES)

      return {
        ...prev,
        timeline: nextTimeline,
        radarPoints: nextRadar,
        events: nextEvents,
      }
    })
  }

  const derived = useMemo(
    () => ({
      stats: state.stats,
      timeline: state.timeline,
      radarPoints: state.radarPoints,
      events: state.events,
      dominantVector: state.dominantVector,
      statsConnected: state.statsConnected,
      eventsConnected: state.eventsConnected,
    }),
    [state],
  )

  return derived
}

function normalizeEvent(event: any, activityMap: Map<string, number[]>) {
  const timestamp = typeof event?.timestamp === "string" ? event.timestamp : new Date().toISOString()
  const ip = String(event?.ip ?? "0.0.0.0")
  const threatType = String(event?.threat_type ?? "Unknown")
  const confidence = clamp(Number(event?.confidence ?? 0), 0, 1)
  const vector = clamp(Number(event?.vector ?? 0), 0, 360)
  const status = String(event?.status ?? "Monitoring")
  const geo = event?.geo ?? null

  const history = activityMap.get(ip) ?? []
  history.push(Math.round(confidence * 100))
  if (history.length > 12) history.shift()
  activityMap.set(ip, history)

  return {
    id: `${ip}-${timestamp}`,
    timestamp,
    ip,
    threat_type: threatType,
    confidence,
    geo,
    vector,
    status,
    activity: [...history],
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function updateDominantVector(
  event: ThreatEvent,
  map: Map<number, { count: number; geo?: string | null }>,
  setState: (updater: (prev: TelemetryState) => TelemetryState) => void,
) {
  const angleKey = Math.round(event.vector)
  const existing = map.get(angleKey)
  map.set(angleKey, {
    count: (existing?.count ?? 0) + 1,
    geo: event.geo,
  })

  let topAngle = angleKey
  let topCount = 0
  let topGeo: string | null | undefined = null
  map.forEach((value, angle) => {
    if (value.count > topCount) {
      topCount = value.count
      topAngle = angle
      topGeo = value.geo
    }
  })

  setState((prev) => ({
    ...prev,
    dominantVector: {
      angle: topAngle,
      geo: topGeo,
    },
  }))
}

export type UseThreatTelemetryReturn = ReturnType<typeof useThreatTelemetry>


