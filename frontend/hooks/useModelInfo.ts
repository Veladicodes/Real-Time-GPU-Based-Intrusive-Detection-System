import { useMemo } from "react"

import { useApi } from "@/hooks/useApi"

export interface ModelInfoResponse {
  model_name: string
  accuracy?: number
  precision?: number
  recall?: number
  f1_score?: number
  gpu_mode?: boolean
  features_used?: number | number[]
  last_trained?: string
}

interface BackendModelInfo {
  model_path?: string
  features?: string[]
  gpu_mode?: boolean
  [key: string]: unknown
}

const DEFAULT_INFO: ModelInfoResponse = {
  model_name: "Model unavailable",
  gpu_mode: false,
  features_used: 0,
}

function parseModelName(path?: string, fallback = "Active model"): string {
  if (!path) return fallback
  const parts = path.split(/[/\\]/)
  const last = parts.pop()
  return last && last.length ? last : fallback
}

function transformModelInfo(payload: BackendModelInfo | null | undefined): ModelInfoResponse {
  if (!payload) return DEFAULT_INFO
  const features = Array.isArray(payload.features) ? payload.features : []
  const featureCount =
    typeof payload.features_used === "number"
      ? payload.features_used
      : Array.isArray(payload.features_used)
        ? payload.features_used.length
        : features.length

  return {
    model_name: typeof payload.model_name === "string" ? payload.model_name : parseModelName(payload.model_path),
    gpu_mode: Boolean(payload.gpu_mode),
    features_used: featureCount,
    accuracy: typeof payload.accuracy === "number" ? payload.accuracy : undefined,
    precision: typeof payload.precision === "number" ? payload.precision : undefined,
    recall: typeof payload.recall === "number" ? payload.recall : undefined,
    f1_score: typeof payload.f1_score === "number" ? payload.f1_score : undefined,
    last_trained: typeof payload.last_trained === "string" ? payload.last_trained : undefined,
  }
}

export function useModelInfo(pollIntervalMs = 20_000) {
  const primary = useApi<BackendModelInfo>("/api/model-info", {
    pollInterval: pollIntervalMs,
    initialData: null,
  })

  const fallback = useApi<BackendModelInfo>("/api/model/info", {
    pollInterval: pollIntervalMs * 2,
    enabled: Boolean(primary.error),
    initialData: null,
  })

  const modelInfo = useMemo(() => {
    if (primary.data) return transformModelInfo(primary.data)
    if (fallback.data) return transformModelInfo(fallback.data)
    return transformModelInfo(null)
  }, [fallback.data, primary.data])

  return {
    data: modelInfo,
    loading: primary.loading && modelInfo === DEFAULT_INFO,
    error: primary.error ?? fallback.error,
    lastUpdated: primary.lastUpdated ?? fallback.lastUpdated,
    refresh: async () => {
      await Promise.all([primary.refresh(), fallback.refresh()])
    },
  }
}
