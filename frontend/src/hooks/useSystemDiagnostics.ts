"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { apiClient, API_TOKEN, BACKEND_URL, WS_TOKEN } from "@/lib/api"

export type SystemSnapshot = {
  uptime: string
  backend_latency_ms: number | null
  model_load_ms: number | null
  cache_hit_percent: number
  cpu_load: number
  memory_util: number
  gpu_util: number
  gpu_mem: number
  gpu_name: string
  warnings: string[]
  systems_online: boolean
  maintenance_mode: boolean
  timestamp: string
}

export type FleetNode = {
  id: string
  status: "online" | "offline" | "warning"
  latency_ms: number | null
  packet_rate: number
  location?: string
}

export type MetricsHistoryPoint = {
  timestamp: string
  cpu: number
  memory: number
  gpu: number
  cacheHit: number
  latency: number | null
}

export type ScanResult = {
  redis?: { ok: boolean; latency_ms: number }
  gpu?: { ok: boolean; name: string; utilization: number; memory_mb: number }
  disk?: { ok: boolean; free_percent: number; free_gb: number }
  network?: { ok: boolean }
  model?: { ok: boolean; detail?: string; latency_ms?: number }
  timestamp?: string
}

type UseSystemDiagnosticsReturn = {
  snapshot: SystemSnapshot | null
  history: MetricsHistoryPoint[]
  warnings: string[]
  maintenance: boolean
  wsConnected: boolean
  fleet: FleetNode[]
  fleetLoading: boolean
  scanResult: ScanResult | null
  scanning: boolean
  lastUpdated: string | null
  toggleMaintenance: (enabled: boolean) => Promise<void>
  triggerScan: () => Promise<void>
  refreshStatus: () => Promise<void>
  refreshFleet: () => Promise<void>
}

const HISTORY_LIMIT = 60

