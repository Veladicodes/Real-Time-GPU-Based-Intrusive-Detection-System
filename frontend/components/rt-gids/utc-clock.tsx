import { useEffect, useState } from "react"

export function UtcClock() {
  const [time, setTime] = useState<string>("")

  useEffect(() => {
    const update = () => setTime(new Date().toUTCString())
    update()
    const interval = setInterval(update, 1_000)
    return () => clearInterval(interval)
  }, [])

  return <span className="text-xs font-mono text-neutral-400">{time || "—"}</span>
}


