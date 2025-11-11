import { memo } from "react"

import { motion } from "framer-motion"

import type { TopIpEntry } from "@/hooks/useTopIPs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface TopIPsProps {
  ips: TopIpEntry[]
  loading?: boolean
}

export const TopIPs = memo(function TopIPs({ ips, loading }: TopIPsProps) {
  return (
    <Card className="border border-[rgba(var(--brand-rgb),0.12)] bg-panel/90 shadow-glow">
      <CardHeader className="border-b border-[rgba(var(--brand-rgb),0.08)] pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">TOP ATTACKER IPS</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded bg-[rgba(var(--brand-rgb),0.06)]" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {ips.map((attacker, idx) => {
              const percentage = Math.min(100, (attacker.count / (ips[0]?.count || 1)) * 100)
              return (
                <motion.div
                  key={attacker.ip}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="group"
                >
                  <div className="mb-1 flex items-center justify-between text-xs font-mono text-muted">
                    <span className="transition group-hover:text-brand">{attacker.ip}</span>
                    <span className="text-muted transition group-hover:text-text-primary">Blocked / Active</span>
                  </div>
                  <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.04)]">
                    <motion.div
                      animate={{ width: `${percentage}%` }}
                      transition={{ type: "spring", stiffness: 140, damping: 18 }}
                      className="h-full rounded-full shadow-[0_0_10px_rgba(var(--brand-rgb),0.45)]"
                      style={{
                        background: `linear-gradient(90deg, rgba(var(--brand-rgb),0.8) 0%, rgba(var(--accent-red-rgb),0.6) 100%)`,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-muted">Incidents: {attacker.count}</div>
                </motion.div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
})

