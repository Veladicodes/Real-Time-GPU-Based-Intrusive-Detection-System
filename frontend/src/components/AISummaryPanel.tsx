"use client"

import { useMemo } from "react"

import { Sparkles, TimerReset, Copy, Download, Activity } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SummaryState } from "@/src/hooks/useModelInsights"

type AISummaryPanelProps = {
  summary: SummaryState
  onGenerate: () => Promise<string | null> | string | null
  disabled?: boolean
}

function formatSignals(signals: SummaryState["signals"]) {
  if (!signals.length) return "No dominant signals."
  return signals.map((signal) => `${signal.feature}: ${signal.signal} (${Math.round((signal.score ?? 0) * 100)}%)`).join("\n")
}

export function AISummaryPanel({ summary, onGenerate, disabled = false }: AISummaryPanelProps) {
  const isRateLimited = summary.rateLimitedUntil ? summary.rateLimitedUntil.getTime() > Date.now() : false

  const summaryText = summary.text ?? "AI summary pending. Generate to inspect the latest model narrative."

  const signalList = useMemo(
    () =>
      summary.signals.map((signal) => (
        <li key={signal.feature} className="flex items-center justify-between rounded border border-brand/10 bg-black/30 px-3 py-2">
          <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted">{signal.feature}</span>
          <span className="text-xs font-mono tracking-[0.2em] text-brand">
            {signal.signal}
            {signal.score !== undefined && (
              <span className="ml-1 text-[10px] text-neutral-400">{Math.round(signal.score * 100)}%</span>
            )}
          </span>
        </li>
      )),
    [summary.signals],
  )

  const handleCopy = async () => {
    await navigator.clipboard.writeText(summaryText)
  }

  const handleDownload = () => {
    const blob = new Blob([summaryText], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "model_insights_summary.txt"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="model-card backdrop-blur-xl">
      <CardHeader className="flex items-center justify-between border-b border-brand/15 pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">AI Pattern Summary</CardTitle>
        <div className="flex items-center gap-2">
          {isRateLimited && summary.rateLimitedUntil && (
            <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.25em] text-muted">
              <TimerReset className="h-3 w-3" />
              Retry at {summary.rateLimitedUntil.toLocaleTimeString()}
            </span>
          )}
          <Button
            onClick={() => onGenerate()}
            disabled={summary.inFlight || disabled || isRateLimited}
            className="generate-ai-summary flex items-center gap-2 border border-brand/20 px-3 py-1 text-xs font-mono uppercase tracking-[0.3em]"
          >
            <Sparkles className={`h-4 w-4 ${summary.inFlight ? "animate-spin" : ""}`} />
            {summary.inFlight ? "Generating…" : "Generate"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted">
            {summary.createdAt ? `Last updated ${summary.createdAt.toLocaleTimeString()}` : "Awaiting generation"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              className="h-7 rounded border border-brand/20 px-2 text-[11px] font-mono uppercase tracking-[0.2em]"
              onClick={handleCopy}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="h-7 rounded border border-brand/20 px-2 text-[11px] font-mono uppercase tracking-[0.2em]"
              onClick={handleDownload}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        </div>
        <div className="relative rounded-lg border border-brand/10 bg-black/40 p-4 text-sm leading-relaxed text-neutral-200 shadow-[0_0_12px_rgba(243,91,4,0.12)]">
          {summary.inFlight && (
            <div className="absolute inset-0 rounded-lg border border-brand/20 bg-black/40 backdrop-blur-sm">
              <div className="flex h-full items-center justify-center gap-3 text-xs font-mono uppercase tracking-[0.3em] text-brand">
                <Activity className="h-4 w-4 animate-pulse" />
                {Math.round(summary.percent)}% complete
              </div>
            </div>
          )}
          <p className="whitespace-pre-wrap">{summaryText}</p>
        </div>
        <div>
          <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted">Signals</span>
          <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">{signalList}</ul>
          {!summary.signals.length && (
            <div className="mt-3 flex items-center justify-center rounded border border-dashed border-brand/20 bg-black/20 py-6 text-xs font-mono uppercase tracking-[0.3em] text-muted">
              Awaiting summary generation…
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default AISummaryPanel


