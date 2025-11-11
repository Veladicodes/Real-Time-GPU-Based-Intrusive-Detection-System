import { memo, useEffect } from "react"

import { motion, useSpring, useTransform } from "framer-motion"

interface ThreatGaugeProps {
  level: number // 0-100
  isLoading?: boolean
}

const clampLevel = (value: number) => Math.max(0, Math.min(100, value))

export const ThreatGauge = memo(function ThreatGauge({ level, isLoading }: ThreatGaugeProps) {
  const safeLevel = clampLevel(level)
  const levelSpring = useSpring(safeLevel, { stiffness: 80, damping: 12 })
  const dashOffset = useTransform(levelSpring, (value) => 283 - (clampLevel(value) / 100) * 283)

  useEffect(() => {
    levelSpring.set(safeLevel)
  }, [safeLevel, levelSpring])

  const rotation = (safeLevel / 100) * 180 - 90

  return (
    <div className="relative mx-auto aspect-square w-full max-w-xs">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 200" role="img" aria-label="Threat gauge">
        <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(233, 233, 233, 0.12)" strokeWidth="2" />
        <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="rgba(233, 233, 233, 0.08)" strokeWidth="8" />
        <motion.path
          d="M 10 100 A 90 90 0 0 1 190 100"
          fill="none"
          stroke="var(--brand-orange)"
          strokeWidth="8"
          strokeDasharray="283"
          strokeDashoffset={dashOffset}
          style={{ filter: "drop-shadow(0 0 6px rgba(var(--brand-orange-rgb),0.6))" }}
        />
        <circle cx="100" cy="100" r="4" fill="var(--brand-orange)" opacity="0.8" />
        <motion.line
          x1="100"
          y1="100"
          x2={100 + 70 * Math.cos((rotation * Math.PI) / 180)}
          y2={100 + 70 * Math.sin((rotation * Math.PI) / 180)}
          stroke="var(--brand-orange)"
          strokeWidth="3"
          opacity="0.9"
          animate={{ rotate: rotation }}
          transition={{ type: "spring", stiffness: 120, damping: 14 }}
          style={{
            transformOrigin: "100px 100px",
            filter: "drop-shadow(0 0 6px rgba(var(--brand-orange-rgb),0.7))",
          }}
        />
        {[0, 25, 50, 75, 100].map((tick) => {
          const angle = (tick / 100) * 180 - 90
          const x1 = 100 + 85 * Math.cos((angle * Math.PI) / 180)
          const y1 = 100 + 85 * Math.sin((angle * Math.PI) / 180)
          const x2 = 100 + 92 * Math.cos((angle * Math.PI) / 180)
          const y2 = 100 + 92 * Math.sin((angle * Math.PI) / 180)
          return <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(233, 233, 233, 0.18)" strokeWidth="1" />
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {isLoading ? (
          <div className="h-10 w-20 animate-pulse rounded bg-surface/70" />
        ) : (
          <motion.div
            key={safeLevel}
            initial={{ scale: 0.95, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            className="text-4xl font-bold text-brand"
          >
            {safeLevel}%
          </motion.div>
        )}
        <div className="mt-1 text-xs font-mono uppercase text-muted">Threat</div>
      </div>
    </div>
  )
})

