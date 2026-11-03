'use client'

import type { ExecuteAdRequest, ExecuteAdResult, InterpretResponse, PlanContext, PlanOverrides, SheetInterpretation } from './types'

export class BulkPlanError extends Error {
  constructor(message: string, readonly needsGoogle = false) {
    super(message)
  }
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new BulkPlanError(data.error ?? 'No se pudo completar la operación.', data.code === 'google_not_connected')
  return data as T
}

export const interpretSheetRequest = (body: { clientId: string; url: string; clientContext?: string }) =>
  request<InterpretResponse>('/api/conexa/bulk/interpret', { method: 'POST', body: JSON.stringify(body) })

export const buildPlanRequest = (body: { clientId: string; url: string; interpretation: SheetInterpretation; rowFilter?: { column: string; values: string[] }; batchDefaults: { cta: string; url: string }; clientContext?: string }) =>
  request<{ context: PlanContext }>('/api/conexa/bulk/plan', { method: 'POST', body: JSON.stringify(body) })

export const savePlanOverridesRequest = (planId: string, body: { clientId: string; overrides: PlanOverrides; alias?: { alias: string; accountId: string }; vocabulary?: Array<{ value: string; action: string }>; instructionNotes?: Array<{ key: string; decision: 'apply' | 'ignore' | 'clarified'; clarification?: string }> }) =>
  request<{ ok: true }>(`/api/conexa/bulk/plans/${encodeURIComponent(planId)}`, { method: 'PATCH', body: JSON.stringify(body) })

export async function executePlanAdRequest(planId: string, body: ExecuteAdRequest): Promise<ExecuteAdResult> {
  const response = await fetch(`/api/conexa/bulk/plans/${encodeURIComponent(planId)}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if ('ok' in data) return data as ExecuteAdResult
  return { itemId: body.item.id, ok: false, error: data.error ?? 'No se pudo crear en Meta.' }
}

export const regenerateCopyRequest = (planId: string, body: { clientId: string; planAdId: string }) =>
  request<{ primaryText: string; headline: string }>(`/api/conexa/bulk/plans/${encodeURIComponent(planId)}/copy`, { method: 'POST', body: JSON.stringify(body) })

export type ReviewListItem = {
  idempotencyKey: string; itemKey: string; rowNumber: number; accountId: string; adId: string
  reviewStatus: 'pending' | 'ok' | 'excluded'; reviewNote: string | null; createdAt: string
  name: string; metaStatus?: string; thumbnail?: string; destination: string; url: string | null
}

export const reviewUrl = (planId: string, clientId: string) => `/api/conexa/bulk/plans/${encodeURIComponent(planId)}/review?clientId=${encodeURIComponent(clientId)}`

export const fetchReview = (url: string) => request<{ items: ReviewListItem[] }>(url, { method: 'GET' })

export const setReviewRequest = (planId: string, body: { clientId: string; idempotencyKey: string; status: ReviewListItem['reviewStatus']; note?: string }) =>
  request<{ ok: true }>(`/api/conexa/bulk/plans/${encodeURIComponent(planId)}/review`, { method: 'PATCH', body: JSON.stringify(body) })
