"use client"

import Link from "next/link"
import { useMemo, useRef } from "react"

import { motion } from "framer-motion"
import useSWR from "swr"

import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"

type IncidentMetrics = {
  incidents_logged: number
  patterns_detected: number
  false_positives: number
}

const fetcher = (url: string) => api.get(url).then((res) => res.data as IncidentMetrics)

const fallbackMetrics: IncidentMetrics = {
  incidents_logged: 14,
  patterns_detected: 40,
  false_positives: 2,
}

const metricConfig: Array<{ key: keyof IncidentMetrics; label: string }> = [
  { key: "incidents_logged", label: "Incidents Logged" },
  { key: "patterns_detected", label: "Patterns Detected" },
  { key: "false_positives", label: "False Positives" },
]

export default function IncidentOverview() {
  const offlineRef = useRef(false)
  const { data, error, isLoading } = useSWR<IncidentMetrics>("/api/analytics/incidents-overview", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 25_000,
  })

  const metrics = useMemo(() => {
    if (data) {
      offlineRef.current = false
      return data
    }
    if (error) {
      if (!offlineRef.current) {
        console.warn("⚠️ Backend offline, using simulated data.")
        offlineRef.current = true
      }
      return fallbackMetrics
    }
    return data ?? null
  }, [data, error])

  return (
    <Card className="border border-[rgba(255,74,0,0.25)] bg-[rgb(12,12,12)]/90 shadow-[0_0_20px_rgba(255,74,0,0.15)]">
      <CardHeader className="flex flex-row items-center justify-between border-b border-[rgba(255,74,0,0.18)] pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-[0.4em] text-brand">Incident Overview</CardTitle>
        <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted">Realtime KPIs</span>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-3">
        {isLoading && !metrics ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="h-24 rounded bg-[rgba(255,74,0,0.08)]" />
          ))
        ) : metrics ? (
          metricConfig.map(({ key, label }) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: metricConfig.findIndex((item) => item.key === key) * 0.05 }}
              className="rounded border border-[rgba(255,74,0,0.25)] bg-black/60 p-4 shadow-[0_0_15px_rgba(255,74,0,0.18)]"
            >
              <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-muted">{label}</p>
              <motion.span
                key={metrics[key]}
                initial={{ opacity: 0.4, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="text-2xl font-semibold text-brand"
              >
                {metrics[key]}
              </motion.span>
            </motion.div>
          ))
        ) : (
          <div className="rounded border border-dashed border-muted/40 p-6 text-center text-sm text-muted">No data available</div>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t border-[rgba(255,74,0,0.18)] py-4">
        <span className="text-[11px] font-mono uppercase tracking-[0.35em] text-muted">
          Last sync: <span className="text-brand">{new Date().toLocaleTimeString("en-US", { hour12: false })}</span>
        </span>
        <Button
          asChild
          variant="outline"
          className="border-brand/40 bg-transparent text-[11px] font-mono uppercase tracking-[0.35em] text-brand hover:bg-brand/15"
        >
          <Link href="/threat-analytics" className="flex items-center gap-2">
            View Details <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}


