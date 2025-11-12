/* eslint-disable no-console */
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { apiClient, BACKEND_URL, API_TOKEN, WS_TOKEN } from "@/lib/api"

export type FeatureImportancePoint = {
  name: string
  score: number
  normalized_score: number
}

export type FeatureDistribution = {
  feature: string
  histogram_bins: number[]
  counts: number[]
  sample_percentiles: Record<string, number>
  statistics: Record<string, number>
}

export type SummarySignal = {
  feature: string
  signal: string
  score?: number
}

export type SummaryState = {
  text: string | null
  signals: SummarySignal[]
  createdAt: Date | null
  inFlight: boolean
  percent: number
  rateLimitedUntil: Date | null
}

export type ModelStatus = {
  model_loaded: boolean
  model_name: string | null
  gpu_mode: boolean
  features: string[]
}

export type ShapExplanation = {
  instance_id?: string
  shap_values: Record<string, number>
  base_value?: number
  predicted_score?: number
}

export type ShapResult = {
  id: string
  completed: boolean
  feature_order: string[]
  explanations: ShapExplanation[]
  created_at: string
}

export type ShapJobState = {
  id: string
  percent: number
  status: "queued" | "running" | "completed" | "error"
  result?: ShapResult
  error?: string
}

export type ExplainInstance = {
  instanceId?: string
  ip?: string
  features: Record<string, number | string>
}

type UseModelInsightsOptions = {
  prefetch?: boolean
  autoConnect?: boolean
}

type FeatureDelta = FeatureImportancePoint & { delta?: number }

const DEFAULT_OPTIONS: UseModelInsightsOptions = {
  prefetch: true,
  autoConnect: true,
}

