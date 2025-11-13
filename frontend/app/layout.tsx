import type React from "react"
import type { Metadata } from "next"
import dynamic from "next/dynamic"
import { Inter, Share_Tech_Mono } from "next/font/google"
import "../styles/globals.css"

const AppShell = dynamic(() => import("@/components/AppShell"), {
  ssr: false,
  loading: () => <div className="motion-ready" />,
})

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--ui-font",
})

const shareTechMono = Share_Tech_Mono({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--mono-font",
})

export const metadata: Metadata = {
  title: "RT-GIDS Tier-0 Neural Defense Interface",
  description: "Cinematic neural defense operations portal with real-time GPU intrusion intelligence.",
  authors: [{ name: "Neural Defense Labs" }],
  generator: "v0.app",
  applicationName: "RT-GIDS Neural Ops",
  icons: {
    icon: "/favicon.ico",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preload" as="font" href="/fonts/Orbitron.woff2" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" href="/fonts/JetBrainsMono.woff2" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className={`${inter.variable} ${shareTechMono.variable} bg-bg text-text antialiased font-ui`}>
        <div aria-live="polite" className="sr-only" />
        <AppShell>{children}</AppShell>
        <script defer src="/scripts/deferred.js"></script>
      </body>
    </html>
  )
}
