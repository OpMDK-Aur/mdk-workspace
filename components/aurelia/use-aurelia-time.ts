'use client'

import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { addAureliaTimeEntry, deleteAureliaTimeEntry, startAureliaTimer, stopAureliaTimer } from '@/app/actions/aurelia-time'
import type { AureliaTimeData } from '@/lib/aurelia/time-shared'

const fetchTime = async (url: string): Promise<AureliaTimeData> => {
  const response = await fetch(url, { cache: 'no-store' })
  const body = await response.json().catch(() => null)
  if (!response.ok) return { available: false, message: body?.error ?? 'No se pudieron cargar las horas.' }
  return body as AureliaTimeData
}

export function useAureliaTime() {
  const { data, isLoading, mutate } = useSWR('/api/aurelia/time', fetchTime, { revalidateOnFocus: true })
  const [pending, setPending] = useState(false)

  const perform = useCallback(async (action: () => Promise<{ error: string | null }>, success: string) => {
    setPending(true)
    const result = await action()
    setPending(false)
    if (result.error) toast.error(result.error)
    else toast.success(success)
    await mutate()
    return !result.error
  }, [mutate])

  return {
    data,
    isLoading,
    pending,
    start: (clientId: string, clientName: string, descripcion?: string) => perform(() => startAureliaTimer({ clientId, clientName, descripcion }), `Midiendo tiempo en ${clientName}`),
    stop: () => perform(() => stopAureliaTimer(), 'Tiempo registrado'),
    addManual: (input: { clientId: string; clientName: string; fecha: string; minutes: number; descripcion?: string }) => perform(() => addAureliaTimeEntry(input), 'Horas cargadas'),
    remove: (entryId: string) => perform(() => deleteAureliaTimeEntry(entryId), 'Entrada eliminada'),
  }
}

/** Reloj que avanza cada segundo mientras haya un timer corriendo. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [active])
  return now
}
