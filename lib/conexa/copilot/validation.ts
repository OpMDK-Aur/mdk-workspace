import { createHash } from 'node:crypto'
import { MAX_BUDGET_CHANGE, RECENT_EDIT_WINDOW_DAYS } from './config'
import type { EntityCatalog, GoogleCatalogAccount, GoogleCatalogCampaign, MetaCatalogAccount, MetaCatalogAd, MetaCatalogAdset, MetaCatalogCampaign } from './entity-catalog'
import { money } from './executors'
import type { RecommendationOperation } from './types'

export type LinkedAccounts = { meta: Set<string>; google: Set<string> }

type MetaEntry =
  | { level: 'campaign'; account: MetaCatalogAccount; entity: MetaCatalogCampaign }
  | { level: 'adset'; account: MetaCatalogAccount; entity: MetaCatalogAdset }
  | { level: 'ad'; account: MetaCatalogAccount; entity: MetaCatalogAd }

export function indexCatalog(catalog: EntityCatalog) {
  const meta = new Map<string, MetaEntry>()
  const google = new Map<string, { account: GoogleCatalogAccount; entity: GoogleCatalogCampaign }>()
  for (const account of catalog.meta ?? []) {
    for (const entity of account.campaigns) meta.set(entity.id, { level: 'campaign', account, entity })
    for (const entity of account.adsets) meta.set(entity.id, { level: 'adset', account, entity })
    for (const entity of account.ads) meta.set(entity.id, { level: 'ad', account, entity })
  }
  for (const account of catalog.googleAds ?? []) for (const entity of account.campaigns) google.set(`${account.customerId}:${entity.id}`, { account, entity })
  return { meta, google }
}

const LEVEL_NAME = { campaign: 'la campaña', adset: 'el conjunto', ad: 'el anuncio' } as const
const isRecent = (value: string | null) => Boolean(value) && Date.now() - new Date(value!).getTime() < RECENT_EDIT_WINDOW_DAYS * 86_400_000
const recentError = (name: string, value: string) => `«${name}» tuvo un cambio el ${new Date(value).toLocaleDateString('es-AR')}; esperá a que termine el reaprendizaje (${RECENT_EDIT_WINDOW_DAYS} días) antes de hacer otro cambio.`

function budgetErrors(name: string, current: number | null, next: number, currency: string) {
  if (current === null || current <= 0) return [`«${name}» no tiene presupuesto diario propio (se define en otro nivel), así que no se puede cambiar desde acá.`]
  if (!Number.isFinite(next) || next <= 0) return [`El presupuesto propuesto para «${name}» no es válido.`]
  const change = (next - current) / current
  if (Math.abs(change) > MAX_BUDGET_CHANGE + 1e-9) return [`El cambio de presupuesto de «${name}» (${money(current, currency)} → ${money(next, currency)}, ${Math.round(change * 100)}%) supera el máximo de ±${MAX_BUDGET_CHANGE * 100}%.`]
  if (Math.abs(next - current) < 0.005) return [`El presupuesto propuesto para «${name}» es igual al actual.`]
  return []
}

