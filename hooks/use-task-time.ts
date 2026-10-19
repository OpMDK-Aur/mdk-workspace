'use client'

import { useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useTimerStore } from '@/lib/time-tracking/timer-store'
import type { TaskTimeTotals } from '@/app/api/tasks/time-totals/route'

export const TASK_TIME_KEY = '/api/tasks/time-totals'

async function fetchTotals(url: string): Promise<TaskTimeTotals> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo cargar el tiempo')
  const json = (await res.json()) as { totals: TaskTimeTotals }
  return json.totals
}

export function useTaskTimeTotals() {
  return useSWR<TaskTimeTotals>(TASK_TIME_KEY, fetchTotals, {
    // Totals scan every task-linked entry; stopping a timer already updates the cache locally.
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })
}

export function refreshTaskTimeTotals() {
  return mutate(TASK_TIME_KEY)
}

/** Seconds the signed-in user tracked on the task (`mine`) and the task total across everyone, including the live timer. */
export function useTaskTime(taskId: string) {
  const { data } = useTaskTimeTotals()
  const runningHere = useTimerStore((s) => s.isRunning && s.taskId === taskId)
  const startedAt = useTimerStore((s) => s.startedAt)
  const [live, setLive] = useState(0)

  useEffect(() => {
    if (!runningHere || !startedAt) {
      setLive(0)
      return
    }
    const started = new Date(startedAt).getTime()
    const tick = () => setLive(Math.max(0, Math.floor((Date.now() - started) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [runningHere, startedAt])

  const base = data?.[taskId]
  return {
    mine: (base?.mine ?? 0) + live,
    total: (base?.total ?? 0) + live,
    running: runningHere,
  }
}
