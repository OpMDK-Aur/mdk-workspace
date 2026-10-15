'use client'

import useSWR from 'swr'

export type ConexaSuggestion = {
  id: string
  titulo: string
  cliente_id: string | null
  cliente_nombre: string | null
  prioridad: 'alta' | 'media' | 'baja' | null
  fecha_vencimiento: string | null
  detalles: string[] | null
  grupo: string
  created_at: string
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudieron cargar las sugerencias')
  return (await res.json()) as { items: ConexaSuggestion[] }
}

export function useConexaSuggestions() {
  const swr = useSWR('/api/tasks/suggestions', fetcher, { revalidateOnFocus: false })
  const items = swr.data?.items ?? []

  const dismiss = async (id: string) => {
    await swr.mutate((prev) => ({ items: (prev?.items ?? []).filter((s) => s.id !== id) }), { revalidate: false })
    await fetch(`/api/tasks/seguimiento/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completado: true }),
    }).catch(() => swr.mutate())
  }

  return { items, isLoading: swr.isLoading, dismiss, refresh: swr.mutate }
}
