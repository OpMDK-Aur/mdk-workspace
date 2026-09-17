import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { getToolDefinitions } from '@/lib/ai/tools'
import type { ExecutionContext } from '@/lib/ai/types'

export const maxDuration = 60

const toISODate = (date: Date) => date.toISOString().slice(0, 10)

// El selector de período de la UI ofrece opciones de texto libre ("Hoy",
// "Ayer", "Últimos 7 días", "Este mes", "Mes anterior", "Personalizado") que
// no siempre contienen un número parseable. Antes, cualquier período sin un
// dígito (p. ej. "Ayer") caía al default de 30 días, inflando las métricas
// ~30x contra lo que se ve en Meta/Google Ads para ese mismo día.
function dateRange(period: string, customRange?: { from?: string; to?: string }) {
  const today = new Date()
  const normalized = period.trim().toLowerCase()

  if (normalized === 'personalizado' && customRange?.from && customRange?.to) {
    return { dateFrom: customRange.from, dateTo: customRange.to }
  }
  if (normalized === 'hoy') {
    return { dateFrom: toISODate(today), dateTo: toISODate(today) }
  }
  if (normalized === 'ayer') {
    const yesterday = new Date(today)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    return { dateFrom: toISODate(yesterday), dateTo: toISODate(yesterday) }
  }
  if (normalized === 'este mes') {
    const from = new Date(today.getUTCFullYear(), today.getUTCMonth(), 1)
    return { dateFrom: toISODate(from), dateTo: toISODate(today) }
  }
  if (normalized === 'mes anterior') {
    const from = new Date(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
    const to = new Date(today.getUTCFullYear(), today.getUTCMonth(), 0)
    return { dateFrom: toISODate(from), dateTo: toISODate(to) }
  }
  const match = normalized.match(/(\d+)/)
  const days = match ? Number(match[1]) : 30
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - days + 1)
  return { dateFrom: toISODate(from), dateTo: toISODate(today) }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  const body = await request.json() as { clientId?: string; period?: string; customRange?: { from?: string; to?: string }; selectedAccounts?: Record<string, string[]> }
  if (!body.clientId) return NextResponse.json({ error: 'Falta el cliente seleccionado.' }, { status: 400 })
  const range = dateRange(body.period ?? 'Últimos 30 días', body.customRange)
  const [{ data: client }, { data: accounts }] = await Promise.all([
    admin.from('clientes').select('meta_ads_account_id, google_ads_customer_id, analytics_property_id').eq('id', body.clientId).maybeSingle(),
    admin.from('cuentas_publicitarias').select('id_cuenta, plataforma').eq('cliente_id', body.clientId).eq('activo', true),
  ])
  const selectedMeta = body.selectedAccounts?.meta
  const selectedGoogle = body.selectedAccounts?.google
  // `cuentas_publicitarias.id_cuenta` puede almacenar varias cuentas en un
  // mismo registro como un string separado por comas. Hay que separarlas
  // antes de comparar contra la selección individual del usuario en la UI;
  // comparar el string completo nunca matchea y hacía que el filtro
  // quedara vacío y cayera al fallback de "todas las cuentas del cliente".
  const splitIds = (value: string) => value.split(',').map((id) => id.trim()).filter(Boolean)
  const metaIds = (accounts ?? []).filter((account) => account.plataforma === 'meta').flatMap((account) => splitIds(account.id_cuenta))
  const googleIds = (accounts ?? []).filter((account) => account.plataforma === 'google').flatMap((account) => splitIds(account.id_cuenta).map((id) => id.replace(/-/g, '')))
  const accountIds = (selectedMeta === undefined ? metaIds : metaIds.filter((id) => selectedMeta.includes(id))).join(',')
  const customerIds = [...new Set(selectedGoogle === undefined ? googleIds : googleIds.filter((id) => selectedGoogle.includes(id)))].join(',')
  const context: ExecutionContext = { userId: user?.id ?? 'conexa-prototype', userEmail: user?.email ?? undefined, clientId: body.clientId, metaAccountId: accountIds || client?.meta_ads_account_id || undefined, googleCustomerId: customerIds || client?.google_ads_customer_id || undefined, analyticsPropertyId: client?.analytics_property_id || undefined }
  const tools = getToolDefinitions(['get_meta_metrics', 'get_google_metrics', 'get_google_analytics_report', 'get_google_tag_manager_report', 'crm_contacts', 'crm_opportunities', 'crm_sales_attribution', 'get_client_memory'])
  const byKey = new Map(tools.map((tool) => [tool.key, tool]))
  const run = (key: string, input: Record<string, string> = {}) => byKey.get(key)?.execute({ ...range, ...input }, context).catch((error) => ({ available: false, message: error instanceof Error ? error.message : `Falló la tool ${key}.` })) ?? Promise.resolve({ available: false, message: `Tool ${key} no disponible.` })

  const [meta, google, analytics, tagManager, contacts, opportunities, sales, memory] = await Promise.all([
    run('get_meta_metrics'), run('get_google_metrics'), run('get_google_analytics_report'), run('get_google_tag_manager_report'), run('crm_contacts'), run('crm_opportunities'), run('crm_sales_attribution'), run('get_client_memory'),
  ])
  const number = (value: unknown) => typeof value === 'number' ? value : Number(value) || 0
  const total = (source: unknown, keys: string[]) => {
    if (!source || typeof source !== 'object') return 0
    const root = source as Record<string, unknown>
    const totals = root.totals
    if (totals && typeof totals === 'object') {
      return keys.reduce((sum, key) => sum + number((totals as Record<string, unknown>)[key]), 0)
    }
    let result = 0
    const visit = (value: unknown, isRoot = false) => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (keys.includes(key) && (isRoot || !Array.isArray(value))) result += number(child)
        if (child && typeof child === 'object' && !Array.isArray(child)) visit(child)
      }
    }
    visit(source, true)
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
  const tagManagerContainers = (tagManager && typeof tagManager === 'object' && Array.isArray((tagManager as { containers?: unknown }).containers) ? (tagManager as { containers: Array<Record<string, unknown>> }).containers : [])
  const platformMetrics = {
    meta: [{ label: 'Inversión', value: total(meta, ['spend', 'cost', 'investment']) }, { label: 'Impresiones', value: total(meta, ['impressions']) }, { label: 'Clicks', value: total(meta, ['clicks']) }, { label: 'Resultados', value: total(meta, ['results', 'conversions', 'leads']) }],
    google: [{ label: 'Inversión', value: total(google, ['spend', 'cost', 'investment']) }, { label: 'Impresiones', value: total(google, ['impressions']) }, { label: 'Clicks', value: total(google, ['clicks']) }, { label: 'Conversiones', value: total(google, ['conversions', 'results']) }],
    analytics: [{ label: 'Usuarios', value: total(analytics, ['users', 'activeUsers']) }, { label: 'Sesiones', value: total(analytics, ['sessions']) }, { label: 'Eventos', value: total(analytics, ['eventCount', 'events']) }, { label: 'Conversiones', value: total(analytics, ['conversions']) }],
    tag_manager: [{ label: 'Etiquetas', value: tagManagerContainers.reduce((sum, container) => sum + Number((container.diagnostics as Record<string, unknown> | undefined)?.totalTags ?? 0), 0) }, { label: 'Activadores', value: tagManagerContainers.reduce((sum, container) => sum + Number((container.diagnostics as Record<string, unknown> | undefined)?.totalTriggers ?? 0), 0) }, { label: 'Variables', value: tagManagerContainers.reduce((sum, container) => sum + Number((container.diagnostics as Record<string, unknown> | undefined)?.totalVariables ?? 0), 0) }],
    crm: [{ label: 'Contactos', value: crmTotals(contacts, 'contacts') }, { label: 'Oportunidades', value: crmTotals(opportunities, 'opportunities') }, { label: 'Ventas', value: crmTotals(sales, 'won_sales') }],
  }
  return NextResponse.json({ range, metrics, platformMetrics, meta, google, analytics, tagManager, contacts, opportunities, sales, memory })
}
