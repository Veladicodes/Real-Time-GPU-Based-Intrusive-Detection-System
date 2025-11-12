"use client"

import { motion } from "framer-motion"
import { Activity } from "lucide-react"

import ParticleBackdrop from "@/components/system/ParticleBackdrop"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import FleetStatusTable from "@/src/components/FleetStatusTable"
import MaintenanceToggle from "@/src/components/MaintenanceToggle"
import ResourceCharts from "@/src/components/ResourceCharts"
import SystemHealthPanel from "@/src/components/SystemHealthPanel"
import SystemScanButton from "@/src/components/SystemScanButton"
import WarningsPanel from "@/src/components/WarningsPanel"
import { useSystemDiagnostics } from "@/src/hooks/useSystemDiagnostics"

export default function SystemDiagnosticsPage() {
  const {
    snapshot,
    history,
    warnings,
    maintenance,
    wsConnected,
    fleet,
    fleetLoading,
    scanResult,
    scanning,
    lastUpdated,
    toggleMaintenance,
    triggerScan,
  } = useSystemDiagnostics()

  return (
    <div className="relative flex min-h-screen flex-col gap-6 overflow-hidden bg-bg p-6 text-text">
      <ParticleBackdrop />

      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-display tracking-[0.4em] text-brand">SYSTEM DIAGNOSTICS</h1>
          <p className="text-sm text-muted">
            GPU telemetry, cache efficiency, and fleet health — streaming live for Tier-0 readiness.
          </p>
          <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-500">
            {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : "Awaiting telemetry handshake"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MaintenanceToggle enabled={maintenance} onToggle={toggleMaintenance} />
          <SystemScanButton scanning={scanning} scanResult={scanResult} onTrigger={triggerScan} />
        </div>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10"
      >
        <SystemHealthPanel snapshot={snapshot} warnings={warnings} wsConnected={wsConnected} />
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10"
      >
        <ResourceCharts history={history} />
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]"
      >
        <FleetStatusTable nodes={fleet} loading={fleetLoading} />
        <div className="space-y-4">
          <WarningsPanel warnings={warnings} />
          <Card className="border border-brand/15 bg-black/40">
            <CardHeader className="flex items-center gap-2 border-b border-brand/15 pb-3">
              <Activity className="h-4 w-4 text-brand" />
              <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">
                Pipeline Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs font-mono uppercase tracking-[0.25em] text-neutral-300">
              <div className="flex justify-between">
                <span>Backend Latency</span>
                <span>{snapshot?.backend_latency_ms != null ? `${snapshot.backend_latency_ms.toFixed(1)} ms` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>Model Load</span>
                <span>{snapshot?.model_load_ms != null ? `${snapshot.model_load_ms.toFixed(1)} ms` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>Cache Hit</span>
                <span>{snapshot ? `${snapshot.cache_hit_percent.toFixed(1)} %` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>Memory</span>
                <span>
                  {snapshot?.memory_used_mb != null && snapshot?.memory_total_mb != null
                    ? `${Math.round(snapshot.memory_used_mb)} / ${Math.round(snapshot.memory_total_mb)} MB`
                    : "—"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.section>
    </div>
  )
}
