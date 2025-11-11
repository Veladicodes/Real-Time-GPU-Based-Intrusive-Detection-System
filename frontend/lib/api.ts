import axios, { type AxiosRequestConfig } from "axios"

const rawBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/$/, "")
export const BACKEND_URL = rawBackendUrl && rawBackendUrl.length > 0 ? rawBackendUrl : "http://localhost:8000"

function deriveDefaultWebSocketUrl(): string {
  try {
    const base = new URL(BACKEND_URL)
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:"
    const path = base.pathname.replace(/\/$/, "")
    base.pathname = `${path}/api/logs/ws`
    base.search = ""
    base.hash = ""
    return base.toString()
  } catch {
    const protocol = BACKEND_URL.startsWith("https") ? "wss" : "ws"
    const clean = BACKEND_URL.replace(/^https?:\/\//i, "").replace(/\/$/, "")
    return `${protocol}://${clean}/api/logs/ws`
  }
}

export const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? deriveDefaultWebSocketUrl()).trim()

const rawApiToken = process.env.NEXT_PUBLIC_API_TOKEN?.trim() ?? ""
const rawWsToken = process.env.NEXT_PUBLIC_WS_TOKEN?.trim() ?? ""

const normalizedApiToken =
  rawApiToken.length > 0 ? (rawApiToken.startsWith("api::") ? rawApiToken : `api::${rawApiToken}`) : ""
const normalizedWsToken = rawWsToken.length > 0 ? rawWsToken : normalizedApiToken

export const apiClient = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 12_000,
})

if (normalizedApiToken) {
  apiClient.interceptors.request.use((config) => {
    const headers = config.headers ?? {}
    if (!headers.Authorization) {
      headers.Authorization = `Bearer ${normalizedApiToken}`
    }
    config.headers = headers
    return config
  })
}

export function buildWebSocketUrl(): string {
  const base = WS_URL
  const token = normalizedWsToken
  if (!token) return base
  try {
    const url = new URL(base)
    url.searchParams.set("token", token.startsWith("api::") ? token : `api::${token}`)
    return url.toString()
  } catch {
    const separator = base.includes("?") ? "&" : "?"
    const encoded = token.startsWith("api::") ? token : `api::${token}`
    return `${base}${separator}token=${encodeURIComponent(encoded)}`
  }
}

export type ThreatIndexResponse = {
  threat_index?: number
  status?: string
  count?: number
  [key: string]: unknown
}

export async function fetchThreatIndex(config?: AxiosRequestConfig) {
  const { data } = await apiClient.get<ThreatIndexResponse>("/api/metrics/threat", config)
  return data
}

export async function fetchHealth(config?: AxiosRequestConfig) {
  const { data } = await apiClient.get("/api/health", config)
  return data
}

type LogPayload = {
  severity: string
  message: string
  src_ip?: string
  dst_ip?: string
  proto?: string
}

export async function sendTestAlert(payload?: Partial<LogPayload>) {
  const body: LogPayload = {
    severity: "ALERT",
    message: "Test breach event",
    src_ip: "10.0.0.99",
    dst_ip: "192.168.0.5",
    proto: "TCP",
    ...payload,
  }
  await apiClient.post("/api/logs/ingest", body)
}

export { normalizedApiToken as API_TOKEN, normalizedWsToken as WS_TOKEN }
export default apiClient

export const api = apiClient

