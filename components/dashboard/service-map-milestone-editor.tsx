'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Plus, Save, Trash2, CalendarClock, RefreshCw } from 'lucide-react'
import type { FrecuenciaHito, HitoCatalogo, TipoServicio } from '@/lib/types'

type Draft = Omit<HitoCatalogo, 'id'>
const blank: Draft = { nombre: '', descripcion: null, orden: 1, tipo_servicio: 'esencial', frecuencia: 'Mensual', genera_tarea: true, requiere_link_drive: false, checklist_esencial: null, checklist_estrategico: null }
const frequencies: FrecuenciaHito[] = ['Mensual', 'Bimestral', 'Semanal', 'Semanal (Lun)', 'Semanal (Vie)', '2 Veces x Sem']

export function ServiceMapMilestoneEditor() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<HitoCatalogo[]>([])
  const [selected, setSelected] = useState<HitoCatalogo | null>(null)
  const [draft, setDraft] = useState<Draft>(blank)
  const [scope, setScope] = useState<'catalog' | 'client'>('catalog')
  const [clientId, setClientId] = useState('')
  const [clients, setClients] = useState<Array<{ id: string; nombre_del_negocio: string }>>([])
  const [impact, setImpact] = useState<'none' | 'current' | 'future'>('none')
  const [months, setMonths] = useState<string[]>([])
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('hitos_catalogo').select('*').order('tipo_servicio').order('orden')
    setItems((data ?? []) as HitoCatalogo[])
    const { data: clientData } = await supabase.from('clientes').select('id, nombre_del_negocio').order('nombre_del_negocio')
    setClients(clientData ?? [])
  }, [supabase])
  useEffect(() => { void load() }, [load])

  const choose = (item: HitoCatalogo) => { setSelected(item); setDraft({ ...item }); setScope('catalog'); setNotice('') }
  const save = async () => {
    if (!draft.nombre.trim()) return setNotice('El nombre del hito es obligatorio.')
    const payload = { ...draft, nombre: draft.nombre.trim(), descripcion: draft.descripcion?.trim() || null }
    const query = selected ? supabase.from('hitos_catalogo').update(payload).eq('id', selected.id) : supabase.from('hitos_catalogo').insert(payload)
    const { error } = await query
    if (error) return setNotice(`No se pudo guardar: ${error.message}`)
    setNotice('Hito guardado correctamente.'); setSelected(null); setDraft(blank); await load()
  }
  const remove = async () => {
    if (!selected) return
    const { error } = await supabase.from('hitos_catalogo').delete().eq('id', selected.id)
    if (error) return setNotice(`No se pudo borrar: ${error.message}`)
    setNotice('Hito borrado del catálogo. Las tareas históricas no se modifican.'); setSelected(null); setDraft(blank); await load()
  }
  const applyImpact = async () => {
    if (impact === 'none') return setNotice('Elegí cómo impactar el cambio.')
    const now = new Date(); const currentMonth = now.getMonth() + 1; const currentYear = now.getFullYear()
    const selectedMonths = impact === 'current' ? [`${currentYear}-${String(currentMonth).padStart(2, '0')}`] : months
    if (impact === 'future' && selectedMonths.some((value) => value <= `${currentYear}-${String(currentMonth).padStart(2, '0')}`)) return setNotice('Sólo se pueden seleccionar meses siguientes; los meses anteriores están bloqueados.')
    let instanceQuery = supabase.from('mapa_servicio_instancias').select('id, tarea_id').gte('anio', currentYear)
    if (impact === 'current') instanceQuery = instanceQuery.eq('mes', currentMonth).eq('anio', currentYear)
    else instanceQuery = instanceQuery.in('mes', selectedMonths.map((value) => Number(value.split('-')[1]))).in('anio', selectedMonths.map((value) => Number(value.split('-')[0])))
    if (clientId) instanceQuery = instanceQuery.eq('cliente_id', clientId)
    const { data: instances, error: readError } = await instanceQuery
    if (readError) return setNotice(`No se pudo preparar el impacto: ${readError.message}`)
    const taskIds = (instances ?? []).map((instance) => instance.tarea_id).filter((id): id is string => Boolean(id))
    if (taskIds.length) { const { error } = await supabase.from('tareas').delete().in('id', taskIds); if (error) return setNotice(`No se pudieron borrar las tareas del mapa: ${error.message}`) }
    const instanceIds = (instances ?? []).map((instance) => instance.id)
    if (instanceIds.length) { const { error } = await supabase.from('mapa_servicio_instancias').delete().in('id', instanceIds); if (error) return setNotice(`No se pudieron borrar las instancias: ${error.message}`) }
    setNotice(`Se eliminaron las tareas e instancias seleccionadas (${selectedMonths.join(', ')}). Las anteriores quedaron intactas; volvé a generar el mapa para crear las nuevas.`)
  }
  const addMonth = (value: string) => { if (value && !months.includes(value)) setMonths([...months, value].sort()) }
  const monthOptions = Array.from({ length: 18 }, (_, index) => { const d = new Date(); d.setMonth(d.getMonth() + index + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })

  return <Card className="mt-6"><CardHeader><div className="flex items-center justify-between gap-4"><div><CardTitle>Administrar hitos</CardTitle><CardDescription>Catálogo por plan y alcance opcional por cliente.</CardDescription></div><Button variant="outline" size="sm" onClick={() => { setSelected(null); setDraft(blank) }}><Plus data-icon="inline-start" />Nuevo hito</Button></div></CardHeader><CardContent className="flex flex-col gap-6">
    {notice && <Alert><AlertTitle>Mapa de servicio</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex max-h-[32rem] flex-col gap-2 overflow-auto">{items.map((item) => <button type="button" key={item.id} onClick={() => choose(item)} className="flex items-start justify-between rounded-lg border p-3 text-left hover:bg-muted"><span><span className="block font-medium">{item.nombre}</span><span className="text-sm text-muted-foreground">{item.tipo_servicio} · {item.frecuencia}</span></span><Badge variant="outline">#{item.orden}</Badge></button>)}</div>
      <div className="flex flex-col gap-4 rounded-lg border p-4"><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm">Nombre<Input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} /></label><label className="flex flex-col gap-2 text-sm">Orden<Input type="number" value={draft.orden} onChange={(e) => setDraft({ ...draft, orden: Number(e.target.value) })} /></label></div><label className="flex flex-col gap-2 text-sm">Descripción<Textarea value={draft.descripcion ?? ''} onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm">Plan<Select value={draft.tipo_servicio} onValueChange={(value) => setDraft({ ...draft, tipo_servicio: value as TipoServicio })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="esencial">Esencial</SelectItem><SelectItem value="estrategico">Estratégico</SelectItem></SelectContent></Select></label><label className="flex flex-col gap-2 text-sm">Frecuencia<Select value={draft.frecuencia} onValueChange={(value) => setDraft({ ...draft, frecuencia: value as FrecuenciaHito })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{frequencies.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.genera_tarea} onCheckedChange={(checked) => setDraft({ ...draft, genera_tarea: checked === true })} />Genera tarea</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.requiere_link_drive} onCheckedChange={(checked) => setDraft({ ...draft, requiere_link_drive: checked === true })} />Requiere link de Drive</label><div className="flex flex-wrap gap-2"><Button onClick={() => void save()}><Save data-icon="inline-start" />Guardar</Button>{selected && <Button variant="destructive" onClick={() => void remove()}><Trash2 data-icon="inline-start" />Borrar</Button>}</div></div>
    </div>
    <div className="flex flex-col gap-4 rounded-lg border p-4"><div className="flex items-center gap-2"><CalendarClock className="size-5" /><div><h3 className="font-medium">Impactar cambios</h3><p className="text-sm text-muted-foreground">No se borran tareas de meses anteriores.</p></div></div><div className="flex flex-wrap gap-2"><Button variant={impact === 'current' ? 'default' : 'outline'} onClick={() => setImpact('current')}>Desde ahora · mes corriente</Button><Button variant={impact === 'future' ? 'default' : 'outline'} onClick={() => setImpact('future')}>Seleccionar meses siguientes</Button></div>{impact === 'future' && <div className="flex flex-wrap items-center gap-2"><Select onValueChange={addMonth}><SelectTrigger className="w-48"><SelectValue placeholder="Agregar mes futuro" /></SelectTrigger><SelectContent>{monthOptions.filter((value) => !months.includes(value)).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>{months.map((value) => <Badge key={value} variant="secondary">{value}</Badge>)}</div>}<Select value={clientId || 'all'} onValueChange={(value) => setClientId(value === 'all' ? '' : value)}><SelectTrigger><SelectValue placeholder="Todos los clientes" /></SelectTrigger><SelectContent><SelectItem value="all">Todos los clientes</SelectItem>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.nombre_del_negocio}</SelectItem>)}</SelectContent></Select><Button variant="secondary" onClick={() => void applyImpact()}><RefreshCw data-icon="inline-start" />Aplicar impacto</Button></div>
  </CardContent></Card>
}
