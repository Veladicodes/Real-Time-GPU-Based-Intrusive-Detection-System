"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { AnimatePresence, motion } from "framer-motion"

import type { LogMessage } from "@/hooks/useWebSocketLogs"

type AINarratorProps = {
  threatLevel: number
  logs: LogMessage[]
  muted?: boolean
  intervalMs?: number
}

const SUMMARY_INTERVAL = 20_000

export function AINarrator({ threatLevel, logs, muted = false, intervalMs = SUMMARY_INTERVAL }: AINarratorProps) {
  const [summary, setSummary] = useState<string>("Awaiting telemetry synopsis…")
  const [displayText, setDisplayText] = useState<string>("Awaiting telemetry synopsis…")
  const [timestamp, setTimestamp] = useState<number>(Date.now())
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const lastSpokenRef = useRef<string>("")
  const typingTimeoutRef = useRef<number>()

  useEffect(() => {
    if (typeof window === "undefined") return
    synthRef.current = window.speechSynthesis
    return () => {
      synthRef.current?.cancel()
    }
  }, [])

  const computedSummary = useMemo(() => {
    if (threatLevel <= 30) {
      return {
        text: "Threat index nominal. Monitoring channels stand by.",
        key: "idle",
      }
    }

    const recent = logs.slice(-25)
    const alerts = recent.filter((log) => log.type === "ALERT")
    const warnings = recent.filter((log) => log.type === "WARNING")
    const critical = alerts.length
    const dominant = dominantPattern(alerts) ?? dominantPattern(warnings) ?? "baseline traffic"
    const topIp = extractTopIp(alerts.length ? alerts : recent)
    const confidence = averageConfidence(alerts.length ? alerts : recent)
    const text = `At ${new Date().toUTCString()}, ${critical + warnings.length} incidents detected. Dominant pattern ${dominant}, confidence ${confidence} percent${topIp ? `, primary source ${topIp}` : ""}.`
    return { text, key: `${critical}-${dominant}-${topIp}-${confidence}` }
  }, [logs, threatLevel])

  useEffect(() => {
    const speak = (text: string) => {
      if (muted) return
      if (!synthRef.current || typeof window === "undefined") return
      synthRef.current.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.05
      utterance.pitch = 1.1
      const voices = synthRef.current.getVoices()
      const preferred = voices.find((voice) => /female|woman|en-us/i.test(voice.name))
      if (preferred) utterance.voice = preferred
      utteranceRef.current = utterance
      synthRef.current.speak(utterance)
    }

    const handleSummary = () => {
      const { text, key } = computedSummary
      if (key === lastSpokenRef.current) return
      lastSpokenRef.current = key
      setSummary(text)
      setTimestamp(Date.now())
      speak(text)
    }

    handleSummary()
    const interval = setInterval(handleSummary, intervalMs)
    return () => clearInterval(interval)
  }, [computedSummary, intervalMs, muted])

  useEffect(() => {
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
    let index = 0
    const target = summary
    const step = () => {
      setDisplayText(target.slice(0, index))
      index += 1
      if (index <= target.length) {
        typingTimeoutRef.current = window.setTimeout(step, 25)
      }
    }
    step()
    return () => {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
    }
  }, [summary])

  return (
    <div className="ai-narrator-box pointer-events-auto w-full max-w-sm rounded-[var(--radius)] p-5 font-mono text-sm text-muted">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.35em] text-brand">
        <span>AI NARRATOR</span>
        <span>{new Date(timestamp).toLocaleTimeString("en-GB", { hour12: false })}Z</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={summary}
          className="min-h-[4rem] whitespace-pre-line text-text"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {displayText}
        </motion.p>
      </AnimatePresence>
      <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-[rgba(243,91,4,0.5)] to-transparent" />
      <div className="mt-2 text-[0.65rem] uppercase tracking-[0.4em] text-muted">
        {muted ? "Audio muted" : "Audio active"}
      </div>
    </div>
  )
}

function extractTopIp(logs: LogMessage[]) {
  if (!logs.length) return null
  const counts = new Map<string, number>()
  logs.forEach((log) => {
    if (!log.src_ip) return
    counts.set(log.src_ip, (counts.get(log.src_ip) ?? 0) + 1)
  })
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] ?? null
}

function dominantPattern(logs: LogMessage[]) {
  if (!logs.length) return null
  const patterns = new Map<string, number>()
  logs.forEach((log) => {
    const rawMessage =
      typeof log.raw?.message === "string"
        ? (log.raw.message as string)
        : typeof (log.raw as Record<string, unknown>)?.description === "string"
          ? String((log.raw as Record<string, unknown>).description)
          : undefined
    const key = log.threat ?? rawMessage ?? "unknown"
    patterns.set(key, (patterns.get(key) ?? 0) + 1)
  })
  const sorted = [...patterns.entries()].sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] ?? null
}

function averageConfidence(logs: LogMessage[]) {
  const confidences = logs
    .map((log) => {
      if (typeof log.confidence === "number") return log.confidence
      const rawMessage =
        typeof log.raw?.message === "string"
          ? (log.raw.message as string)
          : typeof (log.raw as Record<string, unknown>)?.description === "string"
            ? String((log.raw as Record<string, unknown>).description)
            : ""
      const match = /(\d+)%/.exec(rawMessage)
      return match ? Number.parseFloat(match[1]) : 0
    })
    .filter((value) => Number.isFinite(value))
  if (!confidences.length) return 0
  const avg = confidences.reduce((acc, value) => acc + value, 0) / confidences.length
  return Math.round(avg)
}

export default AINarrator


