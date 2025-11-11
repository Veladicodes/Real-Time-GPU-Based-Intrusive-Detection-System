import { useMemo } from "react"

import { useApi } from "@/hooks/useApi"
import { useWebSocketLogs } from "@/hooks/useWebSocketLogs"

export type ThreatMetricSummary = {
  active_threats: number
  blocked_attacks: number
  suspicious_ips: number
  avg_response_time: string
  avg_confidence?: number
  geo_points: ThreatGeoPoint[]
  threat_table: ThreatTableRow[]
}

export type ThreatGeoPoint = {
  id: string
  ip: string
  latitude: number
  longitude: number
  intensity: number
}

export type ThreatTableRow = {
  ip: string
  threat_type: string
  confidence: number
  geo: string
  status: string
  recent_activity?: number[]
}

export type ThreatAnomalyPoint = {
  timestamp: string
  value: number
}

interface SummaryResponse {
  attack_rate?: number
  total_events?: number
  top_ips?: Record<string, number>
  top_ports?: Record<string, number>
  protocols?: Record<string, number>
  timeline?: { minute: string; count: number }[]
}

interface DashboardMetrics {
  threat?: { index?: number; count?: number; status?: string }
  redis?: { latency_ms?: number; hit_rate?: number }
  summary?: SummaryResponse
}

interface ThreatsApiResponse {
  active_threats?: number
  blocked_attacks?: number
  suspicious_ips?: number
  avg_response_time_ms?: number
  avg_response_time?: string | number
  avg_confidence?: number
  geo_points?: Array<{ id?: string; ip?: string; latitude?: number; longitude?: number; intensity?: number }>
  geo?: Array<{ ip?: string; lat?: number; lon?: number; intensity?: number }>
  threat_table?: Array<Partial<ThreatTableRow>>
  table?: Array<Partial<ThreatTableRow>>
  top_ips?: Array<{ ip?: string; count?: number; latitude?: number; longitude?: number; intensity?: number }>
}

interface AnomaliesApiResponse {
  timeline?: Array<{ timestamp?: string; minute?: string; count?: number; value?: number }>
  anomalies?: Array<{ timestamp?: string; minute?: string; count?: number; value?: number }>
  events?: Array<{ timestamp?: string; value?: number }>
}

const DEFAULT_METRICS: ThreatMetricSummary = {
  active_threats: 0,
  blocked_attacks: 0,
  suspicious_ips: 0,
  avg_response_time: "--",
  avg_confidence: undefined,
  geo_points: [],
  threat_table: [],
}

function pseudoGeoForIp(ip: string, index: number): { lat: number; lon: number } {
  const parts = ip.split(".").map((segment) => Number(segment) || 0)
  const seed = parts.reduce((acc, cur, idx) => acc + cur * (idx + 1), index * 17)
  const lat = ((seed % 160) - 80) + (parts[0] % 7)
  const lon = ((seed % 340) - 170) + (parts[1] % 11)
  return { lat, lon }
}

function buildGeoFromList(
  entries: Array<{ ip?: string; latitude?: number; longitude?: number; lat?: number; lon?: number; intensity?: number }> | undefined,
): ThreatGeoPoint[] | null {
  if (!entries || !entries.length) return null
  return entries
    .map((entry, index) => {
      const ip = entry.ip ?? `anon-${index}`
      const latitude = entry.latitude ?? entry.lat
      const longitude = entry.longitude ?? entry.lon
      const coords =
        latitude != null && longitude != null ? { latitude, longitude } : (() => {
          const fallback = pseudoGeoForIp(ip, index)
          return { latitude: fallback.lat, longitude: fallback.lon }
        })()
      return {
        id: `geo-${ip}-${index}`,
        ip,
        latitude: coords.latitude,
        longitude: coords.longitude,
        intensity: Number(entry.intensity ?? 1),
      }
    })
    .sort((a, b) => b.intensity - a.intensity)
}

function buildGeoPointsFromSummary(summary: SummaryResponse | undefined): ThreatGeoPoint[] {
  if (!summary?.top_ips) return []
  return Object.entries(summary.top_ips)
    .map(([ip, count], index) => {
      const intensity = Math.max(1, Number(count ?? 0))
      const { lat, lon } = pseudoGeoForIp(ip, index)
      return {
        id: `geo-${ip}`,
        ip,
        latitude: lat,
        longitude: lon,
        intensity,
      }
    })
    .sort((a, b) => b.intensity - a.intensity)
}

