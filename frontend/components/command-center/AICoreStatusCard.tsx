"use client"

import { useMemo, useRef, useState } from "react"

import { AlertTriangle, CheckCircle2, Cpu } from "lucide-react"
import { motion } from "framer-motion"
import useSWR from "swr"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"

type ModelStatusResponse = {
  model?: string
  gpu_mode?: boolean
  features?: number
  precision?: number
  recall?: number
  load?: number
}

const fetcher = (url: string) => api.get(url).then((res) => res.data as ModelStatusResponse)

function buildProgressStyle(percent: number) {
  return {
    background: `conic-gradient(#ff4a00 ${percent * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
  }
}

export default function AICoreStatusCard() {
  const [reloading, setReloading] = useState(false)
  const offlineRef = useRef(false)

  const { data, error, isLoading, mutate } = useSWR<ModelStatusResponse>("/api/model/status", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 20_000,
  })

  const status = useMemo(() => {
    if (data && data.model) {
      offlineRef.current = false
      return data
    }
    if (error && !offlineRef.current) {
      if (!offlineRef.current) {
        console.warn("⚠️ Model status unavailable.")
      }
      offlineRef.current = true
    }
    return data ?? null
  }, [data, error])

  const loadPercent = status?.load != null ? Math.min(100, Math.max(0, Math.round(status.load))) : status?.model ? 100 : 0

  const handleReload = async () => {
    setReloading(true)
    try {
      await api.post("/api/model/reload")
      await mutate()
    } catch (err) {
      console.error("Failed to reload model", err)
    } finally {
      setReloading(false)
    }
  }

  const gpuMode = status?.gpu_mode ?? false

  return (
    <Card className="border border-[rgba(255,74,0,0.25)] bg-[rgb(12,12,12)]/90 shadow-[0_0_20px_rgba(255,74,0,0.15)]">
      <CardHeader className="flex flex-row items-center justify-between border-b border-[rgba(255,74,0,0.18)] pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-[0.4em] text-brand">AI Core Status</CardTitle>
        <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.4em] text-muted">
          <Cpu className="h-3.5 w-3.5 text-brand" />
          {gpuMode ? "GPU ACTIVE" : "GPU DISABLED"}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 py-6">
        {isLoading && !status ? (
          <div className="space-y-4">
            <div className="h-28 w-28 animate-pulse rounded-full bg-[rgba(255,74,0,0.08)]" />
            <div className="h-5 w-48 animate-pulse rounded bg-[rgba(255,74,0,0.08)]" />
            <div className="h-5 w-56 animate-pulse rounded bg-[rgba(255,74,0,0.08)]" />
          </div>
        ) : status ? (
          <>
            <div className="flex items-center gap-6">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="relative flex h-32 w-32 items-center justify-center rounded-full border border-[rgba(255,74,0,0.4)] bg-black/60 shadow-[0_0_20px_rgba(255,74,0,0.25)]"
              >
                <div className="absolute inset-1.5 rounded-full bg-[rgba(0,0,0,0.6)]" />
                <div className="absolute inset-0 rounded-full" style={buildProgressStyle(loadPercent)} />
                <div className="relative z-10 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold text-brand">{loadPercent}%</span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-muted">Load</span>
                </div>
              </motion.div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.35em] text-muted">Model</p>
                  <p className="text-lg font-semibold text-text">{status.model ?? "Model unavailable"}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono uppercase tracking-[0.35em] text-muted">
                  <span>
                    Precision <br />
                    <span className="text-brand">{status.precision != null ? status.precision.toFixed(2) : "--"}</span>
                  </span>
                  <span>
                    Recall <br />
                    <span className="text-brand">{status.recall != null ? status.recall.toFixed(2) : "--"}</span>
                  </span>
                  <span>
                    Features <br />
                    <span className="text-brand">{status.features ?? "--"}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    {gpuMode ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-brand" />
                        <span className="text-brand">GPU Enabled</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5 text-accent-red" />
                        <span className="text-accent-red">GPU Off</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded border border-dashed border-muted/40 p-6 text-center text-sm text-muted">
            Model unavailable
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t border-[rgba(255,74,0,0.18)] py-4">
        <span className="text-[11px] font-mono uppercase tracking-[0.35em] text-muted">
          Status: <span className="text-brand">{status?.model ? "Operational" : "Offline"}</span>
        </span>
        <Button
          onClick={handleReload}
          disabled={reloading}
          variant="outline"
          className="border-brand/40 bg-transparent text-[11px] font-mono uppercase tracking-[0.35em] text-brand hover:bg-brand/15"
        >
          {reloading ? "Reloading..." : "Reload Model"}
        </Button>
      </CardFooter>
    </Card>
  )
}


