import { memo, useEffect, useMemo, useRef } from "react"

import { motion } from "framer-motion"

import type { ModelInfoResponse } from "@/hooks/useModelInfo"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface AICoreStatusProps {
  info: ModelInfoResponse | null
  isLoading?: boolean
}

const ORBIT_ROTATE = { repeat: Infinity, ease: "linear" } as const

export const AICoreStatus = memo(function AICoreStatus({ info, isLoading }: AICoreStatusProps) {
  const pulseRef = useRef<HTMLDivElement>(null)
  const accuracy = info?.accuracy ?? 0
  const pulseSpeed = useMemo(() => Math.max(2 - accuracy / 100, 0.5), [accuracy])

  useEffect(() => {
    if (!pulseRef.current) return
    pulseRef.current.style.animationDuration = `${pulseSpeed}s`
  }, [pulseSpeed])

  return (
    <Card className="border border-[rgba(var(--brand-rgb),0.12)] bg-panel/90 shadow-glow">
      <CardHeader className="border-b border-[rgba(var(--brand-rgb),0.08)] pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">
          AI CORE STATUS
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || !info ? (
          <div className="space-y-4">
            <div className="mx-auto h-32 w-32 animate-pulse rounded-full bg-[rgba(var(--brand-rgb),0.06)]" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-5 animate-pulse rounded bg-[rgba(var(--brand-rgb),0.06)]" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="relative mx-auto mb-6 flex h-32 w-32 items-center justify-center">
              <motion.div
                className="absolute inset-0 rounded-full border"
                style={{ borderColor: "rgba(var(--brand-rgb),0.35)" }}
                animate={{ rotate: 360 }}
                transition={{ ...ORBIT_ROTATE, duration: 14 }}
              />
              <motion.div
                className="absolute inset-3 rounded-full border"
                style={{ borderColor: "rgba(var(--brand-rgb),0.25)" }}
                animate={{ rotate: -360 }}
                transition={{ ...ORBIT_ROTATE, duration: 20 }}
              />
              <div
                ref={pulseRef}
                className="relative flex h-14 w-14 items-center justify-center rounded-full shadow-[0_0_18px_rgba(var(--brand-rgb),0.55)]"
                style={{
                  background: "radial-gradient(circle at 30% 30%, rgba(var(--brand-rgb),0.85), rgba(var(--brand-rgb),0.4))",
                  animation: "pulse 1.8s ease-in-out infinite",
                }}
              >
                <span className="text-lg font-mono font-bold text-bg">{Math.round(accuracy)}%</span>
              </div>
            </div>
            <div className="space-y-3 font-mono text-xs text-muted">
              <InfoRow label="Model">{info.model_name}</InfoRow>
              <InfoRow label="GPU Mode" tone={info.gpu_mode ? "positive" : "warning"}>
                {info.gpu_mode ? "ENABLED" : "DISABLED"}
              </InfoRow>
              <InfoRow label="Features">
                {Array.isArray(info.features_used) ? info.features_used.length : info.features_used ?? "—"}
              </InfoRow>
              {info.last_trained && <InfoRow label="Last Trained">{new Date(info.last_trained).toLocaleString()}</InfoRow>}
              <InfoRow label="Precision">{formatMetric(info.precision)}</InfoRow>
              <InfoRow label="Recall">{formatMetric(info.recall)}</InfoRow>
              <InfoRow label="F1 Score">{formatMetric(info.f1_score)}</InfoRow>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
})

function InfoRow({
  label,
  children,
  tone = "neutral",
}: {
  label: string
  children: React.ReactNode
  tone?: "neutral" | "positive" | "warning"
}) {
  const tint =
    tone === "positive" ? "var(--accent-green)" : tone === "warning" ? "var(--accent-yellow)" : "var(--text-primary)"
  return (
    <div className="flex items-center justify-between border-b border-[rgba(var(--brand-rgb),0.06)] pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span style={{ color: tint }}>{children}</span>
    </div>
  )
}

function formatMetric(value: number | undefined) {
  if (typeof value !== "number") return "—"
  return `${(value * 100).toFixed(1)}%`
}

