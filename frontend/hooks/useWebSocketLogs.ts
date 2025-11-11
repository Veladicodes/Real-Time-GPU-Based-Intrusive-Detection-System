"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"

import { buildWebSocketUrl } from "@/lib/api"
import { useUIAudio } from "@/hooks/useUIAudio"

const LOG_CACHE_KEY = "rtgids_logs_v3"
const MAX_LOG_ENTRIES = 200
const WS_ENDPOINT = buildWebSocketUrl()

export type LogSeverity = "ALERT" | "WARNING" | "INFO" | "NORMAL"

export interface LogMessage {
  id: string
  timestamp: string
  type: LogSeverity
  severity: LogSeverity
  src_ip?: string
  dst_ip?: string
  threat?: string
  message?: string
  confidence?: number
  raw?: Record<string, unknown>
}

export type ConnectionState = "connecting" | "open" | "closed" | "error"

export interface UseWebSocketLogsResult {
  messages: LogMessage[]
  alertMessages: LogMessage[]
  connected: boolean
  connectionState: ConnectionState
  paused: boolean
  setPaused: Dispatch<SetStateAction<boolean>>
  clear: () => void
  reconnect: () => void
  send: (payload: Record<string, unknown>) => void
  isActive: boolean
}

interface UseWebSocketLogsOptions {
  muteAudio?: boolean
}

const ALERT_LEVELS: Record<string, LogSeverity> = {
  alert: "ALERT",
  warning: "WARNING",
  warn: "WARNING",
  info: "INFO",
  normal: "NORMAL",
}

function loadCachedMessages(): LogMessage[] {
  if (typeof window === "undefined") return []
  try {
    const cached = window.localStorage.getItem(LOG_CACHE_KEY)
    if (!cached) return []
    const parsed = JSON.parse(cached) as LogMessage[]
    return parsed.length ? parsed : []
  } catch (error) {
    console.warn("Failed to parse cached logs", error)
    return []
  }
}

function saveCachedMessages(messages: LogMessage[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LOG_CACHE_KEY, JSON.stringify(messages))
  } catch (error) {
    console.warn("Failed to cache logs", error)
  }
}

function normalizeMessage(payload: Record<string, unknown>): LogMessage {
  const idSource = payload.id as string | undefined
  const id = idSource && idSource.length > 0 ? idSource : generateId()

  const tsSource = payload.timestamp ?? payload.ts ?? payload.time
  const timestamp = resolveTimestamp(tsSource)

  const severitySource =
    (payload.severity as string | undefined) ??
    (payload.level as string | undefined) ??
    (payload.type as string | undefined) ??
    "info"
  const type = ALERT_LEVELS[severitySource.toLowerCase()] ?? "INFO"

  const confidence = typeof payload.confidence === "number" ? payload.confidence : undefined

  return {
    id,
    timestamp,
    type,
    severity: type,
    src_ip: payload.src_ip as string | undefined,
    dst_ip: payload.dst_ip as string | undefined,
    threat:
      (payload.threat as string | undefined) ??
      (payload.message as string | undefined) ??
      (payload.description as string | undefined),
    message:
      (payload.message as string | undefined) ??
      (payload.threat as string | undefined) ??
      (payload.description as string | undefined),
    confidence,
    raw: payload,
  }
}

function isHeartbeat(payload: Record<string, unknown>, message: LogMessage): boolean {
  const raw =
    (typeof payload.message === "string" && payload.message) ??
    (typeof payload.threat === "string" && payload.threat) ??
    message.message ??
    message.threat ??
    ""
  return raw.trim().toLowerCase().startsWith("rt-gids auto-pulse")
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function resolveTimestamp(source: unknown): string {
  if (typeof source === "number" && Number.isFinite(source)) {
    const milliseconds = source > 1_000_000_000_000 ? source : source * 1000
    const date = new Date(milliseconds)
    if (!Number.isNaN(date.valueOf())) return date.toISOString()
  }
  if (typeof source === "string" && source.length > 0) {
    const parsed = new Date(source)
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString()
  }
  return new Date().toISOString()
}

const subscribers = new Set<(state: InternalState) => void>()

type InternalState = {
  messages: LogMessage[]
  connectionState: ConnectionState
  connected: boolean
}

let globalState: InternalState = {
  messages: loadCachedMessages(),
  connectionState: "connecting",
  connected: false,
}

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
let shouldReconnect = true

function notifySubscribers() {
  subscribers.forEach((listener) => listener(globalState))
}

function updateState(partial: Partial<InternalState>) {
  globalState = { ...globalState, ...partial }
  notifySubscribers()
}

function pushMessage(message: LogMessage) {
  const next = [...globalState.messages, message].slice(-MAX_LOG_ENTRIES)
  globalState = {
    ...globalState,
    messages: next,
  }
  saveCachedMessages(next)
  notifySubscribers()
}

function scheduleReconnect() {
  if (!shouldReconnect) return
  if (reconnectTimer) return
  const delay = Math.min(30_000, 2 ** reconnectAttempts * 1_000)
  reconnectAttempts += 1
  updateState({ connectionState: "closed", connected: false })
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWebSocket()
  }, delay)
}

