"use client"

import { memo, useEffect, useMemo, useRef } from "react"

import * as THREE from "three"

import type { ThreatVisEvent } from "@/hooks/useThreatVis"
import { usePerfControl } from "@/hooks/usePerfControl"

const GLOBE_RADIUS = 1.6
const ARC_RETENTION = 8000
const FALLBACK_BRAND = "rgb(243, 91, 4)"
const FALLBACK_BG = "rgb(15, 15, 15)"

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export interface ThreatGlobeProps {
  events: ThreatVisEvent[]
  paused?: boolean
  threatLevel?: number
  focus?: number
}

type ArcRecord = {
  mesh: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>
  createdAt: number
}

export const ThreatGlobe = memo(function ThreatGlobe({
  events,
  paused = false,
  threatLevel = 0,
  focus = 0,
}: ThreatGlobeProps) {
  const { reducedMotion, lowPerf } = usePerfControl()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const globeRef = useRef<THREE.Mesh | null>(null)
  const particlesRef = useRef<THREE.Points | null>(null)
  const arcGroupRef = useRef<THREE.Group | null>(null)
  const arcRecordsRef = useRef<ArcRecord[]>([])
  const frameRef = useRef<number>()
  const focusRef = useRef<number>(focus)
  const pausedRef = useRef<boolean>(paused)
  const threatLevelRef = useRef<number>(threatLevel)

  useEffect(() => {
    threatLevelRef.current = threatLevel
  }, [threatLevel])

  useEffect(() => {
    const container = containerRef.current
    if (!container || rendererRef.current) return

    const width = container.clientWidth
    const height = container.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8))
    renderer.setSize(width, height)
    rendererRef.current = renderer
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(0, 0, 5.5)
    cameraRef.current = camera

    const ambient = new THREE.AmbientLight(0xffffff, 0.25)
    scene.add(ambient)

    const keyLight = new THREE.PointLight(0xf35b04, 1.6)
    keyLight.position.set(8, 6, 6)
    scene.add(keyLight)

    const fillLight = new THREE.PointLight(0xff2e00, 1.2)
    fillLight.position.set(-6, -4, -6)
    scene.add(fillLight)

    const texture = createGridTexture()
    const globeMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      color: new THREE.Color(0x111111),
      emissive: new THREE.Color(0xf35b04),
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.9,
      roughness: 0.8,
      metalness: 0.1,
    })
    const globe = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96), globeMaterial)
    globeRef.current = globe
    scene.add(globe)

    const particles = createParticles()
    particlesRef.current = particles
    scene.add(particles)

    const arcGroup = new THREE.Group()
    arcGroupRef.current = arcGroup
    scene.add(arcGroup)

    const renderFrame = () => {
      const now = performance.now()
      const threatValue = threatLevelRef.current
      if (!pausedRef.current && !lowPerf && !reducedMotion) {
        globe.rotation.y += 0.0018
        particles.rotation.y += 0.001 * (0.5 + threatValue / 120)
      }

      if (globeMaterial) {
        const target = 0.18 + threatValue / 220
        globeMaterial.emissiveIntensity = THREE.MathUtils.lerp(
          globeMaterial.emissiveIntensity,
          target,
          0.05,
        )
        const hue = THREE.MathUtils.mapLinear(threatValue, 0, 100, 140, 0)
        globeMaterial.emissive.set(`hsl(${hue}, 85%, 55%)`)
      }

      const camera = cameraRef.current
      if (camera) {
        const targetDistance = THREE.MathUtils.lerp(5.5, 4.1, THREE.MathUtils.clamp(focusRef.current, 0, 1))
        camera.position.lerp(new THREE.Vector3(0, 0, targetDistance), 0.05)
        camera.lookAt(0, 0, 0)
      }

      const arcRecords = arcRecordsRef.current
      if (arcRecords.length && arcGroupRef.current) {
        for (let i = arcRecords.length - 1; i >= 0; i -= 1) {
          const record = arcRecords[i]
          const life = 1 - (now - record.createdAt) / ARC_RETENTION
          record.mesh.material.opacity = THREE.MathUtils.clamp(life, 0, 1)
          if (life <= 0) {
            arcGroupRef.current.remove(record.mesh)
            record.mesh.geometry.dispose()
            record.mesh.material.dispose()
            arcRecords.splice(i, 1)
          }
        }
      }

      renderer.render(scene, camera!)
      if (!reducedMotion && !lowPerf) {
        frameRef.current = requestAnimationFrame(renderFrame)
      }
    }

    if (reducedMotion || lowPerf) {
      renderFrame()
    } else {
      frameRef.current = requestAnimationFrame(renderFrame)
    }

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return
      const w = container.clientWidth
      const h = container.clientHeight
      rendererRef.current.setSize(w, h)
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
    }

    window.addEventListener("resize", handleResize)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      window.removeEventListener("resize", handleResize)
      renderer.dispose()
      scene.clear()
      container.removeChild(renderer.domElement)
      arcRecordsRef.current = []
      rendererRef.current = null
      sceneRef.current = null
      globeRef.current = null
      particlesRef.current = null
      arcGroupRef.current = null
    }
  }, [lowPerf, reducedMotion])

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    focusRef.current = focus
  }, [focus])

  useEffect(() => {
    const arcGroup = arcGroupRef.current
    if (!arcGroup) return

    arcGroup.clear()
    arcRecordsRef.current.forEach((record) => {
      record.mesh.geometry.dispose()
      record.mesh.material.dispose()
    })
    arcRecordsRef.current = []

    events.forEach((event) => {
      const mesh = createArcMesh(event)
      if (mesh) {
        arcGroup.add(mesh)
        arcRecordsRef.current.push({ mesh, createdAt: Date.now() })
      }
    })
  }, [events])

  if (reducedMotion || lowPerf) return null
  return <div ref={containerRef} className="h-full w-full" />
})

