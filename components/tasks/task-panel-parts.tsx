'use client'

import { differenceInCalendarDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarIcon, Copy, Link2, MoreHorizontal, Sparkles, Trash2 } from 'lucide-react'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore } from '@/lib/tasks/task-store'
import { useTimerStore } from '@/lib/time-tracking/timer-store'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function relativeDue(due: Date, done: boolean): { label: string; overdue: boolean } | null {
  if (done) return null
  const diff = differenceInCalendarDays(due, new Date())
  if (diff === 0) return { label: 'vence hoy', overdue: false }
  if (diff === 1) return { label: 'vence mañana', overdue: false }
  if (diff > 1) return { label: `vence en ${diff} días`, overdue: false }
  const ago = Math.abs(diff)
  return { label: `vencida hace ${ago} ${ago === 1 ? 'día' : 'días'}`, overdue: true }
}

function DateChip({
  label,
  value,
  onSelect,
  disabledBefore,
  tone,
}: {
  label: string
  value: Date | null
  onSelect: (d: Date | null) => void
  disabledBefore?: Date | null
  tone?: 'warn'
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${value ? format(value, 'd MMM yyyy', { locale: es }) : 'sin fecha'}`}
          className={cn(
            TASK_FIELD_CLASSES,
            'whitespace-nowrap border border-transparent',
            !value && 'text-[var(--task-text-3)]',
            tone === 'warn' && 'border-[var(--task-warn-border)] bg-[var(--task-warn-bg)] text-[var(--task-warn-text)]',
          )}
        >
          {value ? format(value, 'd MMM', { locale: es }) : 'Sin fecha'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(d) => onSelect(d ?? null)}
          disabled={disabledBefore ? { before: disabledBefore } : undefined}
          initialFocus
        />
        {value && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onSelect(null)}>
              Quitar fecha
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function TaskDatesField({
  task,
  onChange,
}: {
  task: Task
  onChange: (patch: Partial<Pick<Task, 'startDate' | 'dueDate'>>) => void
}) {
  const done = task.status === 'resuelto' || task.status === 'no_realizado'
  const rel = task.dueDate ? relativeDue(task.dueDate, done) : null
  const endBeforeStart =
    !!task.startDate && !!task.dueDate && differenceInCalendarDays(task.dueDate, task.startDate) < 0
  const hasError = endBeforeStart || !!rel?.overdue

  return (
    <div className="flex min-w-0 flex-col gap-1 py-0.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <DateChip label="Inicio" value={task.startDate} onSelect={(d) => onChange({ startDate: d })} />
        <span className="text-[var(--task-arrow)]" aria-hidden="true">→</span>
        <DateChip
          label="Vence"
          value={task.dueDate}
          onSelect={(d) => onChange({ dueDate: d })}
          disabledBefore={task.startDate}
          tone={hasError ? 'warn' : undefined}
        />
        {rel && !endBeforeStart && (
          <span className={cn('text-[12px]', rel.overdue ? 'text-[var(--task-warn-text)]' : 'text-[var(--task-text-3)]')}>
            {rel.label}
          </span>
        )}
      </div>
      {endBeforeStart && task.startDate && (
        <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--task-warn-text)]">
          La fecha de fin es anterior al inicio.
          <button
            type="button"
            onClick={() => onChange({ dueDate: task.startDate })}
            className="font-semibold text-[var(--task-cx-text)] hover:underline"
          >
            {`✦ Corregir a ${format(task.startDate, 'd MMM', { locale: es })}`}
          </button>
        </p>
      )}
    </div>
  )
}

export function OtherTimerNotice() {
  const runningTaskId = useTimerStore((s) => s.taskId)
  const description = useTimerStore((s) => s.description)
  const runningTitle = useTaskStore((s) =>
    runningTaskId ? s.tasks.find((t) => t.id === runningTaskId)?.title : undefined,
  )
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const label = runningTitle || description || 'otra tarea'

  return (
    <p className="min-w-0 text-[12px] text-[var(--task-text-3)] text-pretty">
      {'Tenés un timer corriendo en '}
      <span className="font-medium text-[var(--ntm-text)]">{label}</span>
      {'. Si iniciás este, se pausa. '}
      {runningTaskId && (
        <button
          type="button"
          onClick={() => setSelectedTask(runningTaskId)}
          className="font-medium underline underline-offset-2 text-[var(--ntm-text)] hover:no-underline"
        >
          Ver
        </button>
      )}
    </p>
  )
}

export function TaskMoreMenu({
  onDuplicate,
  onCopyLink,
  onDelete,
}: {
  onDuplicate: () => void
  onCopyLink: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Más acciones">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
          Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopyLink}>
          <Link2 className="h-4 w-4" />
          Copiar link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4" />
          Eliminar tarea
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const CONEXA_CLASSES =
  'bg-[#F3F3FE] border-[#CDD0F7] text-[#3F43C4] dark:bg-[#0F1028] dark:border-[#2E3070] dark:text-[#A5A8FF]'
export const BRAND_BUTTON_CLASSES =
  'bg-[#FF7F00] text-[#141414] hover:bg-[#FF7F00] hover:brightness-105 disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed'
export const SECTION_LABEL_CLASSES = 'text-[11px] font-bold uppercase tracking-[.08em] text-[var(--task-text-4,#6E6E76)]'

/** 30px value "field" used by every property in the task panel. */
export const TASK_FIELD_CLASSES =
  'inline-flex h-[30px] min-w-0 items-center gap-2 rounded-lg bg-[var(--task-field)] px-[11px] text-[13px] font-semibold text-[var(--task-text)] transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ntm-brand)]/40'

/** Overrides for shadcn SelectTrigger so it renders as a task field. */
export const TASK_SELECT_TRIGGER_CLASSES =
  '!h-[30px] w-auto rounded-lg border-0 bg-[var(--task-field)] dark:bg-[var(--task-field)] dark:hover:bg-[var(--task-field)] px-[11px] text-[13px] font-semibold text-[var(--task-text)] shadow-none [&>svg]:hidden focus-visible:ring-2 focus-visible:ring-[var(--ntm-brand)]/40'

export function FieldCaret() {
  return <span className="text-[var(--task-text-4)]" aria-hidden="true">▾</span>
}

export function PanelProp({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <>
      <dt className="flex min-h-[34px] items-start pt-[7px] whitespace-nowrap text-[13px] text-[var(--task-text-3)]">
        {label}
      </dt>
      <dd className="flex min-h-[34px] min-w-0 items-center">{children}</dd>
    </>
  )
}

const CONEXA_ACTIONS = ['Completar descripción', 'Dividir en subtareas', 'Estimar tiempo', 'Sugerir responsable']

export function ConexaBar({ onAction }: { onAction: (action: string) => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="mr-1 inline-flex items-center gap-1 text-[12px] font-bold text-[var(--task-cx-text)]">
        <span aria-hidden="true">✦</span>
        Conexa
      </span>
      {CONEXA_ACTIONS.map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => onAction(action)}
          className="h-7 rounded-full border border-[var(--task-chip-border)] px-3 text-[12px] font-semibold text-[var(--task-text-2)] transition-colors hover:border-[var(--task-cx-hover,#5B5FE8)] hover:text-[var(--task-text)]"
        >
          {action}
        </button>
      ))}
    </div>
  )
}

function describeLink(href: string): { title: string; kind: string } {
  try {
    const url = new URL(href)
    const host = url.hostname.replace(/^www\./, '')
    const path = url.pathname
    if (host === 'drive.google.com') {
      return { title: 'Google Drive', kind: path.includes('/folders/') ? 'carpeta' : 'archivo' }
    }
    if (host === 'docs.google.com') {
      if (path.startsWith('/spreadsheets')) return { title: 'Google Sheets', kind: 'planilla' }
      if (path.startsWith('/presentation')) return { title: 'Google Slides', kind: 'presentación' }
      if (path.startsWith('/forms')) return { title: 'Google Forms', kind: 'formulario' }
      return { title: 'Google Docs', kind: 'documento' }
    }
    if (host.endsWith('figma.com')) return { title: 'Figma', kind: 'diseño' }
    if (host.endsWith('canva.com')) return { title: 'Canva', kind: 'diseño' }
    return { title: host, kind: 'enlace' }
  } catch {
    return { title: href, kind: 'enlace' }
  }
}

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"{}|\\^`\[\]]*[^\s<>"{}|\\^`\[\].,;:!?()"']/gi

/**
 * Turns bare URLs in comment HTML into compact link cards. URLs that sit inside
 * an attribute (img src, existing href) or inside an existing <a> are left as-is.
 */
export function linkifyAsCards(html: string, options: { variant?: 'inline' | 'card' } = {}): string {
  const isCard = options.variant === 'card'
  // Trailing punctuation glued to a URL (e.g. "https://x.com;") would otherwise
  // render as a stray sign right after the chip, so it is consumed and dropped.
  const urlWithTrailing = new RegExp(`${URL_REGEX.source}(?:[.,;:!?)]+(?=\\s|<|&nbsp;|$))?`, 'gi')
  return html.replace(urlWithTrailing, (raw, offset: number, full: string) => {
    const match = raw.replace(/[.,;:!?)]+$/, '')
    const prev = full[offset - 1]
    if (prev === '"' || prev === "'" || prev === '=') return match
    const lastOpenA = full.lastIndexOf('<a', offset)
    if (lastOpenA !== -1 && full.lastIndexOf('</a>', offset) < lastOpenA) return match

    const href = match.startsWith('www.') ? `https://${match}` : match
    const { title, kind } = describeLink(href.replace(/&amp;/g, '&'))
    let domain = ''
    try { domain = new URL(href).hostname } catch { /* keep empty */ }
    if (isCard) {
      const icon = domain
        ? `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" alt="" class="size-[22px] shrink-0 rounded-md !m-0 !inline-block" />`
        : ''
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" title="${href}" class="link-card my-1 inline-flex max-w-full items-center gap-2.5 rounded-[10px] border border-[var(--task-card-border)] bg-[var(--task-card)] px-3 py-2 align-middle no-underline transition-colors hover:border-[var(--task-dashed)]">${icon}<span class="flex min-w-0 flex-col leading-tight"><span class="truncate text-[12.5px] font-semibold text-[var(--task-text)]">${title}</span><span class="truncate text-[11px] text-[var(--task-text-4)]">${domain || kind} · ${kind}</span></span></a>`
    }
    const favicon = domain
      ? `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="" class="size-4 shrink-0 rounded-sm !m-0 !inline-block" />`
      : ''
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" title="${href}" class="link-card my-0.5 inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1 align-middle text-[13px] text-foreground no-underline transition-colors hover:bg-muted">${favicon}<span class="truncate font-semibold">${title}</span><span class="shrink-0 text-muted-foreground">· ${kind}</span></a>`
  })
}
