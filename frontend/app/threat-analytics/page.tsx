"use client"

import { useMemo } from "react"

import { motion } from "framer-motion"

import AnomalyTimeline from "@/components/AnomalyTimeline"
import RadarSweep from "@/components/RadarSweep"
import { NeonParticleBackdrop } from "@/components/ui/NeonParticleBackdrop"
import AINarrator from "@/components/ui/AINarrator"
import { StatBox } from "@/components/ui/StatBox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import ThreatTable from "@/components/ThreatTable"
import { useThreatTelemetry } from "@/hooks/useThreatTelemetry"

export default function ThreatAnalyticsPage() {
  const { stats, timeline, radarPoints, events, dominantVector, statsConnected, eventsConnected } = useThreatTelemetry()

  const avgConfidencePercent = Math.round((stats.avgConfidence ?? 0) * 100)

  const statBoxes = useMemo(
    () => [
      {
        label: "Active Threats",
        value: stats.activeThreats,
        severity: stats.activeThreats > 0 ? "critical" : "normal",
      },
      {
        label: "Blocked Attacks",
        value: stats.blockedAttacks,
        severity: stats.blockedAttacks > 0 ? "critical" : "normal",
      },
      {
        label: "Suspicious IPs",
        value: stats.suspiciousIPs,
        severity: stats.suspiciousIPs > 0 ? "warning" : "normal",
      },
      {
        label: "Avg Confidence",
        value: avgConfidencePercent,
        hint: `${avgConfidencePercent >= 80 ? "Stable" : avgConfidencePercent < 50 ? "Unstable" : "Caution"} • ${avgConfidencePercent}%`,
        severity: avgConfidencePercent >= 80 ? "normal" : avgConfidencePercent < 50 ? "warning" : "critical",
      },
    ],
    [avgConfidencePercent, stats.activeThreats, stats.blockedAttacks, stats.suspiciousIPs],
  )

  const dominantLabel = dominantVector
    ? `${Math.round(dominantVector.angle)}°${dominantVector.geo ? ` / ${dominantVector.geo}` : ""}`
    : "Scanning..."

  return (
    <div className="relative flex min-h-screen flex-col gap-6 overflow-hidden bg-bg p-6 text-text">
      <NeonParticleBackdrop intensity={0.25} className="opacity-50" />

      <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="z-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3">
            <div>
              <h1 className="text-2xl font-display tracking-[0.4em] text-brand">THREAT ANALYTICS</h1>
              <p className="text-sm text-muted">Streaming hostile vectors, anomaly telemetry, and defensive posture.</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-[0.35em] text-muted">
              <span className={statsConnected ? "text-brand" : "text-accent-red"}>
                {statsConnected ? "Stats Live" : "Stats Offline"}
              </span>
              <span className={eventsConnected ? "text-brand" : "text-accent-red"}>
                {eventsConnected ? "Threat Stream Live" : "Threat Stream Offline"}
              </span>
            </div>
          </div>
          <AINarrator />
        </div>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {statBoxes.map((box) => (
          <StatBox key={box.label} label={box.label} value={box.value} severity={box.severity} hint={box.hint} />
        ))}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]"
      >
        <Card className="panel bg-transparent">
          <CardHeader className="flex items-center justify-between border-b border-brand/15 pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">ANOMALY TIMELINE</CardTitle>
            <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted">Last 5 minutes</span>
          </CardHeader>
          <CardContent className="h-72">
            <AnomalyTimeline data={timeline} />
          </CardContent>
        </Card>
        <Card className="panel bg-transparent">
          <CardHeader className="flex items-center justify-between border-b border-brand/15 pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">RADAR SWEEP</CardTitle>
            <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-muted">{dominantLabel}</span>
          </CardHeader>
          <CardContent className="h-72">
            <RadarSweep points={radarPoints} />
          </CardContent>
        </Card>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Card className="panel bg-transparent">
          <CardHeader className="flex items-center justify-between border-b border-brand/15 pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">THREAT TABLE</CardTitle>
            <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-muted">
              {events.length} Events Tracked
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <ThreatTable events={events} />
          </CardContent>
        </Card>
      </motion.section>
    </div>
  )
}