function createGridTexture() {
  const size = 512
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.fillStyle = cssVar("--bg", FALLBACK_BG)
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = cssVar("--brand-orange", FALLBACK_BRAND)
  ctx.globalAlpha = 0.18

  const step = 32
  for (let x = 0; x <= size; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, size)
    ctx.stroke()
  }
  for (let y = 0; y <= size; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(size, y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 16
  texture.repeat.set(1, 1)
  return texture
}

function createParticles() {
  const count = 420
  const radius = GLOBE_RADIUS * 1.3
  const positions = new Float32Array(count * 3)
  const speeds = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    const phi = Math.acos(2 * Math.random() - 1)
    const theta = 2 * Math.PI * Math.random()
    const r = radius + Math.random() * 0.2
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.cos(phi)
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    speeds[i] = 0.2 + Math.random() * 0.4
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: new THREE.Color(cssVar("--brand-orange", FALLBACK_BRAND)),
    size: 0.02,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geometry, material)
  ;(points.userData as { speeds?: Float32Array }).speeds = speeds

  return points
}

function createArcMesh(event: ThreatVisEvent) {
  const start = latLonToVector3(event.src.lat, event.src.lon, GLOBE_RADIUS)
  const end = latLonToVector3(event.dst.lat, event.dst.lon, GLOBE_RADIUS)
  const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS * 1.5)
  const curve = new THREE.CatmullRomCurve3([start, mid, end])
  const geometry = new THREE.TubeGeometry(curve, 128, 0.015, 12, false)

  const color =
    event.severity === "ALERT" ? 0xff2e00 : event.severity === "WARNING" ? 0xf35b04 : event.severity === "NORMAL" ? 0xd97706 : 0x888888

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  return new THREE.Mesh(geometry, material)
}

function latLonToVector3(lat: number, lon: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(90 - lat)
  const theta = THREE.MathUtils.degToRad(lon + 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

export default ThreatGlobe


