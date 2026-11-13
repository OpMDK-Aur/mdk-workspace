import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CopilotError } from './route-helpers'
import { getClientAdAccounts, googleRequest, metaRequest } from './executors'
import type { Recommendation, RecommendationOperation } from './types'

export const rawOperationSchema = z.object({
  platform: z.enum(['meta', 'google_ads']),
  kind: z.enum(['set_status', 'set_daily_budget']),
  level: z.enum(['campaign', 'adset', 'ad']),
  entityId: z.string().max(40),
  entityName: z.string().max(200),
  customerId: z.string().max(20),
  status: z.enum(['ACTIVE', 'PAUSED', 'ENABLED']).nullable(),
  dailyBudget: z.number().positive().nullable(),
})
export type RawOperation = z.infer<typeof rawOperationSchema>

export type ExecutableEntities = {
  meta: Array<{ level: 'campaign' | 'adset' | 'ad'; id: string; name: string; status: string; daily_budget: string | null; parent_id: string | null }>
  google: Array<{ customerId: string; id: string; name: string; status: string; daily_budget_micros: string | null }>
}

/** Normaliza la operación del modelo; solo acepta IDs que existen en las cuentas vinculadas. */
export function normalizeOperation(raw: RawOperation | null, isKnownId: (platform: 'meta' | 'google_ads', id: string, customerId: string) => boolean): RecommendationOperation | null {
  if (!raw) return null
  const entityId = raw.entityId.trim().replace(/^act_/, '')
  const entityName = raw.entityName.trim() || entityId
  const customerId = raw.customerId.replace(/-/g, '').trim()
  if (!/^\d{3,30}$/.test(entityId) || !isKnownId(raw.platform, entityId, customerId)) return null
  if (raw.platform === 'meta') {
    if (raw.kind === 'set_status') return raw.status === 'ACTIVE' || raw.status === 'PAUSED' ? { platform: 'meta', kind: 'set_status', level: raw.level, entityId, entityName, status: raw.status } : null
    return raw.level !== 'ad' && raw.dailyBudget ? { platform: 'meta', kind: 'set_daily_budget', level: raw.level, entityId, entityName, dailyBudget: raw.dailyBudget } : null
  }
  if (raw.level !== 'campaign') return null
  if (raw.kind === 'set_status') {
    const status = raw.status === 'ACTIVE' ? 'ENABLED' : raw.status
    return status === 'ENABLED' || status === 'PAUSED' ? { platform: 'google_ads', kind: 'set_status', customerId, campaignId: entityId, entityName, status } : null
  }
  return raw.dailyBudget ? { platform: 'google_ads', kind: 'set_daily_budget', customerId, campaignId: entityId, entityName, dailyBudget: raw.dailyBudget } : null
}

async function listEntities(supabase: SupabaseClient, clientId: string, platforms: Recommendation['platforms']): Promise<ExecutableEntities> {
  const accounts = await getClientAdAccounts(supabase, clientId)
  const wantsMeta = !platforms.length || platforms.includes('meta')
  const wantsGoogle = !platforms.length || platforms.includes('google_ads')
  const entities: ExecutableEntities = { meta: [], google: [] }
  const usable = (status?: string) => status === 'ACTIVE' || status === 'PAUSED'

  await Promise.all([
    ...(wantsMeta ? [...accounts.meta].slice(0, 5).map(async (accountId) => {
      try {
        const [campaigns, adsets, ads] = await Promise.all([
          metaRequest<{ data?: Array<{ id: string; name: string; effective_status?: string; daily_budget?: string }> }>(`act_${accountId}/campaigns`, { fields: 'id,name,effective_status,daily_budget', limit: '60' }),
          metaRequest<{ data?: Array<{ id: string; name: string; effective_status?: string; daily_budget?: string; campaign_id?: string }> }>(`act_${accountId}/adsets`, { fields: 'id,name,effective_status,daily_budget,campaign_id', limit: '100' }),
          metaRequest<{ data?: Array<{ id: string; name: string; effective_status?: string; adset_id?: string }> }>(`act_${accountId}/ads`, { fields: 'id,name,effective_status,adset_id', limit: '100' }),
        ])
        for (const item of campaigns.data ?? []) if (usable(item.effective_status)) entities.meta.push({ level: 'campaign', id: item.id, name: item.name, status: item.effective_status!, daily_budget: item.daily_budget ?? null, parent_id: null })
        for (const item of adsets.data ?? []) if (usable(item.effective_status)) entities.meta.push({ level: 'adset', id: item.id, name: item.name, status: item.effective_status!, daily_budget: item.daily_budget ?? null, parent_id: item.campaign_id ?? null })
        for (const item of ads.data ?? []) if (usable(item.effective_status)) entities.meta.push({ level: 'ad', id: item.id, name: item.name, status: item.effective_status!, daily_budget: null, parent_id: item.adset_id ?? null })
      } catch (error) { console.error('[conexa:copilot:prepare] Meta', accountId, error instanceof Error ? error.message : error) }
    }) : []),
    ...(wantsGoogle ? [...accounts.google].slice(0, 5).map(async (customerId) => {
      try {
        const result = await googleRequest<{ results?: Array<{ campaign?: { id?: string; name?: string; status?: string }; campaignBudget?: { amountMicros?: string } }> }>(`customers/${customerId}/googleAds:search`, { query: "SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros FROM campaign WHERE campaign.status IN ('ENABLED', 'PAUSED') LIMIT 100" })
        for (const row of result.results ?? []) if (row.campaign?.id) entities.google.push({ customerId, id: String(row.campaign.id), name: row.campaign.name ?? String(row.campaign.id), status: row.campaign.status ?? 'UNKNOWN', daily_budget_micros: row.campaignBudget?.amountMicros ?? null })
      } catch (error) { console.error('[conexa:copilot:prepare] Google', customerId, error instanceof Error ? error.message : error) }
    }) : []),
  ])
  return entities
}

