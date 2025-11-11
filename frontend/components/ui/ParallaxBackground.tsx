"use client"

import { useEffect, useRef } from "react"

import { usePerfControl } from "@/hooks/usePerfControl"

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
}

const PARTICLE_COUNT = 420
const PARALLAX_STRENGTH = 18
const FALLBACK_BRAND_RGB = "243, 91, 4"
const FALLBACK_BG = "rgb(15, 15, 15)"

function brandColor(alpha = 1) {
  if (typeof window === "undefined") return `rgba(${FALLBACK_BRAND_RGB}, ${alpha})`
  const value = getComputedStyle(document.documentElement).getPropertyValue("--brand-orange-rgb").trim()
  const rgb = value || FALLBACK_BRAND_RGB
  return `rgba(${rgb}, ${alpha})`
}

function backgroundColor() {
  if (typeof window === "undefined") return FALLBACK_BG
  const value = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()
  return value || FALLBACK_BG
}

export function ParallaxBackground() {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const layerRefs = [useRef<HTMLDivElement | null>(null), useRef<HTMLDivElement | null>(null), useRef<HTMLDivElement | null>(null)]
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointerTarget = useRef({ x: 0, y: 0 })
  const offset = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number>()
  const particlesRef = useRef<Particle[]>([])
  const lastTimeRef = useRef<number>(performance.now())
  const driftRef = useRef(0)

  const { reducedMotion, lowPerf } = usePerfControl()

  useEffect(() => {
    if ((!reducedMotion && !lowPerf) || !wrapperRef.current) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const wrapper = wrapperRef.current
    wrapper.style.transform = "none"
    layerRefs.forEach((layer) => {
      if (layer.current) layer.current.style.transform = "none"
    })
  }, [lowPerf, reducedMotion])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || reducedMotion || lowPerf) return undefined

    const handlePointerMove = (event: PointerEvent) => {
      const { innerWidth, innerHeight } = window
      const normX = (event.clientX / innerWidth) * 2 - 1
      const normY = (event.clientY / innerHeight) * 2 - 1
      pointerTarget.current.x = normX * PARALLAX_STRENGTH
      pointerTarget.current.y = normY * PARALLAX_STRENGTH
    }

    window.addEventListener("pointermove", handlePointerMove)

    const animate = (time: number) => {
      const delta = Math.min(60, time - lastTimeRef.current)
      lastTimeRef.current = time
      driftRef.current += delta * 0.00005

      offset.current.x += (pointerTarget.current.x - offset.current.x) * 0.04
      offset.current.y += (pointerTarget.current.y - offset.current.y) * 0.04

      const rotationX = offset.current.y * -0.05 + Math.sin(driftRef.current) * 0.4
      const rotationY = offset.current.x * 0.05 + Math.cos(driftRef.current * 0.6) * 0.4

      wrapper.style.transform = `translate3d(${offset.current.x}px, ${offset.current.y}px, 0) rotateX(${rotationX}deg) rotateY(${rotationY}deg)`

      layerRefs.forEach((layer, index) => {
        const element = layer.current
        if (!element) return
        const depth = (index + 1) * 0.35
        const x = offset.current.x * depth + Math.sin(driftRef.current * (index + 1)) * 6
        const y = offset.current.y * depth + Math.cos(driftRef.current * (index + 1.4)) * 6
        element.style.transform = `translate3d(${x}px, ${y}px, 0)`
      })

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [lowPerf, reducedMotion])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reducedMotion || lowPerf) return undefined
    const context = canvas.getContext("2d")
    if (!context) return undefined

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      canvas.width = parent.clientWidth
      canvas.height = parent.clientHeight
      particlesRef.current = createParticles(canvas.width, canvas.height)
    }

    resize()
    window.addEventListener("resize", resize)

    const render = () => {
      const { width, height } = canvas
      context.clearRect(0, 0, width, height)
      context.globalCompositeOperation = "lighter"

      particlesRef.current.forEach((particle) => {
        particle.x += particle.vx
        particle.y += particle.vy
        particle.alpha += (Math.random() - 0.5) * 0.01

        if (particle.x < 0) particle.x = width
        if (particle.x > width) particle.x = 0
        if (particle.y < 0) particle.y = height
        if (particle.y > height) particle.y = 0
        particle.alpha = Math.max(0.05, Math.min(0.35, particle.alpha))

        context.beginPath()
        context.fillStyle = brandColor(particle.alpha)
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        context.fill()
      })

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener("resize", resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [lowPerf, reducedMotion])

  if (reducedMotion || lowPerf) {
    return (
      <div
        className="pointer-events-none fixed inset-0 -z-20"
        style={{
          background: `linear-gradient(135deg, ${backgroundColor()}, rgba(0, 0, 0, 0.85))`,
        }}
      />
    )
  }

  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div ref={wrapperRef} className="absolute inset-0 will-change-transform">
        <div ref={layerRefs[0]} className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(circle at 30% 20%, ${brandColor(0.16)}, transparent 70%)` }} />
        <div ref={layerRefs[1]} className="absolute inset-0 opacity-35" style={{ background: "linear-gradient(120deg, rgba(0,0,0,0.55), rgba(0,0,0,0.2))" }} />
        <div ref={layerRefs[2]} className="absolute inset-0 opacity-25" style={{ background: `linear-gradient(200deg, ${brandColor(0.12)}, transparent 60%)` }} />
        <div className="absolute inset-0 animate-[noiseDrift_60s_linear_infinite_alternate] bg-[url('data:image/svg+xml,%3Csvg width=%27100%25%27 height=%27100%25%27 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22 x=%220%22 y=%220%22 width=%22100%25%22 height=%22100%25%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%222%22 seed=%222%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')] opacity-[0.04]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:100%_3px]" />
        <canvas ref={canvasRef} className="absolute inset-0" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_60%,rgba(0,0,0,0.35)_100%)]" />
        <div className="scanline-shimmer absolute inset-0" />
      </div>
    </div>
  )
}

function createParticles(width: number, height: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 0.08 + Math.random() * 0.12
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: Math.random() * 1.8 + 0.4,
      alpha: 0.08 + Math.random() * 0.18,
    }
  })
}

export default ParallaxBackground



