"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { AnimatePresence, motion } from "framer-motion"
import { Bot } from "lucide-react"

const REFRESH_INTERVAL = 20_000
const INITIAL_MESSAGE = "Initializing neural synopsis…"

type NarrativeResponse = {
  narrative: string
  generated_at?: string
}

export function AINarrator() {
  const [narrative, setNarrative] = useState<string>(INITIAL_MESSAGE)
  const [displayText, setDisplayText] = useState<string>(INITIAL_MESSAGE)
  const [timestamp, setTimestamp] = useState<string | null>(null)
  const [muted, setMuted] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)

  const synthRef = useRef<SpeechSynthesis | null>(null)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const speakTimeoutRef = useRef<number>()
  const typingTimeoutRef = useRef<number>()
  const lastNarrativeRef = useRef<string>("")

  const fetchNarrative = useCallback(async () => {
    try {
      const response = await fetch("/api/summary/narrative")
      if (!response.ok) throw new Error(`Narrative request failed: ${response.status}`)
      const payload = (await response.json()) as NarrativeResponse
      if (!payload?.narrative) return
      const text = payload.narrative.trim()
      if (text && text !== lastNarrativeRef.current) {
        lastNarrativeRef.current = text
        setNarrative(text)
        setTimestamp(payload.generated_at ?? new Date().toISOString())
        setLoading(false)
      }
    } catch (error) {
      console.warn("[AI Narrator] failed to fetch narrative", error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    synthRef.current = window.speechSynthesis

    const assignVoice = () => {
      if (!synthRef.current) return
      const voices = synthRef.current.getVoices()
      if (!voices.length) return
      const preferred =
        voices.find((voice) => /male|man|baritone|david|brian/i.test(`${voice.name} ${voice.voiceURI}`) && voice.lang.startsWith("en")) ??
        voices.find((voice) => voice.lang.startsWith("en")) ??
        voices[0]
      voiceRef.current = preferred
    }

    assignVoice()
    synthRef.current.addEventListener("voiceschanged", assignVoice)

    return () => {
      synthRef.current?.cancel()
      synthRef.current?.removeEventListener("voiceschanged", assignVoice)
      if (speakTimeoutRef.current) window.clearTimeout(speakTimeoutRef.current)
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    fetchNarrative()
    const interval = window.setInterval(fetchNarrative, REFRESH_INTERVAL)
    return () => window.clearInterval(interval)
  }, [fetchNarrative])

  const speak = useCallback(
    (text: string) => {
      if (muted) return
      if (!synthRef.current) return
      synthRef.current.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.04
      utterance.pitch = 0.95
      utterance.volume = 0.9
      if (voiceRef.current) utterance.voice = voiceRef.current
      speakTimeoutRef.current = window.setTimeout(() => {
        synthRef.current?.speak(utterance)
      }, 250)
    },
    [muted],
  )

  useEffect(() => {
    if (!narrative) return
    speak(narrative)
  }, [narrative, speak])

  useEffect(() => {
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
    let index = 0
    const target = narrative
    const typeNext = () => {
      setDisplayText(target.slice(0, index))
      index += 1
      if (index <= target.length) {
        typingTimeoutRef.current = window.setTimeout(typeNext, 18)
      }
    }
    typeNext()
    return () => {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
    }
  }, [narrative])

  const formattedTimestamp = useMemo(() => {
    if (!timestamp) return "--"
    return new Date(timestamp).toLocaleTimeString("en-GB", { hour12: false })
  }, [timestamp])

  return (
    <div className="relative flex w-full max-w-md flex-col gap-4 rounded-2xl border border-[rgba(255,74,0,0.25)] bg-[rgba(5,5,5,0.82)] p-5 shadow-[0_0_22px_rgba(255,74,0,0.18)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ scale: [1, 1.06, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(255,74,0,0.18)]"
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[rgba(255,74,0,0.35)] to-transparent blur-md" />
            <Bot className="relative h-5 w-5 text-brand" />
          </motion.div>
          <div className="flex flex-col">
            <span className="text-xs font-mono uppercase tracking-[0.35em] text-brand">AI Narrator</span>
            <span className="text-[0.65rem] font-mono uppercase tracking-[0.25em] text-muted">
              {loading ? "Calibrating..." : `${formattedTimestamp}Z`}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMuted((prev) => !prev)}
          className={`rounded-full border px-3 py-1 text-[0.65rem] font-mono uppercase tracking-[0.3em] transition ${
            muted ? "border-[rgba(255,74,0,0.35)] text-muted" : "border-brand/40 text-brand hover:border-brand/60"
          }`}
        >
          {muted ? "Audio Off" : "Audio On"}
        </button>
      </div>

      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={narrative}
            className="min-h-[4.5rem] whitespace-pre-line font-mono text-sm text-neutral-200 leading-relaxed"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {displayText}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-[rgba(255,74,0,0.55)] to-transparent" />
      <div className="text-[0.65rem] font-mono uppercase tracking-[0.35em] text-[rgba(255,255,255,0.55)]">
        Neural voice: {muted ? "Muted" : "Active"}
      </div>
    </div>
  )
}

export default AINarrator


