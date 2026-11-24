'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { createDevTask, deleteDevTask, updateDevTask } from '@/app/actions/aurelia-followup'
import { DEV_CATEGORIES, DEV_STAGES, formatDay, type DevCategory, type DevStage, type DevTask, type TeamMember } from '@/lib/aurelia/followup-shared'
import { todayInArgentina } from '@/lib/aurelia/time-shared'
import { ClientPicker, type PickedClient } from './client-picker'

const UNASSIGNED = '__none__'

export type DevTaskDraft = { task: DevTask } | { etapa: DevStage; categoria: DevCategory; client?: PickedClient; titulo?: string; descripcion?: string }

type Props = {
  draft: DevTaskDraft | null
  team: TeamMember[]
  viewerId: string
  onClose: () => void
  onSaved: () => Promise<unknown>
}

export function DevTaskDialog({ draft, team, viewerId, onClose, onSaved }: Props) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {draft && <DevTaskForm key={'task' in draft ? draft.task.id : `new-${draft.etapa}-${draft.categoria}`} draft={draft} team={team} viewerId={viewerId} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function DevTaskForm({ draft, team, viewerId, onClose, onSaved }: Props & { draft: DevTaskDraft }) {
  const existing = 'task' in draft ? draft.task : null
  const prefill = 'task' in draft ? null : draft
  const [titulo, setTitulo] = useState(existing?.titulo ?? prefill?.titulo ?? '')
  const [descripcion, setDescripcion] = useState(existing?.descripcion ?? prefill?.descripcion ?? '')
  const [etapa, setEtapa] = useState<DevStage>(existing?.etapa ?? ('etapa' in draft ? draft.etapa : 'backlog'))
  const [categoria, setCategoria] = useState<DevCategory>(existing?.categoria ?? ('categoria' in draft ? draft.categoria : 'sugerencia'))
  const [fechaPedido, setFechaPedido] = useState(existing?.fechaPedido ?? todayInArgentina())
  const [fechaFin, setFechaFin] = useState(existing?.fechaFin ?? '')
  const [asignadoId, setAsignadoId] = useState(existing?.asignadoId ?? UNASSIGNED)
  const [client, setClient] = useState<PickedClient>(existing?.clientId ? { id: existing.clientId, name: existing.clientName ?? 'Cliente' } : prefill?.client ?? null)
  const [pending, startTransition] = useTransition()

  const creator = existing ? existing.creadoPorName ?? 'Desconocido' : team.find((member) => member.id === viewerId)?.name ?? 'Vos'

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    startTransition(async () => {
      const input = {
        titulo,
        descripcion: descripcion || null,
        etapa,
        categoria,
        fechaPedido: fechaPedido || null,
        fechaFin: fechaFin || null,
        asignadoId: asignadoId === UNASSIGNED ? null : asignadoId,
        clientId: client?.id ?? null,
        clientName: client?.name ?? null,
      }
      const result = existing ? await updateDevTask(existing.id, input) : await createDevTask(input)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(existing ? 'Tarea actualizada' : 'Tarea creada')
      await onSaved()
      onClose()
    })
  }

  const remove = () => {
    if (!existing || !window.confirm('¿Borrar esta tarea? No se puede deshacer.')) return
    startTransition(async () => {
      const result = await deleteDevTask(existing.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Tarea borrada')
      await onSaved()
      onClose()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{existing ? 'Editar tarea de desarrollo' : 'Nueva tarea de desarrollo'}</DialogTitle>
        <DialogDescription>
          {!existing && 'Se suma al panel de Desarrollo. '}Creada por {creator}
          {existing && <> · actualizada {formatDay(existing.updatedAt)}</>}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dev-titulo">Título</Label>
        <Input id="dev-titulo" value={titulo} onChange={(event) => setTitulo(event.target.value)} maxLength={200} required autoFocus />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dev-descripcion">Descripción / próximos pasos</Label>
        <Textarea id="dev-descripcion" value={descripcion} onChange={(event) => setDescripcion(event.target.value)} rows={4} maxLength={4000} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dev-categoria">Categoría</Label>
          <Select value={categoria} onValueChange={(value) => setCategoria(value as DevCategory)}>
            <SelectTrigger id="dev-categoria" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEV_CATEGORIES.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dev-etapa">Etapa</Label>
          <Select value={etapa} onValueChange={(value) => setEtapa(value as DevStage)}>
            <SelectTrigger id="dev-etapa" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEV_STAGES.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dev-fecha-pedido">Fecha del pedido</Label>
          <Input id="dev-fecha-pedido" type="date" value={fechaPedido} onChange={(event) => setFechaPedido(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dev-fecha-fin">Fecha de fin</Label>
          <Input id="dev-fecha-fin" type="date" value={fechaFin} min={fechaPedido || undefined} onChange={(event) => setFechaFin(event.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dev-asignado">Asignado a</Label>
        <Select value={asignadoId} onValueChange={setAsignadoId}>
          <SelectTrigger id="dev-asignado" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
            {team.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dev-cliente">Cliente</Label>
        <ClientPicker id="dev-cliente" value={client} onChange={setClient} />
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {existing ? (
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove} disabled={pending}>
            <Trash2 className="size-4" aria-hidden="true" />
            Borrar
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button type="submit" disabled={pending || !titulo.trim()}>
            {pending && <Spinner />}
            {existing ? 'Guardar' : 'Crear tarea'}
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}