function buildThreatTableFromList(list: Array<Partial<ThreatTableRow>> | undefined): ThreatTableRow[] | null {
  if (!list || !list.length) return null
  return list
    .map((row, index) => ({
      ip: row.ip ?? `unknown-${index}`,
      threat_type: row.threat_type ?? "Unknown",
      confidence: Math.round(Number(row.confidence ?? 0)),
      geo: row.geo ?? "—",
      status: row.status ?? "ONLINE",
      recent_activity: row.recent_activity?.map((value) => Number(value ?? 0)),
    }))
    .sort((a, b) => b.confidence - a.confidence)
}

function buildThreatTableFromSummary(summary: SummaryResponse | undefined): ThreatTableRow[] {
  if (!summary?.top_ips) return []
  const total = Object.values(summary.top_ips).reduce((acc, val) => acc + Number(val ?? 0), 0) || 1
  const recentActivity = summary.timeline?.slice(-6).map((point) => Number(point.count ?? 0)) ?? []

  return Object.entries(summary.top_ips)
    .map(([ip, count]) => {
      const weight = Number(count ?? 0) / total
      const status = weight > 0.35 ? "CRITICAL" : weight > 0.2 ? "WARNING" : "ONLINE"
      const port = summary.top_ports ? Object.keys(summary.top_ports)[0] : "--"
      const proto = summary.protocols ? Object.keys(summary.protocols)[0] : "Unknown"
      return {
        ip,
        threat_type: `${proto} ${port}`,
        confidence: Math.round(weight * 100),
        geo: `Weight ${(weight * 100).toFixed(1)}%`,
        status,
        recent_activity: recentActivity,
      }
    })
    .sort((a, b) => b.confidence - a.confidence)
}

function buildAnomaliesFromList(
  items: Array<{ timestamp?: string; minute?: string; count?: number; value?: number }> | undefined,
): ThreatAnomalyPoint[] | null {
  if (!items || !items.length) return null
  return items.map((entry, index) => ({
    timestamp: entry.timestamp ?? entry.minute ?? index.toString(),
    value: Number(entry.count ?? entry.value ?? 0),
  }))
}

function buildAnomaliesFromSummary(summary: SummaryResponse | undefined): ThreatAnomalyPoint[] {
  if (!summary?.timeline) return []
  return summary.timeline.map((entry) => ({ timestamp: entry.minute, value: Number(entry.count ?? 0) }))
}

function deriveMetricsFromThreats(payload: ThreatsApiResponse | null | undefined): ThreatMetricSummary | null {
  if (!payload) return null
  const geoCandidates = buildGeoFromList(payload.geo_points ?? payload.geo ?? payload.top_ips)
  const tableCandidates = buildThreatTableFromList(payload.threat_table ?? payload.table)

  const avgResponse =
    typeof payload.avg_response_time === "string"
      ? payload.avg_response_time
      : payload.avg_response_time != null
        ? `${Number(payload.avg_response_time).toFixed(0)} ms`
        : payload.avg_response_time_ms != null
          ? `${Number(payload.avg_response_time_ms).toFixed(0)} ms`
          : "--"

  return {
    active_threats: Number(payload.active_threats ?? 0),
    blocked_attacks: Number(payload.blocked_attacks ?? 0),
    suspicious_ips: Number(payload.suspicious_ips ?? geoCandidates?.length ?? 0),
    avg_response_time: avgResponse,
    avg_confidence: payload.avg_confidence != null ? Number(payload.avg_confidence) : undefined,
    geo_points: geoCandidates ?? [],
    threat_table: tableCandidates ?? [],
  }
}

