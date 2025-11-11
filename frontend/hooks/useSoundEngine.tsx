"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { getSound, stopAllSounds, type SoundKey } from "@/utils/sound"

type SoundEngineContextValue = {
  muted: boolean
  setMuted: (muted: boolean) => void
  toggleMute: () => void
  play: (key: SoundKey, options?: { volume?: number }) => void
}

const SoundEngineContext = createContext<SoundEngineContextValue | null>(null)

const STORAGE_KEY = "rtgids_sound_muted"

function randomPitch() {
  return 0.96 + Math.random() * 0.08
}

export function SoundEngineProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMutedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem(STORAGE_KEY) === "true"
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, muted ? "true" : "false")
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (muted || prefersReduced) {
      stopAllSounds()
    } else {
      const ambient = getSound("ambient_hum", 0.18, { loop: true })
      if (!ambient.playing()) ambient.play()
    }
  }, [muted])

  useEffect(() => {
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const ambient = getSound("ambient_hum", 0.18, { loop: true })
    if (muted || prefersReduced) {
      ambient.stop()
      ambient.loop(false)
      ambient.mute(true)
    } else if (!ambient.playing()) {
      ambient.mute(false)
      ambient.loop(true)
      ambient.play()
    }
    return () => {
      ambient.stop()
    }
  }, [muted])

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value)
  }, [])

  const toggleMute = useCallback(() => {
    setMutedState((prev) => !prev)
  }, [])

  const play = useCallback(
    (key: SoundKey, options?: { volume?: number }) => {
      if (muted) return
      const sound = getSound(key, options?.volume ?? 0.3)
      const id = sound.play()
      if (key !== "ambient_hum") {
        sound.rate(randomPitch(), id)
      }
    },
    [muted],
  )

  const value = useMemo(
    () => ({
      muted,
      setMuted,
      toggleMute,
      play,
    }),
    [muted, play, setMuted, toggleMute],
  )

  return <SoundEngineContext.Provider value={value}>{children}</SoundEngineContext.Provider>
}

export function useSoundEngine() {
  const context = useContext(SoundEngineContext)
  if (!context) {
    throw new Error("useSoundEngine must be used within a SoundEngineProvider")
  }
  return context
}


