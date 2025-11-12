"use client"

import { useEffect, useMemo, useState } from "react"

import { motion } from "framer-motion"
import { Activity, RefreshCw, ToggleLeft, ToggleRight } from "lucide-react"

import ThreatTable from "@/components/ThreatTable"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import AISummaryPanel from "@/src/components/AISummaryPanel"
import FeatureDistribution from "@/src/components/FeatureDistribution"
import FeatureImportanceChart from "@/src/components/FeatureImportanceChart"
import ModelStatusCard from "@/src/components/ModelStatusCard"
import SHAPResultsModal from "@/src/components/SHAPResultsModal"
import { useModelInsights } from "@/src/hooks/useModelInsights"
import { useThreatTelemetry } from "@/hooks/useThreatTelemetry"

function buildFeatureVector(featureNames: string[], event: ReturnType<typeof useThreatTelemetry>["events"][number]) {
  const vector: Record<string, number | string> = {}
  featureNames.forEach((feature) => {
    const lower = feature.toLowerCase()
    if (lower.includes("confidence")) {
      vector[feature] = Number((event.confidence ?? 0).toFixed(4))
    } else if (lower.includes("vector") || lower.includes("angle")) {
      vector[feature] = event.vector ?? 0
    } else if (lower.includes("ip")) {
      vector[feature] = event.ip
    } else if (lower.includes("geo")) {
      vector[feature] = event.geo ?? "unknown"
    } else if (lower.includes("timestamp") || lower.includes("time")) {
      vector[feature] = new Date(event.timestamp).getTime()
    } else if (lower.includes("threat") || lower.includes("type")) {
      vector[feature] = event.threat_type
    } else if (lower.includes("activity")) {
      vector[feature] = event.activity?.[event.activity.length - 1] ?? 0
    } else if (lower.includes("confidence_scaled")) {
      vector[feature] = Math.round((event.confidence ?? 0) * 1000)
    } else {
      vector[feature] = 0
    }
  })
  return vector
}

export default function ModelInsightsPage() {
  const {
    status,
    featureImportance,
    fetchDistribution,
    fetchFeatureImportance,
    fetchStatus,
    distributions,
    summary,
    generateSummary,
    requestShapExplain,
    activeShapJob,
    setActiveShapJobId,
    wsConnected,
    compareMode,
    setCompareMode,
    loading,
  } = useModelInsights()
  const { events } = useThreatTelemetry()

  const [selectedFeature, setSelectedFeature] = useState<string | null>(null)
  const [distributionLoading, setDistributionLoading] = useState(false)
  const [shapModalOpen, setShapModalOpen] = useState(false)
  const [explainingEventId, setExplainingEventId] = useState<string | null>(null)

  const selectedDistribution = selectedFeature ? distributions[selectedFeature] ?? null : null

  const handleSelectFeature = async (feature: { name: string }) => {
    setSelectedFeature(feature.name)
    if (!distributions[feature.name]) {
      setDistributionLoading(true)
      try {
        await fetchDistribution(feature.name)
      } finally {
        setDistributionLoading(false)
      }
    }
  }

  const featureExportHandler = (csv: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "feature_importance.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleGenerateSummary = async () => {
    await generateSummary()
  }

  const handleExplain = async (event: (typeof events)[number]) => {
    if (!status?.features?.length) return
    const vector = buildFeatureVector(status.features, event)
    setExplainingEventId(event.id)
    const jobId = await requestShapExplain([{ instanceId: event.id, ip: event.ip, features: vector }])
    if (jobId) {
      setActiveShapJobId(jobId)
      setShapModalOpen(true)
    }
  }

  useEffect(() => {
    if (activeShapJob?.status === "completed" || activeShapJob?.status === "error") {
      setExplainingEventId(null)
    }
  }, [activeShapJob?.status])

  const featureHeader = useMemo(() => {
    if (!status?.model_name) return "Feature Importance"
    return `Feature Importance · ${status.model_name}`
  }, [status?.model_name])

  return (
    <div className="relative flex min-h-screen flex-col gap-6 overflow-hidden bg-bg p-6 text-text">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(var(--brand-orange-rgb),0.2)_60%,transparent_90%)] opacity-40"
      />

      <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display tracking-[0.4em] text-brand">MODEL INSIGHTS</h1>
            <p className="text-sm text-muted">Global transparency for the RT-GIDS inference stack — SHAP, summaries, and live health.</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-[0.3em] text-muted">
            <span className={wsConnected ? "text-brand" : "text-accent-red"}>
              <Activity className="mr-1 inline-block h-3.5 w-3.5" />
              {wsConnected ? "Insights Live" : "Stream Offline"}
            </span>
            <Button
              size="xs"
              variant="ghost"
              className="flex items-center gap-2 rounded border border-brand/20 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.25em]"
              onClick={() => setCompareMode((prev) => !prev)}
            >
              {compareMode ? <ToggleRight className="h-4 w-4 text-brand" /> : <ToggleLeft className="h-4 w-4" />}
              Compare Windows
            </Button>
          </div>
        </div>
      </motion.header>

      <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <ModelStatusCard status={status} onRefresh={() => { void fetchStatus() }} wsConnected={wsConnected} />
          <AISummaryPanel summary={summary} onGenerate={handleGenerateSummary} disabled={loading} />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Card className="model-card backdrop-blur-xl">
            <CardContent className="flex flex-col gap-4 p-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted">{featureHeader}</span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted">
                    {status?.features.length ?? 0} features tracked
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  className="flex items-center gap-2 rounded border border-brand/20 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.25em]"
                  onClick={() => {
                    void fetchFeatureImportance()
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
              {loading ? (
                <div className="h-72 animate-pulse rounded bg-black/40" />
              ) : (
                <FeatureImportanceChart
                  data={featureImportance}
                  onSelect={handleSelectFeature}
                  onExportCsv={featureExportHandler}
                  highlight={selectedFeature}
                  compareMode={compareMode}
                />
              )}
            </CardContent>
          </Card>

          <Card className="model-card backdrop-blur-xl">
            <CardContent className="p-6">
              <FeatureDistribution
                feature={selectedFeature}
                distribution={selectedDistribution}
                loading={distributionLoading}
                onRefresh={
                  selectedFeature
                    ? () => {
                        setDistributionLoading(true)
                        fetchDistribution(selectedFeature)
                          .catch(() => null)
                          .finally(() => setDistributionLoading(false))
                      }
                    : undefined
                }
              />
            </CardContent>
          </Card>

          <Card className="model-card backdrop-blur-xl">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted">Recent Threat Events</span>
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted">Explainable AI on demand</p>
                </div>
              </div>
              <ThreatTable events={events} onExplain={handleExplain} explainingId={explainingEventId} />
            </CardContent>
          </Card>
        </div>
      </div>

      <SHAPResultsModal open={shapModalOpen} job={activeShapJob ?? null} onClose={() => setShapModalOpen(false)} />
    </div>
  )
}
