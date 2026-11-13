'use client'

import useSWR from 'swr'
import { copilotApi } from '@/lib/conexa/copilot/api'
import type { ProfileUpdate } from '@/lib/conexa/copilot/client-profile'
import type { ClientContextRecord, CopilotChatMessage, Recommendation } from '@/lib/conexa/copilot/types'

export function useCopilot(clientId: string) {
  const recommendations = useSWR(`/api/conexa/copilot/recommendations?clientId=${encodeURIComponent(clientId)}`, (_url: string) => copilotApi.list(clientId), { revalidateOnFocus: false })
  const messages = useSWR(`/api/conexa/copilot/messages?clientId=${encodeURIComponent(clientId)}`, (_url: string) => copilotApi.messages(clientId), { revalidateOnFocus: false })
  const contexts = useSWR(`/api/conexa/copilot/context?clientId=${encodeURIComponent(clientId)}`, async (url: string) => {
    const response = await fetch(url)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'No se pudo cargar el contexto adicional.')
    return data as { context: ClientContextRecord[] }
  }, { revalidateOnFocus: false })
  const profile = useSWR(`/api/conexa/copilot/profile?clientId=${encodeURIComponent(clientId)}`, (_url: string) => copilotApi.profile(clientId), { revalidateOnFocus: false })

  const autoSuggest = useSWR(profile.data?.assessment.autoSuggestCompetitors ? `/api/conexa/copilot/competitors?auto=${encodeURIComponent(clientId)}` : null, () => copilotApi.competitors({ clientId, action: 'suggest', onlyIfEmpty: true }), {
    revalidateOnFocus: false, revalidateIfStale: false, shouldRetryOnError: false,
    onSuccess: (result) => { void profile.mutate({ profile: result.profile, assessment: result.assessment }, { revalidate: false }); void contexts.mutate() },
  })
  const applyCompetitors = async (body: Parameters<typeof copilotApi.competitors>[0]) => {
    const result = await copilotApi.competitors(body)
    await Promise.all([profile.mutate({ profile: result.profile, assessment: result.assessment }, { revalidate: false }), contexts.mutate()])
    return result
  }

  return {
    assessment: profile.data?.assessment ?? null,
    profileError: profile.error as Error | undefined,
    suggestingCompetitors: autoSuggest.isLoading,
    suggestCompetitorsError: autoSuggest.error as Error | undefined,
    suggestCompetitors: () => applyCompetitors({ clientId, action: 'suggest' }),
    addCompetitor: (name: string) => applyCompetitors({ clientId, action: 'add', name }),
    removeCompetitor: (noteId: string) => applyCompetitors({ clientId, action: 'remove', noteId }),
    saveProfile: async (updates: ProfileUpdate[]) => {
      const result = await copilotApi.saveProfile(clientId, updates)
      await profile.mutate(result, { revalidate: false })
      return result
    },
    recommendations: recommendations.data?.recommendations ?? [],
    messages: messages.data?.messages ?? [],
    contexts: contexts.data?.context ?? [],
    isLoading: recommendations.isLoading || messages.isLoading || contexts.isLoading,
    error: recommendations.error ?? messages.error ?? (contexts.error as Error | undefined),
    mutateRecommendations: recommendations.mutate,
    mutateMessages: messages.mutate,
    mutateContexts: contexts.mutate,
    send: async (message: string, editingRecommendationId?: string) => {
      const result = await copilotApi.send({ clientId, message, editingRecommendationId })
      await Promise.all([recommendations.mutate(), messages.mutate(), contexts.mutate(), profile.mutate()])
      return result
    },
    addContext: async (content: string) => {
      await copilotApi.addContext({ clientId, content })
      await Promise.all([contexts.mutate(), profile.mutate()])
    },
    edit: async (id: string, patch: Partial<Recommendation>) => {
      await copilotApi.edit(clientId, id, patch)
      await recommendations.mutate()
    },
    prepare: async (id: string) => {
      const { recommendation } = await copilotApi.prepare(clientId, id)
      await recommendations.mutate((current) => current && { ...current, recommendations: current.recommendations.map((item) => (item.id === id ? recommendation : item)) }, { revalidate: false })
      return recommendation
    },
    previewPublish: async (id: string) => {
      const result = await copilotApi.previewPublish(clientId, id)
      await recommendations.mutate((current) => current && { ...current, recommendations: current.recommendations.map((item) => (item.id === id ? { ...item, ...result.recommendation } : item)) }, { revalidate: false })
      return result
    },
    publish: async (id: string, confirmedPlanHash: string) => {
      const { recommendation } = await copilotApi.publish(clientId, id, confirmedPlanHash)
      await recommendations.mutate((current) => current && { ...current, recommendations: current.recommendations.map((item) => (item.id === id ? recommendation : item)) }, { revalidate: true })
      return recommendation
    },
    markDone: async (id: string) => {
      await copilotApi.markDone(clientId, id)
      await recommendations.mutate()
    },
    scan: async () => {
      const result = await copilotApi.scan(clientId)
      await recommendations.mutate()
      return result
    },
    discard: async (id: string, reason?: string) => {
      await copilotApi.discard(clientId, id, reason)
      await recommendations.mutate()
    },
    restore: async (id: string) => {
      await copilotApi.restore(clientId, id)
      await recommendations.mutate()
    },
  }
}

export type CopilotState = ReturnType<typeof useCopilot>
