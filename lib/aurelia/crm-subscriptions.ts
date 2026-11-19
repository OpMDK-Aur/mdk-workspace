import { createCrmClient } from '@/lib/supabase/crm'
import type { AureliaClient, AureliaDataset, SubscriptionStatus } from './metrics'

const PAGE_SIZE = 1000
const MAX_ROWS = 20000

type ClientRow = { id: string; name: string | null; email: string | null; phone: string | null }
type SubscriptionRow = { client_id: string; plan_id: string | null; status: string | null; current_period_start: string | null; ended_at: string | null; trial_end_at: string | null; created_at: string | null }
type PlanRow = Record<string, unknown> & { id: string; slug?: string | null; name?: string | null }

type PlanPricing = { name: string | null; slug: string | null; monthlyPrice: number | null; currency: string | null }

// La tabla `plans` no tiene un nombre de columna de precio documentado, así que
// se toma el primer campo numérico conocido. Los campos en centavos se dividen
// por 100 y los planes anuales se prorratean a 12 meses.
const PRICE_KEYS = ['monthly_price', 'price_monthly', 'mrr', 'price', 'amount', 'unit_amount', 'price_cents', 'amount_cents', 'unit_amount_cents']
const INTERVAL_KEYS = ['interval', 'billing_interval', 'billing_period', 'period', 'recurring_interval']

function planPricing(plan: PlanRow): PlanPricing {
  let monthlyPrice: number | null = null
  for (const key of PRICE_KEYS) {
    const raw = plan[key]
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN
    if (!Number.isFinite(value)) continue
    monthlyPrice = key.endsWith('_cents') || key === 'unit_amount' ? value / 100 : value
    break
  }
  const interval = INTERVAL_KEYS.map((key) => String(plan[key] ?? '').toLowerCase()).find(Boolean) ?? ''
  if (monthlyPrice !== null && /year|annual|anual/.test(interval)) monthlyPrice /= 12
  const currency = typeof plan.currency === 'string' && plan.currency.trim() ? plan.currency.trim().toUpperCase() : null
  return { name: typeof plan.name === 'string' ? plan.name : null, slug: plan.slug ?? null, monthlyPrice, currency }
}

function normalizeStatus(raw: string | null, endedAt: string | null, now: number): SubscriptionStatus {
  const status = String(raw ?? '').toLowerCase().trim()
  if (endedAt && new Date(endedAt).getTime() <= now) return 'churned'
  if (['canceled', 'cancelled', 'cancelada', 'ended', 'expired', 'inactive', 'incomplete_expired', 'churned', 'baja'].includes(status)) return 'churned'
  if (['trialing', 'trial', 'prueba'].includes(status)) return 'trial'
  if (['past_due', 'unpaid', 'pending', 'incomplete'].includes(status)) return 'past_due'
  if (['active', 'activa', 'activo', 'paid'].includes(status)) return 'active'
  return 'other'
}

const timestamp = (value: string | null) => (value ? new Date(value).getTime() : Number.NEGATIVE_INFINITY)

// Igual al criterio del lateral join: la suscripción más reciente por
// current_period_start y, si empata o falta, por created_at.
function compareLatestFirst(a: SubscriptionRow, b: SubscriptionRow) {
  return timestamp(b.current_period_start) - timestamp(a.current_period_start) || timestamp(b.created_at) - timestamp(a.created_at)
}

async function fetchPaged<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE_SIZE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

export async function getAureliaDataset(): Promise<AureliaDataset> {
  let crm: ReturnType<typeof createCrmClient>
  try {
    crm = createCrmClient()
  } catch (error) {
    return { available: false, message: error instanceof Error ? error.message : 'No se pudo conectar con el CRM de Aurelia.' }
  }

  try {
    const [clientsResult, subscriptionsResult, plansResult] = await Promise.all([
      fetchPaged<ClientRow>((from, to) => crm.from('clients').select('id,name,email,phone').order('id').range(from, to)),
      fetchPaged<SubscriptionRow>((from, to) => crm.from('client_subscriptions').select('client_id,plan_id,status,current_period_start,ended_at,trial_end_at,created_at').order('created_at').order('client_id').range(from, to)),
      crm.from('plans').select('*').limit(500),
    ])
    if (plansResult.error) throw new Error(`plans: ${plansResult.error.message}`)

    const pricingByPlan = new Map(((plansResult.data ?? []) as PlanRow[]).map((plan) => [plan.id, planPricing(plan)]))
    const subscriptionsByClient = new Map<string, SubscriptionRow[]>()
    for (const row of subscriptionsResult.rows) {
      const list = subscriptionsByClient.get(row.client_id) ?? []
      list.push(row)
      subscriptionsByClient.set(row.client_id, list)
    }

    const now = Date.now()
    const currencyVotes = new Map<string, number>()
    const clients: AureliaClient[] = []
    for (const client of clientsResult.rows) {
      const subscriptions = subscriptionsByClient.get(client.id)
      if (!subscriptions?.length) continue
      const latest = [...subscriptions].sort(compareLatestFirst)[0]
      const pricing = latest.plan_id ? pricingByPlan.get(latest.plan_id) : undefined
      // Mismo comportamiento que el `join plans`: sin plan no hay fila.
      if (!pricing) continue

      const firstStart = subscriptions
        .map((row) => row.created_at ?? row.current_period_start)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null
      const status = normalizeStatus(latest.status, latest.ended_at, now)
      const paying = status === 'active' || status === 'past_due'
      if (pricing.currency) currencyVotes.set(pricing.currency, (currencyVotes.get(pricing.currency) ?? 0) + 1)

      clients.push({
        id: client.id,
        name: client.name?.trim() || client.email || 'Sin nombre',
        email: client.email,
        phone: client.phone,
        status,
        rawStatus: latest.status,
        planSlug: pricing.slug,
        planName: pricing.name ?? pricing.slug,
        startedAt: firstStart,
        currentPeriodStart: latest.current_period_start,
        endedAt: latest.ended_at,
        trialEndAt: latest.trial_end_at,
        churnedAt: status === 'churned' ? latest.ended_at : null,
        planMonthlyPrice: pricing.monthlyPrice,
        mrr: paying ? pricing.monthlyPrice ?? 0 : 0,
      })
    }

    const currency = [...currencyVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD'
    return {
      available: true,
      clients,
      currency,
      priceAvailable: [...pricingByPlan.values()].some((plan) => plan.monthlyPrice !== null),
      truncated: clientsResult.truncated || subscriptionsResult.truncated,
      generatedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('[Aurelia] Error consultando el CRM:', error)
    return { available: false, message: error instanceof Error ? `No se pudo consultar el CRM de Aurelia: ${error.message}` : 'No se pudo consultar el CRM de Aurelia.' }
  }
}
