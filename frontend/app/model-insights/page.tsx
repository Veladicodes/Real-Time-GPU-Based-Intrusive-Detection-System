"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Sparkles } from "lucide-react"

import AISummaryBox from "@/components/ui/AISummaryBox"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import FeatureImportanceChart from "@/components/model/FeatureImportanceChart"
import InsightCard from "@/components/model/InsightCard"
import { useModelInsightsData } from "@/hooks/useModelInsightsData"

export default function ModelInsightsPage() {
  const { features, patterns, summary, loading, generating, generate } = useModelInsightsData()

  return (
    <div className="relative flex h-full flex-col gap-6 overflow-hidden bg-bg p-6 text-text">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(var(--brand-orange-rgb),0.2)_60%,transparent_90%)] opacity-50"
      />

      <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="page-header relative z-10 space-y-2">
        <h1 className="model-header">MODEL INSIGHTS</h1>
        <p className="text-sm text-muted">Transparency layer for GPU IDS — feature impact, AI summaries, and emerging patterns.</p>
      </motion.header>

      <div className="relative z-10 grid flex-1 grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="model-card col-span-1 backdrop-blur-xl xl:col-span-6">
          <CardHeader className="flex items-center justify-between border-b border-brand/15 pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">
              TOP FEATURE IMPORTANCE
            </CardTitle>
            <span className="rounded border border-brand/20 bg-bg/80 px-3 py-1 text-xs font-mono uppercase tracking-[0.3em] text-text">
              Model: XGBoost-GPU v1.0
            </span>
          </CardHeader>
          <CardContent className="h-80">
            {loading ? <div className="h-full animate-pulse rounded bg-surface/60" /> : <FeatureImportanceChart data={features} />}
          </CardContent>
        </Card>

        <Card className="model-card col-span-1 backdrop-blur-xl xl:col-span-6">
          <CardHeader className="flex items-center justify-between border-b border-brand/15 pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-[0.35em] text-brand">
              AI PATTERN SUMMARIES
            </CardTitle>
            <Button
              onClick={generate}
              disabled={generating || loading}
              className="generate-ai-summary flex items-center gap-2 border border-brand/20 px-3 py-1 text-xs font-mono uppercase tracking-[0.3em]"
            >
              <Sparkles className={`h-4 w-4 ${generating ? "animate-pulse" : ""}`} />
              {generating ? "GENERATING…" : "GENERATE AI SUMMARY"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <AISummaryBox text={summary} loading={generating || loading} />
            <div className="max-h-[320px] space-y-3 overflow-y-auto pr-2">
              {loading && <div className="h-24 animate-pulse rounded bg-surface/60" />}
              {!loading && (
                <AnimatePresence initial={false}>
                  {patterns.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} />
                  ))}
                </AnimatePresence>
              )}
              {!loading && patterns.length === 0 && (
                <div className="flex h-32 items-center justify-center text-xs uppercase tracking-[0.4em] text-muted">
                  Awaiting AI diagnostics…
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

