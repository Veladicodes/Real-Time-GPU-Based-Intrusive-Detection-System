"use client"

import { useCallback, useMemo, useState } from "react"

import { Volume2, VolumeX, Headphones, Mic, Sparkles } from "lucide-react"

import { useUIAudio } from "@/hooks/useUIAudio"

function formatVoiceName(name: string | null, supported: boolean) {
  if (!supported) return "Synth unavailable"
  if (!name) return "System voice"
  return name.replace(/\s+voice$/i, "")
}

export function AudioControls() {
  const { muted, toggleMute, play } = useUIAudio()
  const [testCounter, setTestCounter] = useState(0)

  const handleToggleMute = useCallback(() => {
    if (!muted) {
      play("click")
    }
    toggleMute()
  }, [muted, play, toggleMute])

  const handleTestVoice = useCallback(() => {
    const next = testCounter + 1
    setTestCounter(next)
    play("info")
  }, [play, testCounter])

  const statusLabel = muted ? "Audio Muted" : "Audio Active"

  return (
    <div className="flex items-center gap-3 rounded-lg border border-brand/30 bg-surface/80 px-3 py-2 text-xs font-mono text-muted">
      <div className="flex items-center gap-2" data-audio-status>
        <span className={`h-2 w-2 rounded-full ${muted ? "bg-brand/30" : "bg-brand animate-pulse"}`} />
        <span className="uppercase tracking-[0.3em] text-text">{statusLabel}</span>
      </div>

      <button
        type="button"
        onClick={handleToggleMute}
        className="flex items-center gap-1 rounded border border-brand/30 px-2 py-1 text-text transition hover:border-brand/60 hover:text-brand"
        aria-pressed={!muted}
        aria-label={muted ? "Unmute audio" : "Mute audio"}
      >
        {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
        {muted ? "Unmute" : "Mute"}
      </button>

      <button
        type="button"
        onClick={handleTestVoice}
        className="flex items-center gap-1 rounded border border-brand/20 px-2 py-1 text-text transition hover:border-brand/60 hover:text-brand"
        aria-label="Play sample audio cue"
      >
        <Sparkles className="h-3 w-3" />
        Test
      </button>

      <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-muted">
        <span className="flex items-center gap-1">
          <Headphones className="h-3 w-3" />
          {muted ? "Muted" : "Active"}
        </span>
        <span>| Ambient {muted ? "Off" : "On"}</span>
      </div>
    </div>
  )
}

export default AudioControls


