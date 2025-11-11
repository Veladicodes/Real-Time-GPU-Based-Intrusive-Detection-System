"use client"

import type { ReactNode } from "react"
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes"

type NextThemeProviderWithChildren = ThemeProviderProps & { children?: ReactNode }

export function ThemeProvider({ children, ...props }: NextThemeProviderWithChildren) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
