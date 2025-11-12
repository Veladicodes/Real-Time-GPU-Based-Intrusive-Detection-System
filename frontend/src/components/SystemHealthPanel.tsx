"use client"

import { Activity, AlertTriangle, Cpu, Power } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { SystemSnapshot } from "@/src/hooks/useSystemDiagnostics"

type SystemHealthPanelProps = {
  snapshot: SystemSnapshot | null
  warnings: string[]
  wsConnected: boolean
}

type HealthStat = {
  label: string
  value: string
  tone: "normal" | "warning" | "critical"
  hint?: string
  icon: React.ReactNode
}

const toneClasses: Record<HealthStat["tone"], string> = {
  normal: "border-brand/20 text-brand",
  warning: "border-yellow-500/40 text-yellow-300",
  critical: "border-red-500/40 text-red-400",
}

export function SystemHealthPanel({ snapshot, warnings, wsConnected }: SystemHealthPanelProps) {
  const maintenance = Boolean(snapshot?.maintenance_mode)
  const online = Boolean(snapshot?.systems_online)
  const gpuUtil = snapshot?.gpu_util ?? 0

  const stats: HealthStat[] = [
    {
      label: "Systems Online",
      value: online ? "ONLINE" : "OFFLINE",
      tone: online ? "normal" : "critical",
      hint: snapshot?.uptime ? `Uptime ${snapshot.uptime}` : undefined,
      icon: <Power className="h-5 w-5" />,
    },
    {
      label: "Warnings",
      value: warnings.length.toString(),
      tone: warnings.length === 0 ? "normal" : warnings.length > 2 ? "critical" : "warning",
      hint: warnings[0],
      icon: <AlertTriangle className="h-5 w-5" />,
    },
    {
      label: "Maintenance",
      value: maintenance ? "ACTIVE" : "READY",
      tone: maintenance ? "warning" : "normal",
      hint: maintenance ? "Telemetry paused for service window" : "Live streaming",
      icon: <Activity className={`h-5 w-5 ${maintenance ? "animate-pulse" : ""}`} />,
    },
    {
      label: "GPU Utilisation",
      value: `${Math.round(gpuUtil)}%`,
      tone: gpuUtil > 90 ? "critical" : gpuUtil > 70 ? "warning" : "normal",
      hint: snapshot?.gpu_name ?? undefined,
      icon: <Cpu className="h-5 w-5" />,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className={cn(
            "relative overflow-hidden border bg-black/40 px-4 py-3 transition-colors duration-200",
            toneClasses[stat.tone],
          )}
        >
          <CardContent className="flex items-center justify-between gap-3 p-0">
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.3em] text-muted">{stat.label}</p>
              <p className="mt-2 text-xl font-mono uppercase tracking-[0.2em] text-text">{stat.value}</p>
              {stat.hint && (
                <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.2em] text-muted">{stat.hint}</p>
              )}
            </div>
            <div className="rounded-full border border-current/30 p-3 text-current">{stat.icon}</div>
          </CardContent>
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 h-0.5 transition-all duration-500",
              stat.tone === "critical"
                ? "bg-red-500"
                : stat.tone === "warning"
                  ? "bg-yellow-400"
                  : "bg-brand",
            )}
          />
        </Card>
      ))}
      <Card className={cn("border bg-black/40 px-4 py-3", wsConnected ? "border-brand/20" : "border-red-500/30")}>
        <CardContent className="flex items-center justify-between p-0">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.3em] text-muted">Telemetry</p>
            <p
              className={cn(
                "mt-2 text-xl font-mono uppercase tracking-[0.25em]",
                wsConnected ? "text-brand" : "text-red-400",
              )}
            >
              {wsConnected ? "L I V E" : "OFFLINE"}
            </p>
          </div>
          <div className={cn("h-10 w-10 rounded-full border-2", wsConnected ? "border-brand animate-pulse" : "border-red-500")} />
        </CardContent>
      </Card>
    </div>
  )
}

export default SystemHealthPanel

"use client"

import { memo, useMemo } from "react"

import { Activity, AlertTriangle, Cpu, MonitorSmartphone, ShieldCheck, Zap } from "lucide-react"

import { StatBox } from "@/components/ui/StatBox"
import type { SystemSnapshot } from "@/src/hooks/useSystemDiagnostics"

type SystemHealthPanelProps = {
  snapshot: SystemSnapshot | null
  warnings: string[]
  maintenance: boolean
  wsConnected: boolean
}

function SystemHealthPanelComponent({ snapshot, warnings, maintenance, wsConnected }: SystemHealthPanelProps) {
  const stats = useMemo(() => {
    const gpu = snapshot?.gpu_util ?? 0
    const cpu = snapshot?.cpu_load ?? 0
    const memory = snapshot?.memory_util ?? 0
    const cacheHit = snapshot?.cache_hit_percent ?? 0
    const systemsOnline = snapshot?.systems_online ?? false
    const warningCount = warnings.length

    return [
      {
        label: "SYSTEMS ONLINE",
        value: systemsOnline ? "ONLINE" : "OFFLINE",
        severity: systemsOnline ? ("normal" as const) : ("critical" as const),
        icon: <MonitorSmartphone className="h-5 w-5" />,
        hint: wsConnected ? "Telemetry live" : "Telemetry paused",
      },
      {
        label: "WARNINGS",
        value: warningCount,
        severity: warningCount > 0 ? ("warning" as const) : ("normal" as const),
        icon: <AlertTriangle className="h-5 w-5" />,
        hint: warningCount > 0 ? warnings[0] : "All subsystems stable",
      },
      {
        label: "MAINTENANCE",
        value: maintenance ? "ACTIVE" : "OFF",
        severity: maintenance ? ("warning" as const) : ("normal" as const),
        icon: <ShieldCheck className="h-5 w-5" />,
        hint: maintenance ? "Ingestion paused" : "Streaming live",
      },
      {
        label: "GPU UTILISATION",
        value: `${Math.round(gpu)}%`,
        severity: gpu > 85 ? ("critical" as const) : gpu > 65 ? ("warning" as const) : ("normal" as const),
        icon: <Zap className="h-5 w-5" />,
        hint: snapshot?.gpu_name ?? "GPU device",
      },
      {
        label: "CPU LOAD",
        value: `${Math.round(cpu)}%`,
        severity: cpu > 85 ? ("critical" as const) : cpu > 70 ? ("warning" as const) : ("normal" as const),
        icon: <Cpu className="h-5 w-5" />,
      },
      {
        label: "CACHE HIT",
        value: `${Math.round(cacheHit)}%`,
        severity: cacheHit < 60 ? ("warning" as const) : ("normal" as const),
        icon: <Activity className="h-5 w-5" />,
        hint: "Redis cache efficiency",
      },
      {
        label: "MEMORY UTIL",
        value: `${Math.round(memory)}%`,
        severity: memory > 90 ? ("critical" as const) : memory > 75 ? ("warning" as const) : ("normal" as const),
        icon: <Cpu className="h-5 w-5 rotate-90" />,
      },
    ]
  }, [maintenance, warnings, snapshot, wsConnected])

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <StatBox key={stat.label} label={stat.label} value={stat.value} severity={stat.severity} icon={stat.icon} hint={stat.hint} />
      ))}
    </div>
  )
}

export const SystemHealthPanel = memo(SystemHealthPanelComponent)
export default SystemHealthPanel


