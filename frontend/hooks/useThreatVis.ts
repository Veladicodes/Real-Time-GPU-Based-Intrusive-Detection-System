"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import type { LogMessage } from "@/hooks/useWebSocketLogs"
import { useMetricsStream } from "@/hooks/useMetricsStream"

export type ThreatVisSeverity = "INFO" | "NORMAL" | "WARNING" | "ALERT"

export type ThreatVisEvent = {
  id: string
  srcIp: string
  dstIp?: string
  severity: ThreatVisSeverity
  createdAt: number
  src: LatLon
  dst: LatLon
}

export type LatLon = {
  lat: number
  lon: number
}

type ThreatVisOptions = {
  maintenance?: boolean
  retentionMs?: number
}

const DEFAULT_RETENTION = 8_000

export function useThreatVis(logs: LogMessage[], options: ThreatVisOptions = {}) {
  const { maintenance = false, retentionMs = DEFAULT_RETENTION } = options
  const { threatLevel, threatStatus } = useMetricsStream()
  const [events, setEvents] = useState<ThreatVisEvent[]>([])
  const prevCountRef = useRef(0)

  useEffect(() => {
    if (maintenance) return
    if (logs.length === 0) {
      prevCountRef.current = 0
      setEvents([])
      return
    }

    if (logs.length < prevCountRef.current) {
      prevCountRef.current = 0
      setEvents([])
    }

    const newItems = logs.slice(prevCountRef.current)
    prevCountRef.current = logs.length

    if (newItems.length === 0) return

    setEvents((prev) => {
      const now = Date.now()
      const mapped = newItems
        .map((item) => {
          if (!item.src_ip && !item.dst_ip) return null
          const src = ipToLatLon(item.src_ip ?? "")
          const dst = ipToLatLon(item.dst_ip ?? "")
          return {
            id: item.id ?? `${item.timestamp}-${item.src_ip ?? "unknown"}`,
            srcIp: item.src_ip ?? "unknown",
            dstIp: item.dst_ip,
            severity: (item.type ?? "INFO") as ThreatVisSeverity,
            createdAt: now,
            src,
            dst,
          } satisfies ThreatVisEvent
        })
        .filter(Boolean) as ThreatVisEvent[]

      const combined = [...prev, ...mapped].slice(-100)
      const filtered = combined.filter((event) => now - event.createdAt <= retentionMs)
      return filtered
    })
  }, [logs, maintenance, retentionMs])

  useEffect(() => {
    if (maintenance) return
    const interval = setInterval(() => {
      const now = Date.now()
      setEvents((prev) => prev.filter((event) => now - event.createdAt <= retentionMs))
    }, 1_000)
    return () => clearInterval(interval)
  }, [maintenance, retentionMs])

  const arcs = useMemo(() => events, [events])

  return {
    arcs,
    threatLevel,
    threatStatus,
  }
}

function ipToLatLon(ip: string): LatLon {
  if (!ip) {
    return randomLatLon()
  }
  const octets = ip.split(".").map((part) => Number.parseInt(part, 10))
  if (octets.some((part) => Number.isNaN(part))) {
    return randomLatLon()
  }

  const hash =
    ((octets[0] ?? 0) << 24) | ((octets[1] ?? 0) << 16) | ((octets[2] ?? 0) << 8) | ((octets[3] ?? 0) << 0)

  const lat = ((hash % 180) + 180) % 180 - 90
  const lon = (((hash >> 8) % 360) + 360) % 360 - 180

  return {
    lat: clamp(lat, -85, 85),
    lon: clamp(lon, -180, 180),
  }
}

function randomLatLon(): LatLon {
  return {
    lat: Math.random() * 170 - 85,
    lon: Math.random() * 360 - 180,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}


