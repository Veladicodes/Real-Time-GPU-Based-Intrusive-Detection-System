"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { motion } from "framer-motion"
import useSWR from "swr"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"

type AttackPoint = {
  timestamp: string
  count: number
}

type TimeWindow = "1M" | "5M" | "1H"

const WINDOW_CONFIG: Record<TimeWindow, { label: string; durationMs: number; query: string }> = {
  "1M": { label: "1M", durationMs: 60_000, query: "1m" },
  "5M": { label: "5M", durationMs: 5 * 60_000, query: "5m" },
  "1H": { label: "1H", durationMs: 60 * 60_000, query: "1h" },
}

const buildTelemetryWsUrl = () => {
  const fromEnv = process.env.NEXT_PUBLIC_WS_TELEMETRY_URL
  if (fromEnv) return fromEnv
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"
  try {
    const url = new URL(backend)
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
    url.pathname = "/ws/telemetry"
    return url.toString()
  } catch {
    return "ws://localhost:8000/ws/telemetry"
  }
}

const fetcher = (url: string) => api.get(url).then((res) => res.data as AttackPoint[])

const tooltipStyle = {
  backgroundColor: "rgba(10, 10, 10, 0.92)",
  border: "1px solid rgba(255, 74, 0, 0.5)",
  borderRadius: "8px",
  color: "#f2f2f2",
  fontFamily: "var(--mono-font)",
  fontSize: "12px",
} as const

function normalisePoints(points: AttackPoint[]): AttackPoint[] {
  return [...points]
    .filter((point) => typeof point.timestamp === "string" && Number.isFinite(Number(point.count)))
    .map((point) => ({
      timestamp: point.timestamp,
      count: Number(point.count ?? 0),
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

export default function AttackFrequencyChart() {
  const [windowKey, setWindowKey] = useState<TimeWindow>("5M")
  const [points, setPoints] = useState<AttackPoint[]>([])
  const [simulating, setSimulating] = useState(false)
  const simulationWarnedRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)

  const { data, error, isLoading } = useSWR<AttackPoint[]>(
    `/api/telemetry/attack-frequency?window=${WINDOW_CONFIG[windowKey].query}`,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 15_000,
    },
  )

  useEffect(() => {
    if (data && data.length) {
      setPoints(normalisePoints(data))
      setSimulating(false)
    } else if (!isLoading && !points.length) {
      setSimulating(true)
    }
  }, [data, isLoading, points.length])

  useEffect(() => {
    if (!error) return
    if (!simulationWarnedRef.current) {
      console.warn("⚠️ Backend offline, using simulated data.")
      simulationWarnedRef.current = true
    }
    setSimulating(true)
  }, [error])

  useEffect(() => {
    const url = buildTelemetryWsUrl()
    try {
      wsRef.current = new WebSocket(url)
    } catch {
      setSimulating(true)
      return
    }
    const socket = wsRef.current

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data)
        const candidate = Array.isArray(payload) ? payload[0] : payload
        if (!candidate || typeof candidate !== "object") return
        if (candidate.type && candidate.type !== "attack-frequency") return
        const timestamp = candidate.timestamp ?? candidate.time ?? candidate.at
        const count = Number(candidate.count ?? candidate.value ?? candidate.events ?? 0)
        if (!timestamp || !Number.isFinite(count)) return
        setPoints((prev) => {
          const next = [...prev, { timestamp, count }]
          return normalisePoints(next).slice(-720)
        })
      } catch {
        // ignore malformed messages
      }
    })

    socket.addEventListener("error", () => {
      if (!simulationWarnedRef.current) {
        console.warn("⚠️ Backend offline, using simulated data.")
        simulationWarnedRef.current = true
      }
      setSimulating(true)
    })

    return () => {
      socket.close()
      wsRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!simulating) return
    const interval = window.setInterval(() => {
      setPoints((prev) => {
        const next = [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            count: Math.floor(Math.random() * 100),
          },
        ]
        return normalisePoints(next).slice(-720)
      })
    }, 4_000)
    return () => window.clearInterval(interval)
  }, [simulating])

  const filteredPoints = useMemo(() => {
    const duration = WINDOW_CONFIG[windowKey].durationMs
    const cutoff = Date.now() - duration
    return normalisePoints(points).filter((point) => {
      const ts = new Date(point.timestamp).getTime()
      return Number.isFinite(ts) && ts >= cutoff
    })
  }, [points, windowKey])

  const chartData = useMemo(
    () =>
      filteredPoints.map((point) => ({
        time: new Date(point.timestamp).toLocaleTimeString("en-US", { hour12: false }),
        count: point.count,
      })),
    [filteredPoints],
  )

  const totalEvents = filteredPoints.reduce((acc, point) => acc + point.count, 0)
  const averagePerMinute =
    filteredPoints.length > 0
      ? totalEvents / Math.max(filteredPoints.length, WINDOW_CONFIG[windowKey].durationMs / 60_000)
      : 0

  return (
    <Card className="border border-[rgba(255,74,0,0.25)] bg-[rgb(12,12,12)]/90 shadow-[0_0_20px_rgba(255,74,0,0.15)]">
      <CardHeader className="flex flex-col gap-4 border-b border-[rgba(255,74,0,0.18)] pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <CardTitle className="text-sm font-mono uppercase tracking-[0.4em] text-brand">Attack Frequency</CardTitle>
          <Badge variant="outline" className="border-brand/60 bg-brand/10 text-[10px] font-mono uppercase tracking-[0.4em] text-brand">
            {simulating ? "Simulated" : "Live"}
          </Badge>
        </div>
        <div className="flex gap-2">
          {(Object.keys(WINDOW_CONFIG) as TimeWindow[]).map((key) => (
            <Button
              key={key}
              size="xs"
              variant={windowKey === key ? "default" : "outline"}
              className={
                windowKey === key
                  ? "border-brand bg-brand text-black hover:bg-brand/80"
                  : "border-brand/40 bg-transparent text-brand hover:bg-brand/10"
              }
              onClick={() => setWindowKey(key)}
            >
              {WINDOW_CONFIG[key].label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-64">
        {isLoading && !points.length ? (
          <Skeleton className="h-full w-full rounded-lg bg-[rgba(255,74,0,0.08)]" />
        ) : (
          <motion.div initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <defs>
                  <linearGradient id="attack-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255,74,0,0.85)" />
                    <stop offset="100%" stopColor="rgba(255,74,0,0.05)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,74,0,0.12)" strokeDasharray="4 4" />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 10 }} />
                <YAxis stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [`${value} events`, "Detections"]}
                  labelFormatter={(label) => `Time ${label}`}
                />
                <Line type="monotone" dataKey="count" stroke="#ff4a00" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </CardContent>
      <div className="flex flex-wrap items-center gap-4 border-t border-[rgba(255,74,0,0.12)] px-6 py-4 text-[11px] font-mono uppercase tracking-[0.35em] text-muted">
        <span>
          Total Events: <span className="text-brand">{totalEvents}</span>
        </span>
        <span>
          Avg Rate: <span className="text-brand">{averagePerMinute.toFixed(2)}</span> / min
        </span>
      </div>
    </Card>
  )
}


