"use client"

import type { ReactNode } from "react"
import { createContext, useContext, useEffect, useMemo, useState } from "react"

type ThemeTokens = {
  brand: string
  brandSoft: string
  background: string
  panel: string
  text: string
  muted: string
  accentGreen: string
  accentYellow: string
  accentRed: string
}

type ThemeContextValue = {
  tokens: ThemeTokens
  reducedMotion: boolean
}

const TOKEN_MAP: ThemeTokens = {
  brand: "var(--brand)",
  brandSoft: "var(--brand-soft)",
  background: "var(--bg)",
  panel: "var(--panel)",
  text: "var(--text-primary)",
  muted: "var(--muted)",
  accentGreen: "var(--accent-green)",
  accentYellow: "var(--accent-yellow)",
  accentRed: "var(--accent-red)",
}

const ThemeContext = createContext<ThemeContextValue>({
  tokens: TOKEN_MAP,
  reducedMotion: false,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")

    const apply = (value: boolean) => {
      setReducedMotion(value)
      document.documentElement.classList.toggle("reduced-motion", value)
    }

    apply(media.matches)

    const handler = (event: MediaQueryListEvent) => apply(event.matches)
    media.addEventListener("change", handler)

    return () => {
      media.removeEventListener("change", handler)
    }
  }, [])

  const value = useMemo(
    () => ({
      tokens: TOKEN_MAP,
      reducedMotion,
    }),
    [reducedMotion],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
