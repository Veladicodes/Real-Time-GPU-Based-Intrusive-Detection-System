"use client"

import { useMemo, useState } from "react"

import { CheckCircle, Loader2, RefreshCcw, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ScanResult } from "@/src/hooks/useSystemDiagnostics"

type SystemScanButtonProps = {
  scanning: boolean
  scanResult: ScanResult | null
  onScan: () => Promise<void>
}

const statusTone = (ok: boolean | undefined) => (ok ? "text-[rgba(0,255,170,0.85)]" : "text-[rgba(255,74,0,0.85)]")

export function SystemScanButton({ scanning, scanResult, onScan }: SystemScanButtonProps) {
  const [showResult, setShowResult] = useState(false)

  const handleScan = async () => {
    setShowResult(false)
    await onScan()
  }

  const resultItems = useMemo(() => {
    if (!scanResult) return []
    return [
      {
        label: "Redis",
        ok: scanResult.redis?.ok,
        detail:
          scanResult.redis?.ok && typeof scanResult.redis.latency_ms === "number"
            ? `${scanResult.redis.latency_ms.toFixed(1)} ms`
            : "Unreachable",
      },
      {
        label: "GPU",
        ok: scanResult.gpu?.ok,
        detail: scanResult.gpu?.name
          ? `${scanResult.gpu.name} • ${scanResult.gpu.utilization.toFixed(1)}%`
          : "Unavailable",
      },
      {
        label: "Disk",
        ok: scanResult.disk?.ok,
        detail:
          typeof scanResult.disk?.free_percent === "number" && typeof scanResult.disk?.free_gb === "number"
            ? `${scanResult.disk.free_percent.toFixed(1)}% free (${scanResult.disk.free_gb.toFixed(1)} GB)`
            : "N/A",
      },
      {
        label: "Network",
        ok: scanResult.network?.ok,
        detail: scanResult.network?.ok ? "Loopback responsive" : "Socket resolution failed",
      },
      {
        label: "Model",
        ok: scanResult.model?.ok,
        detail:
          scanResult.model?.ok && typeof scanResult.model.latency_ms === "number"
            ? `${scanResult.model.latency_ms.toFixed(2)} ms warmup`
            : scanResult.model?.detail ?? "Model offline",
      },
    ]
  }, [scanResult])

  return (
    <div className="space-y-4">
      <Button
        onClick={handleScan}
        disabled={scanning}
        className="flex items-center gap-2 border border-brand/40 bg-brand px-4 py-2 text-xs font-mono uppercase tracking-[0.3em] text-bg hover:border-brand/60 hover:bg-brand/90"
      >
        {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
        {scanning ? "Running Diagnostic…" : "Run Diagnostic Scan"}
      </Button>

      {scanResult && (
        <div className="rounded-xl border border-brand/20 bg-black/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-mono uppercase tracking-[0.3em] text-muted">Scan Summary</h3>
            <button
              className="text-[10px] font-mono uppercase tracking-[0.3em] text-brand hover:text-brand/80"
              onClick={() => setShowResult((prev) => !prev)}
            >
              {showResult ? "Hide" : "View"}
            </button>
          </div>
          {showResult && (
            <ul className="space-y-3 text-sm font-mono text-text">
              {resultItems.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-4">
                  <span>{item.label}</span>
                  <span className={statusTone(item.ok ?? false)}>
                    {item.ok ? <CheckCircle className="mr-2 inline h-4 w-4" /> : <XCircle className="mr-2 inline h-4 w-4" />}
                    {item.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default SystemScanButton


