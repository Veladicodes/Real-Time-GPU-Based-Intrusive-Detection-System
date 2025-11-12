"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

import { AnimatePresence, motion } from "framer-motion"
import { Download, XCircle } from "lucide-react"

import type { ShapJobState } from "@/src/hooks/useModelInsights"

type SHAPResultsModalProps = {
  open: boolean
  job: ShapJobState | null
  onClose: () => void
}

type Contribution = {
  feature: string
  value: number
}

function usePortalContainer() {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (typeof document === "undefined") return
    let portal = document.getElementById("shap-modal-root")
    if (!portal) {
      portal = document.createElement("div")
      portal.id = "shap-modal-root"
      document.body.appendChild(portal)
    }
    setContainer(portal)
  }, [])
  return container
}

export function SHAPResultsModal({ open, job, onClose }: SHAPResultsModalProps) {
  const container = usePortalContainer()
  const [depth, setDepth] = useState(8)

  useEffect(() => {
    setDepth(8)
  }, [job?.id])

  const contributions = useMemo<Contribution[]>(() => {
    if (!job?.result) return []
    const explanation = job.result.explanations[0]
    if (!explanation) return []
    const entries = Object.entries(explanation.shap_values ?? {})
    return entries
      .map(([feature, value]) => ({ feature, value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, depth)
  }, [job, depth])

  const positive = contributions.filter((entry) => entry.value >= 0)
  const negative = contributions.filter((entry) => entry.value < 0)

  const downloadResult = () => {
    if (!job?.result) return
    const blob = new Blob([JSON.stringify(job.result, null, 2)], { type: "application/json;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `shap_${job.id}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (!container) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative w-full max-w-4xl rounded-2xl border border-brand/20 bg-[rgba(5,5,5,0.95)] p-6 shadow-[0_0_32px_rgba(243,91,4,0.25)]"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 22 }}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 text-neutral-500 hover:text-neutral-200"
            >
              <XCircle className="h-6 w-6" />
            </button>
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-mono uppercase tracking-[0.4em] text-brand">SHAP Explanation</h2>
                <p className="text-xs text-neutral-400">
                  Job {job?.id ?? "—"} • {job?.status === "completed" ? "Completed" : `Progress ${Math.round(job?.percent ?? 0)}%`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.3em] text-muted">
                  Depth
                  <input
                    type="range"
                    min={3}
                    max={20}
                    value={depth}
                    onChange={(event) => setDepth(Number(event.target.value))}
                    className="accent-[rgba(243,91,4,0.8)]"
                  />
                  <span className="text-brand">{depth}</span>
                </label>
                <button
                  onClick={downloadResult}
                  className="flex items-center gap-2 rounded border border-brand/30 px-3 py-1 text-xs font-mono uppercase tracking-[0.3em] text-brand transition hover:border-brand/60 hover:text-brand"
                >
                  <Download className="h-4 w-4" />
                  Download JSON
                </button>
              </div>
            </header>
            {job?.status === "completed" && contributions.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <ContributionColumn title="Positive Impact" entries={positive} tone="positive" />
                <ContributionColumn title="Negative Impact" entries={negative} tone="negative" />
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center rounded border border-dashed border-brand/20 text-xs font-mono uppercase tracking-[0.3em] text-muted">
                Awaiting SHAP computation…
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    container,
  )
}

type ContributionColumnProps = {
  title: string
  entries: Contribution[]
  tone: "positive" | "negative"
}

function ContributionColumn({ title, entries, tone }: ContributionColumnProps) {
  const color =
    tone === "positive" ? "bg-[rgba(0,255,170,0.18)] border-[rgba(0,255,170,0.35)] text-[rgba(0,255,170,0.85)]" : "bg-[rgba(243,91,4,0.12)] border-[rgba(243,91,4,0.35)] text-[rgba(243,91,4,0.85)]"

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-mono uppercase tracking-[0.3em] text-muted">{title}</h3>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.feature}
            className={`rounded border ${color} px-3 py-2 text-xs font-mono uppercase tracking-[0.25em]`}
          >
            <div className="flex items-center justify-between">
              <span>{entry.feature}</span>
              <span className="ml-3 text-[11px]">{entry.value.toFixed(4)}</span>
            </div>
            <div className="mt-2 h-1.5 rounded bg-black/30">
              <div
                className={`h-full rounded ${tone === "positive" ? "bg-[rgba(0,255,170,0.65)]" : "bg-[rgba(243,91,4,0.65)]"}`}
                style={{ width: `${Math.min(Math.abs(entry.value) * 150, 100)}%` }}
              />
            </div>
          </li>
        ))}
        {!entries.length && <li className="rounded border border-brand/10 bg-black/30 px-3 py-4 text-center text-[11px] text-neutral-500">No contributions in this direction.</li>}
      </ul>
    </div>
  )
}

export default SHAPResultsModal


