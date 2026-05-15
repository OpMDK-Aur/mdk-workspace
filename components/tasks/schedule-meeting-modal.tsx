'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTaskStore } from '@/lib/tasks/task-store'
import type { TaskStatus, TaskPriority } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar, Clock, Users, Video, Loader2, CheckCircle2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DbCliente {
  id: string
  nombre_del_negocio: string
}

interface DbColaborador {
  id: string
  nombre: string
  apellido?: string
  avatar_url: string | null
}

interface DbTipoTarea {
  id: string
  nombre: string
}

interface ScheduleMeetingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ScheduleMeetingModal({ open, onOpenChange }: ScheduleMeetingModalProps) {
  const addTask = useTaskStore((s) => s.addTask)

  // Form state
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState('30')
  const [addMeet, setAddMeet] = useState(true)
  const [attendees, setAttendees] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('media')

  // DB data
  const [dbClientes, setDbClientes] = useState<DbCliente[]>([])
  const [dbColaboradores, setDbColaboradores] = useState<DbColaborador[]>([])
  const [dbTiposTarea, setDbTiposTarea] = useState<DbTipoTarea[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; nombre: string; avatar_url: string | null } | null>(null)

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successLink, setSuccessLink] = useState<{ hangout?: string; calendar?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load DB data and current user on open
  useEffect(() => {
    if (!open) return
    async function loadData() {
      const supabase = createClient()
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: colab } = await supabase
          .from('colaboradores')
          .select('id, nombre, apellido, avatar_url')
          .eq('user_id', user.id)
          .single()
        if (colab) setCurrentUser(colab as any)
      }
      
      const [clientesRes, colabRes, tiposRes] = await Promise.all([
        supabase.from('clientes').select('id, nombre_del_negocio').order('nombre_del_negocio'),
        supabase.from('colaboradores').select('id, nombre, apellido, avatar_url').order('nombre'),
        supabase.from('tipo_de_tareas').select('id, nombre').eq('activo', true).order('nombre'),
      ])
      if (clientesRes.data) setDbClientes(clientesRes.data)
      if (colabRes.data) setDbColaboradores(colabRes.data)
      if (tiposRes.data) setDbTiposTarea(tiposRes.data)
    }
    loadData()
  }, [open])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTitle('')
      setClientId('')
      setAssigneeId('')
      setDate('')
      setTime('')
      setDuration('30')
      setAddMeet(true)
      setAttendees('')
      setPriority('media')
      setSuccessLink(null)
      setError(null)
    }
  }, [open])

  const isValid = title.trim() && clientId && date && time

  const handleSubmit = async () => {
    if (!isValid) return
    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      
      // Get current user at time of submission
      const { data: { user } } = await supabase.auth.getUser()
      let submittingUser = currentUser
      if (user && !submittingUser) {
        const { data: colab } = await supabase
          .from('colaboradores')
          .select('id, nombre, apellido, avatar_url')
          .eq('user_id', user.id)
          .single()
        if (colab) submittingUser = colab as any
      }
      const fullName = submittingUser ? [submittingUser.nombre, submittingUser.apellido].filter(Boolean).join(' ') : 'Usuario'
      
      const client = dbClientes.find((c) => c.id === clientId)
      const assignee = dbColaboradores.find((c) => c.id === assigneeId) || dbColaboradores[0]
      const meetingTitle = `${title.trim()} - ${client?.nombre_del_negocio || 'Cliente'}`
      const startDateTime = new Date(`${date}T${time}`)
      const durationMin = parseInt(duration)
      const endDateTime = new Date(startDateTime.getTime() + durationMin * 60000)
      const attendeeList = attendees.split(',').map((e) => e.trim()).filter(Boolean)

      // Create Google Calendar event
      const response = await fetch('/api/google/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            title: meetingTitle,
            description: `Reunion con ${client?.nombre_del_negocio || 'cliente'}.\n\nCreado desde MDK Workspace.`,
            startDateTime: startDateTime.toISOString(),
            endDateTime: endDateTime.toISOString(),
            addMeet,
            attendees: attendeeList,
          },
        }),
      })

      const result = await response.json()

      if (result.needsReauth) {
        setError('Necesitas reconectar Google Calendar. Ve a Plataformas y reconecta tu cuenta.')
        setIsSubmitting(false)
        return
      }

      if (!result.success) {
        setError(result.error || 'Error al crear el evento en Google Calendar.')
        setIsSubmitting(false)
        return
      }

      // Create task linked to meeting
      const reunionTipo = dbTiposTarea.find((t) => t.nombre.toLowerCase().includes('reuni'))
      const meetingComment = [
        '<p><strong>Reunion agendada en Google Calendar</strong></p>',
        `<p>Fecha: ${startDateTime.toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short' })}</p>`,
        `<p>Duracion: ${durationMin} minutos</p>`,
        result.event?.hangoutLink ? `<p><a href="${result.event.hangoutLink}" target="_blank">Link de Google Meet</a></p>` : '',
        result.event?.htmlLink ? `<p><a href="${result.event.htmlLink}" target="_blank">Ver en Calendar</a></p>` : '',
      ].join('')

      console.log('[v0] Creating task with user:', fullName)
      
      await addTask({
        title: meetingTitle,
        description: null,
        clientId,
        clientName: client?.nombre_del_negocio || '',
        assigneeId: assignee?.id || '',
        assigneeName: assignee?.nombre || '',
        assigneeAvatar: assignee?.avatar_url || null,
        status: 'pendiente' as TaskStatus,
        priority,
        type: reunionTipo?.id || '',
        dueDate: startDateTime,
        customFields: {},
        createdById: submittingUser?.id || null,
        createdByName: fullName,
        comments: [{
          id: `comment-${Date.now()}`,
          content: meetingComment,
          userId: submittingUser?.id || 'system',
          userName: fullName,
          userAvatar: submittingUser?.avatar_url || '',
          createdAt: new Date(),
        }],
      })

      setSuccessLink({
        hangout: result.event?.hangoutLink,
        calendar: result.event?.htmlLink,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido al crear la reunion.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Agendar reunion
          </DialogTitle>
        </DialogHeader>

        {successLink ? (
          /* Success state */
          <div className="py-6 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <p className="font-medium text-base">Reunion agendada con exito</p>
              <p className="text-sm text-muted-foreground mt-1">El evento fue creado en Google Calendar y se genero la tarea.</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {successLink.hangout && (
                <Button size="sm" variant="outline" asChild>
                  <a href={successLink.hangout} target="_blank" rel="noreferrer">
                    <Video className="h-3.5 w-3.5 mr-1.5" />
                    Abrir Meet
                    <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                  </a>
                </Button>
              )}
              {successLink.calendar && (
                <Button size="sm" variant="outline" asChild>
                  <a href={successLink.calendar} target="_blank" rel="noreferrer">
                    <Calendar className="h-3.5 w-3.5 mr-1.5" />
                    Ver en Calendar
                    <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                  </a>
                </Button>
              )}
            </div>
            <Button className="mt-2 w-full" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        ) : (
          /* Form */
          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="meeting-title">Tema de la reunion <span className="text-destructive">*</span></Label>
              <Input
                id="meeting-title"
                placeholder="Ej: Revision mensual, Kick-off campana..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            {/* Client */}
            <div className="space-y-1.5">
              <Label>Cliente <span className="text-destructive">*</span></Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {dbClientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre_del_negocio}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="meeting-date">Fecha <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="meeting-date"
                    type="date"
                    className="pl-9"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meeting-time">Hora <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="meeting-time"
                    type="time"
                    className="pl-9"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <Label>Duracion</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutos</SelectItem>
                  <SelectItem value="30">30 minutos</SelectItem>
                  <SelectItem value="45">45 minutos</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="90">1 hora 30 minutos</SelectItem>
                  <SelectItem value="120">2 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assignee */}
            <div className="space-y-1.5">
              <Label>
                <Users className="inline h-3.5 w-3.5 mr-1.5 opacity-70" />
                Responsable
              </Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar responsable..." />
                </SelectTrigger>
                <SelectContent>
                  {dbColaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Attendees */}
            <div className="space-y-1.5">
              <Label htmlFor="meeting-attendees">Emails de invitados <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input
                id="meeting-attendees"
                placeholder="email@ejemplo.com, email2@ejemplo.com"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
              />
            </div>

            {/* Add Meet link */}
            <div className="flex items-center gap-2.5 py-1">
              <Checkbox
                id="add-meet"
                checked={addMeet}
                onCheckedChange={(v) => setAddMeet(v === true)}
              />
              <label htmlFor="add-meet" className="flex items-center gap-2 text-sm cursor-pointer">
                <Video className="h-4 w-4 text-muted-foreground" />
                Agregar link de Google Meet
              </label>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>
        )}

        {!successLink && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting}
              className={cn('gap-2', !isValid && 'opacity-50')}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Agendando...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4" />
                  Agendar reunion
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
