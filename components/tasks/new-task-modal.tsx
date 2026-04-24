'use client'

import { useState } from 'react'
import type { TaskStatus, TaskPriority, TaskType } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  useTaskStore,
  STATUS_CONFIG,
  STATUS_ORDER,
  PRIORITY_CONFIG,
  TYPE_CONFIG,
  ASSIGNEES,
  CLIENTS,
} from '@/lib/tasks/task-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface NewTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewTaskModal({ open, onOpenChange }: NewTaskModalProps) {
  const addTask = useTaskStore((s) => s.addTask)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState('')
  const [type, setType] = useState<TaskType>('crm')
  const [priority, setPriority] = useState<TaskPriority>('media')
  const [assigneeId, setAssigneeId] = useState('')
  const [status, setStatus] = useState<TaskStatus>('pendiente')
  const [dueDate, setDueDate] = useState<Date | undefined>()

  const handleSubmit = () => {
    if (!title.trim() || !clientId || !assigneeId) return

    const client = CLIENTS.find((c) => c.id === clientId)
    const assignee = ASSIGNEES.find((a) => a.id === assigneeId)

    if (!client || !assignee) return

    addTask({
      title: title.trim(),
      description: description.trim() || null,
      clientId,
      clientName: client.name,
      assigneeId,
      assigneeName: assignee.name,
      status,
      priority,
      type,
      dueDate: dueDate ?? null,
      customFields: {},
      comments: [],
    })

    // Reset form
    setTitle('')
    setDescription('')
    setClientId('')
    setType('crm')
    setPriority('media')
    setAssigneeId('')
    setStatus('pendiente')
    setDueDate(undefined)

    onOpenChange(false)
  }

  const isValid = title.trim() && clientId && assigneeId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Titulo *</Label>
            <Input
              id="title"
              placeholder="Describe la tarea..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Client & Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cliente *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {CLIENTS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_CONFIG) as TaskType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      <Badge variant="outline" className={cn('text-xs border-0', TYPE_CONFIG[t].color)}>
                        {TYPE_CONFIG[t].label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Priority & Assignee */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['alta', 'media', 'baja'] as TaskPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      <Badge variant="outline" className={cn('text-xs border-0', PRIORITY_CONFIG[p].bgColor, PRIORITY_CONFIG[p].color)}>
                        {PRIORITY_CONFIG[p].label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Asignado a *</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNEES.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status & Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Estado inicial</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      <div className="flex items-center gap-2">
                        <div className={cn('w-2 h-2 rounded-full', STATUS_CONFIG[s].bgColor.replace('/10', ''))} />
                        {STATUS_CONFIG[s].label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vencimiento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, 'dd MMM yyyy', { locale: es }) : 'Sin fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Descripcion</Label>
            <Textarea
              placeholder="Detalles adicionales..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid}>
            Crear tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
