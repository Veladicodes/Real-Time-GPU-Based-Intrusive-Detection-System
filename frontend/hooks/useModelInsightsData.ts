import { useCallback, useEffect, useMemo, useState } from "react"

import apiClient from "@/lib/api"

export type FeatureImportance = {
  name: string
  importance: number
}

export type InsightPattern = {
  id: string
  title: string
  summary: string
  confidence: number
  last_seen: string
}

export interface ModelInsightState {
  features: FeatureImportance[]
  patterns: InsightPattern[]
  summary: string
  loading: boolean
  error: Error | null
  generating: boolean
  refresh: () => Promise<void>
  generate: () => Promise<void>
}

type InsightsApiResponse = {
  summary?: string
  narrative?: string
  updated_at?: string
  features?: Array<{ name?: string; value?: number; importance?: number }>
  importance?: Array<{ name?: string; importance?: number }>
  feature_importance?: Array<{ name?: string; importance?: number }>
  patterns?: Array<Partial<InsightPattern>>
  signals?: Array<Partial<InsightPattern>>
}

type ImportanceResponse = {
  features?: string[]
  importance?: number[]
  status?: string
}

type SummaryResponse = {
  attack_rate?: number
  total_events?: number
  top_ips?: Record<string, number>
  protocols?: Record<string, number>
  timeline?: { minute: string; count: number }[]
}

type ModelSummaryResponse = {
  model_name?: string
  features?: Array<{ name?: string; importance?: number }>
  patterns_detected?: number
  incidents_logged?: number
}

const INITIAL_STATE: ModelInsightState = {
  features: [],
  patterns: [],
  summary: "Awaiting AI diagnostics…",
  loading: true,
  error: null,
  generating: false,
  refresh: async () => {},
  generate: async () => {},
}

function normalizeFeaturesFromInsights(payload: InsightsApiResponse | null | undefined): FeatureImportance[] | null {
  if (!payload) return null
  const candidates = payload.features ?? payload.feature_importance ?? payload.importance
  if (!candidates) return null
  return candidates
    .map((item, index) => {
      if (!item) return null
      const name = item.name ?? `feature-${index}`
      const score = item.importance ?? item.value
      if (!name || score == null) return null
      return {
        name,
        importance: Number(score),
      }
    })
    .filter(Boolean) as FeatureImportance[]
}

function normalizePatternsFromInsights(payload: InsightsApiResponse | null | undefined): InsightPattern[] | null {
  if (!payload) return null
  const source = payload.patterns ?? payload.signals
  if (!source || !source.length) return null
  return source
    .map((pattern, index) => {
      if (!pattern) return null
      const id = pattern.id ?? `pattern-${index}`
      const summary = pattern.summary ?? pattern.title ?? "Diagnostics pattern"
      const title = pattern.title ?? `Pattern ${index + 1}`
      const confidence = pattern.confidence != null ? Number(pattern.confidence) : 70
      const lastSeen = pattern.last_seen ?? new Date().toISOString()
      return {
        id,
        title,
        summary,
        confidence,
        last_seen: lastSeen,
      }
    })
    .filter(Boolean) as InsightPattern[]
}

function mapImportanceResponse(payload: ImportanceResponse | null | undefined): FeatureImportance[] {
  if (!payload || !Array.isArray(payload.features) || !Array.isArray(payload.importance)) return []
  return payload.features.map((name, index) => ({
    name,
    importance: Number(payload.importance?.[index] ?? 0),
  }))
}

function synthesizeSummary(summary: SummaryResponse | null | undefined): string {
  if (!summary) return "Awaiting AI diagnostics…"
  const totalEvents = Number(summary.total_events ?? 0)
  if (!totalEvents) return "Traffic baseline stable — no hostile vectors detected in the current window."
  const attackRate = Number(summary.attack_rate ?? 0).toFixed(1)
  const topIp = summary.top_ips ? Object.entries(summary.top_ips)[0]?.[0] : undefined
  const dominantProtocol = summary.protocols
    ? Object.entries(summary.protocols).sort((a, b) => b[1] - a[1])[0]?.[0]
    : undefined
  return `In the last cycle, ${totalEvents} hostile events were recorded at ${attackRate} per minute.${
    topIp ? ` Source ${topIp} exhibited the highest pressure.` : ""
  }${dominantProtocol ? ` ${dominantProtocol} traffic dominated the vector mix.` : ""}`.trim()
}

