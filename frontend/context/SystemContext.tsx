"use client"

import { createContext, useContext, useMemo } from "react"

import { useMetricsStream } from "@/hooks/useMetricsStream"
import { useSystemHealth } from "@/hooks/useSystemHealth"
import { useWebSocketLogs } from "@/hooks/useWebSocketLogs"
import { useUIAudio } from "@/hooks/useUIAudio"

export interface SystemContextValue {
  threatLevel: number
  threatStatus: string
  threatCount: number
  threatLastUpdated: Date | null
  healthStatus: string
  healthLatency: number | null
  backendTime: string | null
  healthLastUpdated: Date | null
  telemetryCount: number
  lastTelemetryAt: string | null
  backendConnected: boolean
  socketConnected: boolean
  muted: boolean
  toggleMute: () => void
}

const SystemContext = createContext<SystemContextValue | undefined>(undefined)

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const { threatLevel, threatStatus, count: threatCount, lastUpdated: threatLastUpdated } = useMetricsStream()
  const { data: healthData, status: healthStatus, lastUpdated: healthLastUpdated } = useSystemHealth()
  const { messages, connected: socketConnected } = useWebSocketLogs({ muteAudio: true })
  const { muted, toggleMute } = useUIAudio()

  const value = useMemo<SystemContextValue>(
    () => ({
      threatLevel,
      threatStatus,
      threatCount,
      threatLastUpdated,
      healthStatus,
      healthLatency: typeof healthData?.latency_ms === "number" ? healthData.latency_ms : null,
      backendTime: typeof healthData?.backend_time === "string" ? healthData.backend_time : null,
      healthLastUpdated,
      telemetryCount: messages.length,
      lastTelemetryAt: messages.length ? messages[messages.length - 1]?.timestamp ?? null : null,
      backendConnected: ["ok", "online", "healthy"].includes((healthStatus ?? "").toLowerCase()),
      socketConnected,
      muted,
      toggleMute,
    }),
    [
      healthData?.backend_time,
      healthData?.latency_ms,
      healthLastUpdated,
      healthStatus,
      messages,
      muted,
      socketConnected,
      threatCount,
      threatLastUpdated,
      threatLevel,
      threatStatus,
      toggleMute,
    ],
  )

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>
}

export function useSystemContext(): SystemContextValue {
  const context = useContext(SystemContext)
  if (!context) {
    throw new Error("useSystemContext must be used within a SystemProvider")
  }
  return context
}
