import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { getGoogleAccountMetrics } from '@/lib/google-ads/service'
import { getMetaAccountMetrics } from '@/lib/meta-ads/service'
import { updateAdvertisingAccountName } from '@/lib/ai/repositories/advertising-account-repository'

type Platform = 'google' | 'meta'
type Account = { id: string; cliente_id: string; plataforma: Platform; id_cuenta: string; nombre_cuenta: string | null; moneda: string | null; zona_horaria: string | null }
export type SyncOptions = { mode?: 'daily' | 'backfill'; dateFrom?: string; dateTo?: string; clientId?: string; accountId?: string; advertisingAccountId?: string; dryRun?: boolean }
export type SyncStatus = 'completed' | 'no_delivery' | 'normalization_empty' | 'partial' | 'failed' | 'payload_invalid' | 'sync_not_executed'
export type PersistenceError = { platform: Platform; account_id: string; date: string; stage: 'persistence' | 'payload_validation'; error_code: string; error_message: string; error_details: string; error_hint: string; validation_errors?: Array<Record<string, unknown>>; sample_row?: Record<string, unknown> }
export type SyncWindowDiagnostic = { platform: Platform; account_id: string; date_from: string; date_to: string; status: SyncStatus; api_rows_received: number; normalized_rows: number; validated_rows: number; rows_upserted: number; errors: string[]; persistence_errors?: PersistenceError[]; raw_sample?: Record<string, unknown>[] }
export type SyncResult = { mode: string; date_from: string; date_to: string; status: SyncStatus; reason?: string; error_code?: string; processed: number; upserted: number; failed: number; skipped: number; api_rows_received: number; normalized_rows: number; rows_upserted: number; windows_processed: number; windows_with_data: number; windows_without_data: number; errors: string[]; persistence_errors: PersistenceError[]; windows: SyncWindowDiagnostic[] }

const iso = (date: Date) => date.toISOString().slice(0, 10)
function range(options: SyncOptions) { const end = options.dateTo ?? iso(new Date()); const start = options.dateFrom ?? (options.mode === 'backfill' ? iso(new Date(Date.now() - 89 * 86400000)) : iso(new Date(Date.now() - 2 * 86400000))); return { start, end } }
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)) }
function safeRawSample(rows: unknown[]) {
  const secret = /token|secret|password|authorization|cookie|credential|access_key|refresh/i
  return rows.slice(0, 3).map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([key]) => !secret.test(key)).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 240) : value])))
}
function persistenceCode(error: { code?: string; message?: string }) {
  if (error.code === '23502') return 'NOT_NULL_VIOLATION'
  if (error.code === '23503') return 'FOREIGN_KEY_VIOLATION'
  if (error.code === '23505') return 'UNIQUE_VIOLATION'
  if (error.code === '23514') return 'CHECK_VIOLATION'
  if (error.code === '42501') return 'RLS_DENIED / PERMISSION_DENIED'
  return error.code ?? 'UNKNOWN_PERSISTENCE_ERROR'
}
function invalidRowFields(row: Record<string, unknown>) {
  const required = ['client_id', 'platform', 'account_id', 'campaign_id', 'metric_date', 'result_type']
  const numeric = ['spend', 'impressions', 'clicks', 'results']
  return [...required.filter((key) => row[key] === undefined || row[key] === null || row[key] === ''), ...numeric.filter((key) => { const value = row[key]; return value === undefined || (typeof value !== 'number' || !Number.isFinite(value)) })]
}
function normalizeOptional(value: unknown) { return value === undefined ? null : value }
function invalidFieldDetails(row: Record<string, unknown>, rowIndex: number) {
  return invalidRowFields(row).map((field) => ({ row_index: rowIndex, field, value_type: row[field] === null ? 'null' : typeof row[field], campaign_id: row.campaign_id ?? null, campaign_name: row.campaign_name ?? null, value: row[field] }))
}
function sampleRow(row: Record<string, unknown>) {
  const keys = ['client_id', 'advertising_account_id', 'platform', 'account_id', 'metric_date', 'campaign_id', 'campaign_name', 'campaign_type', 'campaign_objective', 'result_type', 'currency', 'spend', 'impressions', 'clicks', 'results', 'leads', 'conversions']
  return Object.fromEntries(keys.map((key) => [key, row[key] ?? null]))
}
async function retry<T>(work: () => Promise<T>) { let last: unknown; for (let attempt = 0; attempt < 3; attempt++) { try { return await work() } catch (error) { last = error; if (attempt < 2) await sleep(250 * 2 ** attempt) } } throw last }

