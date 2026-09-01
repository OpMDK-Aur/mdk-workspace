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
import { Plus, Save, Trash2, Loader2 } from 'lucide-react'
import { generateMonthInstances } from '@/lib/service-map'
import type { FrecuenciaHito, HitoCatalogo, TipoServicio } from '@/lib/types'

type Draft = Omit<HitoCatalogo, 'id'>
const blank: Draft = { nombre: '', descripcion: null, orden: 1, tipo_servicio: 'esencial', frecuencia: 'Mensual', genera_tarea: true, requiere_link_drive: false, checklist_esencial: null, checklist_estrategico: null }
const frequencies: FrecuenciaHito[] = ['Mensual', 'Bimestral', 'Semanal', 'Semanal (Lun)', 'Semanal (Vie)', '2 Veces x Sem']

export function ServiceMapMilestoneEditor() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<HitoCatalogo[]>([])
  const [selected, setSelected] = useState<HitoCatalogo | null>(null)
  const [draft, setDraft] = useState<Draft>(blank)
  const [clientId, setClientId] = useState('')
  const [clients, setClients] = useState<Array<{ id: string; nombre_del_negocio: string; plan?: string | null }>>([])
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [currentMilestones, setCurrentMilestones] = useState<Array<{ id: string; mes: number; anio: number; estado: string; hito: { id: string; nombre: string; frecuencia: string; tipo_servicio: string } | null }>>([])
  const [loadingCurrent, setLoadingCurrent] = useState(false)

  const loadCurrentMilestones = useCallback(async (id: string) => {
    setLoadingCurrent(true)
    const now = new Date()
    const { data } = await supabase.from('mapa_servicio_instancias').select('id, mes, anio, estado, hito:hitos_catalogo(id, nombre, frecuencia, tipo_servicio)').eq('cliente_id', id).eq('mes', now.getMonth() + 1).eq('anio', now.getFullYear()).order('mes')
    setCurrentMilestones((data ?? []) as unknown as typeof currentMilestones)
    setLoadingCurrent(false)
  }, [supabase])

  useEffect(() => { if (clientId) void loadCurrentMilestones(clientId); else setCurrentMilestones([]) }, [clientId, loadCurrentMilestones])

  const load = useCallback(async () => {
    const { data } = await supabase.from('hitos_catalogo').select('*').order('tipo_servicio').order('orden')
    setItems((data ?? []) as HitoCatalogo[])
    const { data: clientData } = await supabase.from('clientes').select('id, nombre_del_negocio').order('nombre_del_negocio')
    setClients(clientData ?? [])
  }, [supabase])
  useEffect(() => { void load() }, [load])

  const choose = (item: HitoCatalogo) => { setSelected(item); setDraft({ ...item }); setNotice('') }
  const save = async () => {
    if (!draft.nombre.trim()) return setNotice('El nombre del hito es obligatorio.')
    if (!clientId) return setNotice('Seleccioná un cliente para guardar y actualizar sus hitos.')
    setSaving(true)
    const payload = { ...draft, nombre: draft.nombre.trim(), descripcion: draft.descripcion?.trim() || null }
    const query = selected ? supabase.from('hitos_catalogo').update(payload).eq('id', selected.id) : supabase.from('hitos_catalogo').insert(payload)
    const { error } = await query
    if (error) { setSaving(false); return setNotice(`No se pudo guardar: ${error.message}`) }
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()
    const { data: client } = await supabase.from('clientes').select('plan').eq('id', clientId).single()
    const { data: instances } = await supabase.from('mapa_servicio_instancias').select('id, tarea_id').eq('cliente_id', clientId).eq('mes', month).eq('anio', year)
    const taskIds = (instances ?? []).map((instance) => instance.tarea_id).filter((id): id is string => Boolean(id))
    if (taskIds.length) await supabase.from('tareas').delete().in('id', taskIds)
    const instanceIds = (instances ?? []).map((instance) => instance.id)
    if (instanceIds.length) await supabase.from('mapa_servicio_instancias').delete().in('id', instanceIds)
    const result = await generateMonthInstances(clientId, month, year, (client?.plan ?? draft.tipo_servicio) as any)
    setSaving(false)
    if (!result.success) return setNotice(`Hito guardado, pero no se pudo actualizar el mes corriente: ${result.error ?? 'error desconocido'}`)
    setNotice('Cambios guardados y aplicados desde el mes corriente. Los meses anteriores no fueron modificados.')
setSelected(null); setDraft(blank); await load(); await loadCurrentMilestones(clientId)
  }
  const remove = async () => {
    if (!selected) return
    const { error } = await supabase.from('hitos_catalogo').delete().eq('id', selected.id)
    if (error) return setNotice(`No se pudo borrar: ${error.message}`)
    setNotice('Hito borrado del catálogo. Las tareas históricas no se modifican.'); setSelected(null); setDraft(blank); await load()
  }

  return <Card className="mt-6"><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>Administrar hitos</CardTitle><CardDescription>Seleccioná un cliente para personalizar sus hitos. Los cambios se aplican desde el mes corriente.</CardDescription></div><div className="flex items-center gap-2"><Select value={clientId || 'all'} onValueChange={(value) => setClientId(value === 'all' ? '' : value)}><SelectTrigger className="w-64"><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger><SelectContent><SelectItem value="all">Seleccionar cliente</SelectItem>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.nombre_del_negocio}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="sm" onClick={() => { setSelected(null); setDraft(blank) }}><Plus data-icon="inline-start" />Nuevo hito</Button></div></div></CardHeader><CardContent className="flex flex-col gap-6">
    {notice && <Alert><AlertTitle>Mapa de servicio</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}
    <section className="rounded-xl border bg-muted/20 p-4" aria-labelledby="client-current-map-heading"><div className="flex items-start justify-between gap-4"><div><h3 id="client-current-map-heading" className="font-semibold">Hitos activos del mes corriente</h3><p className="text-sm text-muted-foreground">Seleccioná un cliente para ver cómo está configurado hoy.</p></div>{clientId && <Badge variant="secondary">{new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</Badge>}</div>{!clientId ? <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Elegí un cliente arriba para cargar sus hitos actuales.</div> : loadingCurrent ? <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border p-6 text-sm text-muted-foreground"><Loader2 className="animate-spin" />Cargando hitos actuales...</div> : currentMilestones.length === 0 ? <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Este cliente no tiene hitos generados para el mes corriente.</div> : <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{currentMilestones.map((instance) => <article key={instance.id} className="rounded-lg border bg-background p-3"><div className="flex items-start justify-between gap-2"><h4 className="font-medium">{instance.hito?.nombre ?? 'Hito sin catálogo'}</h4><Badge variant="outline">{instance.estado ?? 'pendiente'}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{instance.hito?.tipo_servicio ?? 'Sin plan'} · {instance.hito?.frecuencia ?? 'Sin frecuencia'}</p></article>)}</div>}</section>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex flex-col gap-3"><div><h3 className="font-semibold">Catálogo de hitos</h3><p className="text-sm text-muted-foreground">Elegí un hito para editarlo o creá uno nuevo.</p></div><div className="flex max-h-[32rem] flex-col gap-2 overflow-auto">{items.map((item) => <button type="button" key={item.id} onClick={() => choose(item)} className="flex items-start justify-between rounded-lg border p-3 text-left hover:bg-muted"><span><span className="block font-medium">{item.nombre}</span><span className="text-sm text-muted-foreground">{item.tipo_servicio} · {item.frecuencia}</span></span><Badge variant="outline">#{item.orden}</Badge></button>)}</div></div>
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm"><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm">Nombre<Input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} /></label><label className="flex flex-col gap-2 text-sm">Orden<Input type="number" value={draft.orden} onChange={(e) => setDraft({ ...draft, orden: Number(e.target.value) })} /></label></div><label className="flex flex-col gap-2 text-sm">Descripción<Textarea value={draft.descripcion ?? ''} onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm">Plan<Select value={draft.tipo_servicio} onValueChange={(value) => setDraft({ ...draft, tipo_servicio: value as TipoServicio })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="esencial">Esencial</SelectItem><SelectItem value="estrategico">Estratégico</SelectItem></SelectContent></Select></label><label className="flex flex-col gap-2 text-sm">Frecuencia<Select value={draft.frecuencia} onValueChange={(value) => setDraft({ ...draft, frecuencia: value as FrecuenciaHito })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{frequencies.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.genera_tarea} onCheckedChange={(checked) => setDraft({ ...draft, genera_tarea: checked === true })} />Genera tarea</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.requiere_link_drive} onCheckedChange={(checked) => setDraft({ ...draft, requiere_link_drive: checked === true })} />Requiere link de Drive</label><div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}{saving ? 'Guardando cambios...' : 'Guardar cambios'}</Button>{selected && <Button variant="destructive" onClick={() => void remove()}><Trash2 data-icon="inline-start" />Borrar</Button>}</div></div>
    </div>

  </CardContent></Card>
}
