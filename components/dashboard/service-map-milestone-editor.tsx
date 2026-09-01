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
    setSelected(null); setDraft(blank); await load()
  }
  const remove = async () => {
    if (!selected) return
    const { error } = await supabase.from('hitos_catalogo').delete().eq('id', selected.id)
    if (error) return setNotice(`No se pudo borrar: ${error.message}`)
    setNotice('Hito borrado del catálogo. Las tareas históricas no se modifican.'); setSelected(null); setDraft(blank); await load()
  }

  return <Card className="mt-6"><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>Administrar hitos</CardTitle><CardDescription>Seleccioná un cliente para personalizar sus hitos. Los cambios se aplican desde el mes corriente.</CardDescription></div><div className="flex items-center gap-2"><Select value={clientId || 'all'} onValueChange={(value) => setClientId(value === 'all' ? '' : value)}><SelectTrigger className="w-64"><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger><SelectContent><SelectItem value="all">Seleccionar cliente</SelectItem>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.nombre_del_negocio}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="sm" onClick={() => { setSelected(null); setDraft(blank) }}><Plus data-icon="inline-start" />Nuevo hito</Button></div></div></CardHeader><CardContent className="flex flex-col gap-6">
    {notice && <Alert><AlertTitle>Mapa de servicio</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex max-h-[32rem] flex-col gap-2 overflow-auto">{items.map((item) => <button type="button" key={item.id} onClick={() => choose(item)} className="flex items-start justify-between rounded-lg border p-3 text-left hover:bg-muted"><span><span className="block font-medium">{item.nombre}</span><span className="text-sm text-muted-foreground">{item.tipo_servicio} · {item.frecuencia}</span></span><Badge variant="outline">#{item.orden}</Badge></button>)}</div>
      <div className="flex flex-col gap-4 rounded-lg border p-4"><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm">Nombre<Input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} /></label><label className="flex flex-col gap-2 text-sm">Orden<Input type="number" value={draft.orden} onChange={(e) => setDraft({ ...draft, orden: Number(e.target.value) })} /></label></div><label className="flex flex-col gap-2 text-sm">Descripción<Textarea value={draft.descripcion ?? ''} onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm">Plan<Select value={draft.tipo_servicio} onValueChange={(value) => setDraft({ ...draft, tipo_servicio: value as TipoServicio })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="esencial">Esencial</SelectItem><SelectItem value="estrategico">Estratégico</SelectItem></SelectContent></Select></label><label className="flex flex-col gap-2 text-sm">Frecuencia<Select value={draft.frecuencia} onValueChange={(value) => setDraft({ ...draft, frecuencia: value as FrecuenciaHito })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{frequencies.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.genera_tarea} onCheckedChange={(checked) => setDraft({ ...draft, genera_tarea: checked === true })} />Genera tarea</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.requiere_link_drive} onCheckedChange={(checked) => setDraft({ ...draft, requiere_link_drive: checked === true })} />Requiere link de Drive</label><div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}{saving ? 'Guardando cambios...' : 'Guardar cambios'}</Button>{selected && <Button variant="destructive" onClick={() => void remove()}><Trash2 data-icon="inline-start" />Borrar</Button>}</div></div>
    </div>

  </CardContent></Card>
}