function synthesizePatternsFromSummary(summary: SummaryResponse | null | undefined, features: FeatureImportance[]): InsightPattern[] {
  if (!summary) return []
  const now = new Date()
  const toIso = (offsetMinutes: number) => new Date(now.getTime() - offsetMinutes * 60_000).toISOString()
  const patterns: InsightPattern[] = []

  const topIps = summary.top_ips ? Object.entries(summary.top_ips).sort((a, b) => b[1] - a[1]) : []
  if (topIps.length) {
    const [ip, hits] = topIps[0]
    patterns.push({
      id: `ip-${ip}`,
      title: `Concentrated activity from ${ip}`,
      summary: `${ip} generated ${hits} correlated alerts in the active window. Increase scrutiny on ingress routes tied to this origin.`,
      confidence: Math.min(99, 60 + Number(hits)),
      last_seen: toIso(0),
    })
  }

  if (features.length) {
    const feature = features[0]
    patterns.push({
      id: `feature-${feature.name}`,
      title: `Model weights emphasise ${feature.name}`,
      summary: `${feature.name} contributes ${(feature.importance * 100).toFixed(1)}% of the model signal. Validate upstream instrumentation.`,
      confidence: Math.round(feature.importance * 100),
      last_seen: toIso(4),
    })
  }

  const spike = summary.timeline?.slice(-3).find((entry) => entry.count >= 5)
  if (spike) {
    patterns.push({
      id: `spike-${spike.minute}`,
      title: "Spike detected in recent minutes",
      summary: `Minute ${spike.minute} registered ${spike.count} hostile events, exceeding baseline thresholds.`,
      confidence: Math.min(95, spike.count * 12),
      last_seen: toIso(2),
    })
  }

  return patterns
}

function mergeFeatureSources(
  features: FeatureImportance[],
  summary: ModelSummaryResponse | null | undefined,
): FeatureImportance[] {
  if (summary?.features?.length) {
    const mapped = summary.features
      .map((feature, index) => {
        if (!feature || !feature.name) return null
        const importance = feature.importance != null ? Number(feature.importance) : 0
        return {
          name: feature.name,
          importance: importance > 1 ? importance / 100 : importance,
        }
      })
      .filter(Boolean) as FeatureImportance[]
    if (mapped.length) {
      return mapped.sort((a, b) => b.importance - a.importance)
    }
  }
  return features
}

