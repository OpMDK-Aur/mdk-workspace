'use client'

import useSWR, { useSWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Subtask } from '@/lib/tasks/subtasks-api'

export type { Subtask }

export const subtasksKey = (taskId: string) => `/api/tasks/${taskId}/subtasks`

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudieron cargar las subtareas')
  return res.json()
}

export function useSubtasks(taskId: string) {
  return useSWR<Subtask[]>(subtasksKey(taskId), fetchJson)
}

export function useRefreshSubtaskCounts() {
  const { mutate } = useSWRConfig()
  return () => mutate(key => Array.isArray(key) && key[0] === 'subtask-counts')
}

export type SubtaskCounts = Record<string, { done: number; total: number }>

export function useSubtaskCounts(taskIds: string[]) {
  const ids = [...new Set(taskIds)].sort()
  return useSWR<SubtaskCounts>(ids.length ? ['subtask-counts', ids.join(',')] : null, async () => {
    const counts: SubtaskCounts = {}
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await createClient()
        .from('subtareas_tareas')
        .select('tarea_id, completada')
        .in('tarea_id', ids.slice(i, i + 200))
      if (error) throw error
      for (const r of data ?? []) {
        const c = (counts[r.tarea_id] ??= { done: 0, total: 0 })
        c.total++
        if (r.completada) c.done++
      }
    }
    return counts
  })
}
