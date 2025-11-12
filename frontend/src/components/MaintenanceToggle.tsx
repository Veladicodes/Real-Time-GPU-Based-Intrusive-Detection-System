"use client"

import { useState } from "react"

import { ShieldAlert, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"

type MaintenanceToggleProps = {
  enabled: boolean
  onToggle: (enabled: boolean) => Promise<void>
}

export function MaintenanceToggle({ enabled, onToggle }: MaintenanceToggleProps) {
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    setLoading(true)
    try {
      await onToggle(!enabled)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleToggle}
      disabled={loading}
      className={`flex items-center gap-2 border px-4 py-2 text-xs font-mono uppercase tracking-[0.25em] ${
        enabled
          ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/20"
          : "border-brand/30 bg-brand/10 text-brand hover:bg-brand/20"
      }`}
    >
      {enabled ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
      {loading ? "Updating…" : enabled ? "Disable Maintenance" : "Enable Maintenance"}
    </Button>
  )
}

export default MaintenanceToggle

"use client"

import { useState } from "react"

import { PauseCircle, PlayCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

type MaintenanceToggleProps = {
  maintenance: boolean
  onToggle: (enabled: boolean) => Promise<void>
}

export function MaintenanceToggle({ maintenance, onToggle }: MaintenanceToggleProps) {
  const [submitting, setSubmitting] = useState(false)

  const handleClick = async () => {
    setSubmitting(true)
    try {
      await onToggle(!maintenance)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={submitting}
      variant={maintenance ? "default" : "outline"}
      className={`flex items-center gap-2 border border-brand/30 text-xs font-mono uppercase tracking-[0.3em] ${
        maintenance ? "bg-brand text-bg" : "text-text hover:bg-brand/10"
      }`}
    >
      {maintenance ? <PauseCircle className="h-4 w-4 animate-pulse" /> : <PlayCircle className="h-4 w-4" />}
      {submitting ? "Updating…" : maintenance ? "Exit Maintenance" : "Maintenance Mode"}
    </Button>
  )
}

export default MaintenanceToggle


