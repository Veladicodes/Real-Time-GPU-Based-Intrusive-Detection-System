"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Howl, Howler } from "howler"

const STORAGE_KEY = "muted"
const SOUND_PATH = "/sounds/"

const soundFiles = {
  info: "info.mp3",
  warning: "warning.mp3",
  alert: "alert.mp3",
  click: "ui-click.mp3",
  ambient: "ambient.mp3",
} as const

type SoundType = keyof typeof soundFiles

const volumes: Record<SoundType, number> = {
  info: 0.25,
  warning: 0.35,
  alert: 0.45,
  click: 0.3,
  ambient: 0.1,
}

const cooldowns: Record<SoundType, number> = {
  info: 1000,
  warning: 1000,
  alert: 1000,
  click: 150,
  ambient: 0,
}

const STUB = Object.freeze({
  play: () => {},
  muted: true,
  toggleMute: () => {},
  ready: false,
} as const)

let soundBank: Record<SoundType, Howl> | null = null
let globalMuted = true
let globalReady = false
let activeConsumers = 0

const muteListeners = new Set<(value: boolean) => void>()
const readyListeners = new Set<(value: boolean) => void>()

function ensureSoundBank() {
  if (typeof window === "undefined") return null
  if (soundBank) return soundBank
  const entries = Object.entries(soundFiles).map(([key, file]) => {
    const typedKey = key as SoundType
    return [
      typedKey,
      new Howl({
        src: [`${SOUND_PATH}${file}`],
        volume: volumes[typedKey],
        loop: typedKey === "ambient",
        preload: true,
        html5: false,
        onload: handleSoundLoaded,
        onloaderror: (_, error) => {
          console.warn(`⚠️ Failed to load ${file}`, error)
        },
      }),
    ]
  })
  soundBank = Object.fromEntries(entries) as Record<SoundType, Howl>
  return soundBank
}

function handleSoundLoaded() {
  if (!soundBank) return
  const everyLoaded = Object.values(soundBank).every((sound) => sound.state() === "loaded")
  if (everyLoaded) {
    globalReady = true
    readyListeners.forEach((listener) => listener(true))
  }
}

function stopAllSounds() {
  if (!soundBank) return
  Object.values(soundBank).forEach((sound) => {
    if (sound.playing()) sound.stop()
  })
}

export const useUIAudio = () => {
  if (typeof window === "undefined") {
    console.warn("Skipping audio preload during SSR build phase")
    return STUB
  }

  const sounds = ensureSoundBank()
  if (!sounds) {
    return STUB
  }
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return globalMuted
    const stored = window.localStorage.getItem(STORAGE_KEY)
    globalMuted = stored === "true"
    Howler.mute(globalMuted)
    return globalMuted
  })
  const [ready, setReady] = useState<boolean>(globalReady)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const lastPlayRef = useRef<Record<SoundType, number>>({
    info: 0,
    warning: 0,
    alert: 0,
    click: 0,
    ambient: 0,
  })

  useEffect(() => {
    activeConsumers += 1
    muteListeners.add(setMuted)
    readyListeners.add(setReady)
    if (globalReady) setReady(true)

    return () => {
      activeConsumers = Math.max(0, activeConsumers - 1)
      muteListeners.delete(setMuted)
      readyListeners.delete(setReady)
      if (activeConsumers === 0) {
        stopAllSounds()
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = (matches: boolean) => {
      setPrefersReducedMotion(matches);
      if (matches) {
        stopAllSounds();
        const ambient = soundBank?.ambient;
        ambient?.loop(false);
        ambient?.mute(true);
      } else if (!globalMuted && globalReady && activeConsumers > 0) {
        const ambient = soundBank?.ambient;
        ambient?.mute(false);
        ambient?.loop(true);
        ambient?.play();
      }
    };
    applyPreference(query.matches);
    const listener = (event: MediaQueryListEvent) => applyPreference(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, [sounds]);

  useEffect(() => {
    if (!globalReady) {
      const interval = setInterval(() => {
        if (globalReady) {
          setReady(true)
          clearInterval(interval)
        }
      }, 150)
      return () => clearInterval(interval)
    }
    return undefined
  }, [])

  useEffect(() => {
    globalMuted = muted
    Howler.mute(muted)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(muted))
    }

    if (muted || prefersReducedMotion || activeConsumers === 0) {
      stopAllSounds()
      return
    }
    if (ready) {
      sounds.ambient.loop(true)
      sounds.ambient.play()
    }
  }, [muted, ready, sounds, prefersReducedMotion])

  const play = useCallback(
    (type: SoundType) => {
      if (muted || !ready || prefersReducedMotion) return
      const sound = sounds[type]
      if (!sound) return
      const now = Date.now()
      const last = lastPlayRef.current[type]
      if (now - last < (cooldowns[type] ?? 0)) return
      lastPlayRef.current[type] = now
      try {
        sound.play()
      } catch (error) {
        console.error(`Audio play failed for ${type}`, error)
      }
    },
    [muted, ready, sounds],
  )

  const toggleMute = useCallback(() => {
    const next = !globalMuted
    globalMuted = next
    Howler.mute(next)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    }
    muteListeners.forEach((listener) => listener(next))
    if (next) {
      stopAllSounds()
    } else if (ready && !prefersReducedMotion) {
      sounds.ambient.play()
    }
  }, [ready, sounds])

  return useMemo(
    () => ({
      play,
      muted,
      toggleMute,
      ready,
    }),
    [muted, play, ready, toggleMute],
  )
}


