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


