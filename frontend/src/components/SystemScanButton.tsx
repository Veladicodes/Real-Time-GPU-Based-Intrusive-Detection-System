"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { Loader2, Radar } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ScanResult } from "@/src/hooks/useSystemDiagnostics"

type SystemScanButtonProps = {
  scanning: boolean
  scanResult: ScanResult | null
  onTrigger: () => Promise<void>
}

function ScanResultModal({ result, onClose }: { result: ScanResult; onClose: () => void }) {
  if (typeof document === "undefined") return null
  const container = document.getElementById("system-scan-modal") ?? (() => {
    const el = document.createElement("div")
    el.id = "system-scan-modal"
    document.body.appendChild(el)
    return el
  })()

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 backdrop-blur">
      <div className="relative w-full max-w-3xl rounded-2xl border border-brand/40 bg-[rgba(8,8,8,0.95)] p-6 shadow-[0_0_32px_rgba(243,91,4,0.2)]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-sm font-mono uppercase tracking-[0.3em] text-muted hover:text-brand"
        >
          CLOSE
        </button>
        <h2 className="text-lg font-mono uppercase tracking-[0.4em] text-brand">Diagnostic Scan Result</h2>
        <p className="mt-2 text-xs font-mono uppercase tracking-[0.25em] text-muted">
          Completed {new Date(result.timestamp).toLocaleTimeString()}
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {Object.entries(result.details).map(([key, value]) => {
            if (key === "warnings") return null
            const section = value as Record<string, any>
            const statusValue = typeof section.status === "string" ? section.status : null
            const statusTone =
              statusValue === "ok"
                ? "text-brand"
                : statusValue === "warning"
                  ? "text-yellow-300"
                  : statusValue === "error"
                    ? "text-red-400"
                    : "text-neutral-400"
            return (
              <div key={key} className="rounded border border-brand/20 bg-black/40 p-4 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <h3 className="uppercase tracking-[0.3em] text-muted">{key}</h3>
                  {statusValue && (
                    <span className={`text-[11px] uppercase tracking-[0.2em] ${statusTone}`}>{statusValue}</span>
                  )}
                </div>
                <dl className="mt-3 space-y-1 text-[11px] text-neutral-300">
                  {Object.entries(section)
                    .filter(([entryKey]) => entryKey !== "status")
                    .map(([entryKey, entryValue]) => (
                      <div key={entryKey} className="flex justify-between gap-4">
                        <dt className="uppercase tracking-[0.2em] text-neutral-500">{entryKey}</dt>
                        <dd className="text-right text-neutral-200">
                          {typeof entryValue === "number" ? entryValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : `${entryValue}`}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            )
          })}
        </div>
        <div className="mt-4 rounded border border-brand/15 bg-black/30 p-4 text-xs font-mono text-yellow-300">
          <h4 className="uppercase tracking-[0.3em]">Warnings</h4>
          <ul className="mt-2 space-y-1 text-[11px] tracking-[0.2em]">
            {result.details.warnings.length === 0 && <li className="text-neutral-400">No warnings detected</li>}
            {result.details.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    container,
  )
}

export function SystemScanButton({ scanning, scanResult, onTrigger }: SystemScanButtonProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (scanResult) {
      setOpen(true)
    }
  }, [scanResult])

  return (
    <>
      <Button
        onClick={onTrigger}
        disabled={scanning}
        className="flex items-center gap-2 border border-brand/40 bg-brand px-4 py-2 text-xs font-mono uppercase tracking-[0.25em] text-bg hover:border-brand/60 hover:bg-brand/90"
      >
        {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
        {scanning ? "Running Scan…" : "Run Diagnostic Scan"}
      </Button>
      {scanResult && open && <ScanResultModal result={scanResult} onClose={() => setOpen(false)} />}
    </>
  )
}

export default SystemScanButton

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


