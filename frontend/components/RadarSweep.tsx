"use client"

import { useEffect, useRef } from "react"

import type { RadarPoint } from "@/hooks/useThreatTelemetry"

type RadarSweepProps = {
  points: RadarPoint[]
  dominantLabel?: string
}

const BLIP_LIFETIME = 6000

type Blip = RadarPoint & { createdAt: number; x: number; y: number }

export default function RadarSweep({ points, dominantLabel }: RadarSweepProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const blipsRef = useRef<Blip[]>([])
  const animationRef = useRef<number>()

  useEffect(() => {
    const now = Date.now()
    const normalized = points.map((point) => ({
      ...point,
      createdAt: now,
      ...polarToCartesian(point.angle),
    }))
    blipsRef.current = [...blipsRef.current, ...normalized].slice(-200)
  }, [points])

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

      drawGrid(ctx, radius)

      const now = Date.now()
      blipsRef.current = blipsRef.current.filter((blip) => now - blip.createdAt < BLIP_LIFETIME)

      const sweepSpeed = 0.025
      sweep += sweepSpeed
      drawSweep(ctx, radius, sweep)

      blipsRef.current.forEach((blip) => drawBlip(ctx, blip, radius))

      ctx.restore()
      animationRef.current = requestAnimationFrame(render)
    }

    render()
    return () => {
      window.removeEventListener("resize", resize)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [])

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div className="relative h-[300px] w-full overflow-hidden rounded-[var(--radius)] bg-[radial-gradient(circle_at_center,rgba(255,74,0,0.18)_0%,rgba(0,0,0,0.85)_70%)]">
        <canvas ref={canvasRef} aria-label="Threat radar display" />
      </div>
      {dominantLabel ? (
        <div className="text-xs font-mono uppercase tracking-[0.35em] text-muted">Dominant Vector: {dominantLabel}</div>
      ) : null}
    </div>
  )
}

function polarToCartesian(angle: number) {
  const radians = ((angle % 360) * Math.PI) / 180
  const radius = 0.45
  const x = 0.5 + Math.cos(radians) * radius
  const y = 0.5 - Math.sin(radians) * radius
  return { x, y }
}

function drawGrid(ctx: CanvasRenderingContext2D, radius: number) {
  ctx.strokeStyle = "rgba(255, 215, 155, 0.18)"
  ctx.lineWidth = 2
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath()
    ctx.arc(0, 0, radius * fraction, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.strokeStyle = "rgba(255, 215, 155, 0.12)"
  ctx.beginPath()
  ctx.moveTo(-radius, 0)
  ctx.lineTo(radius, 0)
  ctx.moveTo(0, -radius)
  ctx.lineTo(0, radius)
  ctx.stroke()
}

function drawSweep(ctx: CanvasRenderingContext2D, radius: number, sweep: number) {
  const gradient = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius)
  gradient.addColorStop(0, "rgba(255,74,0,0.4)")
  gradient.addColorStop(1, "rgba(255,74,0,0)")

  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.arc(0, 0, radius, sweep, sweep + Math.PI / 4)
  ctx.closePath()
  ctx.fill()
}

function drawBlip(ctx: CanvasRenderingContext2D, blip: Blip, radius: number) {
  const age = Date.now() - blip.createdAt
  const fade = 1 - age / BLIP_LIFETIME
  const distance = radius * 2
  const x = (blip.x - 0.5) * distance
  const y = (blip.y - 0.5) * distance
  const size = 6 + blip.intensity * 12

  ctx.fillStyle = `rgba(255,74,0,${0.55 * fade})`
  ctx.beginPath()
  ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = `rgba(255,140,0,${0.4 * fade})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, size + 6 * (1 - fade), 0, Math.PI * 2)
  ctx.stroke()
}


