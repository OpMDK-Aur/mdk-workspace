'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SeguimientoGrupo, SeguimientoItem } from '@/lib/tasks/seguimiento-match'
import { ClientPicker, type ClienteOption } from './client-picker'
import { GRUPO_LABELS, GRUPO_ORDER } from './constants'

export type ItemDraft = Pick<
  SeguimientoItem,
  'grupo' | 'cliente_id' | 'cliente_nombre' | 'titulo' | 'detalles' | 'prioridad' | 'fecha_vencimiento' | 'deadline_texto'
>

interface ItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: SeguimientoItem | null
  clientes: ClienteOption[]
  onSubmit: (draft: ItemDraft) => Promise<void>
}

export function ItemDialog({ open, onOpenChange, item, clientes, onSubmit }: ItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Editar ítem' : 'Nuevo ítem de seguimiento'}</DialogTitle>
        </DialogHeader>
        {open && <ItemForm key={item?.id ?? 'new'} item={item} clientes={clientes} onSubmit={onSubmit} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ItemForm({ item, clientes, onSubmit, onCancel }: Omit<ItemDialogProps, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const [grupo, setGrupo] = useState<SeguimientoGrupo>(item?.grupo ?? 'semana')
  const [cliente, setCliente] = useState<{ id: string | null; nombre: string | null }>({
    id: item?.cliente_id ?? null,
    nombre: item?.cliente_nombre ?? null,
  })
  const [titulo, setTitulo] = useState(item?.titulo ?? '')
  const [detalles, setDetalles] = useState((item?.detalles ?? []).join('\n'))
  const [prioridad, setPrioridad] = useState<string>(item?.prioridad ?? 'ninguna')
  const [fecha, setFecha] = useState(item?.fecha_vencimiento ?? '')
  const [deadlineTexto, setDeadlineTexto] = useState(item?.deadline_texto ?? '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) return
    setSaving(true)
    try {
      await onSubmit({
        grupo,
        cliente_id: cliente.id,
        cliente_nombre: cliente.nombre,
        titulo: titulo.trim(),
        detalles: detalles.split('\n').map((d) => d.trim()).filter(Boolean),
        prioridad: prioridad === 'ninguna' ? null : (prioridad as SeguimientoItem['prioridad']),
        fecha_vencimiento: fecha || null,
        deadline_texto: deadlineTexto.trim() || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="seg-titulo">Título</Label>
        <Input id="seg-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required autoFocus />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Grupo</Label>
          <Select value={grupo} onValueChange={(v) => setGrupo(v as SeguimientoGrupo)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GRUPO_ORDER.map((g) => <SelectItem key={g} value={g}>{GRUPO_LABELS[g]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Cliente</Label>
          <ClientPicker
            clientes={clientes}
            value={cliente.id}
            placeholder={cliente.nombre ?? 'Elegir cliente'}
            onChange={(c) => setCliente({ id: c?.id ?? null, nombre: c?.nombre_del_negocio ?? null })}
            className="rounded-md"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Prioridad</Label>
          <Select value={prioridad} onValueChange={setPrioridad}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ninguna">Sin prioridad</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Media</SelectItem>
              <SelectItem value="baja">Baja</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="seg-fecha">Vencimiento</Label>
          <Input id="seg-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="seg-deadline">Plazo en texto (opcional)</Label>
        <Input id="seg-deadline" placeholder="Semanal, Depende del cliente..." value={deadlineTexto} onChange={(e) => setDeadlineTexto(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="seg-detalles">Detalles (uno por línea)</Label>
        <Textarea id="seg-detalles" rows={4} value={detalles} onChange={(e) => setDetalles(e.target.value)} />
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" className="rounded-full" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={saving || !titulo.trim()} className="rounded-full">
          {saving ? 'Guardando...' : item ? 'Guardar cambios' : 'Crear ítem'}
        </Button>
      </DialogFooter>
    </form>
  )
}
