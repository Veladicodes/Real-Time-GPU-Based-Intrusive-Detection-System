"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

import { motion } from "framer-motion"

import AttackFrequencyChart from "@/components/command-center/AttackFrequencyChart"
import AICoreStatusCard from "@/components/command-center/AICoreStatusCard"
import CommandSummaryBar from "@/components/command-center/CommandSummaryBar"
import IncidentOverview from "@/components/command-center/IncidentOverview"
import TopAttackersList from "@/components/command-center/TopAttackersList"
import { AIDiagnosticsModal } from "@/components/rt-gids/ai-diagnostics-modal"
import { CommandConsole } from "@/components/rt-gids/command-console"
import { ConnectionIndicator } from "@/components/rt-gids/connection-indicator"
import { FpsIndicator } from "@/components/rt-gids/fps-indicator"
import { SystemStatus } from "@/components/rt-gids/system-status"
import { UtcClock } from "@/components/rt-gids/utc-clock"
import { NeonParticleBackdrop } from "@/components/ui/NeonParticleBackdrop"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useMetricsStream } from "@/hooks/useMetricsStream"
import { useSystemHealth } from "@/hooks/useSystemHealth"
import { useWebSocketLogs } from "@/hooks/useWebSocketLogs"
import { usePerfControl } from "@/hooks/usePerfControl"
import { useUIAudio } from "@/hooks/useUIAudio"
import { useSystemContext } from "@/context/SystemContext"

const LiveLog = dynamic(() => import("@/components/LiveLog"), { ssr: false })

const ThreatGauge = dynamic(() => import("@/components/ui/ThreatGauge"), { ssr: false })

export default function CommandCenterPage() {
  const { data: systemHealth, loading: healthLoading } = useSystemHealth()
  const { threatLevel, threatStatus } = useMetricsStream()
  const { alertMessages, messages, connected, connectionState, paused, setPaused, clear } = useWebSocketLogs()
  const { muted, toggleMute, play } = useUIAudio()
  const { showFps } = usePerfControl()
  const { totalPackets, attacksBlocked, ipsBlocked, uptimeLabel } = useSystemContext()

  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [alertPulse, setAlertPulse] = useState(false)

  useEffect(() => {
    if (!alertMessages.length) return
    setAlertPulse(true)
    const timeout = window.setTimeout(() => setAlertPulse(false), 350)
    return () => window.clearTimeout(timeout)
  }, [alertMessages])

  const lastLogTimestamp = alertMessages.length ? alertMessages[alertMessages.length - 1]?.timestamp : undefined

  return (
    <div className="relative flex flex-col gap-6 overflow-hidden bg-bg p-6 text-text lg:gap-8">
      <NeonParticleBackdrop intensity={0.35} className="opacity-60" />
      <motion.div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--brand-orange-rgb),0.3)_0%,transparent_65%)]"
        animate={{ opacity: alertPulse || threatStatus === "critical" ? 0.35 : 0 }}
        transition={{ duration: 0.3 }}
      />
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="page-header flex flex-col justify-between gap-4 rounded-[var(--radius)] bg-surface/95 p-4 md:flex-row md:items-center"
      >
        <div className="flex flex-wrap items-center gap-4">
          <ConnectionIndicator state={connectionState} />
          <button
            type="button"
            onClick={() => {
              play("click")
              toggleMute()
            }}
            aria-label="Toggle Audio Mute"
            className="rounded border border-brand/30 px-3 py-2 text-xs font-mono uppercase tracking-[0.35em] text-brand transition hover:border-brand/60 hover:text-brand"
          >
            {muted ? "🔇 Mute Off" : "🔊 Mute On"}
          </button>
          <button
            type="button"
            onClick={() => {
              play("click")
              setDiagnosticsOpen(true)
            }}
            className="rounded border border-brand/30 px-3 py-2 text-xs font-mono uppercase tracking-[0.35em] text-brand transition hover:border-brand/60 hover:bg-brand/10"
          >
            AI Diagnostics
          </button>
        </div>
        <div className="flex items-center gap-4">
          <UtcClock />
        </div>
      </motion.div>

      <CommandSummaryBar />

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="grid grid-cols-1 gap-6 lg:grid-cols-12"
      >
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-8">
          <LiveLog
            logs={messages}
            connected={connected}
            paused={paused}
            onTogglePause={() => setPaused((prev) => !prev)}
            onClear={clear}
            className="panel h-[28rem]"
            limit={6}
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4 lg:col-span-4">
          <Card className="panel bg-transparent p-4">
            <CardHeader>
              <CardTitle className="text-sm font-mono uppercase tracking-[0.3em] text-brand">THREAT INDEX</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              <ThreatGauge value={threatLevel} lastUpdated={lastLogTimestamp} />
            </CardContent>
          </Card>
          <SystemStatus health={systemHealth} connectionState={connectionState} isLoading={healthLoading} />
        </motion.div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="grid grid-cols-1 gap-6 lg:grid-cols-12"
      >
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-6">
          <AICoreStatusCard />
        </motion.div>
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-6">
          <IncidentOverview />
        </motion.div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="grid grid-cols-1 gap-6 lg:grid-cols-12"
      >
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-7">
          <AttackFrequencyChart />
        </motion.div>
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-5">
          <TopAttackersList />
        </motion.div>
      </motion.section>

      <CommandConsole onSubmit={() => play("info")}
      />
      {showFps && (
        <div className="pointer-events-none fixed bottom-4 right-4 opacity-70">
          <FpsIndicator />
        </div>
      )}

      <AIDiagnosticsModal open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />
    </div>
  )
}
