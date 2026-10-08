'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { publishBulk, retryPublishRow } from '@/lib/bulk/api'
import { useBulkStore } from '@/lib/bulk/store'
import type { BulkAdset, BulkRow } from '@/lib/bulk/types'
import { validateRow } from '@/lib/bulk/validate'
import { Panel, StateBadge } from './bulk-shared'

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'amber' }) {
  return (
    <div className={cn('rounded-xl border bg-white p-4', tone === 'amber' ? 'border-[#f0d9b0]' : 'border-[#dcdcd8]')}>
      <p className="text-[11px] text-[#777]">{label}</p>
      <p className={cn('mt-1 text-[24px] font-bold tabular-nums', tone === 'amber' ? 'text-[#a86412]' : 'text-[#141414]')}>{value}</p>
    </div>
  )
}

function Check({ tone, children }: { tone: 'ok' | 'warn' | 'muted'; children: React.ReactNode }) {
  const mark = { ok: { symbol: '✓', className: 'bg-[#e8f6ef] text-[#1e7d55]' }, warn: { symbol: '!', className: 'bg-[#fdf3e1] text-[#a86412]' }, muted: { symbol: '•', className: 'bg-[#f0f0ed] text-[#888]' } }[tone]
  return (
    <li className="flex items-start gap-2.5 text-[12px] leading-relaxed text-[#333]">
      <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold', mark.className)} aria-hidden="true">{mark.symbol}</span>
      {children}
    </li>
  )
}

