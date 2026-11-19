'use client'

import { useState, type FormEvent } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

type CampaignPlatform = 'meta' | 'google_ads'

const COPY: Record<CampaignPlatform, { title: string; description: string; placeholder: string; prompt: string; accent: string }> = {
  meta: {
    title: 'Crear campaña en Meta Ads con Conexa',
    description: 'Conexa arma la campaña tomando como modelo un conjunto de anuncios que ya funciona y reutiliza sus creatividades. Queda como borrador en Recomendaciones y, al publicarla, se crea en pausa.',
    placeholder: 'Ej.: captar leads para la promo de verano en WhatsApp, público de 25 a 45 años',
    prompt: 'Proponé una campaña nueva en Meta Ads',
    accent: 'bg-[#1877F2] hover:bg-[#1468d6]',
  },
  google_ads: {
    title: 'Crear campaña en Google Ads con Conexa',
    description: 'Conexa arma una campaña de búsqueda tomando como modelo una campaña existente y copia las palabras clave y los anuncios de los grupos que mejor rinden. Queda como borrador en Recomendaciones y, al publicarla, se crea en pausa.',
    placeholder: 'Ej.: búsquedas de la marca con la oferta de cuotas sin interés',
    prompt: 'Proponé una campaña de búsqueda nueva en Google Ads',
    accent: 'bg-[#4285F4] hover:bg-[#3474e0]',
  },
}

export function CreateCampaignButton({ platform, onSubmit }: { platform: CampaignPlatform; onSubmit: (prompt: string) => void }) {
  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState('')
  const copy = COPY[platform]

  function submit(event: FormEvent) {
    event.preventDefault()
    const detail = goal.trim()
    onSubmit(detail ? `${copy.prompt} con este objetivo: ${detail}` : `${copy.prompt}.`)
    setOpen(false)
    setGoal('')
  }

  return <>
    <Button type="button" onClick={() => setOpen(true)} className={`h-8 gap-1.5 rounded-full px-4 text-[11px] text-white ${copy.accent}`}>
      <Sparkles className="size-3.5" aria-hidden="true" />
      Crear campaña con Conexa
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription className="text-pretty leading-relaxed">{copy.description}</DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            ¿Qué tiene que lograr? (opcional)
            <Textarea value={goal} maxLength={500} rows={3} placeholder={copy.placeholder} onChange={(event) => setGoal(event.target.value)} className="text-sm" />
          </label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Si no completás nada, Conexa elige el objetivo según el contexto y el rendimiento de la cuenta.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit">Pedir propuesta</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>
}