function rowsForAccount(account: Account, metrics: any, date: string) {
  if (account.plataforma === 'google') return metrics.campaigns.map((campaign: any) => ({ client_id: account.cliente_id, platform: 'google', account_id: account.id_cuenta.replace(/-/g, ''), account_name: account.nombre_cuenta, metric_date: date, campaign_id: campaign.id, campaign_name: normalizeOptional(campaign.name), campaign_type: normalizeOptional(campaign.advertising_channel_type), campaign_objective: null, result_type: 'lead', currency: normalizeOptional(account.moneda ?? 'ARS'), spend: campaign.spend, impressions: campaign.impressions, clicks: campaign.clicks, leads: normalizeOptional(campaign.leads), conversions: normalizeOptional(campaign.leads), ctr: normalizeOptional(campaign.ctr), cpc: normalizeOptional(campaign.cpc), cost_per_result: normalizeOptional(campaign.cpl), source: 'google_ads' }))
  return metrics.campaigns.map((campaign: any) => ({ client_id: account.cliente_id, platform: 'meta', account_id: account.id_cuenta.replace(/^act_/, ''), account_name: normalizeOptional(account.nombre_cuenta), metric_date: date, campaign_id: campaign.id, campaign_name: normalizeOptional(campaign.name), campaign_type: null, campaign_objective: normalizeOptional(campaign.objective), result_type: campaign.result_type, currency: normalizeOptional(account.moneda ?? 'ARS'), spend: campaign.spend, impressions: campaign.impressions, clicks: campaign.clicks, leads: campaign.result_type === 'lead' ? campaign.results : 0, conversions: normalizeOptional(campaign.results), ctr: normalizeOptional(campaign.ctr), cpc: normalizeOptional(campaign.cpc), cost_per_result: normalizeOptional(campaign.cost_per_result), source: 'meta_ads' }))
}

