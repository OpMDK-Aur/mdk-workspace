import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { fetchGhlContactsInRange, fetchGhlOpportunities, type GhlContact, type GhlCreds, type GhlOpportunity } from '@/lib/revops/ghl-client'

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { expires: number; value: Promise<unknown> }>()

// Conexa consulta contactos, oportunidades, ventas y adquisición en paralelo. Sin este cache cada
// tool volvería a paginar la cuenta completa en GHL y la API respondería 429.
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expires > now) return hit.value as Promise<T>
  const value = load().catch((error) => { cache.delete(key); throw error })
  cache.set(key, { expires: now + CACHE_TTL_MS, value })
  return value
}

export function getGhlContactsInRange(creds: GhlCreds, startIso: string, endIso: string): Promise<GhlContact[]> {
  return cached(`contacts:${creds.locationId}:${startIso}:${endIso}`, () => fetchGhlContactsInRange(creds, startIso, endIso))
}

export function getGhlOpportunities(creds: GhlCreds): Promise<GhlOpportunity[]> {
  return cached(`opportunities:${creds.locationId}`, () => fetchGhlOpportunities(creds))
}

export type GhlClientCreds = { creds: GhlCreds } | { error: string } | null

/** Devuelve las credenciales GHL si el cliente usa GoHighLevel como CRM; null si usa otro CRM. */
export async function resolveGhlCreds(clientId: string): Promise<GhlClientCreds> {
  const { data } = await createAdminClient().from('clientes').select('crm_type, ghl_location_id, ghl_token').eq('id', clientId).maybeSingle()
  if (data?.crm_type !== 'ghl') return null
  if (!data.ghl_location_id || !data.ghl_token) return { error: 'El cliente usa GoHighLevel pero no tiene la location o el token configurados en Plataformas.' }
  return { creds: { locationId: data.ghl_location_id, token: data.ghl_token } }
}

export function buenosAiresRange(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00-03:00`).toISOString()
  const endExclusive = new Date(`${dateTo}T00:00:00-03:00`)
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
  return { start, end: endExclusive.toISOString() }
}

const period = (dateFrom: string, dateTo: string, start: string, end: string) => ({ date_from: dateFrom, date_to: dateTo, timezone: 'America/Argentina/Buenos_Aires', query_start_utc: start, query_end_exclusive_utc: end, source: 'gohighlevel' })

const inRange = (value: string, startMs: number, endMs: number) => { const time = new Date(value).getTime(); return time >= startMs && time < endMs }

export async function ghlContactsResult(creds: GhlCreds, dateFrom: string, dateTo: string) {
  const { start, end } = buenosAiresRange(dateFrom, dateTo)
  const contacts = await getGhlContactsInRange(creds, start, end)
  const bySource = contacts.reduce<Record<string, number>>((summary, contact) => { const key = contact.source?.trim() || 'Sin origen'; summary[key] = (summary[key] ?? 0) + 1; return summary }, {})
  const rows = contacts.map((contact) => ({ id: contact.id, created_at: contact.dateAdded, source: contact.source, tags: contact.tags }))
  return { available: true, period: period(dateFrom, dateTo, start, end), totals: { contacts: contacts.length, by_source: bySource }, contacts: rows.slice(0, 500), truncated: rows.length > 500 }
}

async function opportunitiesInRange(creds: GhlCreds, dateFrom: string, dateTo: string) {
  const { start, end } = buenosAiresRange(dateFrom, dateTo)
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  const opportunities = (await getGhlOpportunities(creds)).filter((row) => inRange(row.createdAt, startMs, endMs))
  return { start, end, opportunities }
}

const toOpportunityRow = (row: GhlOpportunity) => ({ id: row.id, name: row.name, created_at: row.createdAt, contact_id: row.contactId, contact: row.contactId ? { id: row.contactId, name: row.contactName } : null, pipeline_id: row.pipelineId, stage_id: row.pipelineStageId, assigned_user: row.assignedTo, status: row.status, amount: row.monetaryValue })

export async function ghlOpportunitiesResult(creds: GhlCreds, dateFrom: string, dateTo: string, status?: string) {
  const { start, end, opportunities } = await opportunitiesInRange(creds, dateFrom, dateTo)
  const rows = (status ? opportunities.filter((row) => row.status.toLowerCase() === status.toLowerCase()) : opportunities).map(toOpportunityRow)
  const byStatus = rows.reduce<Record<string, number>>((summary, row) => { summary[row.status] = (summary[row.status] ?? 0) + 1; return summary }, {})
  return { available: true, period: period(dateFrom, dateTo, start, end), totals: { opportunities: rows.length, by_status: byStatus, amount: rows.reduce((sum, row) => sum + (Number(row.amount ?? 0) || 0), 0) }, opportunities: rows.slice(0, 500), truncated: rows.length > 500 }
}

export async function ghlSalesResult(creds: GhlCreds, dateFrom: string, dateTo: string) {
  const { opportunities } = await opportunitiesInRange(creds, dateFrom, dateTo)
  const won = opportunities.filter((row) => row.status.toLowerCase() === 'won').map(toOpportunityRow)
  const amount = won.reduce((sum, row) => sum + (Number(row.amount ?? 0) || 0), 0)
  return {
    available: true,
    period: { date_from: dateFrom, date_to: dateTo, source: 'gohighlevel' },
    totals: { won_sales: won.length, attributed_sales: 0, unattributed_sales: won.length, amount },
    by_channel: won.length ? [{ channel: 'unattributed', sales: won.length, amount, campaign_sales: 0 }] : [],
    by_campaign: won.length ? [{ campaign: null, ad_id: null, sales: won.length, amount }] : [],
    sales: won.slice(0, 100).map((opportunity) => ({ opportunity, contact: opportunity.contact, stage: null, referral: null })),
    truncated: won.length > 100,
    note: 'GoHighLevel no expone la atribución por campaña en las oportunidades; las ventas figuran sin atribuir. Para atribución por campaña usá el desglose de adquisición del CRM.',
  }
}
