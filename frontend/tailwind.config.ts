import type { Config } from "tailwindcss"

const withOpacity = (variable: string) => {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variable}) / ${opacityValue})`
    }
    return `rgb(var(${variable}))`
  }
}

const config: Config = {
  content: ["./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: withOpacity("--brand-rgb") as any,
        brandSoft: "var(--brand-soft)",
        bg: withOpacity("--bg-rgb") as any,
        panel: withOpacity("--panel-rgb") as any,
        surfaceGlass: "var(--surface-glass)",
        surfaceGlow: "var(--surface-glow)",
        surface: withOpacity("--panel-rgb") as any,
        muted: withOpacity("--muted-rgb") as any,
        text: withOpacity("--text-primary-rgb") as any,
        textBright: withOpacity("--text-bright-rgb") as any,
        textDim: withOpacity("--text-dim-rgb") as any,
        accentGreen: withOpacity("--accent-green-rgb") as any,
        accentYellow: withOpacity("--accent-yellow-rgb") as any,
        accentRed: withOpacity("--accent-red-rgb") as any,
      },
      boxShadow: {
        glow: "var(--glow)",
      },
      fontFamily: {
        ui: ["var(--ui-font)", "sans-serif"],
        mono: ["var(--mono-font)", "monospace"],
        display: ["var(--font-display)", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
      },
    },
  },
  plugins: [],
}

export default config
