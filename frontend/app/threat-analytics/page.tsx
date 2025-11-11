"use client"

import dynamic from "next/dynamic"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"

import { motion } from "framer-motion"

import LiveLog from "@/components/LiveLog"
import AINarrator from "@/components/ui/AINarrator"
import { NeonParticleBackdrop } from "@/components/ui/NeonParticleBackdrop"
import { StatBox } from "@/components/ui/StatBox"
import type { StatSeverity } from "@/components/ui/StatBox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSoundEngine } from "@/hooks/useSoundEngine"
import { useThreatAnalytics } from "@/hooks/useThreatAnalytics"
import { useThreatVis } from "@/hooks/useThreatVis"
import { useWebSocketLogs } from "@/hooks/useWebSocketLogs"
import type { ThreatGlobeProps } from "@/components/Three/ThreatGlobe"

const ThreatGlobe = dynamic<ThreatGlobeProps>(
  () => import("@/components/Three/ThreatGlobe").then((mod) => mod.ThreatGlobe),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-black/40" />,
  },
)
const AnomalyTimeline = dynamic(() => import("@/components/threat/AnomalyTimeline"), { ssr: false, suspense: true })
const ThreatTable = dynamic(() => import("@/components/threat/ThreatTable"), { ssr: false, suspense: true })
const ThreatRadar = dynamic(() => import("@/components/threat/ThreatRadar"), { ssr: false, suspense: true })

export default function ThreatAnalyticsPage() {
  const { metrics, anomalies, loading } = useThreatAnalytics()
  const { play } = useSoundEngine()
  const { messages, connected, paused, setPaused, clear } = useWebSocketLogs({ muteAudio: true })
  const { arcs, threatLevel, threatStatus } = useThreatVis(messages)
  const [hoverFocus, setHoverFocus] = useState(0)
  const alertCounterRef = useRef(0)

  useEffect(() => {
    play("nav_click", { volume: 0.18 })
  }, [play])

  useEffect(() => {
    if (!messages.length) {
      alertCounterRef.current = 0
      return
    }
    const latest = messages[messages.length - 1]
    if (latest.severity === "ALERT" && messages.length > alertCounterRef.current) {
      play("alert", { volume: 0.65 })
    }
    alertCounterRef.current = messages.length
  }, [messages, play])

  const alertLogs = useMemo(() => messages.filter((msg) => msg.type === "ALERT"), [messages])

  const radarTargets = useMemo(
    () =>
      metrics.geo_points.slice(0, 18).map((point) => ({
        id: point.id,
        intensity: Math.min(1, point.intensity / (metrics.geo_points[0]?.intensity || 1)),
        x: (point.longitude + 180) / 360,
        y: 1 - (point.latitude + 90) / 180,
        label: `${point.ip} | ${point.intensity}`,
      })),
    [metrics.geo_points],
  )

  const dominant = useMemo(() => {
    if (!alertLogs.length) return "Baseline"
    const map = new Map<string, number>()
    alertLogs.forEach((log) => {
      const raw = log.raw as Record<string, unknown> | undefined
      const message = typeof raw?.message === "string" ? raw.message : undefined
      const key = log.threat ?? message ?? "Unknown"
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Baseline"
  }, [alertLogs])

  const statBoxes = useMemo<{
    label: string
    value: string | number
    severity: StatSeverity
  }[]>(() => {
    const severity: StatSeverity = threatLevel >= 60 ? "critical" : threatLevel >= 30 ? "warning" : "normal"
    return [
      { label: "Active Threats", value: metrics.active_threats ?? "--", severity },
      { label: "Blocked Attacks", value: metrics.blocked_attacks ?? "--", severity },
      {
        label: "Suspicious IPs",
        value: metrics.suspicious_ips ?? "--",
        severity: metrics.suspicious_ips > 10 ? "warning" : severity,
      },
      {
        label: "Avg Confidence",
        value: metrics.avg_confidence ? `${metrics.avg_confidence.toFixed(1)}%` : "--",
        severity: metrics.avg_confidence && metrics.avg_confidence > 70 ? "critical" : "normal",
      },
    ]
  }, [metrics, threatLevel])

  return (
    <div className="relative flex min-h-screen flex-col gap-6 overflow-hidden bg-bg p-6 text-text">
      <NeonParticleBackdrop intensity={0.25} className="opacity-50" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-80">
        <Suspense fallback={<div className="h-full w-full bg-bg" />}>
          <ThreatGlobe events={arcs} threatLevel={threatLevel} paused={paused} focus={hoverFocus} />
        </Suspense>
      </div>

      <div className="relative z-10 space-y-6 bg-bg/80 p-6 backdrop-blur-xl">
        <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="page-header space-y-1">
          <h1 className="text-2xl font-display tracking-[0.4em] text-brand">THREAT ANALYTICS</h1>
          <p className="text-sm text-muted">Real-time spatial analytics, radar sweep, and AI narrative of hostile vectors.</p>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          {statBoxes.map((box) => (
            <div key={box.label} onMouseEnter={() => setHoverFocus(0.85)} onMouseLeave={() => setHoverFocus(0)}>
              <StatBox label={box.label.toUpperCase()} value={box.value} severity={box.severity} />
            </div>
          ))}
        </motion.section>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <Card className="panel bg-transparent backdrop-blur">
              <CardHeader className="border-b border-brand/15 pb-3">
                <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">ANOMALY TIMELINE</CardTitle>
              </CardHeader>
              <CardContent className="relative h-64 md:h-80">
                <Suspense fallback={<div className="h-full animate-pulse rounded bg-surface/60" />}>
                  <AnomalyTimeline data={anomalies} loading={loading} />
                </Suspense>
              </CardContent>
            </Card>

            <Card className="panel bg-transparent backdrop-blur">
              <CardHeader className="border-b border-brand/15 pb-3">
                <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">THREAT TABLE</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Suspense fallback={<div className="h-64 animate-pulse bg-surface/60" />}>
                  <ThreatTable data={metrics.threat_table ?? []} highlightIp={null} />
                </Suspense>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <AINarrator threatLevel={threatLevel} logs={messages} muted={false} />
            <Card className="panel bg-transparent backdrop-blur">
              <CardHeader className="border-b border-brand/15 pb-3">
                <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">RADAR SWEEP</CardTitle>
              </CardHeader>
              <CardContent className="relative h-64 overflow-hidden">
                <Suspense fallback={<div className="h-full animate-pulse rounded bg-surface/60" />}>
                  <ThreatRadar targets={radarTargets} threatLevel={threatLevel} />
                </Suspense>
                <div className="absolute bottom-3 left-3 rounded border border-brand/20 bg-bg/80 px-3 py-2 text-xs font-mono text-muted backdrop-blur">
                  Dominant vector: <span className="text-brand">{dominant}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="panel bg-transparent backdrop-blur">
              <CardHeader className="border-b border-brand/15 pb-3">
                <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">RECENT THREAT EVENTS</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <LiveLog
                  title="Threat Event Stream"
                  logs={alertLogs}
                  connected={connected}
                  paused={paused}
                  onTogglePause={() => setPaused((prev) => !prev)}
                  onClear={clear}
                  className="panel h-60"
                  limit={20}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}


