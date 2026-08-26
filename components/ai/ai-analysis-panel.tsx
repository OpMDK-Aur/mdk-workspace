'use client'

import { ExternalLink, Sparkles } from 'lucide-react'
import { buildAdsPlatformLink, platformLabel, type AdsPlatform } from '@/lib/ai/ads-links'

interface Evidence {
  id?: string
  source?: 'google' | 'meta' | 'crm' | 'user' | 'derived' | 'other' | null
  account_id?: string | null
  campaign_id?: string | null
}

interface Recommendation {
  id?: string
  descripcion?: string
  prioridad?: 'alta' | 'media' | 'baja'
  evidence_ids?: string[]
}

interface Analysis {
  optimization_score?: number | null
  optimization_level?: string | null
  recommendations?: Recommendation[]
  evidence?: Evidence[]
  entity?: { platform?: 'google' | 'meta' | 'mixed'; account_ids?: string[] }
}

const PRIORITY_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 }
const PRIORITY_LABEL: Record<string, string> = { alta: 'Prioridad alta', media: 'Prioridad media', baja: 'Prioridad baja' }
const PRIORITY_COLOR: Record<string, string> = {
  alta: 'bg-status-rojo/15 text-status-rojo',
  media: 'bg-status-amarillo/15 text-status-amarillo',
  baja: 'bg-status-verde/15 text-status-verde',
}

/** Resuelve a qué plataforma y cuenta/campaña apunta una recomendación, usando la evidencia que la sustenta y, si no hay, la cuenta a nivel de entidad analizada. */
function resolveRecommendationLink(recommendation: Recommendation, analysis: Analysis): { platform: AdsPlatform; accountId: string; campaignId?: string | null } | null {
  const evidenceById = new Map((analysis.evidence ?? []).map((item) => [item.id, item]))
  const linkedEvidence = (recommendation.evidence_ids ?? [])
    .map((id) => evidenceById.get(id))
    .find((item) => item && (item.source === 'google' || item.source === 'meta') && item.account_id)

  if (linkedEvidence?.account_id && (linkedEvidence.source === 'google' || linkedEvidence.source === 'meta')) {
    return { platform: linkedEvidence.source, accountId: linkedEvidence.account_id, campaignId: linkedEvidence.campaign_id }
  }

  const entityPlatform = analysis.entity?.platform
  const entityAccountId = analysis.entity?.account_ids?.[0]
  if (entityAccountId && (entityPlatform === 'google' || entityPlatform === 'meta')) {
    return { platform: entityPlatform, accountId: entityAccountId }
  }
  return null
}

export function AIAnalysisPanel({ content, analysis }: { content: string; analysis?: Analysis | null }) {
  const scoreMatch = content.match(/(?:optimization_score|score|scoring|calificaci[oó]n)\D{0,20}(\d{1,3})\s*(?:\/\s*100)?/i)
  const score = analysis?.optimization_score ?? (scoreMatch ? Math.min(100, Number(scoreMatch[1])) : null)
  const levelMatch = content.match(/\b(baja|intermedia|alta)\b/i)
  const level = analysis?.optimization_level ?? levelMatch?.[1]?.toLowerCase() ?? null
  const temperature = level === 'alta' ? 'Alta' : level === 'intermedia' ? 'Intermedia' : level === 'baja' ? 'Baja' : null

  const recommendations = [...(analysis?.recommendations ?? [])]
    .filter((recommendation) => recommendation.descripcion)
    .sort((a, b) => (PRIORITY_RANK[a.prioridad ?? 'baja'] ?? 3) - (PRIORITY_RANK[b.prioridad ?? 'baja'] ?? 3))

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-t bg-card p-4 lg:w-80 lg:border-l lg:border-t-0" aria-label="Análisis IA del cliente">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-primary"><Sparkles className="size-4" aria-hidden="true" /><h2 className="text-sm font-semibold">Análisis IA</h2></div><span className="text-[11px] text-muted-foreground">Último análisis</span></div>
      {score !== null ? (
        <>
          <div>
            <p className="text-xs text-muted-foreground">Scoring</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">{score}<span className="text-base font-normal text-muted-foreground">/100</span></p>
            <div className="mt-3 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${score}%` }} /></div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Optimización</p>
            <p className="mt-1 text-sm font-medium">{temperature ?? 'Sin clasificar'}</p>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-primary">Recomendaciones</p>
            {recommendations.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {recommendations.map((recommendation, index) => {
                  const link = resolveRecommendationLink(recommendation, analysis ?? {})
                  return (
                    <li key={recommendation.id ?? index} className="flex flex-col gap-1.5 rounded-md border p-2.5">
                      {recommendation.prioridad && (
                        <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_COLOR[recommendation.prioridad] ?? 'bg-muted text-muted-foreground'}`}>
                          {PRIORITY_LABEL[recommendation.prioridad] ?? recommendation.prioridad}
                        </span>
                      )}
                      <p className="text-sm leading-6 text-foreground">{recommendation.descripcion}</p>
                      {link && (
                        <a
                          href={buildAdsPlatformLink(link.platform, link.accountId, link.campaignId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Ver en {platformLabel(link.platform)}
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">El performance analyst no encontró recomendaciones concretas con la evidencia disponible.</p>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-md border border-dashed p-4 text-sm leading-6 text-muted-foreground">El score y la temperatura aparecerán acá cuando el performance analyst complete un análisis de este cliente.</div>
      )}
    </aside>
  )
}
