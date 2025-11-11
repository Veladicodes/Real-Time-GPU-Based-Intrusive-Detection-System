"use client"

import { memo, useEffect, useRef } from "react"

import { usePerfControl } from "@/hooks/usePerfControl"

type NeonParticleBackdropProps = {
  className?: string
  intensity?: number
}

const PARTICLE_COUNT = 140

export const NeonParticleBackdrop = memo(function NeonParticleBackdrop({
  className = "",
  intensity = 0.4,
}: NeonParticleBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number>()
  const particlesRef = useRef<Particle[]>([])

  const { reducedMotion, lowPerf } = usePerfControl()

  useEffect(() => {
    if (reducedMotion || lowPerf) return
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext("2d")
    if (!ctx) return undefined

    let width = canvas.offsetWidth
    let height = canvas.offsetHeight
    canvas.width = width
    canvas.height = height

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => createParticle(width, height))
    particlesRef.current = particles

    const render = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = "lighter"
      particles.forEach((particle) => {
        particle.x += particle.vx
        particle.y += particle.vy
        particle.life -= 0.016

        if (particle.life <= 0 || particle.x < 0 || particle.x > width || particle.y < 0 || particle.y > height) {
          Object.assign(particle, createParticle(width, height))
        }

        const opacity = Math.max(0, particle.life) * intensity
        const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.size)
        gradient.addColorStop(0, `rgba(243,91,4,${opacity})`)
        gradient.addColorStop(1, "rgba(10,10,10,0)")
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
      })
      animationRef.current = requestAnimationFrame(render)
    }

    render()

    const handleResize = () => {
      width = canvas.offsetWidth
      height = canvas.offsetHeight
      canvas.width = width
      canvas.height = height
    }
    window.addEventListener("resize", handleResize)

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      window.removeEventListener("resize", handleResize)
    }
  }, [intensity, lowPerf, reducedMotion])

  return (
    <>
      {!reducedMotion && !lowPerf && (
        <canvas
          ref={canvasRef}
          className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
          aria-hidden="true"
        />
      )}
    </>
  )
})

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
}

function createParticle(width: number, height: number): Particle {
  const angle = Math.random() * Math.PI * 2
  const speed = 0.2 + Math.random() * 0.6
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed * 0.6,
    size: 1 + Math.random() * 2.5,
    life: 0.4 + Math.random() * 0.6,
  }
}

export default NeonParticleBackdrop


