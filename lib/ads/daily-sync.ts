import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { getGoogleAccountMetrics } from '@/lib/google-ads/service'
import { getMetaAccountMetrics } from '@/lib/meta-ads/service'
import { updateAdvertisingAccountName } from '@/lib/ai/repositories/advertising-account-repository'

type Platform = 'google' | 'meta'
type Account = { id: string; cliente_id: string; plataforma: Platform; id_cuenta: string; nombre_cuenta: string | null; moneda: string | null; zona_horaria: string | null }
export type SyncOptions = { mode?: 'daily' | 'backfill'; dateFrom?: string; dateTo?: string; clientId?: string; accountId?: string; dryRun?: boolean }
export type SyncResult = { mode: string; date_from: string; date_to: string; processed: number; upserted: number; failed: number; skipped: number; errors: string[] }

const iso = (date: Date) => date.toISOString().slice(0, 10)
function range(options: SyncOptions) { const end = options.dateTo ?? iso(new Date()); const start = options.dateFrom ?? (options.mode === 'backfill' ? iso(new Date(Date.now() - 89 * 86400000)) : iso(new Date(Date.now() - 2 * 86400000))); return { start, end } }
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)) }
async function retry<T>(work: () => Promise<T>) { let last: unknown; for (let attempt = 0; attempt < 3; attempt++) { try { return await work() } catch (error) { last = error; if (attempt < 2) await sleep(250 * 2 ** attempt) } } throw last }

function rowsForAccount(account: Account, metrics: any, date: string) {
  if (account.plataforma === 'google') return metrics.campaigns.map((campaign: any) => ({ client_id: account.cliente_id, platform: 'google', account_id: account.id_cuenta.replace(/-/g, ''), account_name: account.nombre_cuenta, metric_date: date, campaign_id: campaign.id, campaign_name: campaign.name, campaign_type: campaign.advertising_channel_type, campaign_objective: null, result_type: 'lead', currency: account.moneda ?? 'ARS', spend: campaign.spend, impressions: campaign.impressions, clicks: campaign.clicks, leads: campaign.leads, conversions: campaign.leads, ctr: campaign.ctr, cpc: campaign.cpc, cost_per_result: campaign.cpl, source: 'google_ads' }))
  return metrics.campaigns.map((campaign: any) => ({ client_id: account.cliente_id, platform: 'meta', account_id: account.id_cuenta.replace(/^act_/, ''), account_name: account.nombre_cuenta, metric_date: date, campaign_id: campaign.id, campaign_name: campaign.name, campaign_type: null, campaign_objective: campaign.objective, result_type: campaign.result_type, currency: account.moneda ?? 'ARS', spend: campaign.spend, impressions: campaign.impressions, clicks: campaign.clicks, leads: campaign.result_type === 'lead' ? campaign.results : 0, conversions: campaign.results, ctr: campaign.ctr, cpc: campaign.cpc, cost_per_result: campaign.cost_per_result, source: 'meta_ads' }))
}

export async function runPaidMediaSync(options: SyncOptions = {}): Promise<SyncResult> {
  const { start, end } = range(options); const db = createAdminClient(); const result: SyncResult = { mode: options.mode ?? 'daily', date_from: start, date_to: end, processed: 0, upserted: 0, failed: 0, skipped: 0, errors: [] }
  let query = db.from('cuentas_publicitarias').select('id, cliente_id, plataforma, id_cuenta, nombre_cuenta, moneda, zona_horaria').eq('activo', true)
  if (options.clientId) query = query.eq('cliente_id', options.clientId)
  if (options.accountId) query = query.eq('id_cuenta', options.accountId.replace(/^act_/, ''))
  const { data: accounts, error } = await query
  if (error) throw new Error(`No se pudieron cargar cuentas: ${error.message}`)
  for (let cursor = new Date(`${start}T00:00:00Z`); iso(cursor) <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = iso(cursor)
    for (let offset = 0; offset < (accounts ?? []).length; offset += 3) {
      const batch = (accounts ?? []).slice(offset, offset + 3) as Account[]
      await Promise.all(batch.map(async (account) => { result.processed++
        try {
          const metrics: any = account.plataforma === 'google'
            ? await retry<any>(() => getGoogleAccountMetrics({ customerId: account.id_cuenta, accountName: account.nombre_cuenta, dateFrom: date, dateTo: date }))
            : await retry<any>(() => getMetaAccountMetrics({ accountId: account.id_cuenta, accountName: account.nombre_cuenta, moneda: account.moneda, zonaHoraria: account.zona_horaria, dateFrom: date, dateTo: date }))
          const rows = rowsForAccount(account, metrics, date)
          if (!options.dryRun && rows.length) { const write = await db.from('paid_media_daily_metrics').upsert(rows, { onConflict: 'client_id,platform,account_id,campaign_id,metric_date' }); if (write.error) throw write.error }
          result.upserted += rows.length
          if (account.nombre_cuenta === null && !options.dryRun) await updateAdvertisingAccountName(db, { clienteId: account.cliente_id, plataforma: account.plataforma, idCuenta: account.id_cuenta, nombreCuenta: metrics.account_name ?? account.id_cuenta, moneda: metrics.moneda, zonaHoraria: metrics.zona_horaria })
        } catch (error) { result.failed++; result.errors.push(`${account.plataforma}:${account.id_cuenta}:${date} ${error instanceof Error ? error.message.slice(0, 240) : 'error'}`) }
      }))
    }
  }
  return result
}

export async function runDailyPaidMediaSync(options: Omit<SyncOptions, 'mode'> = {}) { return runPaidMediaSync({ ...options, mode: 'daily' }) }
export async function runBackfillPaidMedia(options: Omit<SyncOptions, 'mode'> = {}) { return runPaidMediaSync({ ...options, mode: 'backfill' }) }
