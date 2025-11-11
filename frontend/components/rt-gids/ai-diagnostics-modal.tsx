import { useEffect, useRef } from "react"

import { AnimatePresence, motion } from "framer-motion"
import * as THREE from "three"

interface AIDiagnosticsModalProps {
  open: boolean
  onClose: () => void
}

export function AIDiagnosticsModal({ open, onClose }: AIDiagnosticsModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open || !canvasRef.current) {
      return
    }

    const canvas = canvasRef.current
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000)
    camera.position.z = 6

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

    const geometry = new THREE.IcosahedronGeometry(2.2, 1)
    const material = new THREE.MeshStandardMaterial({
      color: 0xf35b04,
      emissive: 0x111111,
      emissiveIntensity: 0.8,
      metalness: 0.4,
      roughness: 0.3,
      wireframe: true,
    })

    const orb = new THREE.Mesh(geometry, material)
    scene.add(orb)

    const ambient = new THREE.AmbientLight(0xf2a365, 0.9)
    scene.add(ambient)

    const point = new THREE.PointLight(0xff8a00, 1.2)
    point.position.set(5, 5, 5)
    scene.add(point)

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      orb.rotation.x += 0.004
      orb.rotation.y += 0.006
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!canvasRef.current) return
      const { clientWidth, clientHeight } = canvasRef.current
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }

    window.addEventListener("resize", handleResize)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      window.removeEventListener("resize", handleResize)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0.5 }}
            transition={{ type: "spring", stiffness: 180, damping: 18 }}
            className="relative w-full max-w-3xl overflow-hidden rounded border border-orange-500/40 bg-neutral-950/95 p-6 text-neutral-300"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded border border-neutral-700 px-2 py-1 text-xs font-mono uppercase text-neutral-400 transition hover:border-orange-500/60 hover:text-orange-300"
            >
              Close
            </button>
            <h2 className="text-lg font-bold uppercase tracking-[0.3em] text-orange-500">AI Diagnostics</h2>
            <p className="mt-2 text-xs text-neutral-500">
              Real-time vector resonance showing the GPU inference core. Rotational velocity correlates with ensemble confidence.
            </p>
            <div className="mt-6 aspect-video rounded border border-orange-500/20 bg-neutral-900/60">
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-xs font-mono">
              <DiagnosticsRow label="GPU Load" value="92%" />
              <DiagnosticsRow label="VRAM Usage" value="14.2 GB" />
              <DiagnosticsRow label="Inference Latency" value="12 ms" />
              <DiagnosticsRow label="Confidence Index" value="0.992" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function DiagnosticsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-800 pb-2 last:border-b-0 last:pb-0">
      <span className="text-neutral-500">{label}</span>
      <span className="text-orange-400">{value}</span>
    </div>
  )
}


