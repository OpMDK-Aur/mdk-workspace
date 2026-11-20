import type { AureliaClient } from './metrics'

export const ONBOARDING_PIPELINE_ID = '65f9c82a-cb24-4052-bfee-2781b7bd2dec'
/** Días en una misma etapa a partir de los cuales el onboarding se marca como demorado. */
export const STALLED_AFTER_DAYS = 14

export type OnboardingStage = { id: string; name: string; position: number }

export type OnboardingOpportunity = {
  id: string
  title: string
  stageId: string | null
  stageAt: string | null
  createdAt: string | null
  updatedAt: string | null
  contact: { id: string | null; name: string | null; email: string | null; phone: string | null }
}

export type AureliaOnboardingData =
  | { available: false; message: string }
  | { available: true; pipelineName: string; stages: OnboardingStage[]; opportunities: OnboardingOpportunity[] }

export type OnboardingMatch = OnboardingOpportunity & { stage: OnboardingStage | null; matchedBy: 'email' | 'phone' | 'name' }

export function normalizeName(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const normalizeEmail = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()
// Últimos 10 dígitos: ignora prefijos de país y el 9 de los celulares argentinos.
const normalizePhone = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '').slice(-10)

const newestFirst = (a: OnboardingOpportunity, b: OnboardingOpportunity) =>
  (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? '')

/**
 * Asocia cada cliente con su oportunidad del pipeline de onboarding. Prioriza el
 * email y el teléfono del contacto y, si no coinciden, el título de la oportunidad
 * contra el nombre del cliente. Con varias oportunidades gana la más reciente.
 */
export function matchOnboarding(clients: AureliaClient[], data: Extract<AureliaOnboardingData, { available: true }>) {
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]))
  const byEmail = new Map<string, OnboardingOpportunity>()
  const byPhone = new Map<string, OnboardingOpportunity>()
  const byName = new Map<string, OnboardingOpportunity>()
  const remember = (index: Map<string, OnboardingOpportunity>, key: string, opportunity: OnboardingOpportunity) => {
    if (!key) return
    const current = index.get(key)
    if (!current || newestFirst(opportunity, current) < 0) index.set(key, opportunity)
  }
  for (const opportunity of data.opportunities) {
    remember(byEmail, normalizeEmail(opportunity.contact.email), opportunity)
    const phone = normalizePhone(opportunity.contact.phone)
    if (phone.length >= 8) remember(byPhone, phone, opportunity)
    remember(byName, normalizeName(opportunity.title), opportunity)
    remember(byName, normalizeName(opportunity.contact.name), opportunity)
  }

  const matches = new Map<string, OnboardingMatch>()
  const usedOpportunities = new Set<string>()
  for (const client of clients) {
    const phone = normalizePhone(client.phone)
    const candidates: Array<[OnboardingMatch['matchedBy'], OnboardingOpportunity | undefined]> = [
      ['email', byEmail.get(normalizeEmail(client.email))],
      ['phone', phone.length >= 8 ? byPhone.get(phone) : undefined],
      ['name', byName.get(normalizeName(client.name))],
    ]
    const found = candidates.find(([, opportunity]) => opportunity)
    if (!found?.[1]) continue
    const [matchedBy, opportunity] = found as [OnboardingMatch['matchedBy'], OnboardingOpportunity]
    matches.set(client.id, { ...opportunity, stage: opportunity.stageId ? stageById.get(opportunity.stageId) ?? null : null, matchedBy })
    usedOpportunities.add(opportunity.id)
  }

  const unmatched = data.opportunities.filter((opportunity) => !usedOpportunities.has(opportunity.id))
  return { matches, unmatched }
}

export function daysSince(value: string | null, now = Date.now()) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 86_400_000)) : null
}
