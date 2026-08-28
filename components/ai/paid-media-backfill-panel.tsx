'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Database, Loader2, Play, ShieldCheck, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Account = { id: string; plataforma: 'meta' | 'google'; id_cuenta: string; nombre_cuenta: string; activo?: boolean | null }
type BackfillStatus = 'completed' | 'no_delivery' | 'normalization_empty' | 'partial' | 'failed' | 'payload_invalid' | 'sync_not_executed'
type InvalidField = { row_index: number; field: string; reason?: string; value_type: string; campaign_id?: unknown; campaign_name?: unknown; value?: unknown }
type PersistenceError = { platform: string; account_id: string; date: string; stage: 'persistence' | 'payload_validation'; error_code: string; error_message: string; error_details: string; error_hint: string; validation_errors?: InvalidField[]; sample_row?: Record<string, unknown> }
type BackfillResult = { status?: BackfillStatus; reason?: string; error_code?: string; mode?: string; date_from?: string; date_to?: string; processed?: number; upserted?: number; failed?: number; skipped?: number; api_rows_received?: number; normalized_rows?: number; rows_upserted?: number; windows_processed?: number; windows_with_data?: number; windows_without_data?: number; errors?: string[]; persistence_errors?: PersistenceError[]; windows?: Array<{ platform: string; account_id: string; date_from: string; date_to: string; status: BackfillStatus; api_rows_received: number; normalized_rows: number; validated_rows: number; rows_upserted: number; errors: string[]; persistence_errors?: PersistenceError[]; raw_sample?: Record<string, unknown>[] }>; rows?: Record<string, unknown>[] }

const periods = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
] as const

const sampleColumns = ['metric_date', 'campaign_name', 'campaign_type', 'campaign_objective', 'result_type', 'currency', 'spend', 'impressions', 'clicks', 'results', 'leads', 'conversions'] as const

function platformLabel(value: Account['plataforma']) { return value === 'google' ? 'Google Ads' : 'Meta Ads' }
function groupInvalidErrors(errors: PersistenceError[]) {
  const groups = new Map<string, { field: string; reason: string; windows: Set<string>; rows: number; samples: InvalidField[] }>()
  for (const error of errors) for (const field of error.validation_errors ?? []) {
    const key = `${field.field}:${field.reason ?? field.value_type}`
    const group = groups.get(key) ?? { field: field.field, reason: field.reason ?? field.value_type, windows: new Set<string>(), rows: 0, samples: [] }
    group.windows.add(error.date); group.rows += 1; if (group.samples.length < 5) group.samples.push(field); groups.set(key, group)
  }
  return [...groups.values()]
}

