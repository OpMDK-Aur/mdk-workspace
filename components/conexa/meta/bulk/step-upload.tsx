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

export function StepUpload({ clientId, clientName, adsets, creatives, destinationUrl }: { clientId: string; clientName: string; adsets: BulkAdset[]; creatives: CreativeCard[]; destinationUrl?: string | null }) {
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
          className={cn('flex flex-col items-center justify-center gap-3 rounded-xl border-2 px-6 py-14 text-center transition-colors', dragging ? 'border-solid border-[#5B5FE8] bg-[#5B5FE8]/5' : 'border-dashed border-[#5B5FE8]/35 bg-white')}
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-[#5B5FE8]/10">
            <ImageUp className="size-5 text-[#5B5FE8]" aria-hidden="true" />
          </span>
          <button type="button" onClick={() => inputRef.current?.click()} className="text-[14px] font-semibold text-[#141414] hover:text-[#5B5FE8]">
            {reading ? 'Leyendo archivos…' : 'Arrastrá imágenes y videos, o hacé clic para elegirlos'}
          </button>
          <p className="max-w-[520px] text-pretty text-[12px] leading-relaxed text-[#777]">
            JPG, PNG, MP4 o MOV. Conexa detecta el formato y agrupa en un solo anuncio las versiones 1:1, 4:5 y 9:16 de una misma pieza (ej. oferta_1x1.jpg + oferta_9x16.jpg).
          </p>
          <input ref={inputRef} type="file" multiple accept={ACCEPTED_TYPES.join(',')} className="sr-only" onChange={(event) => { handleFiles(event.target.files); event.target.value = '' }} aria-label="Elegir archivos" />
        </div>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => addAssets(sampleAssets())} className="text-[11.5px] font-semibold text-[#5B5FE8] hover:underline">
            Cargar lote de ejemplo (12 archivos)
          </button>
          {rowCount > 0 && (
            <button type="button" onClick={() => setStep(2)} className="text-[11.5px] font-semibold text-[#333] hover:underline">
              {`Volver al lote (${rowCount} anuncios) →`}
            </button>
          )}
        </div>

        <Panel title="Valores por defecto del lote">
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-[11px] font-medium text-[#777]">Conjunto</p>
              {adsets.length ? (
                <div className="flex flex-wrap gap-2">
                  {adsets.map((adset) => <Chip key={adset.id} active={defaults.adsetId === adset.id} onClick={() => setDefaults({ adsetId: adset.id })}>{adset.name}</Chip>)}
                </div>
              ) : <p className="text-[11.5px] text-[#999]">No hay conjuntos activos en la cuenta seleccionada.</p>}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium text-[#777]">CTA</p>
              <div className="flex flex-wrap gap-2">
                {CTAS.map((cta) => <Chip key={cta} active={defaults.cta === cta} onClick={() => setDefaults({ cta })}>{cta}</Chip>)}
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-3 border-t border-[#f0f0ed] pt-3 text-[11.5px] md:grid-cols-3">
              <div>
                <dt className="mb-0.5 text-[10.5px] text-[#999]">URL de destino</dt>
                <dd className="truncate text-[#333]">{destinationUrl || 'Definida en Contexto del cliente'}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-[10.5px] text-[#999]">UTMs</dt>
                <dd className="break-all font-mono text-[10.5px] text-[#333]">{'utm_source=meta&utm_campaign={campaña}&utm_content={anuncio}'}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-[10.5px] text-[#999]">Nomenclatura</dt>
                <dd className="font-mono text-[10.5px] text-[#333]">{'{CLIENTE}_{conjunto}_{pieza}_{nº}'}<span className="block font-sans text-[10px] text-[#999]">{`CLIENTE = ${clientName}`}</span></dd>
              </div>
            </dl>
          </div>
        </Panel>
      </div>
      <CompactSuggestions clientId={clientId} creatives={creatives} />
    </div>
  )
}
