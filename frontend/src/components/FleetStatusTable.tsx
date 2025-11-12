"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { FleetNode } from "@/src/hooks/useSystemDiagnostics"

type FleetStatusTableProps = {
  nodes: FleetNode[]
  loading?: boolean
}

const toneByStatus: Record<FleetNode["status"], string> = {
  online: "bg-[rgba(0,255,170,0.15)] text-[rgba(0,255,170,0.85)] border-[rgba(0,255,170,0.35)]",
  warning: "bg-[rgba(255,214,0,0.18)] text-[rgba(255,214,0,0.85)] border-[rgba(255,214,0,0.4)]",
  offline: "bg-[rgba(255,74,0,0.18)] text-[rgba(255,74,0,0.85)] border-[rgba(255,74,0,0.4)]",
  maintenance: "bg-[rgba(80,120,255,0.18)] text-[rgba(120,160,255,0.85)] border-[rgba(120,160,255,0.45)]",
}

export function FleetStatusTable({ nodes, loading = false }: FleetStatusTableProps) {
  return (
    <Card className="border border-brand/15 bg-black/40">
      <CardHeader className="flex items-center justify-between border-b border-brand/15 pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">Sensor Fleet</CardTitle>
        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted">
          Last {nodes.length ? nodes[0]?.timestamp ?? "—" : "no data"}
        </span>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 py-4">
        <table className="w-full table-fixed border-separate border-spacing-y-2 text-left font-mono text-xs text-neutral-300">
          <thead className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
            <tr>
              <th className="px-4 py-2">Node</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2 text-right">Latency</th>
              <th className="px-4 py-2 text-right">Packet Rate</th>
              <th className="px-4 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  Streaming fleet diagnostics…
                </td>
              </tr>
            )}
            {!loading && nodes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  Awaiting fleet heartbeat…
                </td>
              </tr>
            )}
            {!loading &&
              nodes.map((node) => (
                <tr key={node.id} className="transition hover:bg-[rgba(243,91,4,0.08)]">
                  <td className="px-4 py-2 text-[13px] text-brand">{node.id}</td>
                  <td className="px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-neutral-400">{node.location ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-[11px] text-neutral-300">
                    {node.latency_ms != null ? `${node.latency_ms.toFixed(1)} ms` : "N/A"}
                  </td>
                  <td className="px-4 py-2 text-right text-[11px] text-neutral-300">{node.packet_rate} pkt/s</td>
                  <td className="px-4 py-2 text-right">
                    <Badge
                      className={`border ${toneByStatus[node.status]} px-3 py-1 text-[10px] uppercase tracking-[0.25em]`}
                    >
                      {node.status}
                    </Badge>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

export default FleetStatusTable

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


