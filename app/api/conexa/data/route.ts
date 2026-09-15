import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { getToolDefinitions } from '@/lib/ai/tools'
import type { ExecutionContext } from '@/lib/ai/types'

export const maxDuration = 60

function dateRange(period: string) {
  const match = period.match(/(7|30|90)/)
  const days = match ? Number(match[1]) : 30
  const to = new Date()
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - days + 1)
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  const body = await request.json() as { clientId?: string; period?: string; selectedAccounts?: Record<string, string[]> }
  if (!body.clientId) return NextResponse.json({ error: 'Falta el cliente seleccionado.' }, { status: 400 })
  const range = dateRange(body.period ?? 'Últimos 30 días')
  const [{ data: client }, { data: accounts }] = await Promise.all([
    admin.from('clientes').select('meta_ads_account_id, google_ads_customer_id, analytics_property_id').eq('id', body.clientId).maybeSingle(),
    admin.from('cuentas_publicitarias').select('id_cuenta, plataforma').eq('cliente_id', body.clientId).eq('activo', true),
  ])
  const selectedMeta = body.selectedAccounts?.meta
  const selectedGoogle = body.selectedAccounts?.google
  const accountIds = (accounts ?? []).filter((account) => account.plataforma === 'meta' && (selectedMeta === undefined || selectedMeta.includes(account.id_cuenta))).map((account) => account.id_cuenta).filter(Boolean).join(',')
  const customerIds = (accounts ?? []).filter((account) => account.plataforma === 'google' && (selectedGoogle === undefined || selectedGoogle.includes(account.id_cuenta))).map((account) => account.id_cuenta).filter(Boolean).join(',')
  const context: ExecutionContext = { userId: user?.id ?? 'conexa-prototype', userEmail: user?.email ?? undefined, clientId: body.clientId, metaAccountId: accountIds || client?.meta_ads_account_id || undefined, googleCustomerId: customerIds || client?.google_ads_customer_id || undefined, analyticsPropertyId: client?.analytics_property_id || undefined }
  const tools = getToolDefinitions(['get_meta_metrics', 'get_google_metrics', 'get_google_analytics_report', 'crm_contacts', 'crm_opportunities', 'crm_sales_attribution', 'get_client_memory'])
  const byKey = new Map(tools.map((tool) => [tool.key, tool]))
  const run = (key: string, input: Record<string, string> = {}) => byKey.get(key)?.execute({ ...range, ...input }, context).catch((error) => ({ available: false, message: error instanceof Error ? error.message : `Falló la tool ${key}.` })) ?? Promise.resolve({ available: false, message: `Tool ${key} no disponible.` })

  const [meta, google, analytics, contacts, opportunities, sales, memory] = await Promise.all([
    run('get_meta_metrics'), run('get_google_metrics'), run('get_google_analytics_report'), run('crm_contacts'), run('crm_opportunities'), run('crm_sales_attribution'), run('get_client_memory'),
  ])
  const number = (value: unknown) => typeof value === 'number' ? value : Number(value) || 0
  const total = (source: unknown, keys: string[]) => {
    let result = 0
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (keys.includes(key)) result += number(child)
        if (child && typeof child === 'object') visit(child)
      }
    }
    visit(source)
    return result
  }
  const crmTotals = (source: unknown, key: string) => {
    if (!source || typeof source !== 'object') return 0
    const totals = (source as { totals?: Record<string, unknown> }).totals
    return number(totals?.[key])
  }
  const metrics = [{
    spend: total(meta, ['spend', 'cost', 'investment']) + total(google, ['spend', 'cost', 'investment']),
    impressions: total(meta, ['impressions']) + total(google, ['impressions']),
    clicks: total(meta, ['clicks']) + total(google, ['clicks']),
    visits: total(analytics, ['sessions', 'visits']),
    contacts: crmTotals(contacts, 'contacts'),
    opportunities: crmTotals(opportunities, 'opportunities'),
    sales: crmTotals(sales, 'won_sales'),
  }]
  const platformMetrics = {
    meta: [{ label: 'Inversión', value: total(meta, ['spend', 'cost', 'investment']) }, { label: 'Impresiones', value: total(meta, ['impressions']) }, { label: 'Clicks', value: total(meta, ['clicks']) }, { label: 'Resultados', value: total(meta, ['results', 'conversions', 'leads']) }],
    google: [{ label: 'Inversión', value: total(google, ['spend', 'cost', 'investment']) }, { label: 'Impresiones', value: total(google, ['impressions']) }, { label: 'Clicks', value: total(google, ['clicks']) }, { label: 'Conversiones', value: total(google, ['conversions', 'results']) }],
    analytics: [{ label: 'Usuarios', value: total(analytics, ['users', 'activeUsers']) }, { label: 'Sesiones', value: total(analytics, ['sessions']) }, { label: 'Eventos', value: total(analytics, ['eventCount', 'events']) }, { label: 'Conversiones', value: total(analytics, ['conversions']) }],
    crm: [{ label: 'Contactos', value: crmTotals(contacts, 'contacts') }, { label: 'Oportunidades', value: crmTotals(opportunities, 'opportunities') }, { label: 'Ventas', value: crmTotals(sales, 'won_sales') }],
  }
  return NextResponse.json({ range, metrics, platformMetrics, meta, google, analytics, contacts, opportunities, sales, memory })
}
