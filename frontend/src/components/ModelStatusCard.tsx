"use client"

import { Cpu, Zap, RefreshCcw, Wifi } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ModelStatus } from "@/src/hooks/useModelInsights"

type ModelStatusCardProps = {
  status: ModelStatus | null
  onRefresh?: () => void
  wsConnected?: boolean
}

export function ModelStatusCard({ status, onRefresh, wsConnected = false }: ModelStatusCardProps) {
  const featureCount = status?.features.length ?? 0
  const gpuMode = status?.gpu_mode ?? false
  const modelName = status?.model_name ?? "Unknown model"

  const badgeTone = gpuMode ? "bg-[rgba(0,255,170,0.12)] text-[rgba(0,255,170,0.85)]" : "bg-[rgba(243,91,4,0.12)] text-[rgba(243,91,4,0.85)]"

  return (
    <Card className="model-card backdrop-blur-xl">
      <CardHeader className="flex items-center justify-between border-b border-brand/15 pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">Model Health</CardTitle>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-[0.25em] ${badgeTone}`}
          >
            <Cpu className="h-3.5 w-3.5" />
            {gpuMode ? "GPU ON" : "GPU OFF"}
          </span>
          <Button
            size="xs"
            variant="ghost"
            className="h-7 rounded border border-brand/20 px-2 text-[11px] font-mono uppercase tracking-[0.2em]"
            onClick={onRefresh}
          >
            <RefreshCcw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.3em] text-muted">Model</p>
            <p className="text-sm font-mono tracking-[0.2em] text-neutral-200">{modelName}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.3em] text-muted">
            <Wifi className={`h-4 w-4 ${wsConnected ? "text-brand" : "text-accent-red"}`} />
            {wsConnected ? "Live" : "Offline"}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs font-mono uppercase tracking-[0.3em] text-muted">
          <div className="rounded border border-brand/10 bg-black/30 p-3">
            <span>Features</span>
            <p className="mt-2 text-xl text-brand">{featureCount}</p>
          </div>
          <div className="rounded border border-brand/10 bg-black/30 p-3">
            <span>Loaded</span>
            <p className="mt-2 text-xl text-brand">{status?.model_loaded ? "YES" : "NO"}</p>
          </div>
          <div className="rounded border border-brand/10 bg-black/30 p-3">
            <span>Signal</span>
            <p className="mt-2 text-xl text-brand flex items-center gap-1">
              <Zap className="h-4 w-4" />
              {wsConnected ? "LIVE" : "IDLE"}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-muted">Feature Names</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-mono uppercase tracking-[0.2em]">
            {status?.features.slice(0, 24).map((feature) => (
              <span key={feature} className="rounded border border-brand/10 bg-black/40 px-2 py-1 text-neutral-300">
                {feature}
              </span>
            ))}
            {featureCount > 24 && (
              <span className="rounded border border-brand/10 bg-black/40 px-2 py-1 text-neutral-500">
                +{featureCount - 24} more
              </span>
            )}
            {!featureCount && <span className="text-neutral-500">No feature metadata available</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default ModelStatusCard


