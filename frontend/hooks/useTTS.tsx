"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

declare global {
  interface Window {
    __AUDIO_DEBUG__?: {
      getState: () => {
        queueLength: number
        muted: boolean
        mode: string
        volume: number
        currentPhrase: string | null
        supported: boolean
      }
    }
  }
}

type NarrationLevel = "critical" | "warning" | "info"
type NarrationMode = "concise" | "verbose"

type SpeakPayload = {
  text: string
  level?: NarrationLevel
  key?: string
}

type AudioContextValue = {
  supported: boolean
  muted: boolean
  mode: NarrationMode
  volume: number
  activeVoice: string | null
  queueLength: number
  currentPhrase: string | null
  speak: (payload: SpeakPayload) => void
  mute: () => void
  unmute: () => void
  setVolume: (value: number) => void
  setMode: (mode: NarrationMode) => void
}

type QueueItem = {
  id: string
  text: string
  level: NarrationLevel
  key: string
  createdAt: number
}

const AudioContext = createContext<AudioContextValue | undefined>(undefined)

const LEVEL_PRIORITY: Record<NarrationLevel, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

const THROTTLE_WINDOWS: Record<NarrationLevel, number> = {
  info: 5_000,
  warning: 3_000,
  critical: 1_000,
}

const DEDUP_WINDOW_MS = 60_000

