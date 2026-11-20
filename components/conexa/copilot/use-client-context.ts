'use client'

import useSWR from 'swr'
import { toast } from 'sonner'
import { copilotApi } from '@/lib/conexa/copilot/api'
import type { CompetitorControls } from './context-status'

/**
 * Solo la parte de contexto del cliente de Recomendaciones (evaluación y
 * competidores). Usa las mismas claves de SWR que `useCopilot`, así ambas
 * vistas comparten los datos sin pedirlos dos veces.
 */
export function useClientContext(clientId: string | null) {
  const profileKey = clientId ? `/api/conexa/copilot/profile?clientId=${encodeURIComponent(clientId)}` : null
  const contextKey = clientId ? `/api/conexa/copilot/context?clientId=${encodeURIComponent(clientId)}` : null
  const profile = useSWR(profileKey, () => copilotApi.profile(clientId as string), { revalidateOnFocus: false })
  const contexts = useSWR(contextKey, async (url: string) => {
    const response = await fetch(url)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'No se pudo cargar el contexto adicional.')
    return data
  }, { revalidateOnFocus: false })

  const autoSuggest = useSWR(clientId && profile.data?.assessment.autoSuggestCompetitors ? `/api/conexa/copilot/competitors?auto=${encodeURIComponent(clientId)}` : null, () => copilotApi.competitors({ clientId: clientId as string, action: 'suggest', onlyIfEmpty: true }), {
    revalidateOnFocus: false, revalidateIfStale: false, shouldRetryOnError: false,
    onSuccess: (result) => { void profile.mutate({ profile: result.profile, assessment: result.assessment }, { revalidate: false }); void contexts.mutate() },
  })

  const applyCompetitors = async (body: Parameters<typeof copilotApi.competitors>[0]) => {
    const result = await copilotApi.competitors(body)
    await Promise.all([profile.mutate({ profile: result.profile, assessment: result.assessment }, { revalidate: false }), contexts.mutate()])
    return result
  }

  const competitors: CompetitorControls = {
    suggesting: autoSuggest.isLoading,
    onSuggest: async () => {
      if (!clientId) return
      const result = await applyCompetitors({ clientId, action: 'suggest' })
      toast.message(result.suggested ? `Conexa sugirió ${result.suggested} competidor(es). Quitá los que no correspondan.` : 'No se encontraron competidores nuevos.')
    },
    onAdd: async (name: string) => { if (clientId) await applyCompetitors({ clientId, action: 'add', name }) },
    onRemove: async (noteId: string) => { if (clientId) await applyCompetitors({ clientId, action: 'remove', noteId }) },
  }

  return {
    assessment: profile.data?.assessment ?? null,
    unavailable: Boolean(profile.error),
    competitors,
    addContext: async (content: string) => {
      if (!clientId) return
      await copilotApi.addContext({ clientId, content })
      await Promise.all([contexts.mutate(), profile.mutate()])
    },
  }
}