function buildWsUrl(): string {
  try {
    const base = new URL(BACKEND_URL)
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:"
    const cleanPath = base.pathname.replace(/\/$/, "")
    base.pathname = `${cleanPath}/ws/model/insights`
    if (WS_TOKEN?.length) {
      base.searchParams.set("token", WS_TOKEN.startsWith("api::") ? WS_TOKEN : `api::${WS_TOKEN}`)
    } else if (API_TOKEN?.length) {
      const token = API_TOKEN.startsWith("api::") ? API_TOKEN : `api::${API_TOKEN}`
      base.searchParams.set("token", token)
    }
    return base.toString()
  } catch {
    const protocol = BACKEND_URL.startsWith("https") ? "wss" : "ws"
    const clean = BACKEND_URL.replace(/^https?:\/\//i, "").replace(/\/$/, "")
    const token = WS_TOKEN || API_TOKEN || ""
    const query = token ? `?token=${encodeURIComponent(token.startsWith("api::") ? token : `api::${token}`)}` : ""
    return `${protocol}://${clean}/ws/model/insights${query}`
  }
}

function normaliseToken(): string | undefined {
  const raw = API_TOKEN || WS_TOKEN || ""
  if (!raw) return undefined
  return raw.startsWith("api::") ? raw : `api::${raw}`
}

export function useModelInsights(options: UseModelInsightsOptions = DEFAULT_OPTIONS) {
  const { prefetch = true, autoConnect = true } = options

  const [status, setStatus] = useState<ModelStatus | null>(null)
  const [featureImportance, setFeatureImportance] = useState<FeatureImportancePoint[]>([])
  const previousImportanceRef = useRef<FeatureImportancePoint[] | null>(null)
  const [compareMode, setCompareMode] = useState(false)

  const [distributions, setDistributions] = useState<Record<string, FeatureDistribution>>({})
  const [summary, setSummary] = useState<SummaryState>({
    text: null,
    signals: [],
    createdAt: null,
    inFlight: false,
    percent: 0,
    rateLimitedUntil: null,
  })
  const [shapJobs, setShapJobs] = useState<Record<string, ShapJobState>>({})
  const [activeShapJobId, setActiveShapJobId] = useState<string | null>(null)

  const [loading, setLoading] = useState(prefetch)
  const [wsConnected, setWsConnected] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualClose = useRef(false)

  const tokenHeader = useMemo(() => {
    const token = normaliseToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const applyFeatureImportance = useCallback(
    (features: FeatureImportancePoint[]) => {
      setFeatureImportance((prev) => {
        if (!prev || prev.length === 0) {
          previousImportanceRef.current = features
        } else {
          previousImportanceRef.current = prev
        }
        return features
      })
    },
    [setFeatureImportance],
  )

  const fetchStatus = useCallback(async () => {
    const { data } = await apiClient.get<ModelStatus>("/api/model/status", { headers: tokenHeader })
    setStatus(data)
    return data
  }, [tokenHeader])

  const fetchFeatureImportance = useCallback(async () => {
    const { data } = await apiClient.get<{ features: FeatureImportancePoint[] }>("/api/model/feature-importance", {
      headers: tokenHeader,
    })
    applyFeatureImportance(data.features)
    return data.features
  }, [applyFeatureImportance, tokenHeader])

  const loadInitial = useCallback(async () => {
    if (!prefetch) return
    setLoading(true)
    try {
      await Promise.all([fetchStatus(), fetchFeatureImportance()])
    } catch (error) {
      console.error("Model insights initial load failed", error)
    } finally {
      setLoading(false)
    }
  }, [fetchStatus, fetchFeatureImportance, prefetch])

  const fetchDistribution = useCallback(
    async (feature: string, samples = 500) => {
      try {
        const { data } = await apiClient.get<FeatureDistribution>("/api/model/feature-distribution", {
          params: { feature, samples },
          headers: tokenHeader,
        })
        setDistributions((prev) => ({ ...prev, [feature]: data }))
        return data
      } catch (error) {
        console.error("Failed to fetch distribution", error)
        throw error
      }
    },
    [tokenHeader],
  )

  const updateSummaryState = useCallback(
    (partial: Partial<SummaryState>) =>
      setSummary((prev) => ({
        ...prev,
        ...partial,
      })),
    [],
  )

  const generateSummary = useCallback(
    async (lookbackSeconds = 3600, topK = 6) => {
      if (summary.rateLimitedUntil && summary.rateLimitedUntil.getTime() > Date.now()) {
        return null
      }
      updateSummaryState({ inFlight: true, percent: 5 })
      try {
        const { data } = await apiClient.post<{ id: string }>(
          "/api/model/summary",
          { lookback_seconds: lookbackSeconds, top_k_features: topK },
          { headers: tokenHeader },
        )
        return data.id
      } catch (error: any) {
        if (error?.response?.status === 429) {
          const retryAfter = Number(error.response.headers["retry-after"] ?? 10)
          updateSummaryState({
            inFlight: false,
            rateLimitedUntil: new Date(Date.now() + retryAfter * 1000),
          })
        } else {
          updateSummaryState({ inFlight: false })
        }
        console.error("Failed to generate summary", error)
        return null
      }
    },
    [summary.rateLimitedUntil, tokenHeader, updateSummaryState],
  )

  const requestShapExplain = useCallback(
    async (instances: ExplainInstance[]) => {
      try {
        const payload = {
          instances: instances.map((item) => ({
            instance_id: item.instanceId,
            ip: item.ip,
            features: item.features,
          })),
        }
        const { data } = await apiClient.post<{ id: string }>("/api/model/shap/explain", payload, { headers: tokenHeader })
        const jobId = data.id
        setShapJobs((prev) => ({
          ...prev,
          [jobId]: {
            id: jobId,
            percent: 0,
            status: "queued",
          },
        }))
        setActiveShapJobId(jobId)
        return jobId
      } catch (error: any) {
        if (error?.response?.status === 429) {
          setShapJobs((prev) => ({
            ...prev,
            rateLimited: {
              id: "rate-limit",
              percent: 0,
              status: "error",
              error: "Rate limit exceeded",
            },
          }))
        }
        console.error("SHAP explain request failed", error)
        return null
      }
    },
    [tokenHeader],
  )

  const fetchShapResult = useCallback(
    async (jobId: string) => {
      try {
        const { data } = await apiClient.get<ShapResult>(`/api/model/shap/result/${jobId}`, { headers: tokenHeader })
        setShapJobs((prev) => ({
          ...prev,
          [jobId]: {
            id: jobId,
            percent: 100,
            status: data.completed ? "completed" : prev[jobId]?.status ?? "running",
            result: data,
          },
        }))
        return data
      } catch (error) {
        console.error("Failed to fetch SHAP result", error)
        return null
      }
    },
    [tokenHeader],
  )

  const closeSocket = useCallback(() => {
    manualClose.current = true
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (!autoConnect) return
    if (manualClose.current) return
    if (reconnectTimer.current) return
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null
      connectSocket()
    }, 3000)
  }, [autoConnect])

  const handleWsMessage = useCallback(
    (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data)
        switch (payload.type) {
          case "model_status":
            setStatus(payload.payload)
            break
          case "feature_importance_update":
            applyFeatureImportance(payload.payload)
            break
          case "summary_progress":
            updateSummaryState({ percent: payload.percent ?? 30, inFlight: true })
            break
          case "summary_done":
            updateSummaryState({
              inFlight: false,
              percent: 100,
              text: payload.summary_text ?? null,
              signals: payload.signals ?? [],
              createdAt: new Date(),
              rateLimitedUntil: null,
            })
            break
          case "summary_error":
            updateSummaryState({ inFlight: false, percent: 0 })
            break
          case "shap_progress":
            setShapJobs((prev) => ({
              ...prev,
              [payload.job_id]: {
                id: payload.job_id,
                percent: payload.percent ?? 10,
                status: "running",
                result: prev[payload.job_id]?.result,
              },
            }))
            break
          case "shap_done":
            setShapJobs((prev) => ({
              ...prev,
              [payload.job_id]: {
                id: payload.job_id,
                percent: 100,
                status: "completed",
                result: payload.result,
              },
            }))
            break
          case "shap_error":
            setShapJobs((prev) => ({
              ...prev,
              [payload.job_id]: {
                id: payload.job_id,
                percent: 100,
                status: "error",
                error: payload.message,
              },
            }))
            break
          default:
            break
        }
      } catch (error) {
        console.error("Failed to parse websocket payload", error)
      }
    },
    [applyFeatureImportance, updateSummaryState],
  )

  const connectSocket = useCallback(() => {
    if (!autoConnect) return
    if (typeof window === "undefined") return
    if (socketRef.current) return

    try {
      const url = buildWsUrl()
      const socket = new WebSocket(url)
      socketRef.current = socket
      manualClose.current = false
      socket.onopen = () => {
        setWsConnected(true)
      }
      socket.onmessage = handleWsMessage
      socket.onerror = (event) => {
        console.error("Model insights websocket error", event)
      }
      socket.onclose = () => {
        setWsConnected(false)
        socketRef.current = null
        scheduleReconnect()
      }
    } catch (error) {
      console.error("Failed to open websocket", error)
      scheduleReconnect()
    }
  }, [autoConnect, handleWsMessage, scheduleReconnect])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  useEffect(() => {
    if (!autoConnect) return
    connectSocket()
    return () => {
      manualClose.current = true
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
    }
  }, [autoConnect, connectSocket])

  const featureImportanceWithDelta = useMemo<FeatureDelta[]>(() => {
    if (!compareMode) return featureImportance
    const previous = previousImportanceRef.current
    if (!previous) return featureImportance
    const previousMap = new Map(previous.map((item) => [item.name, item]))
    return featureImportance.map((item) => {
      const baseline = previousMap.get(item.name)
      const delta = baseline ? item.normalized_score - baseline.normalized_score : 0
      return { ...item, delta }
    })
  }, [compareMode, featureImportance])

  const activeShapJob = activeShapJobId ? shapJobs[activeShapJobId] ?? null : null

  return {
    status,
    featureImportance: featureImportanceWithDelta,
    rawFeatureImportance: featureImportance,
    distributions,
    summary,
    loading,
    wsConnected,
    compareMode,
    setCompareMode,
    setFeatureImportance: applyFeatureImportance,
    fetchStatus,
    fetchFeatureImportance,
    fetchDistribution,
    generateSummary,
    requestShapExplain,
    fetchShapResult,
    shapJobs,
    activeShapJob,
    setActiveShapJobId,
    closeSocket,
  }
}

export type UseModelInsightsReturn = ReturnType<typeof useModelInsights>


