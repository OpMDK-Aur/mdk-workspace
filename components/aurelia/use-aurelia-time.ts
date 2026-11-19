'use client'

import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { addAureliaTimeEntry, deleteAureliaTimeEntry, startAureliaTimer, stopAureliaTimer, updateAureliaRunning } from '@/app/actions/aurelia-time'
import type { AureliaClientOption } from '@/lib/aurelia/crm-clients'
import { useTimerStore } from '@/lib/time-tracking/timer-store'

const fetchClientOptions = async (url: string): Promise<AureliaClientOption[]> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('No se pudieron cargar los clientes del CRM')
  return ((await response.json()).clients ?? []) as AureliaClientOption[]
}

/** Clientes del CRM de Aurelia para el selector del timer. */
export function useAureliaClientOptions() {
  return useSWR('/api/aurelia/clients', fetchClientOptions, { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 })
}
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
    start: async (clientId: string, clientName: string, descripcion?: string) => {
      // Un solo timer a la vez entre MDK y Aurelia, para no contar el mismo tiempo dos veces.
      const mdkTimer = useTimerStore.getState()
      if (mdkTimer.isRunning) {
        try {
          await mdkTimer.stopTimer()
          toast.info('Se detuvo el timer de MDK para no contar el tiempo dos veces')
        } catch {
          toast.error('No se pudo detener el timer de MDK')
          return false
        }
      }
      return perform(() => startAureliaTimer({ clientId, clientName, descripcion }), `Midiendo tiempo en ${clientName}`)
    },
    stop: () => perform(() => stopAureliaTimer(), 'Tiempo registrado'),
    updateRunning: async (input: { clientId?: string; clientName?: string; descripcion?: string }) => {
      const result = await updateAureliaRunning(input)
      if (result.error) toast.error(result.error)
      await mutate()
    },
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
