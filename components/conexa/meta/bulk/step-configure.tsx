'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { generateCopies } from '@/lib/bulk/api'
import { adName, derivePlacement } from '@/lib/bulk/group-assets'
import { useBulkStore } from '@/lib/bulk/store'
import { CTAS, PRIMARY_TEXT_LIMIT, type BulkAdset, type BulkRow, type CTA } from '@/lib/bulk/types'
import { isDraft, validateRow } from '@/lib/bulk/validate'
import { AssetThumb, Chip, StateBadge } from './bulk-shared'

const fieldClass = 'border-[#dcdcd8] bg-white text-[12px] text-[#141414] placeholder:text-[#aaa] dark:bg-white'
const ISSUE_COLOR = { warn: 'text-[#a86412]', info: 'text-[#888]', error: 'text-[#c23b3b]' } as const

function Row({ row, index, adsets, clientName, selected }: { row: BulkRow; index: number; adsets: BulkAdset[]; clientName: string; selected: boolean }) {
  const updateRow = useBulkStore((state) => state.updateRow)
  const toggleSelected = useBulkStore((state) => state.toggleSelected)
  const { state, issues } = validateRow(row)
  const adsetName = adsets.find((adset) => adset.id === row.adsetId)?.name ?? ''
  const overLimit = row.primaryText.length > PRIMARY_TEXT_LIMIT
  const draft = isDraft(row)

  return (
    <tr className={cn('border-b border-[#f0f0ed] align-top', selected && 'bg-[#5B5FE8]/[0.03]')}>
      <td className="px-3 py-3">
        <Checkbox checked={selected} onCheckedChange={() => toggleSelected(row.id)} aria-label={`Seleccionar ${row.baseName}`} className="border-[#bbb] bg-white" />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-end gap-1.5">{row.assets.map((asset) => <AssetThumb key={asset.id} asset={asset} />)}</div>
      </td>
      <td className="px-3 py-3">
        <p className="max-w-[220px] break-all font-mono text-[11px] text-[#141414]">{adName({ clientName, adsetName, baseName: row.baseName, index })}</p>
        <p className="mt-1 text-[11px] text-[#777]">{derivePlacement(row.assets)}</p>
        <p className={cn('text-[11px]', draft ? 'text-[#5B5FE8]' : 'text-[#999]')}>{draft ? 'Sugerido por Conexa' : `${row.assets.length} ${row.assets.length === 1 ? 'archivo' : 'archivos'}`}</p>
      </td>
      <td className="px-3 py-3">
        <Select value={row.adsetId || undefined} onValueChange={(adsetId) => updateRow(row.id, { adsetId })}>
          <SelectTrigger className={cn('h-8 w-[180px]', fieldClass)} aria-label="Conjunto"><SelectValue placeholder="Elegir conjunto" /></SelectTrigger>
          <SelectContent>{adsets.map((adset) => <SelectItem key={adset.id} value={adset.id}>{adset.name}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="px-3 py-3">
        <Textarea
          rows={3}
          value={row.primaryText}
          onChange={(event) => updateRow(row.id, { primaryText: event.target.value, aiGenerated: false })}
          placeholder="Texto principal"
          aria-label="Texto principal"
          className={cn('min-h-0 w-[280px] resize-none leading-relaxed', fieldClass)}
        />
        <div className="mt-1 flex items-center justify-between">
          {row.aiGenerated ? <span className="text-[10px] font-semibold text-[#5B5FE8]">{'✦ Copy de Conexa'}</span> : <span />}
          <span className={cn('font-mono text-[10px]', overLimit ? 'font-semibold text-[#a86412]' : 'text-[#999]')}>{`${row.primaryText.length}/${PRIMARY_TEXT_LIMIT}`}</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <Input value={row.headline} onChange={(event) => updateRow(row.id, { headline: event.target.value, aiGenerated: false })} placeholder="Título" aria-label="Título" className={cn('h-8 w-[180px]', fieldClass)} />
      </td>
      <td className="px-3 py-3">
        <Select value={row.cta} onValueChange={(cta) => updateRow(row.id, { cta: cta as CTA })}>
          <SelectTrigger className={cn('h-8 w-[150px]', fieldClass)} aria-label="CTA"><SelectValue /></SelectTrigger>
          <SelectContent>{CTAS.map((cta) => <SelectItem key={cta} value={cta}>{cta}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="px-3 py-3">
        <StateBadge state={state} />
        {issues.length > 0 && (
          <ul className="mt-1.5 flex max-w-[180px] flex-col gap-0.5">
            {issues.map((issue) => <li key={issue.text} className={cn('text-[10.5px] leading-snug', ISSUE_COLOR[issue.level])}>{issue.text}</li>)}
          </ul>
        )}
      </td>
    </tr>
  )
}

export function StepConfigure({ clientId, clientName, adsets }: { clientId: string; clientName: string; adsets: BulkAdset[] }) {
  const rows = useBulkStore((state) => state.rows)
  const selected = useBulkStore((state) => state.selected)
  const setSelected = useBulkStore((state) => state.setSelected)
  const updateRows = useBulkStore((state) => state.updateRows)
  const updateRow = useBulkStore((state) => state.updateRow)
  const removeRows = useBulkStore((state) => state.removeRows)
  const setStep = useBulkStore((state) => state.setStep)
  const [writing, setWriting] = useState(false)

  const summary = useMemo(() => {
    const states = rows.map((row) => validateRow(row).state)
    return {
      files: rows.reduce((sum, row) => sum + row.assets.filter((asset) => !asset.pending).length, 0),
      ready: states.filter((state) => state === 'listo').length,
      review: states.filter((state) => state === 'revisar').length,
      drafts: states.filter((state) => state === 'borrador').length,
    }
  }, [rows])

  const targetIds = selected.length ? selected : rows.map((row) => row.id)
  const allSelected = rows.length > 0 && selected.length === rows.length

  async function writeCopies() {
    const targets = rows.filter((row) => row.status !== 'done' && (selected.length ? selected.includes(row.id) : !row.primaryText.trim() || !row.headline.trim()))
    if (!targets.length) return
    setWriting(true)
    const copies = await generateCopies({ clientId, clientName, rows: targets.map(({ id, baseName, adsetId }) => ({ id, baseName, adsetId })) })
    for (const [id, copy] of Object.entries(copies)) updateRow(id, { ...copy, aiGenerated: true })
    setWriting(false)
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-[#dcdcd8] bg-white p-10 text-center">
        <p className="mb-3 text-[12px] text-[#777]">Todavía no hay anuncios en el lote.</p>
        <Button size="sm" onClick={() => setStep(1)} className="rounded-full bg-[#141414] text-[11px] text-white hover:bg-[#333]">Subir archivos</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-[#5B5FE8]/25 bg-[#5B5FE8]/[0.06] px-4 py-3 text-[12px] text-[#3c3fb0]">
        <span className="font-semibold">{'✦ Conexa'}</span>
        {` agrupó ${summary.files} ${summary.files === 1 ? 'archivo' : 'archivos'} en ${rows.length} ${rows.length === 1 ? 'anuncio' : 'anuncios'} · ${summary.ready} listos · ${summary.review} para revisar · ${summary.drafts} en borrador`}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-[#dcdcd8] bg-white px-4 py-3">
        <span className="text-[11px] font-medium text-[#555]">{selected.length ? `${selected.length} seleccionados` : 'Sin selección: se aplica a todos'}</span>
        <Button size="sm" variant="outline" onClick={writeCopies} disabled={writing} className="h-8 rounded-full border-[#5B5FE8]/50 bg-white text-[11px] text-[#5B5FE8] hover:bg-[#5B5FE8]/5 hover:text-[#5B5FE8]">
          {'✦ Escribir copies con Conexa'}
        </Button>
        {adsets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#777]">Asignar conjunto:</span>
            {adsets.map((adset) => <Chip key={adset.id} active={false} onClick={() => updateRows(targetIds, { adsetId: adset.id })}>{adset.name}</Chip>)}
          </div>
        )}
        <button type="button" disabled={!selected.length} onClick={() => removeRows(selected)} className="ml-auto text-[11px] font-semibold text-[#c23b3b] hover:underline disabled:text-[#ccc] disabled:no-underline">
          Quitar seleccionados
        </button>
      </div>

      {writing && (
        <p className="flex items-center gap-2 text-[12px] text-[#5B5FE8]" role="status">
          <span className="animate-pulse" aria-hidden="true">{'✦'}</span>
          Conexa está escribiendo copies con el tono y los objetivos del cliente…
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-[#dcdcd8] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] text-left text-[11px] text-[#141414]">
            <thead className="border-b border-[#eee] bg-[#fafaf8] text-[10px] text-[#777]">
              <tr>
                <th className="w-10 px-3 py-3">
                  <Checkbox checked={allSelected} onCheckedChange={(checked) => setSelected(checked ? rows.map((row) => row.id) : [])} aria-label="Seleccionar todos" className="border-[#bbb] bg-white" />
                </th>
                {['Piezas', 'Anuncio', 'Conjunto', 'Texto principal', 'Título', 'CTA', 'Estado'].map((header) => <th key={header} className="px-3 py-3 font-semibold">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => <Row key={row.id} row={row} index={index} adsets={adsets} clientName={clientName} selected={selected.includes(row.id)} />)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" onClick={() => setStep(1)} className="h-9 rounded-full border-[#dcdcd8] bg-white px-4 text-[11.5px] text-[#333] hover:bg-[#f5f5f3] hover:text-[#141414]">{'← Sumar más archivos'}</Button>
        <Button size="sm" onClick={() => setStep(3)} className="h-9 rounded-full bg-[#141414] px-5 text-[11.5px] text-white hover:bg-[#333]">{'Revisar y publicar →'}</Button>
      </div>
    </div>
  )
}
