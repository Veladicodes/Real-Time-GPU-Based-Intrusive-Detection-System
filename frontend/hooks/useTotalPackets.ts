"use client"

import { useEffect, useState } from "react"

import { api } from "@/lib/api"

export function useTotalPackets(pollInterval = 3_000) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    let total = 0

    const tick = async () => {
      try {
        await api.get("/api/metrics/threat")
      } catch {
        // ignore errors while simulating packet flow
      }
      if (cancelled) return
      total += Math.floor(Math.random() * 30) + 20
      setCount(total)
    }

    tick()
    const interval = window.setInterval(tick, pollInterval)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [pollInterval])

  return count
}


