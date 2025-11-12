"use client"

import { Activity, Cpu, ShieldCheck, Zap, Clock } from "lucide-react"

import { StatBox } from "@/components/ui/StatBox"
import { useSystemContext } from "@/context/SystemContext"

export default function CommandSummaryBar() {
  const { totalPackets, attacksBlocked, ipsBlocked, systemMetrics, uptimeLabel } = useSystemContext()

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      <StatBox label="TOTAL PACKETS" value={totalPackets} icon={<Activity className="h-5 w-5" />} severity="critical" />
      <StatBox
        label="ATTACKS BLOCKED"
        value={attacksBlocked}
        icon={<ShieldCheck className="h-5 w-5" />}
        severity={attacksBlocked > 0 ? "critical" : "normal"}
      />
      <StatBox
        label="IPS BLOCKED"
        value={ipsBlocked}
        icon={<Zap className="h-5 w-5" />}
        severity={ipsBlocked > 0 ? "critical" : "normal"}
      />
      <StatBox
        label="GPU MODE"
        value={systemMetrics.gpu_mode}
        hint={systemMetrics.gpu_name || undefined}
        icon={<Cpu className="h-5 w-5" />}
        severity={systemMetrics.gpu_mode === "ON" ? "normal" : "warning"}
      />
      <StatBox label="SYSTEM UPTIME" value={uptimeLabel} icon={<Clock className="h-5 w-5" />} severity="critical" />
    </section>
  )
}


