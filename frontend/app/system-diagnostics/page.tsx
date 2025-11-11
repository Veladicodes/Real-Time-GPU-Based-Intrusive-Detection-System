"use client"

import { useEffect, useMemo, useState } from "react"

import { motion } from "framer-motion"
import { Loader2, PauseCircle } from "lucide-react"

import ParticleBackdrop from "@/components/system/ParticleBackdrop"
import SystemCard, { type SystemStatus } from "@/components/ui/SystemCard"
import PipelineMetrics from "@/components/ui/PipelineMetrics"
import { StatBox } from "@/components/ui/StatBox"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useApi } from "@/hooks/useApi"
import { useSoundEngine } from "@/hooks/useSoundEngine"
import {
  fetchSystemDiagnostics,
  triggerSystemScan,
  type SystemDiagnosticsResponse,
  type SystemNode,
} from "@/hooks/useSystemDiagnostics"

type SystemMetricsResponse = {
  cpu?: number
  cpu_percent?: number
  mem?: {
    percent?: number
    used?: number
    total?: number
    available?: number
  }
}

function DiagnosticsInner() {
  const [data, setData] = useState<SystemDiagnosticsResponse>({ systems: [], summary: {} })
  const [loading, setLoading] = useState<boolean>(true)
  const [scanning, setScanning] = useState<boolean>(false)
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(false)
  const { play } = useSoundEngine()
  const {
    data: liveSystemMetrics,
    refresh: refreshSystemMetrics,
    loading: systemMetricsLoading,
    lastUpdated: systemMetricsUpdated,
  } = useApi<SystemMetricsResponse>("/api/metrics/system", {
    pollInterval: 6_000,
    initialData: null,
  })

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const response = await fetchSystemDiagnostics()
      if (!active) return
      setData(response)
      setLoading(false)
    }
    load()
    const interval = setInterval(() => {
      if (!maintenanceMode) {
        load()
      }
    }, 10_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [maintenanceMode])

  const handleMaintenance = () => {
    setMaintenanceMode((prev) => !prev)
    play("nav_click", { volume: 0.2 })
  }

  const handleSystemScan = async () => {
    setScanning(true)
    play("gauge_change", { volume: 0.3 })
    const ok = await triggerSystemScan()
    if (ok) {
      const response = await fetchSystemDiagnostics()
      setData(response)
      await refreshSystemMetrics()
    }
    setTimeout(() => setScanning(false), 1_800)
  }

  const summary = data.summary ?? {}
  const systems: SystemNode[] = data.systems ?? []
  const cpuPercent =
    liveSystemMetrics?.cpu_percent ?? liveSystemMetrics?.cpu ?? summary.cpu_percent ?? systems[0]?.cpu ?? 0
  const memoryPercent = liveSystemMetrics?.mem?.percent ?? summary.memory_percent ?? systems[0]?.memory ?? 0
  const highestCpu = useMemo(() => {
    if (!systems.length) return null
    return systems.reduce((top, system) => (system.cpu > (top?.cpu ?? -1) ? system : top), systems[0])
  }, [systems])

  const statBoxes = useMemo(() => {
    const warningCount = summary.warnings ?? systems.filter((s) => s.status === "warning").length
    const maintenanceCount = summary.maintenance ?? systems.filter((s) => s.status === "maintenance").length
    const gpuUtil = summary.gpu_utilization ?? systems.find((s) => s.id === "core")?.gpu_utilization ?? null
    return [
      {
        label: "Systems Online",
        value: summary.systems_online ?? systems.filter((s) => s.status === "online").length,
        severity: warningCount > 0 ? ("warning" as const) : ("normal" as const),
      },
      {
        label: "Warnings",
        value: warningCount,
        severity: warningCount > 0 ? ("warning" as const) : ("normal" as const),
      },
      {
        label: "Maintenance",
        value: maintenanceCount,
        severity: maintenanceCount > 0 ? ("warning" as const) : ("normal" as const),
      },
      {
        label: "GPU Utilisation",
        value: gpuUtil != null ? `${gpuUtil}%` : "--",
        severity:
          gpuUtil != null && gpuUtil > 85
            ? ("critical" as const)
            : gpuUtil != null && gpuUtil > 65
              ? ("warning" as const)
              : ("normal" as const),
      },
      {
        label: "CPU Load",
        value: `${Math.round(cpuPercent)}%`,
        severity: cpuPercent > 85 ? ("critical" as const) : cpuPercent > 70 ? ("warning" as const) : ("normal" as const),
      },
      {
        label: "Memory Util",
        value: `${Math.round(memoryPercent)}%`,
        severity:
          memoryPercent > 90 ? ("critical" as const) : memoryPercent > 75 ? ("warning" as const) : ("normal" as const),
      },
    ]
  }, [cpuPercent, maintenanceMode, memoryPercent, summary, systems])

  const pipelineMetrics = useMemo(
    () => [
      {
        label: "Backend Latency",
        value: Math.min(100, Number(summary.backend_latency ?? 42)),
        unit: "ms",
        description: `${Number(summary.backend_latency ?? 42).toFixed(0)} ms service response`,
      },
      {
        label: "Model Load",
        value: Math.min(100, Number(summary.model_load_time ?? 64)),
        unit: "ms",
        description: `${Number(summary.model_load_time ?? 64).toFixed(0)} ms model fetch`,
      },
      {
        label: "Cache Hit",
        value: Math.min(100, Number(summary.cache_hit_rate ?? 82)),
        unit: "%",
        description: "cache efficiency",
      },
      {
        label: "CPU Load",
        value: Math.min(100, Math.round(cpuPercent)),
        unit: "%",
        description: systemMetricsUpdated ? `Updated ${new Date(systemMetricsUpdated).toLocaleTimeString()}` : "live CPU",
      },
    ],
    [cpuPercent, summary, systemMetricsUpdated],
  )

  return (
    <div className="relative flex h-full flex-col gap-6 overflow-hidden bg-bg p-6 text-text">
      <ParticleBackdrop />

      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="page-header relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
              <div>
          <h1 className="model-header text-[1.6rem]">SYSTEM DIAGNOSTICS</h1>
          <p className="text-sm text-muted">Hardware, GPU, and pipeline telemetry orchestrated for RT-GIDS uptime.</p>
              </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleMaintenance}
            variant={maintenanceMode ? "default" : "outline"}
            className={`flex items-center gap-2 border border-brand/30 text-xs font-mono tracking-[0.2em] ${
              maintenanceMode ? "bg-brand text-bg" : "text-text hover:bg-surface/80"
            }`}
          >
            <PauseCircle className={`h-4 w-4 ${maintenanceMode ? "animate-pulse" : ""}`} />
            {maintenanceMode ? "EXIT MAINTENANCE" : "MAINTENANCE MODE"}
          </Button>
          <Button
            onClick={handleSystemScan}
            className={`flex items-center gap-2 border border-brand/40 bg-brand px-4 py-2 text-xs font-mono tracking-[0.25em] text-bg hover:border-brand/60 hover:bg-brand/90 ${
              scanning ? "animate-pulse" : ""
            }`}
            disabled={scanning}
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {scanning ? "SCANNING…" : "SYSTEM SCAN"}
          </Button>
            </div>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {statBoxes.map((box) => (
          <StatBox key={box.label} label={box.label.toUpperCase()} value={box.value} severity={box.severity} />
        ))}
      </motion.section>

      <div className="relative z-10 grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="panel col-span-1 bg-transparent backdrop-blur xl:col-span-8">
          <CardHeader className="border-b border-brand/15 pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">SYSTEM FLEET STATUS</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2 xl:grid-cols-3">
            {(loading || systemMetricsLoading) && <div className="col-span-full h-40 animate-pulse rounded bg-surface/60" />}
            {!loading &&
              systems.map((system) => (
                <SystemCard
                  key={system.id}
                  title={system.name}
                  cpu={system.cpu}
                  memory={system.memory}
                  storage={system.storage}
                  status={(system.status?.toUpperCase() as SystemStatus) ?? "ONLINE"}
                  uptime={system.uptime ?? "—"}
                  location={system.location}
                  highlight={highestCpu?.id === system.id}
                  freezeUpdates={maintenanceMode}
                />
              ))}
            {!loading && systems.length === 0 && (
              <div className="col-span-full flex h-32 items-center justify-center text-xs uppercase tracking-[0.4em] text-neutral-500">
                Awaiting diagnostic feed…
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="panel col-span-1 bg-transparent backdrop-blur xl:col-span-4">
          <CardHeader className="border-b border-brand/15 pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">PIPELINE METRICS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 text-xs font-mono text-muted">
            <PipelineMetrics metrics={pipelineMetrics} />
            <div className="panel bg-transparent p-4 text-xs">
              <h3 className="text-xs uppercase tracking-[0.3em] text-muted">MODE</h3>
              <p className="mt-2 text-sm text-text">
                {maintenanceMode
                  ? "Maintenance mode active — data refresh paused, visuals dimmed."
                  : "Live telemetry streaming from all GPU nodes."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {maintenanceMode && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <div className="rounded border border-brand/30 bg-bg/95 px-8 py-4 text-center font-mono text-sm uppercase tracking-[0.4em] text-brand">
            Maintenance Active • Updates Paused
                </div>
        </div>
      )}
    </div>
  )
}

export default DiagnosticsInner


