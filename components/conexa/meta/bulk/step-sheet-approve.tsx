'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBulkStore } from '@/lib/bulk/store'
import { uploadBulkAsset } from '@/lib/bulk/api'
import { executePlanAdRequest, writeSheetStatusRequest } from '@/lib/conexa/bulk/client'
import { buildExecuteRequest, driveFileUrl, primaryFile } from '@/lib/conexa/bulk/plan-rows'
import { resolvePlan } from '@/lib/conexa/bulk/resolve'
import { Button } from '@/components/ui/button'

type ItemResult = { ok: boolean; message: string }

async function driveToStorage(clientId: string, file: { id: string; name: string; mimeType: string }) {
  const response = await fetch(driveFileUrl(file.id))
  if (!response.ok) throw new Error(`No se pudo descargar ${file.name} de Drive.`)
  const blob = await response.blob()
  const local = new File([blob], file.name, { type: file.mimeType || blob.type })
  return uploadBulkAsset(clientId, { id: file.id, name: file.name, file: local, kind: file.mimeType.startsWith('video/') ? 'video' : 'image', ratio: '1:1' })
}

export function StepSheetApprove() {
  const sheetPlan = useBulkStore((state) => state.sheetPlan)
  const rows = useBulkStore((state) => state.rows)
  const clientId = useBulkStore((state) => state.clientId)
  const setStep = useBulkStore((state) => state.setStep)
  const updateRow = useBulkStore((state) => state.updateRow)
  const exitSheetPlan = useBulkStore((state) => state.exitSheetPlan)
  const [confirmed, setConfirmed] = useState(false)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Record<string, ItemResult>>({})
  const [sheetNote, setSheetNote] = useState<string | null>(null)

  const plan = useMemo(() => (sheetPlan ? resolvePlan(sheetPlan.context, sheetPlan.overrides) : null), [sheetPlan])
  if (!sheetPlan || !plan || !clientId) return null
  const { context } = sheetPlan
  const items = rows.flatMap((row) => {
    const ad = plan.ads.find((item) => item.id === row.planAdId)
    return ad ? [{ row, ad }] : []
  })
  const pending = items.filter(({ row }) => results[row.id]?.ok !== true)
  const doneCount = Object.values(results).filter((result) => result.ok).length
  const failedCount = Object.values(results).filter((result) => !result.ok).length
  const missingCopy = items.filter(({ row }) => !row.primaryText.trim() || !row.headline.trim())

  async function run() {
    if (!plan || !clientId) return
    setRunning(true)
    setSheetNote(null)
    const statusUpdates = new Map<number, boolean>()
    for (const { row, ad } of pending) {
      updateRow(row.id, { status: 'publishing', error: undefined })
      try {
        const file = primaryFile(ad.files)
        if (!file) throw new Error('El anuncio no tiene archivos de Drive.')
        const assetUrl = await driveToStorage(clientId, file)
        const item = buildExecuteRequest({ context, plan, ad, row, assetUrl })
        if (typeof item === 'string') throw new Error(item)
        const result = await executePlanAdRequest(context.planId, { clientId, planId: context.planId, confirmed: true, item })
        if (!result.ok) throw new Error(result.error)
        const reused = result.reused.ad ? ' (ya existía, no se duplicó)' : ''
        setResults((current) => ({ ...current, [row.id]: { ok: true, message: `Creado en pausa${reused}` } }))
        updateRow(row.id, { status: 'published', metaAdId: result.adId })
        if (statusUpdates.get(ad.rowNumber) !== false) statusUpdates.set(ad.rowNumber, true)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'No se pudo crear en Meta.'
        setResults((current) => ({ ...current, [row.id]: { ok: false, message } }))
        updateRow(row.id, { status: 'error', error: message })
        statusUpdates.set(ad.rowNumber, false)
      }
    }
    if (statusUpdates.size) {
      try {
        const response = await writeSheetStatusRequest(context.planId, { clientId, updates: [...statusUpdates].map(([rowNumber, ok]) => ({ rowNumber, ok })), values: context.interpretation.statusVocabulary })
        setSheetNote(response.updated ? `Se actualizó el estado de ${response.updated} filas en el sheet.` : response.skipped ?? null)
      } catch (cause) {
        setSheetNote(cause instanceof Error ? `No se pudo escribir el estado en el sheet: ${cause.message}` : 'No se pudo escribir el estado en el sheet.')
      }
    }
    setRunning(false)
  }

  const finished = items.length > 0 && doneCount === items.length

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[#ececea] bg-white px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-[#999]">Aprobar y crear</p>
        <h2 className="text-[15px] font-semibold text-[#141414]">{`${items.length} anuncios · ${plan.summary.newCampaigns} campañas y ${plan.summary.newAdsets} conjuntos nuevos`}</h2>
        <p className="text-pretty text-[12px] leading-relaxed text-[#777]">Todo se crea en pausa. Si una fila ya se creó antes, se reutiliza en vez de duplicarse, así que podés reintentar sin riesgo.</p>
      </div>

      <ul className="divide-y divide-[#f3f3f0] rounded-xl border border-[#ececea] bg-white">
        {items.map(({ row, ad }) => {
          const result = results[row.id]
          const campaign = plan.campaigns.find((item) => item.key === ad.campaignKey)
          const adset = plan.adsets.find((item) => item.key === ad.adsetKey)
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              {row.status === 'publishing' ? <Loader2 className="size-3.5 animate-spin text-[#5B5FE8]" aria-label="Creando" /> : result?.ok ? <CheckCircle2 className="size-3.5 text-[#1e9e6b]" aria-label="Creado" /> : result ? <AlertTriangle className="size-3.5 text-[#c0432c]" aria-label="Error" /> : <span className="size-3.5 rounded-full border border-[#dcdcd8]" aria-hidden="true" />}
              <div className="flex min-w-[220px] flex-1 flex-col">
                <span className="truncate text-[12.5px] font-medium text-[#141414]">{row.adName || ad.name}</span>
                <span className="truncate text-[11px] text-[#777]">{`${campaign?.mode === 'create' ? 'Nueva: ' : ''}${campaign?.name ?? ''} › ${adset?.mode === 'create' ? 'Nuevo: ' : ''}${adset?.name ?? ''}`}</span>
              </div>
              <span className={cn('text-[11px]', result ? (result.ok ? 'text-[#147a52]' : 'text-[#c0432c]') : 'text-[#999]')}>{result?.message ?? `Fila ${ad.rowNumber}`}</span>
            </li>
          )
        })}
      </ul>

      {sheetNote && <p className="text-[11.5px] text-[#777]" role="status">{sheetNote}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ececea] bg-white px-4 py-3">
        <Button size="sm" variant="outline" disabled={running} onClick={() => setStep(2)} className="h-9 rounded-full border-[#dcdcd8] bg-white px-4 text-[11.5px] text-[#333] hover:bg-[#f5f5f3] hover:text-[#141414]">{'← Volver a configurar'}</Button>
        {finished ? (
          <Button size="sm" onClick={exitSheetPlan} className="h-9 rounded-full bg-[#141414] px-5 text-[11.5px] text-white hover:bg-[#333]">Terminar</Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {missingCopy.length > 0 && <span className="text-[11.5px] text-[#c0432c]">{`${missingCopy.length} anuncios sin texto o título`}</span>}
            <label className="flex items-center gap-2 text-[11.5px] text-[#333]">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={running} className="accent-[#5B5FE8]" />
              Revisé el plan y quiero crearlo en Meta
            </label>
            <Button size="sm" disabled={!confirmed || running || !pending.length || missingCopy.length > 0} onClick={run} className="h-9 rounded-full bg-[#141414] px-5 text-[11.5px] text-white hover:bg-[#333]">
              {running && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {failedCount ? `Reintentar ${pending.length}` : `Crear ${pending.length} anuncios`}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
