import { FormEvent, useCallback, useMemo, useState } from "react"

import { motion, AnimatePresence } from "framer-motion"

import apiClient from "@/lib/api"

interface CommandConsoleProps {
  onSubmit?: (command: string) => void
}

const HISTORY_KEY = "rtgids_console_history_v1"
const SIMULATED_PAYLOAD = {
  severity: "ALERT",
  message: "Simulated attack from console",
  src_ip: "192.168.1.50",
  dst_ip: "10.0.0.9",
  proto: "TCP",
} as const

export function CommandConsole({ onSubmit }: CommandConsoleProps) {
  const [command, setCommand] = useState<string>("")
  const [history, setHistory] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const cached = window.localStorage.getItem(HISTORY_KEY)
      return cached ? (JSON.parse(cached) as string[]) : []
    } catch {
      return []
    }
  })
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [toast, setToast] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  const persistHistory = useCallback((entry: string) => {
    if (typeof window === "undefined") return
    setHistory((current) => {
      const nextHistory = [...current.slice(-10), entry]
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory))
      return nextHistory
    })
  }, [])

  const pushToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 2_600)
  }, [])

  const sendPayload = useCallback(
    async (payload: Record<string, unknown>) => {
      setIsSending(true)
      try {
        await apiClient.post("/api/logs/ingest", payload)
        setStatus("success")
        pushToast("Attack alert sent!")
        setTimeout(() => setStatus("idle"), 2_000)
        return true
      } catch (error) {
        console.warn("Console ingest failed", error)
        setStatus("error")
        pushToast("Transmission failed")
        setTimeout(() => setStatus("idle"), 3_000)
        return false
      } finally {
        setIsSending(false)
      }
    },
    [pushToast],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!command.trim()) return
    const trimmed = command.trim()
    onSubmit?.(trimmed)
    setCommand("")

    const payload = {
      ...SIMULATED_PAYLOAD,
      message: `${trimmed} :: ${SIMULATED_PAYLOAD.message}`,
    }

    const ok = await sendPayload(payload)
    if (ok) {
      persistHistory(trimmed)
    }
  }

  const handleQuickAlert = async () => {
    const ok = await sendPayload(SIMULATED_PAYLOAD)
    if (ok) {
      persistHistory(SIMULATED_PAYLOAD.message)
    }
  }

  const quickLabel = useMemo(() => (isSending ? "Sending…" : "Send Simulated Alert"), [isSending])

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="relative overflow-hidden rounded border border-orange-500/40 bg-neutral-950/80 p-4 font-mono text-xs text-neutral-300"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(243,91,4,0.15),_transparent)] opacity-60" />
        <label htmlFor="command-console-input" className="mb-2 block text-[10px] uppercase tracking-widest text-orange-500">
          COMMAND CONSOLE
        </label>
        <div className="relative flex items-center gap-2">
          <span className="text-orange-500">&gt;</span>
          <input
            id="command-console-input"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            className="flex-1 bg-transparent text-sm text-orange-200 outline-none"
            placeholder="block_ip 192.168.0.12 --reason='manual override'"
          />
          <button
            type="submit"
            disabled={isSending}
            className="rounded border border-orange-500/60 px-3 py-1 text-[10px] uppercase tracking-widest text-orange-300 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Execute
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleQuickAlert}
            disabled={isSending}
            className="rounded border border-orange-500/60 px-3 py-1 text-[10px] uppercase tracking-[0.35em] text-orange-300 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {quickLabel}
          </button>
          {history.length > 0 && (
            <div className="text-[10px] text-neutral-500">
              History: {history.slice(-3).join(" • ")}
            </div>
          )}
        </div>
        {status !== "idle" && (
          <div
            className={`mt-3 text-[10px] uppercase tracking-[0.3em] ${
              status === "success" ? "text-accent" : "text-accent-red"
            }`}
          >
            {status === "success" ? "Attack alert sent!" : "Transmission failed"}
          </div>
        )}
      </form>
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed bottom-10 right-10 z-50 rounded border border-orange-500/60 bg-neutral-950/95 px-4 py-2 font-mono text-xs uppercase tracking-[0.35em] text-orange-200 shadow-[0_0_18px_rgba(243,91,4,0.35)]"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

