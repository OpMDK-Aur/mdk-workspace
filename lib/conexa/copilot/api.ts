import type { Decision, Learning, Recommendation } from './types'

const BASE = '/api/conexa/copilot'

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la acción')
  return data as T
}

export const copilotFetcher = <T,>(url: string) => request<T>(url)

export const copilotUrls = {
  recommendations: (clientId: string) => `${BASE}/recommendations?clientId=${encodeURIComponent(clientId)}`,
  learnings: (clientId: string) => `${BASE}/learnings?clientId=${encodeURIComponent(clientId)}`,
  dashboard: (clientId: string, query: Record<string, string>) => `${BASE}/dashboard?${new URLSearchParams({ clientId, ...query })}`,
}

type RecResult = { recommendation: Recommendation }

export const copilotApi = {
  edit: (id: string, after: string) => request<RecResult>(`${BASE}/recommendations/${id}/edit`, { after }),
  reformulate: (id: string, instruction: string) => request<RecResult>(`${BASE}/recommendations/${id}/reformulate`, { instruction }),
  approve: (id: string, mode: 'now' | 'schedule', slot?: string) => request<RecResult & { decision: Decision }>(`${BASE}/recommendations/${id}/approve`, { mode, slot }),
  reject: (id: string, reason: string) => request<RecResult & { learning: Learning }>(`${BASE}/recommendations/${id}/reject`, { reason }),
  runNow: (id: string) => request<RecResult>(`${BASE}/scheduled/${id}/run-now`, {}),
  cancel: (id: string) => request<RecResult>(`${BASE}/scheduled/${id}/cancel`, {}),
  revert: (id: string) => request<{ decision: Decision }>(`${BASE}/decisions/${id}/revert`, {}),
}
