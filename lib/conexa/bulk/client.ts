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

export const savePlanOverridesRequest = (planId: string, body: { clientId: string; overrides: PlanOverrides; alias?: { alias: string; accountId: string } }) =>
  request<{ ok: true }>(`/api/conexa/bulk/plans/${encodeURIComponent(planId)}`, { method: 'PATCH', body: JSON.stringify(body) })

export async function executePlanAdRequest(planId: string, body: ExecuteAdRequest): Promise<ExecuteAdResult> {
  const response = await fetch(`/api/conexa/bulk/plans/${encodeURIComponent(planId)}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if ('ok' in data) return data as ExecuteAdResult
  return { itemId: body.item.id, ok: false, error: data.error ?? 'No se pudo crear en Meta.' }
}

export const writeSheetStatusRequest = (planId: string, body: { clientId: string; updates: Array<{ rowNumber: number; ok: boolean }>; values?: { done?: string; error?: string } }) =>
  request<{ updated?: number; skipped?: string; needsValues?: boolean }>(`/api/conexa/bulk/plans/${encodeURIComponent(planId)}/sheet-status`, { method: 'POST', body: JSON.stringify(body) })