export function PaidMediaBackfillPanel({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [period, setPeriod] = useState<(typeof periods)[number]['value']>('7')
  const [dryRun, setDryRun] = useState(true)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<BackfillResult | null>(null)

  useEffect(() => {
    if (!open) return
    let mounted = true
    setLoadingAccounts(true)
    fetch(`/api/agentes/analista/cuentas?clientId=${encodeURIComponent(clientId)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('No se pudieron cargar las cuentas.')))
      .then((payload) => {
        if (!mounted) return
        const activeAccounts = (payload.cuentas ?? []).filter((account: Account) => account.activo !== false)
        setAccounts(activeAccounts)
        setAccountId((current) => activeAccounts.some((account: Account) => account.id === current) ? current : activeAccounts[0]?.id ?? '')
      })
      .catch((error) => { if (mounted) setMessage(error instanceof Error ? error.message : 'No se pudieron cargar las cuentas.') })
      .finally(() => { if (mounted) setLoadingAccounts(false) })
    return () => { mounted = false }
  }, [clientId, open])

  const selectedAccount = useMemo(() => accounts.find((account) => account.id === accountId) ?? null, [accounts, accountId])

  async function run() {
    if (!selectedAccount || submitting) return
    setSubmitting(true)
    setStatus('idle')
    setMessage('Consultando...')
    setResult(null)
    try {
      const response = await fetch('/api/admin/paid-media/backfill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, advertising_account_id: selectedAccount.id, days: Number(period), dryRun }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Error de sincronización')
      setResult(payload)
      setStatus('success')
      setMessage('Sincronización completada')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Error de sincronización')
    } finally { setSubmitting(false) }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 py-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><Database className="size-4 text-primary" aria-hidden="true" />Sincronizar histórico</CardTitle>
          <CardDescription>Probá o ejecutá el histórico de una cuenta publicitaria activa.</CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="gap-2">
          {open ? 'Ocultar' : 'Abrir'} <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </Button>
      </CardHeader>
      {open && <CardContent className="flex flex-col gap-4 border-t pt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="backfill-account">Cuenta publicitaria</Label>
            <Select value={accountId} onValueChange={setAccountId} disabled={loadingAccounts || submitting || accounts.length === 0}>
              <SelectTrigger id="backfill-account"><SelectValue placeholder={loadingAccounts ? 'Cargando cuentas...' : 'Seleccionar cuenta'} /></SelectTrigger>
              <SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.nombre_cuenta} · {platformLabel(account.plataforma)}</SelectItem>)}</SelectContent>
            </Select>
            {selectedAccount && <p className="text-xs text-muted-foreground">Cliente: {clientName} · Plataforma: {platformLabel(selectedAccount.plataforma)} · ID: {selectedAccount.id_cuenta}</p>}
            {!loadingAccounts && accounts.length === 0 && <p className="text-xs text-muted-foreground">No hay cuentas activas disponibles.</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="backfill-period">Período</Label>
            <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)} disabled={submitting}>
              <SelectTrigger id="backfill-period"><SelectValue /></SelectTrigger>
              <SelectContent>{periods.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground"><Checkbox checked={dryRun} onCheckedChange={(checked) => setDryRun(checked === true)} disabled={submitting} />Sólo probar, no guardar</label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={run} disabled={!selectedAccount || submitting} className="gap-2">
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : dryRun ? <Play className="size-4" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
            {submitting ? 'Consultando...' : dryRun ? 'Probar sincronización' : 'Ejecutar sincronización'}
          </Button>
          {message && <span role="status" className={cn('flex items-center gap-1.5 text-sm', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {status === 'success' ? <CheckCircle2 className="size-4" aria-hidden="true" /> : status === 'error' ? <XCircle className="size-4" aria-hidden="true" /> : null}{message}
          </span>}
        </div>
        {result && <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-2"><span>Estado: <strong>{result.status === 'no_delivery' ? 'Sin delivery en el período' : result.status === 'normalization_empty' ? 'La normalización descartó todos los registros' : result.status === 'payload_invalid' ? 'Payload inválido' : result.status === 'partial' ? 'Completado con errores parciales' : result.status === 'failed' ? 'Falló la consulta' : result.status === 'sync_not_executed' ? 'No se llegó a consultar la plataforma' : 'Completado con datos'}</strong></span><span>Período: <strong>{result.date_from} → {result.date_to}</strong></span></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><span>Filas recibidas desde plataforma: <strong>{result.api_rows_received ?? 0}</strong></span><span>Filas normalizadas: <strong>{result.normalized_rows ?? 0}</strong></span><span>Filas validadas: <strong>{result.windows?.reduce((sum, window) => sum + window.validated_rows, 0) ?? 0}</strong></span><span>{dryRun ? 'Filas que se guardarían' : 'Filas guardadas'}: <strong>{dryRun ? result.normalized_rows ?? 0 : result.rows_upserted ?? result.upserted ?? 0}</strong></span><span>Ventanas procesadas: <strong>{result.windows_processed ?? result.processed ?? 0}</strong></span><span>Ventanas con datos: <strong>{result.windows_with_data ?? 0}</strong></span><span>Ventanas sin datos: <strong>{result.windows_without_data ?? 0}</strong></span><span>Errores: <strong>{result.failed ?? 0}</strong></span></div>
          {result.reason && <p className="text-xs text-muted-foreground">{result.reason}{result.error_code ? ` (${result.error_code})` : ''}</p>}
        </div>}
        {!!result?.errors?.length && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p className="font-medium">Errores</p><ul className="mt-1 list-disc pl-5">{result.errors.slice(0, 3).map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul>{result.persistence_errors?.some((error) => error.stage === 'payload_validation') ? <div className="mt-3 flex flex-col gap-3">{groupInvalidErrors(result.persistence_errors.filter((error) => error.stage === 'payload_validation')).map((group) => <div key={`${group.field}-${group.reason}`} className="rounded border border-destructive/20 p-2 text-xs"><p className="font-medium">{group.field} = {group.reason}</p><p>{group.windows.size} ventanas afectadas · {group.rows} filas afectadas</p><p className="mt-1">Fechas: {[...group.windows].slice(0, 5).join(', ')}{group.windows.size > 5 ? '…' : ''}</p>{group.samples.map((field, index) => <p key={`${field.field}-${index}`} className="mt-1">Campo: {field.field} · Problema: {field.reason ?? field.value_type} · Campaña: {String(field.campaign_name ?? field.campaign_id ?? '—')} · fila {field.row_index}</p>)}</div>)}</div> : result.persistence_errors?.map((error, index) => <div key={`${error.date}-${index}`} className="mt-3 rounded border border-destructive/20 p-2 text-xs"><p><strong>{error.error_code}</strong> · {error.platform} · {error.account_id} · {error.date}</p><p>Mensaje: {error.error_message || '—'}</p><p>Detalles: {error.error_details || '—'}</p><p>Hint: {error.error_hint || '—'}</p></div>)}</div>}
        {dryRun && result?.rows?.length ? <div className="overflow-x-auto rounded-md border"><table className="min-w-[1100px] text-left text-xs"><thead className="bg-muted/50"><tr>{sampleColumns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">{column}</th>)}</tr></thead><tbody>{result.rows.slice(0, 10).map((row, index) => <tr key={index} className="border-t">{sampleColumns.map((column) => <td key={column} className="whitespace-nowrap px-3 py-2">{String(row[column] ?? '—')}</td>)}</tr>)}</tbody></table></div> : null}
        {dryRun && result && !result.rows?.length && <p className="text-xs text-muted-foreground">El endpoint actual no devuelve una muestra de filas; se muestra el resumen generado por la sincronización.</p>}
      </CardContent>}
    </Card>
  )
}