export async function runPaidMediaSync(options: SyncOptions = {}): Promise<SyncResult> {
  const { start, end } = range(options); const db = createAdminClient(); const result: SyncResult = { mode: options.mode ?? 'daily', date_from: start, date_to: end, status: 'completed', processed: 0, upserted: 0, failed: 0, skipped: 0, api_rows_received: 0, normalized_rows: 0, rows_upserted: 0, windows_processed: 0, windows_with_data: 0, windows_without_data: 0, errors: [], persistence_errors: [], windows: [] }
  let query = db.from('cuentas_publicitarias').select('id, cliente_id, plataforma, id_cuenta, nombre_cuenta, moneda, zona_horaria').eq('activo', true)
  if (options.clientId) query = query.eq('cliente_id', options.clientId)
  if (options.advertisingAccountId) query = query.eq('id', options.advertisingAccountId)
  else if (options.accountId) query = query.eq('id_cuenta', options.accountId)
  const { data: accounts, error } = await query
  if (error) throw new Error(`No se pudieron cargar cuentas: ${error.message}`)
  if (!accounts?.length) return { ...result, status: 'sync_not_executed', reason: 'La cuenta publicitaria no pudo resolverse.', error_code: 'account_not_found' }
  console.log('[paid-media-backfill]', { advertising_account_id: options.advertisingAccountId ?? null, platform: accounts[0].plataforma, external_account_id: accounts[0].id_cuenta, days: Math.max(0, Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000) + 1), dry_run: options.dryRun === true })
  const requestedDays = Math.max(0, Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000) + 1)
  const generatedWindows = requestedDays > 0 ? requestedDays : 0
  if (requestedDays > 0 && generatedWindows === 0) return { ...result, status: 'sync_not_executed', reason: 'No se generaron ventanas para el período.', error_code: 'no_windows_generated' }
  console.log('[paid-media-backfill]', { advertising_account_id: options.advertisingAccountId ?? null, windows_generated: generatedWindows })
  for (let cursor = new Date(`${start}T00:00:00Z`); iso(cursor) <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = iso(cursor)
    for (let offset = 0; offset < (accounts ?? []).length; offset += 3) {
      const batch = (accounts ?? []).slice(offset, offset + 3) as Account[]
      await Promise.all(batch.map(async (account) => { result.processed++; console.log('[paid-media-backfill]', { platform: account.plataforma, account_id: account.id, external_account_id: account.id_cuenta, date_from: date, date_to: date, request_started: true })
        try {
          const metrics: any = account.plataforma === 'google'
            ? await retry<any>(() => getGoogleAccountMetrics({ customerId: account.id_cuenta, accountName: account.nombre_cuenta, dateFrom: date, dateTo: date }))
            : await retry<any>(() => getMetaAccountMetrics({ accountId: account.id_cuenta, accountName: account.nombre_cuenta, moneda: account.moneda, zonaHoraria: account.zona_horaria, dateFrom: date, dateTo: date }))
          const rows = rowsForAccount(account, metrics, date)
          const apiRows = Number(metrics.api_rows_received ?? 0)
          const windowStatus: SyncStatus = apiRows === 0 ? 'no_delivery' : rows.length === 0 ? 'normalization_empty' : 'completed'
          const diagnostic: SyncWindowDiagnostic = { platform: account.plataforma, account_id: account.id_cuenta, date_from: date, date_to: date, status: windowStatus, api_rows_received: apiRows, normalized_rows: rows.length, validated_rows: options.dryRun ? 0 : rows.length, rows_upserted: 0, errors: [] }
          if (options.dryRun && apiRows > 0 && rows.length === 0 && process.env.NODE_ENV !== 'production') diagnostic.raw_sample = safeRawSample(Array.isArray(metrics.raw_rows) ? metrics.raw_rows : [])
          result.windows.push(diagnostic); result.windows_processed++; result.api_rows_received += apiRows; result.normalized_rows += rows.length
          if (apiRows > 0) result.windows_with_data++; else result.windows_without_data++
          if (!options.dryRun && rows.length) {
            const invalidFields = rows.flatMap((row: Record<string, unknown>, index: number) => invalidFieldDetails(row, index))
            diagnostic.validated_rows = rows.length - new Set(invalidFields.map((item: { row_index: number }) => item.row_index)).size
            if (invalidFields.length) { diagnostic.status = 'payload_invalid' as SyncStatus; diagnostic.validated_rows = 0; diagnostic.errors = ['Payload inválido antes del upsert.']; throw Object.assign(new Error('Payload inválido antes del upsert.'), { code: 'PAYLOAD_INVALID', details: JSON.stringify(invalidFields), validation_errors: invalidFields as Array<Record<string, unknown>> }) }
            const write = await db.from('paid_media_daily_metrics').upsert(rows, { onConflict: 'client_id,platform,account_id,campaign_id,metric_date' })
            if (write.error) {
              const error = write.error
              const persistence = { platform: account.plataforma, account_id: account.id_cuenta, date, stage: 'persistence' as const, error_code: persistenceCode(error), error_message: error.message ?? '', error_details: error.details ?? '', error_hint: error.hint ?? '', sample_row: sampleRow(rows[0]) }
              console.error('[daily-metrics-upsert-error]', { platform: account.plataforma, accountId: account.id_cuenta, date, rowsCount: rows.length, supabase: { code: error.code, message: error.message, details: error.details, hint: error.hint }, sampleRow: persistence.sample_row })
              result.persistence_errors.push(persistence)
              const diagnostic = result.windows[result.windows.length - 1]
              if (diagnostic) { diagnostic.status = 'failed'; diagnostic.rows_upserted = 0; diagnostic.persistence_errors = [persistence]; diagnostic.errors = [persistence.error_message] }
              throw Object.assign(new Error(persistence.error_message), { code: persistence.error_code, details: persistence.error_details, hint: persistence.error_hint })
            }
          }
          if (!options.dryRun) { diagnostic.rows_upserted = rows.length; result.rows_upserted += rows.length; result.upserted += rows.length }
          if (account.nombre_cuenta === null && !options.dryRun) await updateAdvertisingAccountName(db, { clienteId: account.cliente_id, plataforma: account.plataforma, idCuenta: account.id_cuenta, nombreCuenta: metrics.account_name ?? account.id_cuenta, moneda: metrics.moneda, zonaHoraria: metrics.zona_horaria })
        } catch (error) { const raw = error as { code?: string; message?: string; details?: string; hint?: string; validation_errors?: Array<Record<string, unknown>> }; const message = `${account.plataforma}:${account.id_cuenta}:${date} ${raw.message?.slice(0, 240) ?? 'error'}`; result.failed++; const existing = result.persistence_errors.find((item) => item.platform === account.plataforma && item.account_id === account.id_cuenta && item.date === date); if (!existing) { const persistence = { platform: account.plataforma, account_id: account.id_cuenta, date, stage: raw.code === 'PAYLOAD_INVALID' ? 'payload_validation' as const : 'persistence' as const, error_code: persistenceCode(raw), error_message: raw.message ?? 'Error durante la sincronización.', error_details: raw.details ?? '', error_hint: raw.hint ?? '', validation_errors: raw.validation_errors }; result.persistence_errors.push(persistence) } if (!existing) result.windows.push({ platform: account.plataforma, account_id: account.id_cuenta, date_from: date, date_to: date, status: 'failed', api_rows_received: 0, normalized_rows: 0, validated_rows: 0, rows_upserted: 0, errors: [message], persistence_errors: [result.persistence_errors[result.persistence_errors.length - 1]] }); result.errors.push(message) }
      }))
    }
  }
  result.status = result.windows_processed === 0 ? 'sync_not_executed' : result.failed === result.windows_processed && result.persistence_errors.some((error) => error.stage === 'payload_validation') ? 'payload_invalid' : result.failed === result.windows_processed && result.windows_with_data > 0 ? 'failed' : result.failed > 0 ? (result.rows_upserted > 0 ? 'partial' : 'failed') : result.api_rows_received === 0 ? 'no_delivery' : result.normalized_rows === 0 ? 'normalization_empty' : 'completed'
  if (result.status === 'sync_not_executed') { result.reason = 'La sincronización no llegó a ejecutarse.'; result.error_code = 'sync_not_executed' }
  return result
}

export async function runDailyPaidMediaSync(options: Omit<SyncOptions, 'mode'> = {}) { return runPaidMediaSync({ ...options, mode: 'daily' }) }
export async function runBackfillPaidMedia(options: Omit<SyncOptions, 'mode'> = {}) { return runPaidMediaSync({ ...options, mode: 'backfill' }) }
