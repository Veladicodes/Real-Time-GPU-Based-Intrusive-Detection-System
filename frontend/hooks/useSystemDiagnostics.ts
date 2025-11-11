import { useEffect, useState } from "react"

import apiClient from "@/lib/api"

export type SystemNode = {
  id: string
  name: string
  status: "online" | "warning" | "maintenance" | "offline"
  health: number
  cpu: number
  memory: number
  storage: number
  gpu_utilization?: number
  backend_latency?: number
  model_load_time?: number
  cache_hit_rate?: number
  uptime: string
  location: string
}

export type SystemDiagnosticsResponse = {
  systems: SystemNode[]
  summary?: {
    systems_online?: number
    warnings?: number
    maintenance?: number
    gpu_utilization?: number
    backend_latency?: number
    model_load_time?: number
    cache_hit_rate?: number
  }
}

const DEFAULT_RESPONSE: SystemDiagnosticsResponse = {
  systems: [],
  summary: {},
}

interface DashboardMetrics {
  system?: {
    cpu_percent?: number
    memory_percent?: number
    memory_used?: number
    memory_total?: number
    uptime_sec?: number
    gpu_util?: number | null
    gpu_memory_used?: number | null
    gpu_memory_total?: number | null
    redis_latency_ms?: number | null
  }
  redis?: {
    connected_clients?: number
    hit_rate?: number
    ops_per_sec?: number
    used_memory_human?: string
  }
  model?: {
    name?: string
    features?: number | null
    status?: string
  }
  summary?: {
    top_ips?: Record<string, number>
    timeline?: { minute: string; count: number }[]
  }
  threat?: {
    index?: number
    status?: string
  }
}

function formatUptime(seconds: number | undefined): string {
  if (!Number.isFinite(seconds)) return "—"
  const totalSeconds = Math.max(0, Math.floor(Number(seconds)))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function toPercentage(value: number | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, Number(value)))
}

function synthesizeSystems(metrics: DashboardMetrics | null | undefined): SystemNode[] {
  if (!metrics) return []
  const systems: SystemNode[] = []
  const system = metrics.system ?? {}
  const redis = metrics.redis ?? {}
  const model = metrics.model ?? {}
  const uptimeLabel = formatUptime(system.uptime_sec)

  systems.push({
    id: "core",
    name: "Core Telemetry",
    status: "online",
    health: 100,
    cpu: toPercentage(system.cpu_percent),
    memory: toPercentage(system.memory_percent),
    storage: toPercentage(system.memory_percent ? system.memory_percent * 0.85 : undefined),
    gpu_utilization: system.gpu_util ?? undefined,
    backend_latency: system.redis_latency_ms ?? undefined,
    model_load_time: undefined,
    cache_hit_rate: redis.hit_rate != null ? Math.round(redis.hit_rate * 100) : undefined,
    uptime: uptimeLabel,
    location: "GPU Command Node",
  })

  systems.push({
    id: "redis",
    name: "Redis Telemetry",
    status: redis.hit_rate && redis.hit_rate < 0.75 ? "warning" : "online",
    health: redis.hit_rate != null ? Math.round(redis.hit_rate * 100) : 75,
    cpu: toPercentage((redis.ops_per_sec ?? 0) / 200),
    memory: toPercentage( redis.used_memory_human ? parseInt(redis.used_memory_human, 10) / 1024 : 45, 45),
    storage: toPercentage((redis.connected_clients ?? 0) * 5, 30),
    cache_hit_rate: redis.hit_rate != null ? Math.round(redis.hit_rate * 100) : undefined,
    backend_latency: system.redis_latency_ms ?? undefined,
    uptime: uptimeLabel,
    location: "In-memory Stream",
  })

  systems.push({
    id: "model",
    name: model.name ? model.name.split(/[/\\]/).pop() ?? "Inference Engine" : "Inference Engine",
    status: model.status?.toLowerCase() === "loaded" ? "online" : "warning",
    health: model.status?.toLowerCase() === "loaded" ? 92 : 65,
    cpu: toPercentage((metrics.threat?.index ?? 0) / 1.4),
    memory: toPercentage((model.features ?? 10) * 4),
    storage: toPercentage((model.features ?? 10) * 2.5),
    gpu_utilization: system.gpu_util ?? undefined,
    uptime: uptimeLabel,
    location: "Inference Fabric",
  })

  if (metrics.summary?.top_ips) {
    const offenders = Object.keys(metrics.summary.top_ips)
    offenders.slice(0, 2).forEach((ip, idx) => {
      systems.push({
        id: `actor-${ip}`,
        name: `Actor ${ip}`,
        status: idx === 0 ? "warning" : "online",
        health: 60 - idx * 10,
        cpu: 55 + idx * 12,
        memory: 45 + idx * 10,
        storage: 38 + idx * 9,
        uptime: "volatile",
        location: "Remote vector",
      })
    })
  }

  return systems
}

