'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import type { ThreadSummary } from '@/lib/conexa/tasks'

const DEBOUNCE_MS = 3000

async function summarize(taskId: string, force: boolean): Promise<ThreadSummary> {
  const res = await fetch(`/api/conexa/tasks/${taskId}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  })
  if (!res.ok) throw new Error('summary_failed')
  return res.json()
}

/** Recomputes after the thread settles for 3s; the first value for a task is used immediately. */
export function useThreadSummary(taskId: string, commentsHash: string, enabled: boolean) {
  const [settledHash, setSettledHash] = useState(commentsHash)
  const lastTaskRef = useRef(taskId)

  useEffect(() => {
    if (lastTaskRef.current !== taskId) {
      lastTaskRef.current = taskId
      setSettledHash(commentsHash)
      return
    }
    if (commentsHash === settledHash) return
    const t = setTimeout(() => setSettledHash(commentsHash), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [taskId, commentsHash, settledHash])

  const key = enabled ? ['conexa-thread-summary', taskId, settledHash] : null
  const swr = useSWR(key, () => summarize(taskId, false), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
  })

  const regenerate = () => swr.mutate(summarize(taskId, true), { revalidate: false })

  return { ...swr, regenerate }
}
