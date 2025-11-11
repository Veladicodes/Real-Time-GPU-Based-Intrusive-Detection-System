import { useEffect, useRef, useState } from "react"

export function FpsIndicator() {
  const [fps, setFps] = useState<number>(60)
  const prevTimestamp = useRef<number>(performance.now())
  const frameCount = useRef<number>(0)
  const rafRef = useRef<number>()

  useEffect(() => {
    const tick = (timestamp: number) => {
      frameCount.current += 1
      const delta = timestamp - prevTimestamp.current
      if (delta >= 1_000) {
        setFps(Math.round((frameCount.current * 1_000) / delta))
        frameCount.current = 0
        prevTimestamp.current = timestamp
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/80 px-3 py-1 text-[10px] font-mono text-neutral-500">
      FPS: <span className={fps > 50 ? "text-green-400" : fps > 30 ? "text-orange-400" : "text-red-500"}>{fps}</span>
    </div>
  )
}


