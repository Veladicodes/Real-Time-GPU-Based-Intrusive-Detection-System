"use client"

import { useEffect, useState } from "react"

import { api } from "@/lib/api"

export function useIPsBlocked() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    const fetchInitial = async () => {
      try {
        const res = await api.get("/api/threats/stats")
        if (cancelled) return
        const value = Number(res.data?.suspicious_ips ?? 0)
        setCount(Number.isFinite(value) ? value : 0)
      } catch (error) {
        console.warn("Failed to load suspicious IP count", error)
      }
    }

    fetchInitial()

    const socket = new WebSocket(buildWebSocketUrl("/ws/stats"))
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (typeof payload.suspicious_ips === "number") {
          setCount(payload.suspicious_ips)
        }
      } catch {
        // ignore malformed payloads
      }
    }

    return () => {
      cancelled = true
      socket.close()
    }
  }, [])

  return count
}

function buildWebSocketUrl(path: string) {
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"
  try {
    const url = new URL(backend)
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
    url.pathname = path
    return url.toString()
  } catch {
    return `${backend.replace(/^http/, "ws")}${path}`
  }
}


