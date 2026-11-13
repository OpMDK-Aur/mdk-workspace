import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CopilotError } from './route-helpers'
import { getClientAdAccounts, googleRequest, metaRequest } from './executors'
import type { Recommendation, RecommendationOperation } from './types'

export const rawOperationSchema = z.object({
  platform: z.enum(['meta', 'google_ads']),
  kind: z.enum(['set_status', 'set_daily_budget', 'set_age_range', 'create_campaign']),
  level: z.enum(['campaign', 'adset', 'ad']),
  entityId: z.string().max(40),
  entityName: z.string().max(200),
  customerId: z.string().max(20),
  status: z.enum(['ACTIVE', 'PAUSED', 'ENABLED']).nullable(),
  dailyBudget: z.number().positive().nullable(),
  ageTargets: z.array(z.object({ id: z.string().max(40), name: z.string().max(200) })).max(10),
  ageMin: z.number().int().nullable(),
  ageMax: z.number().int().nullable(),
  newCampaignName: z.string().max(120),
  newAdsetName: z.string().max(120),
  adRefs: z.array(z.object({ id: z.string().max(40), name: z.string().max(200) })).max(3),
})

export const OPERATION_GUIDE = [
  'Operaciones ejecutables:',
  '- Meta Ads (platform "meta"): pausar/activar campaña, conjunto (adset) o anuncio (kind "set_status", status ACTIVE o PAUSED, entityId de la entidad).',
  '- Meta Ads: cambiar el presupuesto diario de una campaña o conjunto que ya tenga daily_budget (kind "set_daily_budget", dailyBudget en unidades de la moneda, no centavos, máximo ±30% del actual).',
  '- Meta Ads: ajustar el rango de edad de uno o más conjuntos (kind "set_age_range", level "adset", ageTargets con id y nombre de cada conjunto, ageMin y ageMax entre 18 y 65; 65 significa 65+). Usalo para pedidos de segmentación etaria; incluí solo los conjuntos que la recomendación menciona (por ejemplo, los de WhatsApp).',
  '- Google Ads (platform "google_ads", level "campaign"): pausar/activar campaña (status ENABLED o PAUSED) o cambiar su presupuesto diario (máximo ±30%). customerId es la cuenta de la campaña.',
  'Crear campañas nuevas (kind "create_campaign") no se prepara desde acá: si la recomendación pide una campaña nueva, devolvé operation null.',
  'Los IDs deben ser exactos y existir en los datos entregados. Completá con null o vacío los campos que no use el kind: entityId/entityName "" y ageTargets [] cuando no apliquen; status, dailyBudget, ageMin y ageMax null cuando no apliquen; customerId "" para Meta; newCampaignName/newAdsetName "" y adRefs [] salvo en create_campaign.',
].join('\n')
export type RawOperation = z.infer<typeof rawOperationSchema>

export type ExecutableEntities = {
  meta: Array<{ level: 'campaign' | 'adset' | 'ad'; id: string; name: string; status: string; daily_budget: string | null; parent_id: string | null; age_range?: string | null }>
  google: Array<{ customerId: string; id: string; name: string; status: string; daily_budget_micros: string | null }>
}

