"use client"

import { Howl, type HowlOptions } from "howler"

export type SoundKey = "log_entry" | "gauge_change" | "nav_click" | "critical_alert" | "ambient_hum"

const SOUND_FILES: Record<SoundKey, string> = {
  log_entry: "/sounds/log_entry.wav",
  gauge_change: "/sounds/gauge_change.wav",
  nav_click: "/sounds/nav_click.wav",
  critical_alert: "/sounds/critical_alert.wav",
  ambient_hum: "/sounds/ambient_hum.wav",
}

const cache = new Map<SoundKey, Howl>()

export function getSound(key: SoundKey, volume = 0.3, options?: Partial<HowlOptions>) {
  if (!cache.has(key)) {
    cache.set(
      key,
      new Howl({
        src: [SOUND_FILES[key]],
        volume,
        preload: true,
        html5: false,
        loop: key === "ambient_hum",
        ...options,
      }),
    )
  }
  const sound = cache.get(key)!
  sound.volume(volume)
  return sound
}

export function stopAllSounds() {
  cache.forEach((sound) => {
    if (sound.playing()) {
      sound.stop()
    }
  })
}