function connectWebSocket() {
  if (socket || typeof window === "undefined") return

  updateState({ connectionState: "connecting", connected: false })

  try {
    socket = new WebSocket(WS_ENDPOINT)
  } catch (error) {
    console.warn("WebSocket creation failed", error)
    scheduleReconnect()
    return
  }

  socket.addEventListener("open", () => {
    reconnectAttempts = 0
    updateState({ connectionState: "open", connected: true })
  })

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data) as Record<string, unknown>
      const message = normalizeMessage(payload)
      if (isHeartbeat(payload, message)) return
      pushMessage(message)
    } catch (error) {
      console.warn("Failed to parse WebSocket payload", error)
    }
  })

  socket.addEventListener("close", () => {
    socket = null
    if (!shouldReconnect) return
    scheduleReconnect()
  })

  socket.addEventListener("error", (error) => {
    console.warn("WebSocket error", error)
    updateState({ connectionState: "error", connected: false })
    if (socket) {
      socket.close()
      socket = null
    }
    scheduleReconnect()
  })
}

function clearMessages() {
  globalState = { ...globalState, messages: [] }
  saveCachedMessages(globalState.messages)
  notifySubscribers()
}

function reconnectSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  reconnectAttempts = 0
  if (socket) {
    socket.close()
    socket = null
  }
  connectWebSocket()
}

export function useWebSocketLogs(options: UseWebSocketLogsOptions = {}): UseWebSocketLogsResult {
  const [messages, setMessages] = useState<LogMessage[]>(globalState.messages)
  const [connectionState, setConnectionState] = useState<ConnectionState>(globalState.connectionState)
  const [connected, setConnected] = useState<boolean>(globalState.connected)
  const [paused, setPaused] = useState<boolean>(false)
  const { play } = useUIAudio()
  const lastAudioRef = useRef(0)
  const alertMessages = useMemo(() => messages.filter((entry) => entry.severity === "ALERT"), [messages])
  const isActive = alertMessages.length > 0

  useEffect(() => {
    connectWebSocket()

    const listener = (state: InternalState) => {
      setConnectionState(state.connectionState)
      setConnected(state.connected)
      if (!paused) {
        setMessages(state.messages)
      }
    }

    subscribers.add(listener)
    listener(globalState)

    return () => {
      subscribers.delete(listener)
    }
  }, [paused])

  useEffect(() => {
    if (options.muteAudio) return
    if (!messages.length) return
    const latest = messages[messages.length - 1]
    const now = Date.now()
    if (now - lastAudioRef.current < 750) return
    lastAudioRef.current = now
    if (latest.severity === "ALERT") play("alert")
    else if (latest.severity === "WARNING") play("warning")
    else play("info")
  }, [messages, options.muteAudio, play])

  const clear = useCallback(() => {
    clearMessages()
  }, [])

  const reconnect = useCallback(() => {
    reconnectSocket()
  }, [])

  const send = useCallback((payload: Record<string, unknown>) => {
    try {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload))
      }
    } catch (error) {
      console.warn("Failed to send message over WebSocket", error)
    }
  }, [])

  return useMemo(
    () => ({
      messages,
      alertMessages,
      connected,
      connectionState,
      paused,
      setPaused,
      clear,
      reconnect,
      send,
      isActive,
    }),
    [alertMessages, clear, connected, connectionState, isActive, messages, paused, reconnect, send],
  )
}

