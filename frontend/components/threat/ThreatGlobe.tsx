"use client"

import { memo } from "react"

import { motion } from "framer-motion"

import type { ThreatGeoPoint } from "@/hooks/useThreatAnalytics"

type ThreatGlobeProps = {
  points: ThreatGeoPoint[]
  highlightIp: string | null
}

const size = 260

function mapToGlobePosition(lat: number, lon: number) {
  const x = ((lon + 180) / 360) * size - size / 2
  const y = ((90 - lat) / 180) * size - size / 2
  return { x, y }
}

function ThreatGlobeComponent({ points, highlightIp }: ThreatGlobeProps) {
  return (
    <div className="relative mx-auto h-full w-full max-w-xs">
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative h-[260px] w-[260px] rounded-full shadow-[0_0_32px_rgba(var(--brand-orange-rgb),0.25)]"
          style={{
            background: "radial-gradient(circle at center, rgba(var(--brand-orange-rgb),0.2) 0%, rgba(0,0,0,0.9) 70%)",
          }}
        >
          <div className="absolute inset-0 rounded-full border border-brand/20 blur-[0.5px]" />
          <div className="absolute inset-[18%] rounded-full border border-brand/15" />
          <div className="absolute inset-[35%] rounded-full border border-brand/10" />
          <div className="absolute left-1/2 top-1/2 h-[1px] w-[90%] -translate-x-1/2 bg-brand/15" />
          <div className="absolute left-1/2 top-1/2 h-[90%] w-[1px] -translate-y-1/2 bg-brand/15" />
          {points.slice(0, 30).map((point) => {
            const { x, y } = mapToGlobePosition(point.latitude, point.longitude)
            const intensity = Math.min(Math.max(point.intensity, 0.2), 1)
            const isActive = highlightIp && point.ip === highlightIp
            return (
              <motion.span
                key={point.id}
                className="absolute h-2 w-2 rounded-full bg-brand"
                style={{
                  left: `calc(50% + ${x}px)`,
                  top: `calc(50% + ${y}px)`,
                  boxShadow: `0 0 ${isActive ? 16 : 8}px rgba(var(--brand-orange-rgb), ${0.35 + intensity * 0.25})`,
                }}
                animate={{ opacity: [0.4, 1, 0.4], scale: isActive ? [1, 1.4, 1] : [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2.6 - intensity, ease: "easeInOut" }}
              />
            )
          })}
        </div>
      </div>
      <div className="absolute bottom-0 left-1/2 w-[60%] -translate-x-1/2 rounded-full bg-gradient-to-r from-transparent via-brand/25 to-transparent py-1 text-center text-[10px] font-mono text-muted">
        AI threat geo distribution
      </div>
    </div>
  )
}

export const ThreatGlobe = memo(ThreatGlobeComponent)

export default ThreatGlobe


