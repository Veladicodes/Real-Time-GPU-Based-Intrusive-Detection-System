"use client"

import { AnimatePresence, motion } from "framer-motion"
import { usePathname } from "next/navigation"

export function LayoutTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="min-h-screen relative"
        style={{
          color: "inherit",
        }}
      >
        <motion.div
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0.2 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0.25 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ background: "radial-gradient(circle at center, var(--accent-color, rgba(243,91,4,0.25)) 0%, transparent 70%)" }}
        />
        <div className="relative">{children}</div>
      </motion.div>
    </AnimatePresence>
  )
}

export default LayoutTransition


