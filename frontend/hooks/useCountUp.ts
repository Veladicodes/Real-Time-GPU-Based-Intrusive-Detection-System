import { useEffect, useRef, useState } from "react"

/**
 * Animates a numeric value from its previous value to a new target using requestAnimationFrame.
 */
export function useCountUp(target: number, duration = 800) {
  const [displayValue, setDisplayValue] = useState<number>(Number.isFinite(target) ? target : 0)
  const prevValueRef = useRef<number>(displayValue)
  const frameRef = useRef<number>()

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setDisplayValue(target)
      prevValueRef.current = target
      return
    }

    const startValue = prevValueRef.current ?? 0
    const diff = target - startValue
    const startTime = performance.now()

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      setDisplayValue(startValue + diff * progress)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      } else {
        prevValueRef.current = target
      }
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [target, duration])

  return displayValue
}