export function StepPublish({ clientId, adsets }: { clientId: string; adsets: BulkAdset[] }) {
  const rows = useBulkStore((state) => state.rows)
  const initialStatus = useBulkStore((state) => state.initialStatus)
  const setInitialStatus = useBulkStore((state) => state.setInitialStatus)
  const phase = useBulkStore((state) => state.publishPhase)
  const progress = useBulkStore((state) => state.publishProgress)
  const setPublishPhase = useBulkStore((state) => state.setPublishPhase)
  const updateRow = useBulkStore((state) => state.updateRow)
  const setStep = useBulkStore((state) => state.setStep)
  const reset = useBulkStore((state) => state.reset)
  const [retrying, setRetrying] = useState<string[]>([])
  const [publishTotal, setPublishTotal] = useState(0)

  const groups = useMemo(() => {
    const withState = rows.map((row) => ({ row, state: validateRow(row).state }))
    return {
      ready: withState.filter((item) => item.state === 'listo').map((item) => item.row),
      review: withState.filter((item) => item.state === 'revisar').length,
      drafts: withState.filter((item) => item.state === 'borrador').length,
      done: rows.filter((row) => row.status === 'done'),
      errors: rows.filter((row) => row.status === 'error'),
      files: rows.reduce((sum, row) => sum + row.assets.filter((asset) => !asset.pending).length, 0),
    }
  }, [rows])

  const byAdset = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of groups.ready) counts.set(row.adsetId, (counts.get(row.adsetId) ?? 0) + 1)
    return [...counts.entries()].map(([id, count]) => ({ name: adsets.find((adset) => adset.id === id)?.name ?? 'Sin conjunto asignado', count, missing: !id }))
  }, [groups.ready, adsets])

  const statusLabel = initialStatus === 'PAUSED' ? 'Pausados' : 'Activos'

  async function publish() {
    const batch: BulkRow[] = groups.ready
    if (!batch.length) return
    setPublishTotal(batch.length)
    setPublishPhase('publishing', 0)
    for (const row of batch) updateRow(row.id, { status: 'creating' })
    await publishBulk({
      clientId,
      rows: batch,
      initialStatus,
      onProgress: (event) => {
        updateRow(event.rowId, event.status === 'done' ? { status: 'done', metaAdId: event.metaAdId, error: undefined } : { status: 'error', error: event.error })
        setPublishPhase('publishing', event.index + 1)
      },
    })
    setPublishPhase('finished')
  }

  async function retry(row: BulkRow) {
    setRetrying((ids) => [...ids, row.id])
    updateRow(row.id, { status: 'creating' })
    const result = await retryPublishRow({ clientId, row, initialStatus })
    updateRow(row.id, { status: 'done', metaAdId: result.metaAdId, error: undefined })
    setRetrying((ids) => ids.filter((id) => id !== row.id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Anuncios a publicar" value={groups.ready.length} />
        <Stat label="Archivos" value={groups.files} />
        <Stat label="Para revisar" value={groups.review} tone={groups.review > 0 ? 'amber' : undefined} />
        <Stat label="En borrador" value={groups.drafts} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Destino">
          {byAdset.length ? (
            <ul className="flex flex-col divide-y divide-[#f0f0ed]">
              {byAdset.map((item) => (
                <li key={item.name} className="flex items-center justify-between py-2 text-[12px]">
                  <span className={cn('truncate', item.missing ? 'text-[#a86412]' : 'text-[#333]')}>{item.name}</span>
                  <span className="font-semibold tabular-nums text-[#141414]">{`${item.count} ${item.count === 1 ? 'anuncio' : 'anuncios'}`}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[12px] text-[#999]">No hay anuncios listos para publicar.</p>}
        </Panel>

        <Panel title={<>{'Controles de '}<span className="text-[#5B5FE8]">{'✦ Conexa'}</span></>}>
          <ul className="flex flex-col gap-2">
            <Check tone="ok">UTMs y nomenclatura aplicadas a todos los anuncios.</Check>
            <Check tone={byAdset.some((item) => item.missing) ? 'warn' : 'ok'}>
              {byAdset.some((item) => item.missing) ? 'Hay anuncios sin conjunto: no heredan dataset ni evento de conversión.' : 'Dataset y evento de conversión asignados desde cada conjunto.'}
            </Check>
            <Check tone={groups.review > 0 ? 'warn' : 'ok'}>{groups.review > 0 ? `${groups.review} ${groups.review === 1 ? 'anuncio necesita' : 'anuncios necesitan'} revisión de textos: no se publican.` : 'Textos principales y títulos completos.'}</Check>
            <Check tone="muted">{groups.drafts > 0 ? `${groups.drafts} ${groups.drafts === 1 ? 'borrador' : 'borradores'} sin archivo quedan fuera del lote.` : 'Sin borradores pendientes.'}</Check>
          </ul>
        </Panel>
      </div>

      <Panel title="Publicar en Meta Ads">
        {phase === 'finished' ? (
          <div className="flex flex-col gap-4">
            {groups.done.length > 0 && (
              <div className="rounded-lg border border-[#bfe5d2] bg-[#e8f6ef] p-4">
                <p className="text-[13px] font-semibold text-[#1e7d55]">{`✓ ${groups.done.length} ${groups.done.length === 1 ? 'anuncio creado' : 'anuncios creados'} en Meta Ads · ${statusLabel}`}</p>
                <p className="mt-1 text-pretty text-[12px] leading-relaxed text-[#2d6b4f]">Quedó registrado en el historial de Copiloto. Conexa mide el rendimiento del lote a 7 días y te avisa qué piezas escalar o pausar.</p>
              </div>
            )}
            {groups.errors.length > 0 && (
              <ul className="flex flex-col gap-2">
                {groups.errors.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#f3cccc] bg-[#fdf6f6] px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><StateBadge state="error" /><span className="truncate font-mono text-[11px] text-[#141414]">{row.baseName}</span></div>
                      <p className="mt-1 text-[11px] text-[#c23b3b]">{row.error}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={retrying.includes(row.id)} onClick={() => retry(row)} className="h-8 shrink-0 rounded-full border-[#dcdcd8] bg-white text-[11px] text-[#333] hover:bg-[#f5f5f3] hover:text-[#141414]">
                      {retrying.includes(row.id) ? 'Reintentando…' : 'Reintentar'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-4">
              <button type="button" onClick={reset} className="text-[12px] font-semibold text-[#5B5FE8] hover:underline">Nueva carga</button>
              {groups.ready.length > 0 && <button type="button" onClick={() => setPublishPhase('idle', 0)} className="text-[12px] font-semibold text-[#333] hover:underline">{`Publicar ${groups.ready.length} restantes`}</button>}
            </div>
          </div>
        ) : phase === 'publishing' ? (
          <div className="flex flex-col gap-2" role="status">
            <p className="text-[12px] text-[#333]">{`Creando anuncio ${Math.min(progress + 1, publishTotal)} de ${publishTotal}…`}</p>
            <Progress value={publishTotal ? (progress / publishTotal) * 100 : 0} className="h-2 bg-[#5B5FE8]/15 [&>[data-slot=progress-indicator]]:bg-[#5B5FE8]" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-[11px] font-medium text-[#777]">Estado inicial</p>
              <div role="radiogroup" aria-label="Estado inicial" className="inline-flex rounded-full border border-[#dcdcd8] bg-[#f5f5f3] p-0.5">
                {([['PAUSED', 'Pausado'], ['ACTIVE', 'Activo']] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={initialStatus === value} onClick={() => setInitialStatus(value)} className={cn('rounded-full px-4 py-1.5 text-[11.5px] font-medium', initialStatus === value ? 'bg-white text-[#141414] shadow-sm' : 'text-[#777]')}>
                    {value === 'PAUSED' ? `${label} (recomendado)` : label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-pretty text-[11.5px] leading-relaxed text-[#777]">
                {initialStatus === 'PAUSED' ? 'Los anuncios se crean pausados para que los revises en Ads Manager antes de que empiecen a gastar.' : 'Los anuncios empiezan a entregar apenas Meta los apruebe y consumen presupuesto del conjunto.'}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={() => setStep(2)} className="h-9 rounded-full border-[#dcdcd8] bg-white px-4 text-[11.5px] text-[#333] hover:bg-[#f5f5f3] hover:text-[#141414]">{'← Volver a configurar'}</Button>
              <Button size="sm" onClick={publish} disabled={!groups.ready.length} className="h-9 rounded-full bg-[#141414] px-5 text-[11.5px] text-white hover:bg-[#333]">
                {`Publicar ${groups.ready.length} ${groups.ready.length === 1 ? 'anuncio' : 'anuncios'}`}
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
