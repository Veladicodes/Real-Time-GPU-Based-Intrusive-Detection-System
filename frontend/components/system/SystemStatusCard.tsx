"use client"

import { memo } from "react"

import { Progress } from "@/components/ui/progress"
import type { SystemNode } from "@/hooks/useSystemDiagnostics"

type Props = {
  system: SystemNode
  dimmed?: boolean
}

const statusLabelMap: Record<SystemNode["status"], string> = {
  online: "ONLINE",
  warning: "WARN",
  maintenance: "MAINT",
  offline: "OFFLINE",
}

const statusTone: Record<SystemNode["status"], string> = {
  online: "text-brand",
  warning: "text-brand/80",
  maintenance: "text-muted",
  offline: "text-brand/60",
}

function SystemStatusCardComponent({ system, dimmed }: Props) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-brand/20 bg-surface/90 p-4 transition ${
        dimmed ? "opacity-60" : "hover:shadow-glow"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-display tracking-[0.2em] text-brand">{system.name}</h3>
          <p className="text-xs font-mono text-muted">
            {system.id} • {system.location}
          </p>
        </div>
        <span className={`text-xs font-mono tracking-[0.3em] ${statusTone[system.status]}`}>
          {statusLabelMap[system.status]}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-mono text-muted">
        <div>
          <p>HEALTH</p>
          <p className="text-lg font-bold text-text">{system.health}%</p>
        </div>
        <div>
          <p>UPTIME</p>
          <p className="text-lg font-bold text-text">{system.uptime}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-xs font-mono text-muted">
        <Metric label="CPU LOAD" value={system.cpu} />
        <Metric label="MEMORY" value={system.memory} />
        <Metric label="STORAGE" value={system.storage} />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className="text-text">{value}%</span>
      </div>
      <Progress value={value} className="h-2 bg-surface" />
    </div>
  )
}

export const SystemStatusCard = memo(SystemStatusCardComponent)

export default SystemStatusCard


