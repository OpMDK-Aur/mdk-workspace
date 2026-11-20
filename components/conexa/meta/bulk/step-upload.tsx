'use client'

import { useRef, useState } from 'react'
import { ImageUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCEPTED_TYPES, filesToAssets, newId, ratioFromName } from '@/lib/bulk/group-assets'
import { useBulkStore } from '@/lib/bulk/store'
import { CTAS, type BulkAdset, type BulkAsset } from '@/lib/bulk/types'
import type { CreativeCard } from '@/lib/meta/to-creative-card'
import { Chip, Panel } from './bulk-shared'
import { CompactSuggestions } from './creative-suggestions'
import { ExistingCampaigns } from './existing-campaigns'
import { LibraryAdsPicker } from './library-ads-picker'
import { SheetImportDialog } from './sheet-import-dialog'
import { StrategyCard } from './strategy/strategy-card'

const SAMPLE_FILES = [
  'oferta_verano_1x1.jpg', 'oferta_verano_4x5.jpg', 'oferta_verano_9x16.jpg',
  'testimonio_ana_1x1.mp4', 'testimonio_ana_9x16.mp4',
  'ugc_largo_9x16.mp4',
  'producto_hero_4x5.jpg', 'producto_hero_9x16.jpg',
  'combo_familiar_1x1.png', 'combo_familiar_4x5.png',
  'descuento_app_feed_1x1.jpg', 'descuento_app_story_9x16.jpg',
]

function sampleAssets(): BulkAsset[] {
  return SAMPLE_FILES.map((name) => ({ id: newId('asset'), name, kind: name.endsWith('.mp4') ? 'video' : 'image', ratio: ratioFromName(name) ?? '1:1' }))
}

export function StepUpload({ clientId, clientName, adsets = [], creatives, destinationUrl }: { clientId: string; clientName: string; adsets?: BulkAdset[]; creatives: CreativeCard[]; destinationUrl?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const defaults = useBulkStore((state) => state.defaults)
  const setDefaults = useBulkStore((state) => state.setDefaults)
  const addAssets = useBulkStore((state) => state.addAssets)
  const rowCount = useBulkStore((state) => state.rows.length)
  const setStep = useBulkStore((state) => state.setStep)

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return
    setReading(true)
    const assets = await filesToAssets([...list])
    setReading(false)
    if (assets.length) addAssets(assets)
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4">
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); handleFiles(event.dataTransfer.files) }}
          className={cn('flex flex-col items-center justify-center gap-3 rounded-xl border-2 px-6 py-14 text-center transition-colors', dragging ? 'border-solid border-primary bg-primary/5' : 'border-dashed border-primary/35 bg-card')}
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-primary/10">
            <ImageUp className="size-5 text-primary" aria-hidden="true" />
          </span>
          <button type="button" onClick={() => inputRef.current?.click()} className="text-[14px] font-semibold text-foreground hover:text-primary">
            {reading ? 'Leyendo archivos…' : 'Arrastrá imágenes y videos, o hacé clic para elegirlos'}
          </button>
          <p className="max-w-[520px] text-pretty text-[12px] leading-relaxed text-muted-foreground">
            JPG, PNG, MP4 o MOV. Conexa detecta el formato y agrupa en un solo anuncio las versiones 1:1, 4:5 y 9:16 de una misma pieza (ej. oferta_1x1.jpg + oferta_9x16.jpg).
          </p>
          <input ref={inputRef} type="file" multiple accept={ACCEPTED_TYPES.join(',')} className="sr-only" onChange={(event) => { handleFiles(event.target.files); event.target.value = '' }} aria-label="Elegir archivos" />
          <span className="text-[11px] text-muted-foreground">o</span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <LibraryAdsPicker clientId={clientId} />
            <SheetImportDialog destinationUrl={destinationUrl} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => addAssets(sampleAssets())} className="text-[11.5px] font-semibold text-primary hover:underline">
            Cargar lote de ejemplo (12 archivos)
          </button>
          {rowCount > 0 && (
            <button type="button" onClick={() => setStep(2)} className="text-[11.5px] font-semibold text-foreground hover:underline">
              {`Volver al lote (${rowCount} anuncios) →`}
            </button>
          )}
        </div>

        <Panel title="Valores por defecto del lote">
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">CTA</p>
              <div className="flex flex-wrap gap-2">
                {CTAS.map((cta) => <Chip key={cta} active={defaults.cta === cta} onClick={() => setDefaults({ cta })}>{cta}</Chip>)}
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-3 border-t border-border pt-3 text-[11.5px] md:grid-cols-3">
              <div>
                <dt className="mb-0.5 text-[10.5px] text-muted-foreground">URL de destino</dt>
                <dd className="truncate text-foreground">{destinationUrl || 'Definida en Contexto del cliente'}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-[10.5px] text-muted-foreground">UTMs</dt>
                <dd className="break-all font-mono text-[10.5px] text-foreground">{'utm_source=meta&utm_campaign={campaña}&utm_content={anuncio}'}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-[10.5px] text-muted-foreground">Nomenclatura</dt>
                <dd className="font-mono text-[10.5px] text-foreground">{'{CLIENTE}_{conjunto}_{pieza}_{nº}'}<span className="block font-sans text-[10px] text-muted-foreground">{`CLIENTE = ${clientName}`}</span></dd>
              </div>
            </dl>
          </div>
        </Panel>
      </div>
      <div className="flex flex-col gap-4">
        <ExistingCampaigns adsets={adsets} />
        <StrategyCard clientId={clientId} clientName={clientName} destinationUrl={destinationUrl} creatives={creatives} />
        <CompactSuggestions clientId={clientId} creatives={creatives} />
      </div>
    </div>
  )
}
