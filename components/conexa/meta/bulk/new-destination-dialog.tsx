'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchPixels } from '@/lib/bulk/api'
import { newId } from '@/lib/bulk/group-assets'
import { useBulkStore } from '@/lib/bulk/store'
import { COUNTRIES, OBJECTIVES, type BulkAdset, type NewDestination, type Objective } from '@/lib/bulk/types'

export type MetaAccountOption = { id: string; name: string }

const fieldClass = 'border-[#dcdcd8] bg-white text-[12px] text-[#141414] placeholder:text-[#aaa] dark:bg-white'
const tag = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
const month = () => new Date().toISOString().slice(0, 7)

export function NewDestinationDialog({ clientId, clientName, accounts, adsets, onCreated }: { clientId: string; clientName: string; accounts: MetaAccountOption[]; adsets: BulkAdset[]; onCreated: (id: string) => void }) {
  const addDestination = useBulkStore((state) => state.addDestination)
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [campaignMode, setCampaignMode] = useState<'new' | 'existing'>('new')
  const [objective, setObjective] = useState<Objective>('OUTCOME_TRAFFIC')
  const [existingCampaignId, setExistingCampaignId] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [adsetName, setAdsetName] = useState('')
  const [budget, setBudget] = useState('')
  const [countries, setCountries] = useState<string[]>(['AR'])
  const [ageMin, setAgeMin] = useState('18')
  const [ageMax, setAgeMax] = useState('65')
  const [genders, setGenders] = useState<'all' | 'male' | 'female'>('all')
  const [pixelId, setPixelId] = useState('')
  const [engagementTarget, setEngagementTarget] = useState<'POST' | 'WHATSAPP'>('WHATSAPP')
  const [error, setError] = useState('')

  const activeAccount = accountId || accounts[0]?.id || ''
  const existingCampaigns = useMemo(() => {
    const seen = new Map<string, string>()
    for (const adset of adsets) if (adset.status !== 'NEW' && adset.campaignId && (!adset.accountId || adset.accountId === activeAccount)) seen.set(adset.campaignId, adset.campaignName)
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [adsets, activeAccount])

  const objectiveInfo = OBJECTIVES.find((item) => item.value === objective)!
  const needsPixel = campaignMode === 'new' && objectiveInfo.needsPixel
  const showEngagementTarget = campaignMode === 'existing' || objective === 'OUTCOME_ENGAGEMENT'
  const toWhatsapp = showEngagementTarget && engagementTarget === 'WHATSAPP'
  const { data: pixels, isLoading: loadingPixels } = useSWR(open && activeAccount ? ['meta-pixels', clientId, activeAccount] : null, () => fetchPixels(clientId, activeAccount))

  const suggestedCampaign = `${tag(clientName)}_${objectiveInfo.tag}_${month()}`
  const suggestedAdset = `${tag(clientName)}_${countries.join('-') || 'PAIS'}_${ageMin}-${ageMax}${genders === 'all' ? '' : genders === 'male' ? '_H' : '_M'}`
  const existingCampaign = existingCampaigns.find((item) => item.id === existingCampaignId)

  function toggleCountry(code: string) {
    setCountries((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code])
  }

  function save() {
    const finalCampaign = campaignName.trim() || suggestedCampaign
    const finalAdset = adsetName.trim() || suggestedAdset
    if (!activeAccount) return setError('El cliente no tiene cuentas de Meta vinculadas.')
    if (campaignMode === 'existing' && !existingCampaign) return setError('Elegí una campaña existente.')
    if (!(Number(budget) > 0)) return setError('Ingresá un presupuesto diario mayor a 0.')
    if (!countries.length) return setError('Elegí al menos un país.')
    if (Number(ageMin) > Number(ageMax)) return setError('La edad mínima no puede ser mayor que la máxima.')
    if (needsPixel && !pixelId) return setError('Este objetivo necesita un píxel.')

    const destination: NewDestination = {
      id: newId('new'),
      accountId: activeAccount,
      campaign: campaignMode === 'new' ? { mode: 'new', name: finalCampaign, objective } : { mode: 'existing', id: existingCampaign!.id, name: existingCampaign!.name },
      adset: { name: finalAdset, dailyBudget: Number(budget), countries, ageMin: Number(ageMin), ageMax: Number(ageMax), genders, pixelId: pixelId || undefined, ...(toWhatsapp ? { destination: 'WHATSAPP' as const } : {}) },
    }
    addDestination(destination)
    onCreated(destination.id)
    setOpen(false)
    setError('')
    setCampaignName('')
    setAdsetName('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 rounded-full border-[#dcdcd8] bg-white text-[11px] text-[#333] hover:bg-[#f5f5f3] hover:text-[#141414]">
          <Plus className="size-3.5" aria-hidden="true" />
          Nueva campaña / conjunto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white text-[#141414] sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Nuevo destino en Meta</DialogTitle>
          <DialogDescription className="text-[#777]">Se crea en Meta recién al publicar. Si no escribís un nombre, usamos la sugerencia.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {accounts.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] text-[#555]">Cuenta publicitaria</Label>
              <Select value={activeAccount} onValueChange={(value) => { setAccountId(value); setExistingCampaignId(''); setPixelId('') }}>
                <SelectTrigger className={cn('h-9', fieldClass)}><SelectValue /></SelectTrigger>
                <SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-[12px] font-semibold">Campaña</legend>
            <div role="radiogroup" aria-label="Campaña" className="inline-flex w-fit rounded-full border border-[#dcdcd8] bg-[#f5f5f3] p-0.5">
              {([['new', 'Nueva'], ['existing', 'Existente']] as const).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={campaignMode === value} onClick={() => setCampaignMode(value)} className={cn('rounded-full px-4 py-1.5 text-[11.5px] font-medium', campaignMode === value ? 'bg-white text-[#141414] shadow-sm' : 'text-[#777]')}>{label}</button>
              ))}
            </div>
            {campaignMode === 'new' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dest-objective" className="text-[11px] text-[#555]">Objetivo</Label>
                  <Select value={objective} onValueChange={(value) => setObjective(value as Objective)}>
                    <SelectTrigger id="dest-objective" className={cn('h-9', fieldClass)}><SelectValue /></SelectTrigger>
                    <SelectContent>{OBJECTIVES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dest-campaign" className="text-[11px] text-[#555]">Nombre de la campaña</Label>
                  <Input id="dest-campaign" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder={suggestedCampaign} className={cn('h-9 font-mono', fieldClass)} />
                </div>
              </div>
            ) : (
              <Select value={existingCampaignId || undefined} onValueChange={setExistingCampaignId}>
                <SelectTrigger className={cn('h-9', fieldClass)} aria-label="Campaña existente"><SelectValue placeholder={existingCampaigns.length ? 'Elegir campaña' : 'No hay campañas en esta cuenta'} /></SelectTrigger>
                <SelectContent className="max-h-72">{existingCampaigns.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </fieldset>

          {showEngagementTarget && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[#555]">Dónde ocurre la interacción</span>
              <div role="radiogroup" aria-label="Dónde ocurre la interacción" className="inline-flex w-fit rounded-full border border-[#dcdcd8] bg-[#f5f5f3] p-0.5">
                {([['WHATSAPP', 'WhatsApp'], ['POST', campaignMode === 'existing' ? 'Según la campaña' : 'En la publicación']] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={engagementTarget === value} onClick={() => setEngagementTarget(value)} className={cn('rounded-full px-4 py-1.5 text-[11.5px] font-medium', engagementTarget === value ? 'bg-white text-[#141414] shadow-sm' : 'text-[#777]')}>{label}</button>
                ))}
              </div>
              <p className="text-pretty text-[11.5px] leading-relaxed text-[#777]">
                {toWhatsapp
                  ? `El conjunto optimiza conversaciones y los anuncios abren WhatsApp: no hace falta URL de destino. La página de Facebook tiene que tener el número de WhatsApp vinculado${campaignMode === 'existing' ? ', y la campaña tiene que ser de Interacción' : ''}.`
                  : campaignMode === 'existing' ? 'El conjunto usa la optimización del objetivo de la campaña.' : 'Optimiza interacciones con la publicación (me gusta, comentarios, compartidos).'}
              </p>
            </div>
          )}

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-[12px] font-semibold">Conjunto de anuncios</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dest-adset" className="text-[11px] text-[#555]">Nombre del conjunto</Label>
                <Input id="dest-adset" value={adsetName} onChange={(event) => setAdsetName(event.target.value)} placeholder={suggestedAdset} className={cn('h-9 font-mono', fieldClass)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dest-budget" className="text-[11px] text-[#555]">Presupuesto diario</Label>
                <Input id="dest-budget" type="number" min="1" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Ej. 5000" className={cn('h-9', fieldClass)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[#555]">Países</span>
              <div className="flex flex-wrap gap-1.5">
                {COUNTRIES.map((country) => (
                  <button key={country.code} type="button" aria-pressed={countries.includes(country.code)} onClick={() => toggleCountry(country.code)} className={cn('rounded-full border px-2.5 py-1 text-[11px]', countries.includes(country.code) ? 'border-[#5B5FE8] bg-[#5B5FE8]/10 text-[#3c3fb0]' : 'border-[#dcdcd8] bg-white text-[#555]')}>{country.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dest-age-min" className="text-[11px] text-[#555]">Edad mín.</Label>
                <Input id="dest-age-min" type="number" min="18" max="65" value={ageMin} onChange={(event) => setAgeMin(event.target.value)} className={cn('h-9', fieldClass)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dest-age-max" className="text-[11px] text-[#555]">Edad máx.</Label>
                <Input id="dest-age-max" type="number" min="18" max="65" value={ageMax} onChange={(event) => setAgeMax(event.target.value)} className={cn('h-9', fieldClass)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] text-[#555]">Género</Label>
                <Select value={genders} onValueChange={(value) => setGenders(value as typeof genders)}>
                  <SelectTrigger className={cn('h-9', fieldClass)}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="female">Mujeres</SelectItem><SelectItem value="male">Hombres</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] text-[#555]">{needsPixel ? 'Píxel (obligatorio para este objetivo)' : 'Píxel (opcional)'}</Label>
              <Select value={pixelId || 'none'} onValueChange={(value) => setPixelId(value === 'none' ? '' : value)}>
                <SelectTrigger className={cn('h-9', fieldClass)}><SelectValue placeholder={loadingPixels ? 'Cargando píxeles…' : 'Sin píxel'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin píxel</SelectItem>
                  {(pixels ?? []).map((pixel) => <SelectItem key={pixel.id} value={pixel.id}>{pixel.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          {error && <p role="alert" className="text-[12px] text-[#c23b3b]">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full border-[#dcdcd8] bg-white text-[12px] text-[#333] hover:bg-[#f5f5f3] hover:text-[#141414]">Cancelar</Button>
          <Button onClick={save} className="rounded-full bg-[#141414] text-[12px] text-white hover:bg-[#333]">Agregar destino</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
