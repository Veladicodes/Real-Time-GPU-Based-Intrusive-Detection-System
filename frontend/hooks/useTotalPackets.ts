"use client"

import { useEffect, useState } from "react"

import { api } from "@/lib/api"

export function useTotalPackets() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    const fetchInitial = async () => {
      try {
        const res = await api.get("/api/threats/stats")
        if (cancelled) return
        const total = Number(res.data?.total_packets ?? 0)
        setCount(Number.isFinite(total) ? total : 0)
      } catch (error) {
        console.warn("Failed to load packet statistics", error)
      }
    }

    fetchInitial()

    const socket = new WebSocket(buildWebSocketUrl("/ws/stats"))

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (typeof payload.total_packets === "number") {
          setCount(payload.total_packets)
        }
      } catch {
        // ignore malformed payloads
      }
    }

    socket.onerror = () => {
      console.warn("Packet statistics websocket error")
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


