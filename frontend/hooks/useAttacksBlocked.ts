"use client"

import { useMemo } from "react"

import { useWebSocketLogs } from "@/hooks/useWebSocketLogs"

export function useAttacksBlocked() {
  const { alertMessages } = useWebSocketLogs({ muteAudio: true })
  return useMemo(() => alertMessages.length, [alertMessages])
}


