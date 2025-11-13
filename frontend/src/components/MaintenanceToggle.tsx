"use client"

import { useState } from "react"

import { PauseCircle, PlayCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

type MaintenanceToggleProps = {
  maintenance: boolean
  onToggle: (enabled: boolean) => Promise<void>
}

function MaintenanceToggle({ maintenance, onToggle }: MaintenanceToggleProps) {
  const [submitting, setSubmitting] = useState(false)

  const handleToggle = async () => {
    setSubmitting(true)
    try {
      await onToggle(!maintenance)
    } finally {
      setSubmitting(false)
    }
  }

  const Icon = maintenance ? PauseCircle : PlayCircle
  const label = submitting ? "Updating…" : maintenance ? "Exit Maintenance" : "Maintenance Mode"

  return (
    <Button
      onClick={handleToggle}
      disabled={submitting}
      variant={maintenance ? "default" : "outline"}
      className="flex items-center gap-2"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  )
}

export default MaintenanceToggle