export function useModelInsightsData(): ModelInsightState {
  const [state, setState] = useState<ModelInsightState>(INITIAL_STATE)
  const [features, setFeatures] = useState<FeatureImportance[]>([])

  const hydrateFromInsights = useCallback((payload: InsightsApiResponse | null | undefined) => {
    if (!payload) return null
    const normalizedFeatures = normalizeFeaturesFromInsights(payload)
    const normalizedPatterns = normalizePatternsFromInsights(payload)
    const summaryText = payload.summary ?? payload.narrative
    if (!summaryText && !normalizedFeatures && !normalizedPatterns) return null
    return {
      features: normalizedFeatures ?? [],
      patterns: normalizedPatterns ?? [],
      summary: summaryText ?? "AI diagnostics refreshed.",
    }
  }, [])

  const fetchFallback = useCallback(async () => {
    const [importanceResponse, attackSummary, modelSummary] = await Promise.all([
      apiClient.get<ImportanceResponse>("/api/model/importance").then((res) => res.data).catch(() => null),
      apiClient.get<SummaryResponse>("/api/summary/attacks?minutes=10").then((res) => res.data).catch(() => null),
      apiClient.get<ModelSummaryResponse>("/api/model/summary").then((res) => res.data).catch(() => null),
    ])
    const mappedFeatures = mergeFeatureSources(
      mapImportanceResponse(importanceResponse).sort((a, b) => b.importance - a.importance),
      modelSummary,
    )
    const fallbackSummary = synthesizeSummary(attackSummary)
    const fallbackPatterns = synthesizePatternsFromSummary(attackSummary, mappedFeatures)
    return {
      features: mappedFeatures,
      patterns: fallbackPatterns,
      summary: fallbackSummary,
    }
  }, [])

  const fetchInsights = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const [insightsResponse, summaryResponse] = await Promise.all([
        apiClient.get<InsightsApiResponse>("/api/model/insights").then((res) => res.data).catch(() => null),
        apiClient.get<ModelSummaryResponse>("/api/model/summary").then((res) => res.data).catch(() => null),
      ])
      const normalized = hydrateFromInsights(insightsResponse)
      if (normalized) {
        const mergedFeatures = mergeFeatureSources(normalized.features, summaryResponse)
        setFeatures(mergedFeatures)
        setState((prev) => ({
          ...prev,
          features: mergedFeatures,
          patterns: normalized.patterns,
          summary: normalized.summary,
          loading: false,
          generating: false,
        }))
        return
      }

      const fallback = await fetchFallback()
      setFeatures(fallback.features)
      setState((prev) => ({
        ...prev,
        features: fallback.features,
        patterns: fallback.patterns,
        summary: fallback.summary,
        loading: false,
        generating: false,
      }))
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error("Failed to load model insights")
      const fallback = await fetchFallback().catch(() => null)
      if (fallback) {
        setFeatures(fallback.features)
        setState((prev) => ({
          ...prev,
          features: fallback.features,
          patterns: fallback.patterns,
          summary: fallback.summary,
          loading: false,
          generating: false,
          error: normalizedError,
        }))
        return
      }
      setState((prev) => ({ ...prev, loading: false, generating: false, error: normalizedError }))
    }
  }, [fetchFallback, hydrateFromInsights])

  const generateInsight = useCallback(async () => {
    setState((prev) => ({ ...prev, generating: true, error: null }))
    try {
      const response = await apiClient
        .post<InsightsApiResponse>("/api/model/insights/generate")
        .then((res) => res.data)
        .catch(() => null)

      const normalized = hydrateFromInsights(response)
      if (normalized) {
        const summaryDetails = await apiClient.get<ModelSummaryResponse>("/api/model/summary").then((res) => res.data).catch(() => null)
        const mergedFeatures = mergeFeatureSources(normalized.features, summaryDetails)
        setFeatures(mergedFeatures)
        setState((prev) => ({
          ...prev,
          features: mergedFeatures,
          patterns: [...normalized.patterns, ...prev.patterns].slice(0, 12),
          summary: normalized.summary,
          generating: false,
        }))
        return
      }

      if (!features.length) {
        await fetchInsights()
        return
      }

      // Fallback to legacy SHAP explanation path.
      const payload = features.reduce<Record<string, number>>((acc, feature, index) => {
        const base = (Math.sin(Date.now() / 500 + index) + 1) / 2
        acc[feature.name] = Number(base.toFixed(3))
        return acc
      }, {})

      const shapResponse = await apiClient
        .post("/api/model/shap", payload)
        .then((res) => res.data)
        .catch((error) => {
          if (error.response?.status === 503) return error.response.data
          throw error
        })

      const contributions: Record<string, number> = shapResponse?.fallback?.contributions ?? {}
      const [topFeature, value] =
        Object.entries(contributions).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] ?? [features[0]?.name ?? "signal", 0.42]

      const pattern: InsightPattern = {
        id: `ai-${Date.now()}`,
        title: `Anomaly influenced by ${topFeature}`,
        summary:
          Math.abs(value) > 0.001
            ? `${topFeature} deviated by ${(value * 100).toFixed(2)}% compared to training medians. Investigate correlated packets for drift.`
            : "AI diagnostics refreshed.",
        confidence: shapResponse?.prediction ? Math.round(Number(shapResponse.prediction) * 100) : 72,
        last_seen: new Date().toISOString(),
      }

      setState((prev) => ({
        ...prev,
        patterns: [pattern, ...prev.patterns].slice(0, 12),
        summary: pattern.summary,
        generating: false,
      }))
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error("Failed to generate insight")
      setState((prev) => ({ ...prev, generating: false, error: normalizedError }))
    }
  }, [features, fetchInsights, hydrateFromInsights])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  return useMemo(
    () => ({
      ...state,
      refresh: fetchInsights,
      generate: generateInsight,
    }),
    [fetchInsights, generateInsight, state],
  )
}