export function useThreatAnalytics(minutes = 10, pollIntervalMs = 15_000) {
  const { alertMessages } = useWebSocketLogs({ muteAudio: true })
  const threats = useApi<ThreatsApiResponse>("/api/metrics/threats", {
    pollInterval: pollIntervalMs,
    initialData: null,
  })

  const anomaliesApi = useApi<AnomaliesApiResponse>("/api/metrics/anomalies", {
    pollInterval: pollIntervalMs,
    initialData: null,
  })

  const summary = useApi<SummaryResponse>(`/api/summary/attacks?minutes=${minutes}`, {
    pollInterval: pollIntervalMs,
  })

  const dashboard = useApi<DashboardMetrics>("/api/dashboard/metrics", {
    pollInterval: pollIntervalMs * 2,
    initialData: undefined,
  })

  const metrics = useMemo<ThreatMetricSummary>(() => {
    const realtimeFallback = (() => {
      if (!alertMessages.length) return null
      const uniqueIps = new Set<string>()
      alertMessages.forEach((message) => {
        if (message.src_ip) uniqueIps.add(message.src_ip)
      })
      return {
        active_threats: alertMessages.length,
        blocked_attacks: Math.max(0, Math.round(alertMessages.length * 0.65)),
        suspicious_ips: uniqueIps.size,
        avg_response_time: "--",
        avg_confidence: undefined,
        geo_points: alertMessages.slice(-25).map((log, index) => {
          const ip = log.src_ip ?? `unknown-${index}`
          const coords = pseudoGeoForIp(ip, index)
          return {
            id: `geo-live-${ip}-${index}`,
            ip,
            latitude: coords.lat,
            longitude: coords.lon,
            intensity: 1 + Math.random() * 4,
          }
        }),
        threat_table: alertMessages.slice(-10).map((log, index) => ({
          ip: log.src_ip ?? `unknown-${index}`,
          threat_type: log.message ?? log.threat ?? "Alert",
          confidence: 80,
          geo: log.dst_ip ?? "Unknown",
          status: "CRITICAL",
        })),
      } satisfies ThreatMetricSummary
    })()

    const fromThreats = deriveMetricsFromThreats(threats.data)
    if (fromThreats) {
      const geo = fromThreats.geo_points.length ? fromThreats.geo_points : buildGeoPointsFromSummary(summary.data ?? dashboard.data?.summary)
      const table = fromThreats.threat_table.length
        ? fromThreats.threat_table
        : buildThreatTableFromSummary(summary.data ?? dashboard.data?.summary)
      const merged = {
        ...fromThreats,
        geo_points: geo,
        threat_table: table,
      }
      if (realtimeFallback) {
        merged.suspicious_ips = Math.max(merged.suspicious_ips, realtimeFallback.suspicious_ips)
        if (!merged.geo_points.length) merged.geo_points = realtimeFallback.geo_points
        if (!merged.threat_table.length) merged.threat_table = realtimeFallback.threat_table
      }
      return merged
    }

    const fallbackSummary = summary.data ?? dashboard.data?.summary
    if (!fallbackSummary) return realtimeFallback ?? DEFAULT_METRICS

    const activeThreats = Number(fallbackSummary.total_events ?? 0)
    const blockedAttacks = Number(fallbackSummary.top_ports ? Object.values(fallbackSummary.top_ports)[0] ?? 0 : activeThreats)
    const suspiciousIps = fallbackSummary.top_ips ? Object.keys(fallbackSummary.top_ips).length : 0
    const redisLatency = dashboard.data?.redis?.latency_ms
    const avgResponse = redisLatency != null ? `${redisLatency.toFixed(0)} ms` : "--"
    const avgConfidence = fallbackSummary.attack_rate ? Math.min(99, Math.max(5, Number(fallbackSummary.attack_rate) * 10)) : undefined

    const summaryMetrics: ThreatMetricSummary = {
      active_threats: activeThreats,
      blocked_attacks: blockedAttacks,
      suspicious_ips: Math.max(suspiciousIps, realtimeFallback?.suspicious_ips ?? 0),
      avg_response_time: avgResponse,
      avg_confidence: avgConfidence,
      geo_points: buildGeoPointsFromSummary(fallbackSummary),
      threat_table: buildThreatTableFromSummary(fallbackSummary),
    }
    if (!summaryMetrics.geo_points.length && realtimeFallback) summaryMetrics.geo_points = realtimeFallback.geo_points
    if (!summaryMetrics.threat_table.length && realtimeFallback) summaryMetrics.threat_table = realtimeFallback.threat_table
    return summaryMetrics
  }, [alertMessages, dashboard.data, summary.data, threats.data])

  const anomalies = useMemo<ThreatAnomalyPoint[]>(() => {
    const fromApi =
      buildAnomaliesFromList(anomaliesApi.data?.timeline) ??
      buildAnomaliesFromList(anomaliesApi.data?.anomalies) ??
      buildAnomaliesFromList(anomaliesApi.data?.events)
    if (fromApi) return fromApi
    const summaryAnomalies = buildAnomaliesFromSummary(summary.data ?? dashboard.data?.summary)
    if (summaryAnomalies.length) return summaryAnomalies
    if (!alertMessages.length) return []
    const buckets = new Map<string, number>()
    alertMessages.forEach((message) => {
      const ts = new Date(message.timestamp).getTime()
      if (Number.isNaN(ts)) return
      const label = new Date(Math.floor(ts / 60_000) * 60_000).toISOString()
      buckets.set(label, (buckets.get(label) ?? 0) + 1)
    })
    return [...buckets.entries()]
      .map(([timestamp, value]) => ({ timestamp, value }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }, [alertMessages, anomaliesApi.data, dashboard.data, summary.data])

  return {
    metrics,
    anomalies,
    loading: summary.loading && !metrics.geo_points.length,
    error: threats.error ?? anomaliesApi.error ?? summary.error,
    lastUpdated: summary.lastUpdated ?? threats.lastUpdated ?? anomaliesApi.lastUpdated,
    refresh: async () => {
      await Promise.all([threats.refresh(), anomaliesApi.refresh(), summary.refresh(), dashboard.refresh()])
    },
  }
}

