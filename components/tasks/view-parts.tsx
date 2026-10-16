'use client'

import { useEffect, useState } from 'react'
import { addDays, differenceInCalendarDays, format, isSameDay, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Task, TaskPriority, TaskStatus } from '@/lib/types'

// Client colors are data identifiers, dark enough for white 8px codes (≥4.5:1).
const CLIENT_COLORS = ['#0E7490', '#1D4ED8', '#6D28D9', '#BE185D', '#C2410C', '#047857', '#B45309', '#B91C1C']

export const STATUS_DOT: Record<TaskStatus, string> = {
  pendiente_aprobacion: '#8B5CF6',
  pendiente: '#8A8A92',
  resolviendo: '#3B82F6',
  demorada: '#F97316',
  pausada: '#F59E0B',
  resuelto: '#22C55E',
  no_realizado: '#EF4444',
}

export const PRIORITY_STYLE: Record<TaskPriority, { label: string; bg: string; fg: string }> = {
  alta: { label: 'Alta', bg: 'var(--tasks-alta-bg)', fg: 'var(--tasks-alta-fg)' },
  media: { label: 'Media', bg: 'var(--tasks-media-bg)', fg: 'var(--tasks-media-fg)' },
  baja: { label: 'Baja', bg: 'var(--tasks-baja-bg)', fg: 'var(--tasks-baja-fg)' },
}

export type ClientRef = { id: string; name: string }
export type PersonRef = { id: string; nombre: string; apellido?: string | null; avatar_url?: string | null }

export function clientColor(key: string) {
  const sum = key.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return CLIENT_COLORS[sum % CLIENT_COLORS.length]
}

