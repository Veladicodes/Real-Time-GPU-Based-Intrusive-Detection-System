"use client"

import dynamic from "next/dynamic"
import type { PropsWithChildren, ReactNode } from "react"
import { useEffect, useRef, useState } from "react"

import { ThemeProvider } from "@/components/theme/ThemeProvider"
import { SoundEngineProvider } from "@/hooks/useSoundEngine"
import { PerfControlProvider } from "@/hooks/usePerfControl"
import { SystemProvider } from "@/context/SystemContext"

const LayoutTransition = dynamic(() => import("@/components/LayoutTransition"), {
  ssr: false,
  loading: () => <div className="motion-ready" />,
})

const ParallaxBackground = dynamic(() => import("@/components/ui/ParallaxBackground"), {
  ssr: false,
  loading: () => <div className="motion-ready" />,
})

function Footer() {
  return (
    <footer className="page-footer pointer-events-none fixed bottom-2 right-4 z-10">
      <span className="pointer-events-auto">
        RT-GIDS Neural Ops v1.0 | © 2025 Neural Defense Labs
      </span>
    </footer>
  )
}

type AppShellProps = PropsWithChildren<{ children?: ReactNode }>

export function AppShell({ children }: AppShellProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [visualsReady, setVisualsReady] = useState(false)

  useEffect(() => {
    if (visualsReady) return

    if (typeof window === "undefined") return
    if (!("IntersectionObserver" in window)) {
      setVisualsReady(true)
      return
    }
    if (!viewportRef.current) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting)
        if (isVisible) {
          setVisualsReady(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 }
    )

    observer.observe(viewportRef.current)

    return () => observer.disconnect()
  }, [visualsReady])

  return (
    <ThemeProvider>
      <PerfControlProvider>
        <SoundEngineProvider>
          <SystemProvider>
            {visualsReady ? <ParallaxBackground /> : <div className="motion-ready min-h-[40vh]" aria-hidden />}
            <div ref={viewportRef} className="relative z-10">
              {visualsReady ? (
                <LayoutTransition>{children}</LayoutTransition>
              ) : (
                <div className="motion-ready min-h-[40vh]" aria-hidden />
              )}
            </div>
            <Footer />
          </SystemProvider>
        </SoundEngineProvider>
      </PerfControlProvider>
    </ThemeProvider>
  )
}

export default AppShell