function buildTelemetryUrl(): string {
  try {
    const base = new URL(BACKEND_URL)
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:"
    const trimmed = base.pathname.replace(/\/$/, "")
    base.pathname = `${trimmed}/ws/system/telemetry`
    const token = WS_TOKEN || API_TOKEN
    if (token?.length) {
      base.searchParams.set("token", token.startsWith("api::") ? token : `api::${token}`)
    }
    return base.toString()
  } catch {
    const protocol = BACKEND_URL.startsWith("https") ? "wss" : "ws"
    const clean = BACKEND_URL.replace(/^https?:\/\//i, "").replace(/\/$/, "")
    const token = (WS_TOKEN || API_TOKEN || "").replace(/^api::/, "")
    const query = token ? `?token=${encodeURIComponent(`api::${token}`)}` : ""
    return `${protocol}://${clean}/ws/system/telemetry${query}`
  }
}

export function useSystemDiagnostics(): UseSystemDiagnosticsReturn {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null)
  const [history, setHistory] = useState<MetricsHistoryPoint[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [maintenance, setMaintenance] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [fleet, setFleet] = useState<FleetNode[]>([])
  const [fleetLoading, setFleetLoading] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchStatus = useCallback(async () => {
    const { data } = await apiClient.get<SystemSnapshot>("/api/system/status")
    setSnapshot(data)
    setMaintenance(Boolean(data.maintenance_mode))
    setWarnings(data.warnings ?? [])
    setLastUpdated(data.timestamp ?? null)
    setHistory((prev) =>
      [
        ...prev.slice(-(HISTORY_LIMIT - 1)),
        {
          timestamp: data.timestamp ?? new Date().toISOString(),
          cpu: Number.isFinite(data.cpu_load) ? data.cpu_load : 0,
          memory: Number.isFinite(data.memory_util) ? data.memory_util : 0,
          gpu: Number.isFinite(data.gpu_util) ? data.gpu_util : 0,
          cacheHit: Number.isFinite(data.cache_hit_percent) ? data.cache_hit_percent : 0,
          latency: data.backend_latency_ms ?? null,
        },
      ],
    )
  }, [])

  const fetchFleet = useCallback(async () => {
    setFleetLoading(true)
    try {
      const { data } = await apiClient.get<FleetNode[]>("/api/system/fleet")
      setFleet(data)
    } finally {
      setFleetLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus().catch(() => {
      // ignore initial failure
    })
    const interval = window.setInterval(() => {
      fetchStatus().catch(() => null)
    }, 5_000)
    return () => window.clearInterval(interval)
  }, [fetchStatus])

  useEffect(() => {
    fetchFleet().catch(() => null)
    const interval = window.setInterval(() => {
      fetchFleet().catch(() => null)
    }, 10_000)
    return () => window.clearInterval(interval)
  }, [fetchFleet])

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeout.current) return
    reconnectTimeout.current = setTimeout(() => {
      reconnectTimeout.current = null
      connect()
    }, 3_000)
  }, [])

  const handleMessage = useCallback(
    (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === "metrics") {
          const data: SystemSnapshot = payload.payload
          setSnapshot(data)
          setMaintenance(Boolean(data.maintenance_mode))
          setWarnings(data.warnings ?? [])
          setLastUpdated(data.timestamp ?? null)
          setHistory((prev) => {
            const next = [
              ...prev.slice(-(HISTORY_LIMIT - 1)),
              {
                timestamp: data.timestamp ?? new Date().toISOString(),
                cpu: Number.isFinite(data.cpu_load) ? data.cpu_load : 0,
                memory: Number.isFinite(data.memory_util) ? data.memory_util : 0,
                gpu: Number.isFinite(data.gpu_util) ? data.gpu_util : 0,
                cacheHit: Number.isFinite(data.cache_hit_percent) ? data.cache_hit_percent : 0,
                latency: data.backend_latency_ms ?? null,
              },
            ]
            return next
          })
        } else if (payload.type === "scan_result") {
          setScanResult(payload.payload ?? null)
          setScanning(false)
        } else if (payload.type === "maintenance_toggle") {
          setMaintenance(Boolean(payload.payload?.enabled))
        } else if (payload.type === "warnings") {
          setWarnings(Array.isArray(payload.payload) ? payload.payload : [])
        }
      } catch {
        // Ignore malformed payloads
      }
    },
    [],
  )

  const connect = useCallback(() => {
    if (typeof window === "undefined") return
    const url = buildTelemetryUrl()
    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onopen = () => {
      setWsConnected(true)
    }
    socket.onerror = () => {
      setWsConnected(false)
    }
    socket.onclose = () => {
      setWsConnected(false)
      socketRef.current = null
      scheduleReconnect()
    }
    socket.onmessage = handleMessage
  }, [handleMessage, scheduleReconnect])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current)
      }
      if (socketRef.current) {
        socketRef.current.close()
      }
    }
  }, [connect])

  const toggleMaintenance = useCallback(
    async (enabled: boolean) => {
      await apiClient.post("/api/system/maintenance", { enabled })
      setMaintenance(enabled)
    },
    [],
  )

  const triggerScan = useCallback(async () => {
    setScanning(true)
    setScanResult(null)
    try {
      await apiClient.post("/api/system/scan")
    } catch {
      setScanning(false)
    }
  }, [])

  return useMemo(
    () => ({
      snapshot,
      history,
      warnings,
      maintenance,
      wsConnected,
      fleet,
      fleetLoading,
      scanResult,
      scanning,
      lastUpdated,
      toggleMaintenance,
      triggerScan,
      refreshStatus: fetchStatus,
      refreshFleet: fetchFleet,
    }),
    [
      fleet,
      fleetLoading,
      history,
      lastUpdated,
      maintenance,
      scanning,
      scanResult,
      snapshot,
      warnings,
      wsConnected,
      fetchFleet,
      fetchStatus,
      toggleMaintenance,
      triggerScan,
    ],
  )
}


