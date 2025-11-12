"use client"

import { AlertTriangle } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type WarningsPanelProps = {
  warnings: string[]
}

export function WarningsPanel({ warnings }: WarningsPanelProps) {
  return (
    <Card className="border border-yellow-500/30 bg-black/40">
      <CardHeader className="flex items-center gap-2 border-b border-yellow-500/30 pb-3">
        <AlertTriangle className="h-4 w-4 text-yellow-300" />
        <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-yellow-300">System Warnings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 text-xs font-mono uppercase tracking-[0.3em] text-neutral-300">
        {warnings.length === 0 && <p className="text-neutral-500">No active warnings.</p>}
        {warnings.map((warning) => (
          <div
            key={warning}
            className="rounded border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-[11px] uppercase tracking-[0.3em]"
          >
            {warning}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default WarningsPanel

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