/** Traduce una recomendación sin acción a una operación concreta, usando las entidades reales del cliente. */
export async function prepareOperation(supabase: SupabaseClient, clientId: string, recommendation: Recommendation): Promise<RecommendationOperation> {
  const entities = await listEntities(supabase, clientId, recommendation.platforms)
  if (!entities.meta.length && !entities.google.length) throw new CopilotError('No encontramos campañas activas o pausadas en las cuentas de Meta Ads o Google Ads vinculadas a este cliente, así que no hay nada para ejecutar.', 422)

  const { output } = await generateText({
    model: 'anthropic/claude-sonnet-4.6',
    system: [
      'Convertís una recomendación de marketing en UNA operación ejecutable, o explicás por qué no se puede.',
      'Operaciones válidas: Meta Ads pausar/activar campaña, conjunto (adset) o anuncio (kind set_status, status ACTIVE o PAUSED) o cambiar daily_budget de una campaña o conjunto que ya tenga daily_budget (kind set_daily_budget). Google Ads (level campaign) pausar/activar (status ENABLED o PAUSED) o cambiar presupuesto diario.',
      'dailyBudget va en unidades de la moneda de la cuenta (no centavos). En Meta, daily_budget de entities viene en centavos; en Google, daily_budget_micros viene en micros. El nuevo presupuesto no puede alejarse más de ±30% del actual.',
      'entityId debe ser exactamente un id de entities. Para Google, customerId es el de esa campaña; para Meta, customerId es "". Usá status o dailyBudget según kind y null en el otro.',
      'Si la recomendación no corresponde a ninguna de estas operaciones o no podés identificar con certeza la entidad, devolvé operation null y una razón breve en español.',
    ].join('\n'),
    output: Output.object({ schema: z.object({ operation: rawOperationSchema.nullable(), reason: z.string().max(400) }) }),
    prompt: JSON.stringify({
      recommendation: { title: recommendation.title, platforms: recommendation.platforms, type: recommendation.type, description: recommendation.description, rationale: recommendation.rationale, suggested_actions: recommendation.suggested_actions },
      entities,
    }),
  })

  const metaIds = new Set(entities.meta.map((item) => item.id))
  const googleIds = new Set(entities.google.map((item) => `${item.customerId}:${item.id}`))
  const operation = normalizeOperation(output.operation, (platform, id, customerId) => (platform === 'meta' ? metaIds.has(id) : googleIds.has(`${customerId}:${id}`)))
  if (!operation) throw new CopilotError(`Esta recomendación no se puede ejecutar automáticamente: ${output.reason || 'no corresponde a pausar/activar o cambiar presupuesto de una entidad concreta.'} Aplicala a mano o pedile al chat una versión con una acción concreta.`, 422)
  return operation
}
