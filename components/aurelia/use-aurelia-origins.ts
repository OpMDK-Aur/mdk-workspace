'use client'

import useSWR from 'swr'
import type { AureliaOriginsData } from '@/lib/aurelia/origins-shared'

const fetchOrigins = async (url: string): Promise<AureliaOriginsData> => {
  const response = await fetch(url)
  const body = await response.json().catch(() => null)
  if (!response.ok) return { available: false, message: body?.error ?? 'No se pudo cargar el origen de las ventas.' }
  return body as AureliaOriginsData
}

export function useAureliaOrigins() {
  return useSWR<AureliaOriginsData>('/api/aurelia/origins', fetchOrigins, { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 })
}
