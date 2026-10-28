'use client'

import useSWR, { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { copilotApi, copilotFetcher, copilotUrls } from '@/lib/conexa/copilot/api'
import type { LearningsResponse, Recommendation, RecommendationsResponse } from '@/lib/conexa/copilot/types'

export function useCopilot(clientId: string) {
  const recsKey = copilotUrls.recommendations(clientId)
  const learningsKey = copilotUrls.learnings(clientId)
  const recs = useSWR<RecommendationsResponse>(recsKey, copilotFetcher, { revalidateOnFocus: false })
  const learnings = useSWR<LearningsResponse>(learningsKey, copilotFetcher, { revalidateOnFocus: false })
  const { mutate } = useSWRConfig()

  const patchLocal = (id: string, patch: Partial<Recommendation>) =>
    recs.mutate((current) => current && { ...current, recommendations: current.recommendations.map((item) => (item.id === id ? { ...item, ...patch } : item)) }, { revalidate: false })

  const refreshSecondary = () => {
    void learnings.mutate()
    void mutate((key) => typeof key === 'string' && key.startsWith('/api/conexa/copilot/dashboard'))
  }

  /** Aplica el cambio al instante y lo deshace si la API falla. */
  async function optimistic(id: string, patch: Partial<Recommendation>, call: () => Promise<{ recommendation: Recommendation }>) {
    const snapshot = recs.data
    await patchLocal(id, patch)
    try {
      const { recommendation } = await call()
      await patchLocal(id, recommendation)
      refreshSecondary()
      return true
    } catch (error) {
      await recs.mutate(snapshot, { revalidate: false })
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción')
      return false
    }
  }

  return {
    recommendations: recs.data?.recommendations ?? [],
    plays: recs.data?.plays ?? [],
    context: recs.data?.context,
    decisions: learnings.data?.decisions ?? [],
    learnings: learnings.data?.learnings ?? [],
    isLoading: recs.isLoading,
    error: recs.error as Error | undefined,
    edit: (rec: Recommendation, after: string) => optimistic(rec.id, { after, edited: true, diff: 'Editado a mano', version: rec.version + 1 }, () => copilotApi.edit(rec.id, after)),
    reformulate: async (rec: Recommendation, instruction: string) => {
      try {
        const { recommendation } = await copilotApi.reformulate(rec.id, instruction)
        await patchLocal(rec.id, recommendation)
        return true
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo reformular')
        return false
      }
    },
    approve: (rec: Recommendation, mode: 'now' | 'schedule', slot?: string) =>
      optimistic(rec.id, mode === 'now' ? { status: 'executing' } : { status: 'scheduled', slot }, () => copilotApi.approve(rec.id, mode, slot)),
    reject: (rec: Recommendation, reason: string) => optimistic(rec.id, { status: 'rejected', rejectReason: reason }, () => copilotApi.reject(rec.id, reason)),
    runNow: (rec: Recommendation) => optimistic(rec.id, { status: 'executing', slot: undefined }, () => copilotApi.runNow(rec.id)),
    cancel: (rec: Recommendation) => optimistic(rec.id, { status: 'pending', slot: undefined }, () => copilotApi.cancel(rec.id)),
    revert: async (decisionId: string) => {
      const snapshot = learnings.data
      await learnings.mutate((current) => current && { ...current, decisions: current.decisions.map((item) => (item.id === decisionId ? { ...item, decision: 'Revertida', revertible: false } : item)) }, { revalidate: false })
      try {
        await copilotApi.revert(decisionId)
        refreshSecondary()
        toast.success('Cambio revertido al valor anterior')
      } catch (error) {
        await learnings.mutate(snapshot, { revalidate: false })
        toast.error(error instanceof Error ? error.message : 'No se pudo revertir')
      }
    },
  }
}

export type CopilotState = ReturnType<typeof useCopilot>
