'use client'

import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBulkStore } from '@/lib/bulk/store'
import { uploadBulkAsset } from '@/lib/bulk/api'
import { mutate } from 'swr'
import { executePlanAdRequest, reviewUrl } from '@/lib/conexa/bulk/client'
import { SheetReviewList } from './sheet-review-list'
import { buildExecuteRequest, driveFileUrl, publishedFiles } from '@/lib/conexa/bulk/plan-rows'
import { pendingQuestions, resolvePlan } from '@/lib/conexa/bulk/resolve'
import { PLAN_NOT_FOUND } from '@/lib/conexa/bulk/types'
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
  const allRows = useBulkStore((state) => state.rows)
  const selected = useBulkStore((state) => state.selected)
  const rows = allRows.filter((row) => selected.includes(row.id))
  const clientId = useBulkStore((state) => state.clientId)
  const setStep = useBulkStore((state) => state.setStep)
  const updateRow = useBulkStore((state) => state.updateRow)
  const exitSheetPlan = useBulkStore((state) => state.exitSheetPlan)
  const [confirmed, setConfirmed] = useState(false)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Record<string, ItemResult>>({})
  const [cancelling, setCancelling] = useState(false)
  const [stopNote, setStopNote] = useState<string | null>(null)
  const cancelRef = useRef(false)

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
  const unanswered = pendingQuestions(plan)

  // La app solo lee el sheet: el resultado queda en el listado de revisión, no en la columna de estado.
  async function run() {
    if (!plan || !clientId) return
    cancelRef.current = false
    setCancelling(false)
    setStopNote(null)
    setRunning(true)
    for (const { row, ad } of pending) {
      // Cancelar no corta el anuncio en curso (puede estar a mitad de camino en Meta); frena antes del siguiente.
      if (cancelRef.current) {
        setStopNote('Cancelaste la creación. Los anuncios que no se intentaron quedaron sin crear; podés retomarlos cuando quieras.')
        break
      }
      updateRow(row.id, { status: 'creating', error: undefined })
      try {
        const files = publishedFiles(ad)
        if (!files.length) throw new Error('El anuncio no tiene archivos de Drive.')
        const assetUrls: Record<string, string> = {}
        for (const file of files) assetUrls[file.id] = await driveToStorage(clientId, file)
        const item = buildExecuteRequest({ context, plan, ad, row, assetUrls })
        if (typeof item === 'string') throw new Error(item)
        const result = await executePlanAdRequest(context.planId, { clientId, planId: context.planId, confirmed: true, item })
        if (!result.ok) throw new Error(result.error)
        const reused = result.reused.ad ? ' (ya existía, no se duplicó)' : ''
        setResults((current) => ({ ...current, [row.id]: { ok: true, message: `Creado en pausa${reused}` } }))
        updateRow(row.id, { status: 'done', metaAdId: result.adId })
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'No se pudo crear en Meta.'
        // Si el servidor no tiene el plan, va a fallar igual para todos: se corta en vez de subir más archivos.
        if (message === PLAN_NOT_FOUND) {
          updateRow(row.id, { status: 'idle', error: undefined })
          setStopNote(PLAN_NOT_FOUND)
          break
        }
        setResults((current) => ({ ...current, [row.id]: { ok: false, message } }))
        updateRow(row.id, { status: 'error', error: message })
      }
    }
    setRunning(false)
    setCancelling(false)
    await mutate(reviewUrl(context.planId, clientId))
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
              {row.status === 'creating' ? <Loader2 className="size-3.5 animate-spin text-[#5B5FE8]" aria-label="Creando" /> : result?.ok ? <CheckCircle2 className="size-3.5 text-[#1e9e6b]" aria-label="Creado" /> : result ? <AlertTriangle className="size-3.5 text-[#c0432c]" aria-label="Error" /> : <span className="size-3.5 rounded-full border border-[#dcdcd8]" aria-hidden="true" />}
              <div className="flex min-w-[220px] flex-1 flex-col">
                <span className="truncate text-[12.5px] font-medium text-[#141414]">{row.adName || ad.name}</span>
                <span className="truncate text-[11px] text-[#777]">{`${campaign?.mode === 'create' ? 'Nueva: ' : ''}${campaign?.name ?? ''} › ${adset?.mode === 'create' ? 'Nuevo: ' : ''}${adset?.name ?? ''}`}</span>
              </div>
              <span className={cn('text-[11px]', result ? (result.ok ? 'text-[#147a52]' : 'text-[#c0432c]') : 'text-[#999]')}>{result?.message ?? `Fila ${ad.rowNumber}`}</span>
            </li>
          )
        })}
      </ul>

      {!finished && (
        <p className="text-pretty text-[11.5px] leading-relaxed text-[#777]">
          No se escribe nada en el sheet. Al terminar, revisá cada anuncio en el Administrador de anuncios desde el listado de revisión.
        </p>
      )}

      {stopNote && <p className="text-pretty rounded-lg border border-[#f0d9a8] bg-[#fdf6e7] px-3 py-2 text-[11.5px] leading-relaxed text-[#8a5f0d]" role="status">{stopNote}</p>}

      {doneCount > 0 && <SheetReviewList planId={context.planId} clientId={clientId} />}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ececea] bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={running} onClick={() => setStep(2)} className="h-9 rounded-full border-[#dcdcd8] bg-white px-4 text-[11.5px] text-[#333] hover:bg-[#f5f5f3] hover:text-[#141414]">{'← Volver a configurar'}</Button>
          {running ? (
            <Button
              size="sm"
              variant="outline"
              disabled={cancelling}
              onClick={() => {
                cancelRef.current = true
                setCancelling(true)
              }}
              className="h-9 rounded-full border-[#e8c4bc] bg-white px-4 text-[11.5px] text-[#c0432c] hover:bg-[#fbefec] hover:text-[#a33722]"
            >
              {cancelling ? 'Cancelando… termina el anuncio en curso' : 'Cancelar'}
            </Button>
          ) : (
            !finished && (
              <Button size="sm" variant="ghost" onClick={exitSheetPlan} className="h-9 rounded-full px-4 text-[11.5px] text-[#777] hover:bg-[#f5f5f3] hover:text-[#141414]">
                Cancelar carga
              </Button>
            )
          )}
        </div>
        {finished ? (
          <Button size="sm" onClick={exitSheetPlan} className="h-9 rounded-full bg-[#141414] px-5 text-[11.5px] text-white hover:bg-[#333]">Terminar</Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {missingCopy.length > 0 && <span className="text-[11.5px] text-[#c0432c]">{`${missingCopy.length} anuncios sin texto o título`}</span>}
            <label className="flex items-center gap-2 text-[11.5px] text-[#333]">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={running} className="accent-[#5B5FE8]" />
              Revisé el plan y quiero crearlo en Meta
            </label>
            <Button size="sm" disabled={!confirmed || running || !pending.length || missingCopy.length > 0 || unanswered.length > 0} onClick={run} className="h-9 rounded-full bg-[#141414] px-5 text-[11.5px] text-white hover:bg-[#333]">
              {running && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {failedCount ? `Reintentar ${pending.length}` : `Crear ${pending.length} anuncios`}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