function selectVoice(targets: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!targets.length) return null
  const preferred = targets.find(
    (voice) =>
      voice.lang?.toLowerCase().startsWith("en") &&
      /google|microsoft/i.test(voice.name),
  )
  if (preferred) return preferred
  const enVoice = targets.find((voice) => voice.lang?.toLowerCase().startsWith("en"))
  return enVoice ?? targets[0]
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const queueRef = useRef<QueueItem[]>([])
  const speakingRef = useRef(false)
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const [supported, setSupported] = useState(false)
  const [muted, setMuted] = useState(false)
  const [mode, setModeState] = useState<NarrationMode>("verbose")
  const [volume, setVolumeState] = useState(0.7)
  const [queueLength, setQueueLength] = useState(0)
  const [currentPhrase, setCurrentPhrase] = useState<string | null>(null)
  const [activeVoice, setActiveVoice] = useState<string | null>(null)
  const recentMessagesRef = useRef<Map<string, number>>(new Map())
  const lastLevelRef = useRef<Record<NarrationLevel, number>>({
    critical: 0,
    warning: 0,
    info: 0,
  })
  const reducedSoundRef = useRef(false)

  const updateQueueLength = useCallback(() => {
    setQueueLength(queueRef.current.length + (speakingRef.current ? 1 : 0))
  }, [])

  const flushExpired = useCallback(() => {
    const now = Date.now()
    const store = recentMessagesRef.current
    for (const [key, timestamp] of store.entries()) {
      if (now - timestamp > DEDUP_WINDOW_MS) {
        store.delete(key)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    synthRef.current = typeof window.speechSynthesis !== "undefined" ? window.speechSynthesis : null
    const prefersReducedSound = window.matchMedia?.("(prefers-reduced-sound: reduce)")
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    reducedSoundRef.current = Boolean(prefersReducedSound?.matches || prefersReducedMotion?.matches)
    if (reducedSoundRef.current) {
      setMuted(true)
    }

    setSupported(Boolean(synthRef.current))

    if (!synthRef.current) return

    const assignVoices = () => {
      const voices = synthRef.current?.getVoices() ?? []
      const picked = selectVoice(voices)
      if (picked) {
        voiceRef.current = picked
        setActiveVoice(picked.name)
      }
    }

    assignVoices()
    if (synthRef.current && typeof synthRef.current.addEventListener === "function") {
      synthRef.current.addEventListener("voiceschanged", assignVoices)
    }

    const handlePreferenceChange = (event: MediaQueryListEvent) => {
      reducedSoundRef.current = event.matches
      if (event.matches) {
        setMuted(true)
      }
    }
    prefersReducedSound?.addEventListener?.("change", handlePreferenceChange)

    return () => {
      if (synthRef.current && typeof synthRef.current.removeEventListener === "function") {
        synthRef.current.removeEventListener("voiceschanged", assignVoices)
      }
      prefersReducedSound?.removeEventListener?.("change", handlePreferenceChange)
    }
  }, [])

  const processQueue = useCallback(() => {
    if (speakingRef.current || muted || reducedSoundRef.current) {
      updateQueueLength()
      return
    }
    const synth = synthRef.current
    const next = queueRef.current.shift()
    if (!next) {
      updateQueueLength()
      return
    }
    speakingRef.current = true
    setCurrentPhrase(next.text)
    updateQueueLength()

    const finish = () => {
      speakingRef.current = false
      updateQueueLength()
      flushExpired()
      processQueue()
    }

    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
      setTimeout(finish, 50)
      return
    }

    const utterance = new SpeechSynthesisUtterance(next.text)
    utterance.rate = 0.95
    utterance.pitch = 1.0
    utterance.volume = muted ? 0 : volume
    if (voiceRef.current) {
      utterance.voice = voiceRef.current
    }
    utterance.onend = finish
    utterance.onerror = finish
    synth.speak(utterance)
  }, [flushExpired, muted, updateQueueLength, volume])

  useEffect(() => {
    if (muted && synthRef.current?.speaking) {
      synthRef.current.cancel()
      speakingRef.current = false
      updateQueueLength()
    }
  }, [muted, updateQueueLength])

  const enqueue = useCallback(
    (item: QueueItem) => {
      queueRef.current.push(item)
      queueRef.current.sort((a, b) => {
        const priorityDiff = LEVEL_PRIORITY[a.level] - LEVEL_PRIORITY[b.level]
        if (priorityDiff !== 0) return priorityDiff
        return a.createdAt - b.createdAt
      })
      updateQueueLength()
      processQueue()
    },
    [processQueue, updateQueueLength],
  )

  const speak = useCallback(
    ({ text, level = "info", key }: SpeakPayload) => {
      if (!text) return
      const normalizedLevel: NarrationLevel = level
      if (mode === "concise" && normalizedLevel !== "critical") {
        return
      }
      const now = Date.now()
      const identity = (key ?? text).toLowerCase()
      flushExpired()
      const lastHeard = recentMessagesRef.current.get(identity)
      if (lastHeard && now - lastHeard < DEDUP_WINDOW_MS) {
        return
      }
      const lastLevelTime = lastLevelRef.current[normalizedLevel]
      if (now - lastLevelTime < THROTTLE_WINDOWS[normalizedLevel]) {
        return
      }
      recentMessagesRef.current.set(identity, now)
      lastLevelRef.current[normalizedLevel] = now
      enqueue({
        id: `${normalizedLevel}-${now}-${Math.random().toString(36).slice(2)}`,
        text,
        level: normalizedLevel,
        key: identity,
        createdAt: now,
      })
    },
    [enqueue, flushExpired, mode],
  )

  const mute = useCallback(() => setMuted(true), [])
  const unmute = useCallback(() => {
    if (reducedSoundRef.current) {
      reducedSoundRef.current = false
    }
    setMuted(false)
  }, [])
  const setVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value))
    setVolumeState(clamped)
  }, [])
  const setMode = useCallback((next: NarrationMode) => {
    setModeState(next)
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined") {
      ;(window as any).__AUDIO_DEBUG__ = {
        getState: () => ({
          queueLength,
          muted,
          mode,
          volume,
          currentPhrase,
          supported,
        }),
      }
    }
  }, [currentPhrase, mode, muted, queueLength, supported, volume])

  const handleSetVolumePercent = useCallback(
    (percent: number) => {
      setVolume(percent / 100)
    },
    [setVolume],
  )

  useEffect(() => {
    if (!muted) {
      processQueue()
    }
  }, [muted, processQueue])

  const value = useMemo<AudioContextValue>(
    () => ({
      supported,
      muted,
      mode,
      volume,
      activeVoice,
      queueLength,
      currentPhrase,
      speak,
      mute,
      unmute,
      setVolume: handleSetVolumePercent,
      setMode,
    }),
    [activeVoice, currentPhrase, handleSetVolumePercent, mode, muted, queueLength, speak, supported, volume, mute, unmute, setMode],
  )

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
}

export function useTTS() {
  const context = useContext(AudioContext)
  if (!context) {
    throw new Error("useTTS must be used within an AudioProvider")
  }
  return context
}


