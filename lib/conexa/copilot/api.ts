import type { ClientProfile, ContextAssessment, ProfileUpdate } from './client-profile'
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
  profile: (clientId: string) => request<{ profile: ClientProfile | null; assessment: ContextAssessment }>(`/api/conexa/copilot/profile?clientId=${encodeURIComponent(clientId)}`),
  saveProfile: (clientId: string, updates: ProfileUpdate[]) => request<{ profile: ClientProfile | null; assessment: ContextAssessment }>('/api/conexa/copilot/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, updates }) }),
  competitors: (body: { clientId: string } & ({ action: 'suggest'; onlyIfEmpty?: boolean } | { action: 'add'; name: string; detail?: string } | { action: 'remove'; noteId: string } | { action: 'set'; names: string[] })) => request<{ profile: ClientProfile | null; assessment: ContextAssessment; suggested: number }>('/api/conexa/copilot/competitors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  resetChat: (clientId: string) => request<{ deleted: number }>(`/api/conexa/copilot/messages?clientId=${encodeURIComponent(clientId)}`, { method: 'DELETE' }),
  send: (body: { clientId: string; message: string; editingRecommendationId?: string }) => request<{ message: CopilotChatMessage; recommendations: Recommendation[]; editedRecommendation?: Recommendation; needsClarification: boolean; contextSaved: number; profileProposal: ProfileUpdate[] }>('/api/conexa/copilot/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
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
