"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"

import { useReducedMotion } from "framer-motion"

type PerfControlValue = {
  showFps: boolean
  reducedMotion: boolean
  lowPerf: boolean
}

const PerfControlContext = createContext<PerfControlValue | null>(null)

export function PerfControlProvider({ children }: { children: React.ReactNode }) {
  const prefersReducedRaw = useReducedMotion()
  const prefersReduced = prefersReducedRaw ?? false
  const [showFps, setShowFps] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(prefersReduced)
  const [lowPerf, setLowPerf] = useState(false)
  const lowPerfRef = useRef(false)
  const fpsSamples = useRef<number[]>([])
  const lastFrameRef = useRef<number | null>(null)

  useEffect(() => {
    setReducedMotion(prefersReduced ?? false)
  }, [prefersReduced])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    setShowFps(params.get("debug") === "1")
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    if (reducedMotion) {
      document.body.dataset.reducedMotion = "true"
    } else {
      delete document.body.dataset.reducedMotion
    }
  }, [reducedMotion])

  useEffect(() => {
    if (typeof window === "undefined") return
    let rafId: number
    const loop = (time: number) => {
      if (lastFrameRef.current != null) {
        const delta = time - lastFrameRef.current
        const fps = delta > 0 ? Math.min(144, 1000 / delta) : 144
        fpsSamples.current.push(fps)
        if (fpsSamples.current.length > 120) fpsSamples.current.shift()
        if (fpsSamples.current.length >= 30) {
          const avg = fpsSamples.current.reduce((acc, sample) => acc + sample, 0) / fpsSamples.current.length
          if (avg < 55 && !lowPerfRef.current) {
            lowPerfRef.current = true
            setLowPerf(true)
          } else if (avg > 58 && lowPerfRef.current) {
            lowPerfRef.current = false
            setLowPerf(false)
          }
        }
      }
      lastFrameRef.current = time
      rafId = window.requestAnimationFrame(loop)
    }
    rafId = window.requestAnimationFrame(loop)
    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [])

  const value = useMemo(
    () => ({
      showFps,
      reducedMotion,
      lowPerf,
    }),
    [showFps, reducedMotion, lowPerf],
  )

  return <PerfControlContext.Provider value={value}>{children}</PerfControlContext.Provider>
}

export function usePerfControl() {
  const ctx = useContext(PerfControlContext)
  if (!ctx) {
    throw new Error("usePerfControl must be used within a PerfControlProvider")
  }
  return ctx
}


