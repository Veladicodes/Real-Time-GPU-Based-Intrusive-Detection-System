"use client"

import { memo, useMemo } from "react"

import type { ThreatTableRow } from "@/hooks/useThreatAnalytics"

type ThreatTableProps = {
  data: ThreatTableRow[]
  highlightIp: string | null
}

function Sparkline({ values = [] as number[] }) {
  if (!values.length) {
    return <div className="h-6 w-24 rounded bg-neutral-800/60" />
  }
  const max = Math.max(...values, 1)
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * 100
      const y = 100 - (value / max) * 100
      return `${x},${y}`
    })
    .join(" ")
  return (
    <svg viewBox="0 0 100 100" className="h-6 w-24">
      <polyline points={points} fill="none" stroke="rgba(243,91,4,0.6)" strokeWidth={3} />
    </svg>
  )
}

function ThreatTableComponent({ data, highlightIp }: ThreatTableProps) {
  const rows = useMemo(() => data.slice(0, 40), [data])

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-left font-mono text-sm text-neutral-200">
        <thead className="text-xs uppercase tracking-[0.3em] text-neutral-500">
          <tr>
            <th className="w-[18%] px-4 py-3">IP</th>
            <th className="w-[20%] px-4 py-3">Threat Type</th>
            <th className="w-[18%] px-4 py-3">Confidence</th>
            <th className="w-[20%] px-4 py-3">Geo-Location</th>
            <th className="w-[12%] px-4 py-3">Status</th>
            <th className="w-[12%] px-4 py-3 text-right">Activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isHighlighted = highlightIp && row.ip === highlightIp
            return (
              <tr
                key={`${row.ip}-${row.threat_type}`}
                className={`border-b border-neutral-800 transition ${
                  isHighlighted ? "bg-[rgba(243,91,4,0.15)] shadow-[0_0_12px_rgba(243,91,4,0.25)]" : "hover:bg-neutral-900/70"
                }`}
              >
                <td className="truncate px-4 py-3 text-[13px] text-orange-400">{row.ip}</td>
                <td className="px-4 py-3 text-xs uppercase tracking-wide text-neutral-300">{row.threat_type}</td>
                <td className="px-4 py-3 text-sm text-neutral-400">{Math.round(row.confidence * 100)}%</td>
                <td className="px-4 py-3 text-xs text-neutral-400">{row.geo}</td>
                <td className="px-4 py-3 text-xs">
                  <span className="rounded-full border border-[rgba(243,91,4,0.4)] px-3 py-1 text-[11px] text-[var(--accent)]">
                    {row.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Sparkline values={row.recent_activity ?? []} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="flex h-32 items-center justify-center text-xs uppercase tracking-[0.4em] text-neutral-500">
          Awaiting telemetry…
        </div>
      )}
    </div>
  )
}

export const ThreatTable = memo(ThreatTableComponent)

export default ThreatTable


