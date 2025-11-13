"use client"

import { memo } from "react"

import { AlertTriangle } from "lucide-react"

type WarningsPanelProps = {
  warnings: string[]
}

function WarningsPanelComponent({ warnings }: WarningsPanelProps) {
  if (!warnings.length) {
    return (
      <div className="rounded-xl border border-brand/15 bg-black/40 p-4 text-xs font-mono uppercase tracking-[0.3em] text-muted">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-brand" />
          No active warnings • Systems stable
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {warnings.map((warning, index) => (
        <div
          key={`${warning}-${index}`}
          className="rounded-xl border border-[rgba(255,214,0,0.35)] bg-[rgba(255,214,0,0.08)] p-4 text-sm font-mono text-[rgba(255,214,0,0.85)]"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5" />
            <span className="uppercase tracking-[0.3em]">Warning</span>
          </div>
          <p className="mt-2 text-base tracking-[0.05em] text-text">{warning}</p>
        </div>
      ))}
    </div>
  )
}

export const WarningsPanel = memo(WarningsPanelComponent)
export default WarningsPanel