/** Normaliza la operación del modelo; solo acepta IDs que existen en las cuentas vinculadas. */
export function normalizeOperation(raw: RawOperation | null, isKnownId: (platform: 'meta' | 'google_ads', id: string, customerId: string) => boolean): RecommendationOperation | null {
  if (!raw) return null
  if (raw.kind === 'create_campaign') {
    const templateAdsetId = raw.entityId.trim()
    const campaignName = raw.newCampaignName.trim()
    if (raw.platform !== 'meta' || !campaignName || !raw.dailyBudget || !/^\d{3,30}$/.test(templateAdsetId) || !isKnownId('meta', templateAdsetId, '')) return null
    const hasAge = raw.ageMin !== null && raw.ageMax !== null
    if (hasAge && (raw.ageMin! < 18 || raw.ageMax! > 65 || raw.ageMin! > raw.ageMax!)) return null
    const ads = [...new Map(raw.adRefs.map((ad) => [ad.id.trim(), { id: ad.id.trim(), name: ad.name.trim() || ad.id.trim() }])).values()]
    if (!ads.length || ads.some((ad) => !/^\d{3,30}$/.test(ad.id) || !isKnownId('meta', ad.id, ''))) return null
    return { platform: 'meta', kind: 'create_campaign', templateAdsetId, templateAdsetName: raw.entityName.trim() || templateAdsetId, campaignName, adsetName: raw.newAdsetName.trim() || campaignName, dailyBudget: raw.dailyBudget, ageMin: hasAge ? Math.round(raw.ageMin!) : null, ageMax: hasAge ? Math.round(raw.ageMax!) : null, ads }
  }
  if (raw.kind === 'set_age_range') {
    if (raw.platform !== 'meta' || raw.ageMin === null || raw.ageMax === null) return null
    const ageMin = Math.round(raw.ageMin)
    const ageMax = Math.round(raw.ageMax)
    if (ageMin < 18 || ageMax > 65 || ageMin > ageMax) return null
    const targets = [...raw.ageTargets, ...(raw.entityId ? [{ id: raw.entityId, name: raw.entityName }] : [])]
    const adsets = [...new Map(targets.map((target) => [target.id.trim(), { id: target.id.trim(), name: target.name.trim() || target.id.trim() }])).values()]
    if (!adsets.length || adsets.some((adset) => !/^\d{3,30}$/.test(adset.id) || !isKnownId('meta', adset.id, ''))) return null
    return { platform: 'meta', kind: 'set_age_range', adsets, ageMin, ageMax }
  }
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
          metaRequest<{ data?: Array<{ id: string; name: string; effective_status?: string; daily_budget?: string; campaign_id?: string; targeting?: { age_min?: number; age_max?: number } }> }>(`act_${accountId}/adsets`, { fields: 'id,name,effective_status,daily_budget,campaign_id,targeting', limit: '100' }),
          metaRequest<{ data?: Array<{ id: string; name: string; effective_status?: string; adset_id?: string }> }>(`act_${accountId}/ads`, { fields: 'id,name,effective_status,adset_id', limit: '100' }),
        ])
        for (const item of campaigns.data ?? []) if (usable(item.effective_status)) entities.meta.push({ level: 'campaign', id: item.id, name: item.name, status: item.effective_status!, daily_budget: item.daily_budget ?? null, parent_id: null })
        for (const item of adsets.data ?? []) if (usable(item.effective_status)) entities.meta.push({ level: 'adset', id: item.id, name: item.name, status: item.effective_status!, daily_budget: item.daily_budget ?? null, parent_id: item.campaign_id ?? null, age_range: item.targeting ? `${item.targeting.age_min ?? 18}-${item.targeting.age_max ?? 65}` : null })
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
      OPERATION_GUIDE,
      'En entities, daily_budget de Meta viene en centavos y daily_budget_micros de Google en micros; dailyBudget se devuelve en unidades de la moneda. age_range muestra la edad actual de cada conjunto.',
      'Si la recomendación pide un rango de edad sin precisarlo, usá el que esté explícito en su descripción o acciones sugeridas; si no hay ningún rango concreto, devolvé operation null y pedí que se indique.',
      'Si la recomendación no corresponde a ninguna de estas operaciones o no podés identificar con certeza las entidades, devolvé operation null y una razón breve en español.',
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
  if (!operation) throw new CopilotError(`Esta recomendación no se puede ejecutar automáticamente: ${output.reason || 'no corresponde a pausar/activar, cambiar presupuesto o ajustar la edad de entidades concretas.'} Aplicala a mano o pedile al chat una versión con una acción concreta.`, 422)
  return operation
}
