'use client'

import { useEffect, useMemo } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBulkStore, type BulkStep } from '@/lib/bulk/store'
import { destinationToAdset, type BulkAdset } from '@/lib/bulk/types'
import type { MetaAccountOption } from './new-destination-dialog'
import type { CreativeCard } from '@/lib/meta/to-creative-card'
import { StepConfigure } from './step-configure'
import { StepPublish } from './step-publish'
import { StepUpload } from './step-upload'

const STEPS: Array<{ step: BulkStep; label: string }> = [
  { step: 1, label: 'Subir archivos' },
  { step: 2, label: 'Configurar anuncios' },
  { step: 3, label: 'Revisar y publicar' },
]

function Stepper() {
  const current = useBulkStore((state) => state.step)
  const hasRows = useBulkStore((state) => state.rows.length > 0)
  const setStep = useBulkStore((state) => state.setStep)

  return (
    <nav aria-label="Pasos de la carga masiva" className="mb-5">
      <ol className="flex items-center gap-3">
        {STEPS.map(({ step, label }, index) => {
          const done = step < current
          const active = step === current
          const reachable = step <= current || hasRows
          return (
            <li key={step} className="flex flex-1 items-center gap-3 last:flex-none">
              <button type="button" disabled={!reachable} onClick={() => setStep(step)} aria-current={active ? 'step' : undefined} className="flex items-center gap-2 disabled:cursor-not-allowed">
                <span className={cn('flex size-6 items-center justify-center rounded-full text-[11px] font-bold', done ? 'bg-[#1e9e6b] text-white' : active ? 'bg-[#141414] text-white' : 'border border-[#dcdcd8] bg-white text-[#999]')}>
                  {done ? <Check className="size-3.5" aria-label="Completado" /> : step}
                </span>
                <span className={cn('whitespace-nowrap text-[12px]', active ? 'font-semibold text-[#141414]' : 'text-[#777]')}>{label}</span>
              </button>
              {index < STEPS.length - 1 && <span className={cn('h-px flex-1', done ? 'bg-[#1e9e6b]' : 'bg-[#dcdcd8]')} aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function BulkUploadView({ clientId, clientName, adsets: existingAdsets, accounts, creatives, destinationUrl, pageIds }: { pageIds?: string[]; clientId: string; clientName: string; adsets: BulkAdset[]; accounts: MetaAccountOption[]; creatives: CreativeCard[]; destinationUrl?: string | null }) {
  const step = useBulkStore((state) => state.step)
  const destinations = useBulkStore((state) => state.destinations)
  const adsets = useMemo(() => [...destinations.map(destinationToAdset), ...existingAdsets], [destinations, existingAdsets])
  const setClient = useBulkStore((state) => state.setClient)

  useEffect(() => {
    setClient(clientId, { adsetId: '', cta: 'Más información' })
  }, [clientId, setClient])

  return (
    <div>
      <Stepper />
      {step === 1 && <StepUpload clientId={clientId} clientName={clientName} adsets={adsets} creatives={creatives} destinationUrl={destinationUrl} />}
      {step === 2 && <StepConfigure clientId={clientId} clientName={clientName} adsets={adsets} accounts={accounts} />}
      {step === 3 && <StepPublish clientId={clientId} clientName={clientName} adsets={adsets} destinationUrl={destinationUrl} pageIds={pageIds} />}
    </div>
  )
}