/** Controles de servidor sobre una operación propuesta. Devuelve errores legibles; vacío significa válida. */
export function validateOperation(operation: RecommendationOperation, catalog: EntityCatalog, linked: LinkedAccounts): string[] {
  const index = indexCatalog(catalog)

  if (operation.platform === 'meta') {
    if (operation.kind === 'set_age_range') {
      const errors: string[] = []
      if (!Number.isInteger(operation.ageMin) || !Number.isInteger(operation.ageMax) || operation.ageMin < 18 || operation.ageMax > 65 || operation.ageMin > operation.ageMax) errors.push('El rango de edad tiene que estar entre 18 y 65+, con la edad mínima menor o igual a la máxima.')
      if (!operation.adsets.length) errors.push('No se indicó ningún conjunto para cambiar la edad.')
      let unchanged = 0
      for (const target of operation.adsets) {
        const entry = index.meta.get(target.id)
        if (!entry || entry.level !== 'adset') { errors.push(`El conjunto «${target.name}» no está en el catálogo de cuentas vinculadas.`); continue }
        if (!linked.meta.has(entry.account.accountId)) { errors.push(`El conjunto «${entry.entity.name}» no pertenece a una cuenta vinculada al cliente.`); continue }
        if (entry.entity.ageMin === operation.ageMin && entry.entity.ageMax === operation.ageMax) unchanged++
        if (isRecent(entry.entity.lastEditedAt)) errors.push(recentError(entry.entity.name, entry.entity.lastEditedAt!))
      }
      if (operation.adsets.length && unchanged === operation.adsets.length) errors.push('Todos los conjuntos ya tienen ese rango de edad.')
      return errors
    }
    const entry = index.meta.get(operation.entityId)
    if (!entry) return [`${LEVEL_NAME[operation.level].replace(/^\w/, (char) => char.toUpperCase())} «${operation.entityName}» no está en el catálogo de cuentas vinculadas.`]
    if (entry.level !== operation.level) return [`«${entry.entity.name}» no es ${LEVEL_NAME[operation.level]} (en el catálogo figura como ${LEVEL_NAME[entry.level]}).`]
    if (!linked.meta.has(entry.account.accountId)) return [`«${entry.entity.name}» no pertenece a una cuenta vinculada al cliente.`]
    const errors: string[] = []
    if (operation.kind === 'set_status' && entry.entity.status === operation.status) errors.push(`«${entry.entity.name}» ya está ${operation.status === 'PAUSED' ? 'pausada' : 'activa'}.`)
    if (operation.kind === 'set_daily_budget') {
      if (entry.level === 'ad') errors.push('Los anuncios no tienen presupuesto propio.')
      else errors.push(...budgetErrors(entry.entity.name, entry.entity.dailyBudget, operation.dailyBudget, entry.account.currency))
    }
    if (isRecent(entry.entity.lastEditedAt)) errors.push(recentError(entry.entity.name, entry.entity.lastEditedAt!))
    return errors
  }

  const entry = index.google.get(`${operation.customerId}:${operation.campaignId}`)
  if (!entry) return [`La campaña «${operation.entityName}» no está en el catálogo de cuentas de Google Ads vinculadas.`]
  if (!linked.google.has(entry.account.customerId)) return [`La campaña «${entry.entity.name}» no pertenece a una cuenta vinculada al cliente.`]
  const errors: string[] = []
  if (operation.kind === 'set_status' && entry.entity.status === operation.status) errors.push(`«${entry.entity.name}» ya está ${operation.status === 'PAUSED' ? 'pausada' : 'activa'}.`)
  if (operation.kind === 'set_daily_budget') {
    if (entry.entity.budgetShared) errors.push(`La campaña «${entry.entity.name}» usa un presupuesto compartido; cambiarlo afectaría a otras campañas.`)
    else errors.push(...budgetErrors(entry.entity.name, entry.entity.dailyBudget, operation.dailyBudget, entry.account.currency))
  }
  if (isRecent(entry.entity.lastEditedAt)) errors.push(recentError(entry.entity.name, entry.entity.lastEditedAt!))
  return errors
}

/** Clave para el índice único de borradores vigentes: misma acción sobre las mismas entidades con el mismo valor objetivo. */
export function operationDedupeKey(operation: RecommendationOperation) {
  const ids = operation.kind === 'set_age_range' ? operation.adsets.map((adset) => adset.id) : [operation.platform === 'meta' ? operation.entityId : `${operation.customerId}:${operation.campaignId}`]
  const target = operation.kind === 'set_age_range' ? `${operation.ageMin}-${operation.ageMax}` : operation.kind === 'set_status' ? operation.status : String(operation.dailyBudget)
  return createHash('sha256').update(`${operation.kind}|${operation.platform}|${[...ids].sort().join(',')}|${target}`).digest('hex')
}
