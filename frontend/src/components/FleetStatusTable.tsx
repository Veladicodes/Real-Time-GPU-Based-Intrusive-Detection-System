"use client"

import { memo } from "react"

import clsx from "clsx"

import type { FleetNode } from "@/src/hooks/useSystemDiagnostics"

type FleetStatusTableProps = {
  nodes: FleetNode[]
  loading?: boolean
}

const statusTone: Record<FleetNode["status"], string> = {
  online: "text-[rgba(0,255,170,0.85)] border-[rgba(0,255,170,0.35)]",
  warning: "text-[rgba(255,214,0,0.85)] border-[rgba(255,214,0,0.35)]",
  offline: "text-[rgba(255,74,0,0.85)] border-[rgba(255,74,0,0.35)]",
}

function FleetStatusTableComponent({ nodes, loading = false }: FleetStatusTableProps) {
  if (loading) {
    return <div className="h-48 animate-pulse rounded-xl border border-brand/15 bg-black/40" />
  }

  return (
    <div className="overflow-hidden rounded-xl border border-brand/20 bg-black/40">
      <table className="min-w-full divide-y divide-brand/20 text-left text-sm font-mono text-muted">
        <thead className="bg-black/50 text-xs uppercase tracking-[0.3em] text-neutral-400">
          <tr>
            <th className="px-4 py-3">Sensor</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Latency</th>
            <th className="px-4 py-3">Packet Rate</th>
            <th className="px-4 py-3">Location</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.id} className="border-t border-brand/10">
              <td className="px-4 py-3 text-text">{node.id}</td>
              <td className="px-4 py-3">
                <span
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em]",
                    statusTone[node.status],
                  )}
                >
                  <span className="block h-1.5 w-1.5 rounded-full bg-current" />
                  {node.status}
                </span>
              </td>
              <td className="px-4 py-3 text-text">
                {node.latency_ms != null ? `${Math.round(node.latency_ms)} ms` : "--"}
              </td>
              <td className="px-4 py-3 text-text">{node.packet_rate} pps</td>
              <td className="px-4 py-3 text-text">{node.location ?? "—"}</td>
            </tr>
          ))}
          {nodes.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-xs uppercase tracking-[0.35em] text-neutral-500">
                Awaiting fleet telemetry…
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export const FleetStatusTable = memo(FleetStatusTableComponent)
export default FleetStatusTable


