"use client"

import { useMemo, useRef, useState } from "react"

import { motion } from "framer-motion"
import useSWR from "swr"
import { Globe2, ShieldOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"

type Attacker = {
  ip: string
  count: number
  geo?: string
}

const fetcher = (url: string) => api.get(url).then((res) => res.data as Attacker[])

const simulatedAttackers: Attacker[] = [
  { ip: "192.168.10.45", count: 54, geo: "India" },
  { ip: "203.0.113.12", count: 32, geo: "Russia" },
  { ip: "198.51.100.87", count: 25, geo: "Brazil" },
  { ip: "54.231.99.10", count: 21, geo: "United States" },
  { ip: "45.67.23.5", count: 17, geo: "Germany" },
]

const sortAttackers = (attackers: Attacker[]) =>
  [...attackers].sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0))

export default function TopAttackersList() {
  const [blocking, setBlocking] = useState<string | null>(null)
  const offlineRef = useRef(false)

  const { data, error, isLoading, mutate } = useSWR<Attacker[]>(
    "/api/analytics/top-attackers",
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 30_000,
    },
  )

  const attackers = useMemo(() => {
    if (data && data.length) {
      offlineRef.current = false
      return sortAttackers(data)
    }
    if (error || isLoading === false) {
      if (!offlineRef.current) {
        console.warn("⚠️ Backend offline, using simulated data.")
        offlineRef.current = true
      }
      return simulatedAttackers
    }
    return []
  }, [data, error, isLoading])

  const handleBlock = async (ip: string) => {
    setBlocking(ip)
    try {
      await api.post(`/api/defense/block/${encodeURIComponent(ip)}`)
      await mutate()
    } catch (err) {
      console.error("Failed to block IP", err)
    } finally {
      setBlocking(null)
    }
  }

  return (
    <Card className="border border-[rgba(255,74,0,0.25)] bg-[rgb(12,12,12)]/90 shadow-[0_0_20px_rgba(255,74,0,0.15)]">
      <CardHeader className="flex flex-col gap-2 border-b border-[rgba(255,74,0,0.18)] pb-3 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-sm font-mono uppercase tracking-[0.4em] text-brand">
          Top Attacker IPs
        </CardTitle>
        <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted">
          Auto-refresh 30s
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && !attackers.length ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <Skeleton key={idx} className="h-12 rounded bg-[rgba(255,74,0,0.08)]" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {attackers.map((attacker, index) => (
              <motion.div
                key={attacker.ip}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.05 }}
                className="flex items-center justify-between rounded border border-[rgba(255,74,0,0.22)] bg-black/50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-brand">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="text-sm font-semibold text-text">{attacker.ip}</div>
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-muted">
                      <Globe2 className="h-3.5 w-3.5 text-brand" />
                      <span>{attacker.geo ?? "Unknown"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-brand">{attacker.count}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBlock(attacker.ip)}
                    disabled={blocking === attacker.ip}
                    className="border-brand/40 bg-transparent text-[11px] font-mono uppercase tracking-[0.3em] text-brand hover:bg-brand/15"
                  >
                    <ShieldOff className="mr-2 h-3.5 w-3.5" />
                    {blocking === attacker.ip ? "Blocking..." : "Block"}
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}


