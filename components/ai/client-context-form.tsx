'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ClientMemory } from '@/lib/ai/client-memory'

type Props = { clientId: string; clientName: string; initialMemory: ClientMemory | null; mode?: 'conversation-start' | 'edit'; onCompleted: (memory: ClientMemory) => void; onCancel?: () => void }
const industries = ['Retail / E-commerce','Inmobiliaria','Automotriz','Educación','Salud','Turismo','Servicios B2B','Servicios B2C','Tecnología / SaaS','Finanzas','Construcción','Otro']
const objectives = ['Generar leads','Ventas online','Reservas / turnos','Visitas presenciales','Solicitudes de presupuesto','Suscripciones','Tráfico calificado','Reconocimiento de marca','Otro']
const products = ['Producto físico','Servicio','Producto digital','SaaS / Software','Inmueble / lote','Formación / educación','Servicio de salud','Turismo / experiencia','Mixto','Otro']
const conversions = [['Lead','lead'],['Compra','purchase'],['Mensaje / conversación','messaging_conversation_started'],['Reserva / turno','booking'],['Llamada','call'],['Formulario enviado','form_submission'],['Solicitud de presupuesto','quote_request'],['Registro / suscripción','subscription'],['Otro','custom'],['Todavía no está definido','']] as const

export function ClientContextForm({ clientId, clientName, initialMemory, mode = 'conversation-start', onCompleted, onCancel }: Props) {
  const [industry, setIndustry] = useState(''); const [objective, setObjective] = useState(''); const [product, setProduct] = useState(''); const [conversion, setConversion] = useState(''); const [saving, setSaving] = useState(false); const [loading, setLoading] = useState(!initialMemory); const [error, setError] = useState('')
  const [targetSales, setTargetSales] = useState(''); const [targetCpl, setTargetCpl] = useState(''); const [notes, setNotes] = useState('')
  useEffect(() => { if (initialMemory) { setIndustry(initialMemory.profile.industry ?? ''); setObjective(initialMemory.profile.commercial_objective ?? ''); setProduct(initialMemory.profile.product_type ?? ''); setConversion(initialMemory.profile.primary_conversion_type ?? ''); setTargetSales(initialMemory.profile.target_monthly_sales != null ? String(initialMemory.profile.target_monthly_sales) : ''); setTargetCpl(initialMemory.profile.target_cpl != null ? String(initialMemory.profile.target_cpl) : ''); setNotes(initialMemory.profile.additional_context ?? '') } setLoading(false) }, [initialMemory])
  const industryChoice = useMemo(() => industries.find((x) => x.toLowerCase() === industry.toLowerCase()), [industry])
  const objectiveChoice = useMemo(() => objectives.find((x) => x.toLowerCase() === objective.toLowerCase()), [objective])
  const selectedConversion = conversions.find(([, value]) => value === conversion)
  async function submit() { setError(''); if (!industry.trim() || !objective.trim() || !product.trim()) { setError('Completá industria, objetivo comercial y qué vende el cliente.'); return } setSaving(true); try { const response = await fetch('/api/ai/client-memory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, industry, commercial_objective: objective, product_type: product, primary_conversion_type: conversion || undefined, target_monthly_sales: targetSales.trim() || null, target_cpl: targetCpl.trim() || null, additional_context: notes }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo guardar el contexto.'); onCompleted(data.memory) } catch (error) { setError(error instanceof Error ? error.message : 'No pudimos guardar el contexto. Intentá nuevamente.') } finally { setSaving(false) } }
  if (loading) return <div className="flex flex-col gap-6"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
  return <section className="flex w-full max-w-2xl flex-col gap-8" aria-labelledby="context-title">
    <div className="flex flex-col gap-2"><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">{mode === 'edit' ? 'Contexto del cliente' : 'Primer paso'}</p><h2 id="context-title" className="text-balance text-3xl font-semibold tracking-tight">{mode === 'edit' ? clientName : 'Antes de comenzar'}</h2><p className="text-pretty leading-6 text-muted-foreground">Ayudanos a entender mejor a {clientName}. Este contexto mejora los análisis y comparaciones futuras.</p></div>
    <ContextQuestion title="¿En qué industria o rubro trabaja este cliente?" options={industries} value={industryChoice ?? ''} onSelect={(value) => setIndustry(value === 'Otro' ? '' : value)} custom={industryChoice ? undefined : industry} customPlaceholder="Escribí la industria o rubro" onCustom={setIndustry} />
    <ContextQuestion title="¿Cuál es el principal objetivo comercial?" options={objectives} value={objectiveChoice ?? ''} onSelect={(value) => setObjective(value === 'Otro' ? '' : value)} custom={objectiveChoice ? undefined : objective} customPlaceholder="Describí el objetivo comercial" onCustom={setObjective} />
    <ContextQuestion title="¿Qué vende u ofrece este cliente?" options={products} value={products.includes(product) ? product : ''} onSelect={(value) => { if (value !== 'Otro') setProduct(value) }} custom={product} customPlaceholder="Describilo brevemente" onCustom={setProduct} alwaysCustom />
    <ContextQuestion title="¿Qué acción representa principalmente una conversión?" options={conversions.map(([label]) => label)} value={selectedConversion?.[0] ?? (conversion ? 'Otro' : '')} onSelect={(value) => setConversion(conversions.find(([label]) => label === value)?.[1] ?? value)} custom={conversion && !selectedConversion ? conversion : ''} customPlaceholder="Describí la conversión" onCustom={setConversion} />
    <fieldset className="flex flex-col gap-3">
      <legend className="text-lg font-medium">Objetivos de la cuenta <span className="text-sm font-normal text-muted-foreground">(opcional)</span></legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">Ventas objetivo por mes<Input type="number" inputMode="numeric" min={0} value={targetSales} onChange={(e) => setTargetSales(e.target.value)} placeholder="Ej: 20" /></label>
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">CPL objetivo ($)<Input type="number" inputMode="decimal" min={0} step="any" value={targetCpl} onChange={(e) => setTargetCpl(e.target.value)} placeholder="Ej: 3500" /></label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">Contexto adicional<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} placeholder="Ticket promedio, zonas, estacionalidad, presupuesto, particularidades del negocio…" /></label>
    </fieldset>
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Button onClick={submit} disabled={saving}>{saving ? 'Guardando contexto…' : mode === 'edit' ? 'Guardar contexto' : 'Confirmar y comenzar'}</Button>{mode === 'edit' && onCancel && <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>}</div>
  </section>
}
function ContextQuestion({ title, options, value, onSelect, custom, customPlaceholder, onCustom, alwaysCustom = false }: { title: string; options: readonly string[]; value: string; onSelect: (v: string) => void; custom?: string; customPlaceholder: string; onCustom: (v: string) => void; alwaysCustom?: boolean }) { return <fieldset className="flex flex-col gap-3"><legend className="text-lg font-medium">{title}</legend><div className="flex flex-wrap gap-2">{options.map((option) => <Button key={option} type="button" variant={value === option ? 'default' : 'outline'} aria-pressed={value === option} className="rounded-full" onClick={() => onSelect(option)}>{value === option ? '✓ ' : ''}{option}</Button>)}</div>{(alwaysCustom || !value) && <Input value={custom ?? ''} onChange={(e) => onCustom(e.target.value)} placeholder={customPlaceholder} aria-label={customPlaceholder} />}</fieldset> }