export async function fetchSystemDiagnostics(): Promise<SystemDiagnosticsResponse> {
  try {
    const { data } = await apiClient.get<DashboardMetrics>("/api/dashboard/metrics")
    const systems = synthesizeSystems(data)
    const summary = {
      systems_online: systems.filter((s) => s.status === "online").length,
      warnings: systems.filter((s) => s.status === "warning").length,
      maintenance: systems.filter((s) => s.status === "maintenance").length,
      gpu_utilization: data?.system?.gpu_util ?? undefined,
      backend_latency: data?.system?.redis_latency_ms ?? undefined,
      cache_hit_rate: data?.redis?.hit_rate != null ? Math.round(data.redis.hit_rate * 100) : undefined,
    }
    return { systems, summary }
  } catch (error) {
    console.warn("Failed to fetch system diagnostics", error)
    return DEFAULT_RESPONSE
  }
}

export async function triggerSystemScan(): Promise<boolean> {
  try {
    await apiClient.post("/api/health/scan")
    return true
  } catch (error) {
    console.warn("System scan failed", error)
    return false
  }
}

type SystemMetrics = {
  timestamp: string | null
  cpu_load: number
  mem_util: number
  gpu_mode: string
  gpu_name: string
  systems_online: number
  warnings: number
  maintenance: number
  backend_latency: number
  model_load: number
  cache_hit: number
}

const DEFAULT_METRICS: SystemMetrics = {
  timestamp: null,
  cpu_load: 0,
  mem_util: 0,
  gpu_mode: "OFF",
  gpu_name: "None",
  systems_online: 0,
  warnings: 0,
  maintenance: 0,
  backend_latency: 0,
  model_load: 0,
  cache_hit: 0,
}

export function useSystemMetrics(pollInterval = 4_000): SystemMetrics {
  const [metrics, setMetrics] = useState<SystemMetrics>(DEFAULT_METRICS)

  useEffect(() => {
    let cancelled = false

    const fetchMetrics = async () => {
      try {
        const { data } = await apiClient.get("/api/metrics/system")
        if (cancelled) return
        setMetrics({
          timestamp: typeof data.timestamp === "string" ? data.timestamp : null,
          cpu_load: Number.isFinite(data.cpu_load) ? Number(data.cpu_load) : 0,
          mem_util: Number.isFinite(data.mem_util) ? Number(data.mem_util) : 0,
          gpu_mode: typeof data.gpu_mode === "string" ? data.gpu_mode : "OFF",
          gpu_name: typeof data.gpu_name === "string" ? data.gpu_name : "None",
          systems_online: Number.isFinite(data.systems_online) ? Number(data.systems_online) : 0,
          warnings: Number.isFinite(data.warnings) ? Number(data.warnings) : 0,
          maintenance: Number.isFinite(data.maintenance) ? Number(data.maintenance) : 0,
          backend_latency: Number.isFinite(data.backend_latency) ? Number(data.backend_latency) : 0,
          model_load: Number.isFinite(data.model_load) ? Number(data.model_load) : 0,
          cache_hit: Number.isFinite(data.cache_hit) ? Number(data.cache_hit) : 0,
        })
      } catch {
        if (!cancelled) {
          setMetrics((prev) => ({ ...prev, gpu_mode: "OFF" }))
        }
      }
    }

    fetchMetrics()
    const interval = window.setInterval(fetchMetrics, pollInterval)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [pollInterval])

  return metrics
}
