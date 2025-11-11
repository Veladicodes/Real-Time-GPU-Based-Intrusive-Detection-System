"use client"

import { useEffect, useState } from "react"

export function useUptime() {
  const [uptime, setUptime] = useState("00:00:00")

  useEffect(() => {
    let seconds = 0
    const interval = window.setInterval(() => {
      seconds += 1
      const hours = String(Math.floor(seconds / 3600)).padStart(2, "0")
      const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")
      const secs = String(seconds % 60).padStart(2, "0")
      setUptime(`${hours}:${minutes}:${secs}`)
    }, 1_000)
    return () => window.clearInterval(interval)
  }, [])

  return uptime
}


