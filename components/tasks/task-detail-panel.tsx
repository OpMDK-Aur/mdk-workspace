'use client'

import { useEffect, useRef, useState } from 'react'
import type { Task, TaskStatus, TaskPriority, TaskType, TaskCustomField } from '@/lib/types'
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
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
import {
  Play,
  Pause,
  RotateCcw,
  Calendar as CalendarIcon,
  Plus,
  X,
  Clock,
  Trash2,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTimeShort(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

// ── Time Tracker Component ────────────────────────────────────────────────────

function TimeTracker({ task }: { task: Task }) {
  const { startTimer, stopTimer, updateTask } = useTaskStore()
  const [liveSeconds, setLiveSeconds] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (task.isTimerRunning && task.timerStartedAt) {
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - new Date(task.timerStartedAt!).getTime()) / 1000)
        setLiveSeconds(elapsed)
      }, 1000)
    } else {
      setLiveSeconds(0)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [task.isTimerRunning, task.timerStartedAt])

  const totalDisplay = task.totalTimeSec + (task.isTimerRunning ? liveSeconds : 0)

  const handleReset = () => {
    if (task.isTimerRunning) stopTimer(task.id)
    updateTask(task.id, { totalTimeSec: 0, timeSessions: [] })
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Time Tracker</span>
      </div>

      {/* Live timer display */}
      <div className="flex items-center justify-center mb-4">
        <span
          className={cn(
            'text-4xl font-mono tabular-nums tracking-tight',
            task.isTimerRunning && 'text-green-400'
          )}
        >
          {formatTime(totalDisplay)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {task.isTimerRunning ? (
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5"
            onClick={() => stopTimer(task.id)}
          >
            <Pause className="h-4 w-4" />
            Pausar
          </Button>
        ) : (
          <Button
            size="sm"
            className="gap-1.5 bg-green-600 hover:bg-green-700"
            onClick={() => startTimer(task.id)}
          >
            <Play className="h-4 w-4" />
            Iniciar
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleReset}>
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>

      {/* Previous sessions */}
      {task.timeSessions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium">Sesiones anteriores</p>
          <div className="max-h-24 overflow-y-auto space-y-1">
            {task.timeSessions.slice(-3).map((session, i) => (
              <div key={session.id} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{format(new Date(session.startedAt), 'dd/MM HH:mm', { locale: es })}</span>
                <span className="font-mono">{formatTimeShort(session.durationSec)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
            <span className="font-medium">Total acumulado</span>
            <span className="font-mono font-medium">{formatTimeShort(task.totalTimeSec)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Custom Fields Component ───────────────────────────────────────────────────

function CustomFields({ task }: { task: Task }) {
  const { addCustomField, removeCustomField, updateTask } = useTaskStore()
  const [isAdding, setIsAdding] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<TaskCustomField['type']>('text')

  const handleAddField = () => {
    if (!newFieldName.trim()) return
    const key = newFieldName.toLowerCase().replace(/\s+/g, '_')
    addCustomField(task.id, key, {
      label: newFieldName,
      type: newFieldType,
      value: '',
    })
    setNewFieldName('')
    setNewFieldType('text')
    setIsAdding(false)
  }

  const handleUpdateFieldValue = (key: string, value: string) => {
    const updated = {
      ...task.customFields,
      [key]: { ...task.customFields[key], value },
    }
    updateTask(task.id, { customFields: updated })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Campos personalizados</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Agregar
        </Button>
      </div>

      {/* Existing fields */}
      {Object.entries(task.customFields).map(([key, field]) => (
        <div key={key} className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-28 shrink-0">{field.label}</Label>
          <Input
            value={field.value}
            onChange={(e) => handleUpdateFieldValue(key, e.target.value)}
            className="h-8 text-sm"
            type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeCustomField(task.id, key)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {/* Add new field form */}
      {isAdding && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <Input
            placeholder="Nombre del campo"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as TaskCustomField['type'])}>
              <SelectTrigger className="h-8 text-sm flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="number">Numero</SelectItem>
                <SelectItem value="date">Fecha</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8" onClick={handleAddField}>
              Agregar
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setIsAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {Object.keys(task.customFields).length === 0 && !isAdding && (
        <p className="text-xs text-muted-foreground">Sin campos personalizados</p>
      )}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function TaskDetailPanel() {
  const { selectedTaskId, setSelectedTask, tasks, updateTask, addComment, deleteTask } = useTaskStore()
  const task = tasks.find((t) => t.id === selectedTaskId)
  const [comment, setComment] = useState('')

  if (!task) {
    return (
      <Sheet open={false}>
        <SheetContent />
      </Sheet>
    )
  }

  const statusConfig = STATUS_CONFIG[task.status]

  const handleAddComment = () => {
    if (!comment.trim()) return
    addComment(task.id, comment)
    setComment('')
  }

  return (
    <Sheet open={!!selectedTaskId} onOpenChange={(open) => !open && setSelectedTask(null)}>
      <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg leading-tight pr-8">{task.title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Status & Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Estado</Label>
              <Select
                value={task.status}
                onValueChange={(v) => updateTask(task.id, { status: v as TaskStatus })}
              >
                <SelectTrigger className={cn('h-9', statusConfig.bgColor, statusConfig.color)}>
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
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Prioridad</Label>
              <Select
                value={task.priority}
                onValueChange={(v) => updateTask(task.id, { priority: v as TaskPriority })}
              >
                <SelectTrigger className="h-9">
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
          </div>

          {/* Client, Assignee, Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Cliente</Label>
              <Select
                value={task.clientId}
                onValueChange={(v) => {
                  const client = CLIENTS.find((c) => c.id === v)
                  if (client) updateTask(task.id, { clientId: v, clientName: client.name })
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENTS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Asignado</Label>
              <Select
                value={task.assigneeId}
                onValueChange={(v) => {
                  const assignee = ASSIGNEES.find((a) => a.id === v)
                  if (assignee) updateTask(task.id, { assigneeId: v, assigneeName: assignee.name })
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNEES.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[9px]">{getInitials(a.name)}</AvatarFallback>
                        </Avatar>
                        {a.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Tipo</Label>
              <Select
                value={task.type}
                onValueChange={(v) => updateTask(task.id, { type: v as TaskType })}
              >
                <SelectTrigger className="h-9">
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
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Vencimiento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9 w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {task.dueDate ? format(task.dueDate, 'dd MMM yyyy', { locale: es }) : 'Sin fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={task.dueDate ?? undefined}
                    onSelect={(date) => updateTask(task.id, { dueDate: date ?? null })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Separator />

          {/* Time Tracker */}
          <TimeTracker task={task} />

          <Separator />

          {/* Custom Fields */}
          <CustomFields task={task} />

          <Separator />

          {/* Activity Log */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Actividad reciente</p>
            {task.activities.length > 0 ? (
              <div className="space-y-2">
                {task.activities.slice(0, 3).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-2 text-xs">
                    <Avatar className="h-5 w-5 mt-0.5">
                      <AvatarFallback className="text-[8px]">{getInitials(activity.userName)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="text-muted-foreground">{activity.action}</span>
                      <span className="text-muted-foreground/60 ml-1">
                        · {format(new Date(activity.timestamp), 'dd/MM HH:mm', { locale: es })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin actividad reciente</p>
            )}
          </div>

          <Separator />

          {/* Comments */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Comentarios</p>
            {task.comments.length > 0 && (
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {task.comments.map((c, i) => (
                  <div key={i} className="text-sm bg-muted/50 rounded-lg p-2">
                    {c}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                placeholder="Escribe un comentario..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="min-h-[60px] text-sm"
              />
            </div>
            <Button size="sm" onClick={handleAddComment} disabled={!comment.trim()}>
              Guardar
            </Button>
          </div>

          <Separator />

          {/* Delete */}
          <Button
            variant="ghost"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              deleteTask(task.id)
              setSelectedTask(null)
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar tarea
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
