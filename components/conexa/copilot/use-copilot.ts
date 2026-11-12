'use client'

import useSWR from 'swr'
import { copilotApi } from '@/lib/conexa/copilot/api'
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

  return {
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
      await Promise.all([recommendations.mutate(), messages.mutate(), contexts.mutate()])
      return result
    },
    addContext: async (content: string) => {
      await copilotApi.addContext({ clientId, content })
      await contexts.mutate()
    },
    edit: async (id: string, patch: Partial<Recommendation>) => {
      await copilotApi.edit(clientId, id, patch)
      await recommendations.mutate()
    },
    publish: async (id: string) => {
      await copilotApi.publish(clientId, id)
      await recommendations.mutate()
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
