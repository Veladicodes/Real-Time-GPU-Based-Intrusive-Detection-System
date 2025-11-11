"use client"

import { useMemo } from "react"

import { useWebSocketLogs } from "@/hooks/useWebSocketLogs"

export function useIPsBlocked() {
  const { alertMessages } = useWebSocketLogs({ muteAudio: true })

  return useMemo(() => {
    const unique = new Set<string>()
    alertMessages.forEach((message) => {
      if (message.src_ip) {
        unique.add(message.src_ip)
      }
    })
    return unique.size
  }, [alertMessages])
}


