"use client"

import { memo, useEffect, useRef } from "react"

import { usePerfControl } from "@/hooks/usePerfControl"

type RadarTarget = {
  id: string
  intensity: number
  x: number
  y: number
  label?: string
}

type Blip = RadarTarget & { createdAt: number }

type ThreatRadarProps = {
  targets: RadarTarget[]
  threatLevel: number
}

const RINGS = [0.25, 0.5, 0.75, 1]
const BLIP_LIFETIME = 6000

export const ThreatRadar = memo(function ThreatRadar({ targets, threatLevel }: ThreatRadarProps) {
  const { reducedMotion, lowPerf } = usePerfControl()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const blipsRef = useRef<Blip[]>([])
  const animationRef = useRef<number>()

  useEffect(() => {
    const now = Date.now()
    blipsRef.current = targets.map((target) => ({
      ...target,
      createdAt: now,
    }))
  }, [targets])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext("2d")
    if (!ctx) return undefined

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const size = Math.min(parent.clientWidth, parent.clientHeight)
      canvas.width = size * 2
      canvas.height = size * 2
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
    }

    resize()
    window.addEventListener("resize", resize)

    let sweep = 0

    const render = () => {
      const { width, height } = canvas
      const radius = Math.min(width, height) / 2 - 20
      ctx.clearRect(0, 0, width, height)

      ctx.save()
      ctx.translate(width / 2, height / 2)

      ctx.strokeStyle = "rgba(0, 255, 240, 0.15)"
      ctx.lineWidth = 2
      RINGS.forEach((ratio) => {
        ctx.beginPath()
        ctx.arc(0, 0, radius * ratio, 0, Math.PI * 2)
        ctx.stroke()
      })

      ctx.strokeStyle = "rgba(0, 255, 240, 0.12)"
      ctx.beginPath()
      ctx.moveTo(-radius, 0)
      ctx.lineTo(radius, 0)
      ctx.moveTo(0, -radius)
      ctx.lineTo(0, radius)
      ctx.stroke()

      const sweepSpeed = reducedMotion || lowPerf ? 0 : 0.012 + (threatLevel / 100) * 0.02
      sweep += sweepSpeed
      const hue = 180 - Math.min(120, threatLevel * 1.2)
      const gradient = ctx.createRadialGradient(0, 0, radius * 0.06, 0, 0, radius)
      gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.32)`)
      gradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, radius, sweep, sweep + Math.PI / 6)
      ctx.closePath()
      ctx.fill()

      const now = Date.now()
      blipsRef.current = blipsRef.current.filter((blip) => now - blip.createdAt < BLIP_LIFETIME)

      blipsRef.current.forEach((blip) => {
        const age = now - blip.createdAt
        const fade = 1 - age / BLIP_LIFETIME
        const x = (blip.x - 0.5) * (radius * 2)
        const y = (blip.y - 0.5) * (radius * 2)
        const size = 6 + blip.intensity * 10

        ctx.fillStyle = `rgba(255,46,0,${0.6 * fade})`
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = `rgba(255, 120, 0, ${0.4 * fade})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, size + 6 * (1 - fade), 0, Math.PI * 2)
        ctx.stroke()
      })

      ctx.restore()
      if (!reducedMotion && !lowPerf) {
        animationRef.current = requestAnimationFrame(render)
      }
    }

    if (reducedMotion || lowPerf) {
      render()
    } else {
      animationRef.current = requestAnimationFrame(render)
    }

    return () => {
      window.removeEventListener("resize", resize)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [lowPerf, reducedMotion, threatLevel])

  return (
    <div className="radar-container radar-sweep relative h-full w-full overflow-hidden rounded-[var(--radius)]">
      <canvas ref={canvasRef} aria-label="Threat radar display" />
    </div>
  )
})

export default ThreatRadar



