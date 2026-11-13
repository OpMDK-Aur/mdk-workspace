import type { CopilotChatMessage, ExecutionPlan, Recommendation } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la acción.')
  return data as T
}

export const copilotApi = {
  list: (clientId: string) => request<{ recommendations: Recommendation[] }>(`/api/conexa/copilot/recommendations?clientId=${encodeURIComponent(clientId)}`),
  messages: (clientId: string) => request<{ messages: CopilotChatMessage[] }>(`/api/conexa/copilot/messages?clientId=${encodeURIComponent(clientId)}`),
  send: (body: { clientId: string; message: string; editingRecommendationId?: string }) => request<{ message: CopilotChatMessage; recommendations: Recommendation[]; editedRecommendation?: Recommendation; needsClarification: boolean; contextSaved: number }>('/api/conexa/copilot/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  addContext: (body: { clientId: string; content: string }) => request('/api/conexa/copilot/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  edit: (clientId: string, id: string, patch: unknown) => request<{ recommendation: Recommendation }>(`/api/conexa/copilot/recommendations/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(patch as Record<string, unknown>), clientId }) }),
  prepare: (clientId: string, id: string) => request<{ recommendation: Recommendation }>(`/api/conexa/copilot/recommendations/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, action: 'prepare' }) }),
  previewPublish: (clientId: string, id: string) => request<{ recommendation: Recommendation; plan: ExecutionPlan }>(`/api/conexa/copilot/recommendations/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, action: 'publish' }) }),
  publish: (clientId: string, id: string, confirmedPlanHash: string) => request<{ recommendation: Recommendation }>(`/api/conexa/copilot/recommendations/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, action: 'publish', confirmedPlanHash }) }),
  markDone: (clientId: string, id: string) => request<{ recommendation: Recommendation }>(`/api/conexa/copilot/recommendations/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, action: 'manual_done' }) }),
  scan: (clientId: string) => request<{ recommendations: Recommendation[]; reply: string; questions: string[]; skippedDuplicates: number }>('/api/conexa/copilot/recommendations/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId }) }),
  discard: (clientId: string, id: string, reason?: string) => request<{ recommendation: Recommendation }>(`/api/conexa/copilot/recommendations/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, action: 'discard', reason }) }),
  restore: (clientId: string, id: string) => request<{ recommendation: Recommendation }>(`/api/conexa/copilot/recommendations/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, action: 'restore' }) }),
}