export function clientCode(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function getTaskClients(task: Pick<Task, 'clients' | 'clientId' | 'clientName'>): ClientRef[] {
  if (task.clients && task.clients.length > 0) {
    return task.clients.map((c) => ({ id: c.id, name: c.nombre_del_negocio }))
  }
  if (task.clientName) return [{ id: task.clientId || task.clientName, name: task.clientName }]
  return []
}

export function getTaskPeople(task: Pick<Task, 'assignees' | 'assigneeId' | 'assigneeName' | 'assigneeAvatar'>): PersonRef[] {
  if (task.assignees && task.assignees.length > 0) return task.assignees
  if (task.assigneeId && task.assigneeName && task.assigneeName !== 'Sin asignar') {
    return [{ id: task.assigneeId, nombre: task.assigneeName, avatar_url: task.assigneeAvatar ?? null }]
  }
  return []
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Removes a leading/trailing client name ("Cliente / Título", "Título - Cliente") from the title. */
export function stripClientFromTitle(title: string, clients: ClientRef[]) {
  let out = title
  for (const c of clients) {
    if (!c.name) continue
    const name = escapeRe(c.name.trim())
    out = out
      .replace(new RegExp(`^\\s*${name}\\s*[/\\-–—:|·]\\s*`, 'i'), '')
      .replace(new RegExp(`\\s*[/\\-–—:|·]\\s*${name}\\s*$`, 'i'), '')
  }
  return out.trim() || title
}

export const isOpenTask = (task: Pick<Task, 'status'>) => task.status !== 'resuelto' && task.status !== 'no_realizado'

export function toDate(value: Date | string | null | undefined) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function getDueInfo(task: Pick<Task, 'dueDate' | 'status' | 'updatedAt'>): { text: string; tone: 'overdue' | 'muted' } | null {
  if (task.status === 'resuelto') {
    const done = toDate(task.updatedAt) ?? toDate(task.dueDate)
    return done ? { text: `✓ ${format(done, 'd MMM', { locale: es })}`, tone: 'muted' } : null
  }
  const due = toDate(task.dueDate)
  if (!due) return null
  const diff = differenceInCalendarDays(startOfDay(due), startOfDay(new Date()))
  if (diff < 0 && isOpenTask(task)) return { text: `Vencida hace ${-diff} d`, tone: 'overdue' }
  if (diff === 0) return { text: 'Hoy', tone: 'muted' }
  if (diff === 1) return { text: 'Mañana', tone: 'muted' }
  return { text: format(due, 'd MMM', { locale: es }), tone: 'muted' }
}

export function formatCreated(task: Pick<Task, 'createdAt'>) {
  const d = toDate(task.createdAt)
  if (!d) return null
  return isSameDay(d, new Date()) ? 'hoy' : format(d, 'd MMM', { locale: es })
}

/** Conexa risk: in-progress work with no update for 5+ days. */
export function getRiskNote(task: Pick<Task, 'status' | 'updatedAt'>) {
  if (task.status !== 'resolviendo' && task.status !== 'demorada') return null
  const updated = toDate(task.updatedAt)
  if (!updated) return null
  const days = differenceInCalendarDays(new Date(), updated)
  return days >= 5 ? `Lleva ${days} días en curso sin actividad` : null
}

export function isDueTomorrow(task: Pick<Task, 'dueDate'>) {
  const due = toDate(task.dueDate)
  return Boolean(due && isSameDay(due, addDays(new Date(), 1)))
}

export function isOverdue(task: Pick<Task, 'dueDate' | 'status'>) {
  const due = toDate(task.dueDate)
  return Boolean(due && isOpenTask(task) && differenceInCalendarDays(startOfDay(due), startOfDay(new Date())) < 0)
}

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${seconds}s`
}

export function useLiveTime(task: Pick<Task, 'totalTimeSec' | 'isTimerRunning' | 'timerStartedAt'>) {
  const [live, setLive] = useState(task.totalTimeSec)
  useEffect(() => {
    if (!task.isTimerRunning || !task.timerStartedAt) {
      setLive(task.totalTimeSec)
      return
    }
    const started = new Date(task.timerStartedAt).getTime()
    const tick = () => setLive(task.totalTimeSec + Math.floor((Date.now() - started) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [task.isTimerRunning, task.timerStartedAt, task.totalTimeSec])
  return live
}

export function getTypeLabel(task: Pick<Task, 'typeName' | 'type'>) {
  const raw = task.typeName?.trim()
  if (raw) return raw
  const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(task.type ?? '')
  return task.type && !looksLikeUuid ? task.type.replace(/_/g, ' ') : null
}

export function ClientSquares({
  clients,
  size = 18,
  showNames = true,
  conexa = false,
  className,
}: {
  clients: ClientRef[]
  size?: 18 | 8 | 7
  showNames?: boolean
  conexa?: boolean
  className?: string
}) {
  const visible = clients.slice(0, 3)
  const names = clients.map((c) => c.name).join(' + ')
  const withCode = size === 18
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      {visible.length > 0 && (
        <div className="flex shrink-0">
          {visible.map((c, i) => (
            <span
              key={c.id}
              aria-hidden="true"
              className={cn(
                'flex items-center justify-center font-bold leading-none text-white',
                withCode ? 'rounded-[5px] text-[8px]' : 'rounded-[2px]',
              )}
              style={{
                width: size,
                height: size,
                background: clientColor(c.id),
                marginLeft: i === 0 ? 0 : withCode ? -4 : -2,
                boxShadow: withCode ? '0 0 0 1.5px var(--tasks-card)' : undefined,
                zIndex: visible.length - i,
              }}
            >
              {withCode ? clientCode(c.name) : null}
            </span>
          ))}
        </div>
      )}
      {showNames && (
        <span className="min-w-0 truncate text-[11.5px] text-[var(--tasks-text-3)]">{names || 'Sin cliente'}</span>
      )}
      {conexa && (
        <span className="shrink-0 text-[11.5px] text-[var(--tasks-cx-label)]" aria-label="Creada por Conexa" title="Creada por Conexa">
          ✦
        </span>
      )}
    </div>
  )
}

export function TypeChip({ label, className }: { label: string | null; className?: string }) {
  if (!label) return null
  const short = label.length > 24 ? `${label.slice(0, 23)}…` : label
  const chip = (
    <span
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-4',
        'bg-[var(--tasks-type-bg)] text-[var(--tasks-type-fg)]',
        className,
      )}
    >
      {short}
    </span>
  )
  if (short === label) return chip
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  const p = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.media
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold leading-4"
      style={{ background: p.bg, color: p.fg }}
    >
      {p.label}
    </span>
  )
}

function personName(p: PersonRef) {
  return [p.nombre, p.apellido].filter(Boolean).join(' ')
}

function personInitials(p: PersonRef) {
  return (
    p.nombre
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  )
}

export function PersonAvatar({ person, size = 20 }: { person: PersonRef; size?: 16 | 20 }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--tasks-count)] font-semibold text-[var(--tasks-text-2)]"
      style={{ width: size, height: size, fontSize: size === 16 ? 7 : 8, boxShadow: '0 0 0 1.5px var(--tasks-card)' }}
    >
      {person.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        personInitials(person)
      )}
    </span>
  )
}

export function PeopleStack({
  people,
  size = 20,
  max = 3,
  showSingleName = false,
}: {
  people: PersonRef[]
  size?: 16 | 20
  max?: number
  showSingleName?: boolean
}) {
  if (people.length === 0) {
    return (
      <span
        className="block shrink-0 rounded-full border border-dashed border-[var(--tasks-border-hover)]"
        style={{ width: size, height: size }}
        aria-label="Sin responsable"
        title="Sin responsable"
      />
    )
  }
  const visible = people.slice(0, max)
  const extra = people.length - visible.length
  const names = people.map(personName).join(', ')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 items-center gap-1.5" aria-label={`Responsables: ${names}`}>
          <span className="flex shrink-0">
            {visible.map((p, i) => (
              <span key={p.id} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: visible.length - i }} className="relative">
                <PersonAvatar person={p} size={size} />
              </span>
            ))}
            {extra > 0 && (
              <span
                className="relative flex items-center justify-center rounded-full bg-[var(--tasks-count)] font-semibold text-[var(--tasks-text-2)]"
                style={{ width: size, height: size, marginLeft: -6, fontSize: 8, boxShadow: '0 0 0 1.5px var(--tasks-card)' }}
              >
                +{extra}
              </span>
            )}
          </span>
          {showSingleName && people.length === 1 && (
            <span className="truncate text-[12.5px] text-[var(--tasks-text-2)]">{personName(people[0])}</span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {names}
      </TooltipContent>
    </Tooltip>
  )
}

export function TasksEmptyState({
  hasFilters,
  onClearFilters,
  onNewTask,
}: {
  hasFilters: boolean
  onClearFilters: () => void
  onNewTask: () => void
}) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-semibold text-[var(--tasks-text)]">
        {hasFilters ? 'No hay tareas con estos filtros' : 'Todavía no hay tareas'}
      </p>
      {hasFilters ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="h-8 rounded-lg border border-[var(--tasks-border)] bg-[var(--tasks-card)] px-3 text-[12.5px] font-semibold text-[var(--tasks-text)] hover:border-[var(--tasks-border-hover)]"
        >
          Limpiar filtros
        </button>
      ) : (
        <button
          type="button"
          onClick={onNewTask}
          className="h-[34px] rounded-full bg-[var(--tasks-brand)] px-4 text-[13px] font-bold text-[var(--tasks-on-brand)]"
        >
          + Nueva tarea
        </button>
      )}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--tasks-border)] bg-[var(--tasks-card)] p-3" aria-hidden="true">
      <div className="tasks-skeleton h-3 w-2/5 rounded" />
      <div className="tasks-skeleton h-4 w-16 rounded-full" />
      <div className="tasks-skeleton h-3.5 w-11/12 rounded" />
      <div className="tasks-skeleton h-3.5 w-3/5 rounded" />
      <div className="flex items-center justify-between">
        <div className="tasks-skeleton h-4 w-12 rounded-full" />
        <div className="tasks-skeleton h-5 w-5 rounded-full" />
      </div>
    </div>
  )
}
