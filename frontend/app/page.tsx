"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Activity, Bell, Brain, ChevronRight, Cpu, HeartPulse, RefreshCw, ServerCog } from "lucide-react"

import { Button } from "@/components/ui/button"
import { UtcClock } from "@/components/rt-gids/utc-clock"
import AudioControls from "@/components/ui/AudioControls"
import { useSystemContext } from "@/context/SystemContext"
import CommandCenterPage from "./command-center/page"
import ThreatAnalyticsPage from "./threat-analytics/page"
import ModelInsightsPage from "./model-insights/page"
import SystemDiagnosticsPage from "./system-diagnostics/page"

const sections = [
  { id: "command-center", icon: Cpu, label: "Command Center" },
  { id: "threat-analytics", icon: Activity, label: "Threat Analytics" },
  { id: "model-insights", icon: Brain, label: "Model Insights" },
  { id: "system-diagnostics", icon: ServerCog, label: "System Diagnostics" },
]

export default function TacticalDashboard() {
  const [activeSection, setActiveSection] = useState("command-center")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [bootSequence, setBootSequence] = useState(true)
  const {
    threatStatus,
    threatLevel,
    threatCount,
    healthStatus,
    healthLatency,
    telemetryCount,
    lastTelemetryAt,
    backendConnected,
    socketConnected,
  } = useSystemContext()
  useEffect(() => {
    const timeout = setTimeout(() => setBootSequence(false), 1000)
    return () => clearTimeout(timeout)
  }, [])
  const activeItem = sections.find((item) => item.id === activeSection)
  const headerLabel =
    activeSection === "command-center" ? "REAL-TIME COMMAND CENTER" : activeItem?.label?.toUpperCase() ?? "COMMAND CENTER"
  const threatTone =
    threatStatus === "critical" ? "text-accent-red" : threatStatus === "warn" ? "text-accent-yellow" : "text-accent"
  const healthTone = backendConnected ? "text-accent" : "text-accent-red"
  const threatPulseColor =
    threatStatus === "critical" ? "rgba(255,82,82,0.9)" : threatStatus === "warn" ? "rgba(250,204,21,0.9)" : "rgba(74,222,128,0.9)"
  const threatPulseShadow =
    threatStatus === "critical"
      ? "0 0 12px rgba(239,68,68,0.55)"
      : threatStatus === "warn"
        ? "0 0 12px rgba(234,179,8,0.55)"
        : "0 0 12px rgba(34,197,94,0.55)"

  const backendLatencyLabel = healthLatency != null ? `${Math.round(healthLatency)}ms` : "—"
  const telemetryDescriptor = useMemo(() => {
    if (!lastTelemetryAt) return `${telemetryCount}`
    const diff = Date.now() - new Date(lastTelemetryAt).getTime()
    if (!Number.isFinite(diff)) return `${telemetryCount}`
    const seconds = Math.max(0, Math.round(diff / 1000))
    const freshness = seconds < 5 ? "live" : seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`
    return `${telemetryCount} (${freshness})`
  }, [lastTelemetryAt, telemetryCount])

  return (
    <div className="flex h-screen bg-black">
      {/* Sidebar */}
      <div
        className={`${sidebarCollapsed ? "w-16" : "w-70"} bg-neutral-950 border-r border-orange-600/30 transition-all duration-300 fixed md:relative z-50 md:z-auto h-full md:h-auto ${!sidebarCollapsed ? "md:block" : ""}`}
      >
        <div className="p-4">
            <div className="mb-8 flex items-center justify-between">
            <div className={`${sidebarCollapsed ? "hidden" : "block"}`}>
              <h1 className="text-orange-500 font-bold text-lg tracking-wider font-sans">RT-GIDS</h1>
              <p className="text-orange-600/60 text-xs font-mono">v1.0.0 NEURAL NET</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="text-neutral-400 hover:text-[var(--accent)]"
            >
              <ChevronRight
                className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${sidebarCollapsed ? "" : "rotate-180"}`}
              />
            </Button>
          </div>

          <nav className="space-y-2">
            {sections.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`flex w-full items-center gap-3 rounded-sm p-3 transition-colors ${
                  activeSection === item.id
                    ? "border border-orange-500/60 bg-orange-600/40 text-orange-200 neon-glow"
                    : "text-neutral-400 hover:bg-neutral-900/50 hover:text-[var(--accent)]"
                }`}
              >
                <item.icon className="h-5 w-5 md:h-5 md:w-5 sm:h-6 sm:w-6" />
                {!sidebarCollapsed && <span className="text-sm font-mono font-medium tracking-wide">{item.label}</span>}
              </button>
            ))}
          </nav>

          {!sidebarCollapsed && (
            <div className="neon-glow mt-8 rounded-sm border border-[rgba(243,91,4,0.35)] bg-neutral-900/80 p-4 scanline-bg">
              <div className="mb-2 flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]"></div>
                <span className="text-xs font-mono text-[var(--accent)]">SYSTEM ONLINE</span>
              </div>
              <div className="space-y-1 text-xs font-mono text-neutral-500">
                <div>UPTIME: 72:14:33</div>
                <div>STATUS: ACTIVE</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Overlay */}
      {!sidebarCollapsed && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarCollapsed(true)} />
      )}

      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${!sidebarCollapsed ? "md:ml-0" : ""}`}>
        {/* Top Toolbar */}
        <div className="h-16 bg-neutral-950 border-b border-orange-600/20 flex items-center justify-between px-6 scanlines">
          <div className="flex flex-wrap items-center gap-4 justify-end">
            <div className="flex items-center gap-3">
              <motion.div
                className="h-2.5 w-2.5 rounded-full"
                animate={{
                  scale: [1, 1.6, 1],
                  opacity: [0.75, 1, 0.75],
                  backgroundColor: threatPulseColor,
                }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  boxShadow: threatPulseShadow,
                }}
              />
              <div className="text-sm font-mono text-neutral-400">
                RT-GIDS / <span className="text-orange-500">{headerLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5">
                <HeartPulse className={`h-3.5 w-3.5 ${healthTone}`} />
                <span className={`${healthTone} uppercase tracking-[0.25em]`}>
                  {healthStatus?.toUpperCase() ?? "UNKNOWN"}
                </span>
                <span className="text-neutral-500">({backendLatencyLabel})</span>
              </span>
              <span className={`${threatTone} uppercase tracking-[0.25em]`}>
                Threat {Math.round(threatLevel)} • {threatCount}
              </span>
              <span className="text-neutral-500 uppercase tracking-[0.25em]">
                Telemetry {telemetryDescriptor}
              </span>
              <span className={`uppercase tracking-[0.25em] ${socketConnected ? "text-accent" : "text-accent-red"}`}>
                {socketConnected ? "WS ONLINE" : "WS OFFLINE"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-neutral-500 font-mono">
              <UtcClock />
            </div>
            <AudioControls />
            <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-orange-500 transition-colors">
              <Bell className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-orange-500 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-auto bg-black">
          {activeSection === "command-center" && <CommandCenterPage />}
          {activeSection === "threat-analytics" && <ThreatAnalyticsPage />}
          {activeSection === "model-insights" && <ModelInsightsPage />}
          {activeSection === "system-diagnostics" && <SystemDiagnosticsPage />}
        </div>
      </div>
      {bootSequence && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="rounded border border-[rgba(243,91,4,0.35)] bg-neutral-950/90 px-8 py-5 text-center font-mono text-sm uppercase tracking-[0.5em] text-orange-400">
            System Online — Initializing Modules…
          </div>
        </div>
      )}
    </div>
  )
}
