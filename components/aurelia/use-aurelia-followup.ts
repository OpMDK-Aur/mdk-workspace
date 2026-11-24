'use client'

import useSWR from 'swr'
import type { AureliaDevData, AureliaFollowupData } from '@/lib/aurelia/followup-shared'

async function fetchJson<T extends { available: boolean }>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const body = await response.json().catch(() => null)
  if (!response.ok) return { available: false, message: body?.error ?? 'No se pudieron cargar los datos.' } as unknown as T
  return body as T
}

export function useAureliaFollowup() {
  return useSWR<AureliaFollowupData>('/api/aurelia/followup', fetchJson, { revalidateOnFocus: true })
}

export function useAureliaDevTasks() {
  return useSWR<AureliaDevData>('/api/aurelia/dev-tasks', fetchJson, { revalidateOnFocus: true })
}
