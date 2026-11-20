import { createCrmClient } from '@/lib/supabase/crm'
import { ONBOARDING_PIPELINE_ID, type AureliaOnboardingData, type OnboardingOpportunity, type OnboardingStage } from './onboarding-shared'

type Row = Record<string, unknown>

const PAGE_SIZE = 1000
const MAX_OPPORTUNITIES = 10000
const CONTACT_BATCH = 200

const text = (row: Row, keys: string[]) => {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return null
}

const numeric = (row: Row, keys: string[]) => {
  for (const key of keys) {
    const value = Number(row[key])
    if (row[key] !== null && row[key] !== undefined && Number.isFinite(value)) return value
  }
  return null
}

// Nombres de columna no documentados: se toma el primero que exista.
const STAGE_KEYS = ['stage_id', 'pipeline_stage_id']
const STAGE_ORDER_KEYS = ['position', 'order', 'sort_order', 'order_index', 'index']

/**
 * Oportunidades del pipeline de onboarding (cuenta AURELIA) con su etapa actual
 * y el contacto asociado. Solo lee ese pipeline y los contactos que usa.
 */
export async function getAureliaOnboarding(): Promise<AureliaOnboardingData> {
  let crm: ReturnType<typeof createCrmClient>
  try {
    crm = createCrmClient()
  } catch (error) {
    return { available: false, message: error instanceof Error ? error.message : 'No se pudo conectar con el CRM de Aurelia.' }
  }

  try {
    const [pipelineResult, stagesResult] = await Promise.all([
      crm.from('pipelines').select('id,name').eq('id', ONBOARDING_PIPELINE_ID).maybeSingle(),
      crm.from('pipeline_stages').select('*').eq('pipeline_id', ONBOARDING_PIPELINE_ID).limit(200),
    ])
    if (pipelineResult.error) throw new Error(`pipelines: ${pipelineResult.error.message}`)
    if (stagesResult.error) throw new Error(`pipeline_stages: ${stagesResult.error.message}`)

    const stages: OnboardingStage[] = ((stagesResult.data ?? []) as Row[])
      .map((row, index) => ({ id: String(row.id), name: text(row, ['name', 'title']) ?? 'Etapa sin nombre', position: numeric(row, STAGE_ORDER_KEYS) ?? index, createdAt: text(row, ['created_at']) ?? '' }))
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
      .map(({ id, name }, position) => ({ id, name, position }))

    const opportunityRows: Row[] = []
    for (let from = 0; from < MAX_OPPORTUNITIES; from += PAGE_SIZE) {
      const { data, error } = await crm.from('opportunities').select('*').eq('pipeline_id', ONBOARDING_PIPELINE_ID).order('id').range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(`opportunities: ${error.message}`)
      opportunityRows.push(...((data ?? []) as Row[]))
      if ((data ?? []).length < PAGE_SIZE) break
    }

    const stageKey = STAGE_KEYS.find((key) => opportunityRows.some((row) => row[key]))
    if (opportunityRows.length && !stageKey) {
      throw new Error(`opportunities no tiene una columna de etapa reconocible (${Object.keys(opportunityRows[0]).join(', ')})`)
    }

    const contactIds = [...new Set(opportunityRows.map((row) => text(row, ['contact_id'])).filter((id): id is string => Boolean(id)))]
    const contactsById = new Map<string, Row>()
    for (let index = 0; index < contactIds.length; index += CONTACT_BATCH) {
      const batch = contactIds.slice(index, index + CONTACT_BATCH)
      const { data, error } = await crm.from('contacts').select('*').in('id', batch)
      if (error) throw new Error(`contacts: ${error.message}`)
      for (const row of (data ?? []) as Row[]) contactsById.set(String(row.id), row)
    }

    const opportunities: OnboardingOpportunity[] = opportunityRows.map((row) => {
      const contactId = text(row, ['contact_id'])
      const contact = contactId ? contactsById.get(contactId) : undefined
      return {
        id: String(row.id),
        title: text(row, ['title', 'name']) ?? 'Oportunidad sin título',
        stageId: stageKey ? text(row, [stageKey]) : null,
        stageAt: text(row, ['stage_at', 'stage_changed_at']),
        createdAt: text(row, ['created_at']),
        updatedAt: text(row, ['updated_at']),
        contact: {
          id: contactId,
          name: contact ? text(contact, ['name', 'full_name']) : null,
          email: contact ? text(contact, ['email', 'email_address']) : null,
          phone: contact ? text(contact, ['phone', 'phone_number', 'whatsapp', 'mobile']) : null,
        },
      }
    })

    return { available: true, pipelineName: (pipelineResult.data?.name as string | undefined) ?? 'Onboarding', stages, opportunities }
  } catch (error) {
    console.error('[Aurelia] Error consultando el onboarding:', error)
    return { available: false, message: error instanceof Error ? `No se pudo consultar el onboarding: ${error.message}` : 'No se pudo consultar el onboarding.' }
  }
}
