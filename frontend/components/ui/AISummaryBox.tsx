"use client"

import { useEffect, useRef, useState } from "react"

import { motion } from "framer-motion"
import { Loader2 } from "lucide-react"

type AISummaryBoxProps = {
  text: string
  loading: boolean
}

export function AISummaryBox({ text, loading }: AISummaryBoxProps) {
  const [display, setDisplay] = useState<string>(text)
  const typingTimeout = useRef<number>()

  useEffect(() => {
    if (loading) return
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
    let index = 0
    const step = () => {
      setDisplay(text.slice(0, index))
      index += 1
      if (index <= text.length) {
        typingTimeout.current = window.setTimeout(step, 20)
      }
    }
    step()
    return () => {
      if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
    }
  }, [loading, text])

  return (
    <div className="relative min-h-[140px] overflow-hidden rounded-lg border border-brand/20 bg-surface/90 p-4 text-sm text-text shadow-glow backdrop-blur-md">
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-30"
        initial={{ opacity: 0 }}
        animate={{ opacity: loading ? 0 : 1 }}
        transition={{ duration: 0.6 }}
        style={{
            backgroundImage:
              "linear-gradient(115deg, rgba(var(--brand-orange-rgb),0.25) 0%, transparent 45%), linear-gradient(65deg, rgba(var(--brand-orange-rgb),0.18) 0%, transparent 55%)",
        }}
      />
      <div className="relative z-10">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-brand">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="uppercase tracking-[0.4em]">Synthesizing summary…</span>
          </div>
        ) : (
          <p className="whitespace-pre-line font-mono leading-relaxed">{display}</p>
        )}
      </div>
    </div>
  )
}

export default AISummaryBox


