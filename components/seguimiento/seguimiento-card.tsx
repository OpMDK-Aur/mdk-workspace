'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CalendarClock, Link2, MoreHorizontal, Pencil, Plus, Trash2, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { STATUS_CONFIG } from '@/lib/tasks/task-store'
import type { Candidate, SeguimientoItem, TareaLite } from '@/lib/tasks/seguimiento-match'
import { ClientPicker, type ClienteOption } from './client-picker'
import { PRIORIDAD_STYLES } from './constants'

interface SeguimientoCardProps {
  item: SeguimientoItem
  tarea: TareaLite | undefined
  candidates: Candidate[]
  clientes: ClienteOption[]
  today: string
  onPatch: (patch: Partial<SeguimientoItem>) => void
  onEdit: () => void
  onDelete: () => void
  onCreateTask: () => void
}

export function SeguimientoCard({ item, tarea, candidates, clientes, today, onPatch, onEdit, onDelete, onCreateTask }: SeguimientoCardProps) {
  const done = item.completado
  const prioridad = item.prioridad ? PRIORIDAD_STYLES[item.prioridad] : null

  return (
    <article
      className={cn(
        'flex gap-3 rounded-2xl border border-border bg-card p-4 transition-opacity',
        done && 'opacity-60',
      )}
    >
      <Checkbox
        checked={done}
        onCheckedChange={(v) => onPatch({ completado: v === true })}
        aria-label={done ? `Marcar "${item.titulo}" como pendiente` : `Completar "${item.titulo}"`}
        className="mt-0.5 h-5 w-5 rounded-full"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className={cn('text-sm font-semibold leading-snug text-foreground text-pretty', done && 'line-through')}>
            {item.titulo}
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-7 w-7 shrink-0 rounded-full" aria-label="Acciones del ítem">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}><Pencil className="h-4 w-4" />Editar</DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" />Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {item.cliente_id ? (
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              {clientes.find((c) => c.id === item.cliente_id)?.nombre_del_negocio ?? item.cliente_nombre}
            </span>
          ) : (
            <ClientPicker
              clientes={clientes}
              value={null}
              size="sm"
              placeholder={item.cliente_nombre ? `${item.cliente_nombre} · vincular` : 'Vincular cliente'}
              onChange={(c) => c && onPatch({ cliente_id: c.id, cliente_nombre: c.nombre_del_negocio })}
              className="border-dashed text-muted-foreground"
            />
          )}
          {prioridad && (
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', prioridad.className)}>{prioridad.label}</span>
          )}
          <DueChip fecha={item.fecha_vencimiento} texto={item.deadline_texto} today={today} done={done} />
        </div>

        {item.detalles.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm leading-relaxed text-muted-foreground">
            {item.detalles.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span className="text-pretty">{d}</span>
              </li>
            ))}
          </ul>
        )}

        {item.grupo !== 'tarjetas' && item.cliente_id && (
          <MatchRow item={item} tarea={tarea} candidates={candidates} onPatch={onPatch} onCreateTask={onCreateTask} />
        )}
      </div>
    </article>
  )
}

function DueChip({ fecha, texto, today, done }: { fecha: string | null; texto: string | null; today: string; done: boolean }) {
  if (!fecha && !texto) return null
  let label = texto ?? ''
  let tone = 'bg-muted text-muted-foreground'
  if (fecha) {
    const [, m, d] = fecha.split('-')
    if (!done && fecha < today) {
      label = `Vencida · ${d}/${m}`
      tone = 'bg-mdk-pink/15 text-mdk-pink'
    } else if (!done && fecha === today) {
      label = 'Vence hoy'
      tone = 'bg-mdk-orange/15 text-mdk-orange'
    } else {
      label = `${d}/${m}`
    }
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tone)}>
      <CalendarClock className="h-3 w-3" aria-hidden />
      {label}
    </span>
  )
}

function MatchRow({ item, tarea, candidates, onPatch, onCreateTask }: Pick<SeguimientoCardProps, 'item' | 'tarea' | 'candidates' | 'onPatch' | 'onCreateTask'>) {
  const status = tarea ? STATUS_CONFIG[tarea.estado as keyof typeof STATUS_CONFIG] : null

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs">
      {item.tarea_id && tarea ? (
        <>
          <Link
            href={`/dashboard/tasks?task=${tarea.id}`}
            className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground hover:underline"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0 text-mdk-orange" aria-hidden />
            <span className="truncate">{tarea.titulo}</span>
          </Link>
          {status && <span className={cn('rounded-full px-2 py-0.5 font-medium', status.bgColor, status.color)}>{status.label}</span>}
          <CandidatePicker
            label="Vincular otra"
            candidates={candidates.filter((c) => c.id !== item.tarea_id)}
            onPick={(id) => onPatch({ tarea_id: id, match_estado: 'vinculada' })}
            onNone={() => onPatch({ tarea_id: null, match_estado: 'sin_match' })}
          />
        </>
      ) : item.match_estado === 'pendiente' ? (
        <>
          <span className="text-muted-foreground">Hay varias tareas parecidas</span>
          <CandidatePicker
            label="Elegir tarea"
            primary
            candidates={candidates}
            onPick={(id) => onPatch({ tarea_id: id, match_estado: 'vinculada' })}
            onNone={() => onPatch({ match_estado: 'sin_match' })}
          />
        </>
      ) : (
        <>
          <span className="text-muted-foreground">Sin tarea vinculada</span>
          <Button size="sm" onClick={onCreateTask} className="h-7 gap-1 rounded-full px-3 text-xs">
            <Plus className="h-3.5 w-3.5" />Crear tarea
          </Button>
          {candidates.length > 0 && (
            <CandidatePicker
              label="Vincular existente"
              candidates={candidates}
              onPick={(id) => onPatch({ tarea_id: id, match_estado: 'vinculada' })}
            />
          )}
        </>
      )}
    </div>
  )
}

function CandidatePicker({
  label,
  candidates,
  onPick,
  onNone,
  primary,
}: {
  label: string
  candidates: Candidate[]
  onPick: (id: string) => void
  onNone?: () => void
  primary?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={primary ? 'default' : 'ghost'} className="h-7 rounded-full px-3 text-xs">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1">
        {candidates.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">No hay otras tareas abiertas de este cliente.</p>
        ) : (
          <ul className="flex flex-col">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => { onPick(c.id); setOpen(false) }}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="min-w-0 truncate">{c.titulo}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{Math.round(c.score * 100)}%</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {onNone && (
          <button
            type="button"
            onClick={() => { onNone(); setOpen(false) }}
            className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
          >
            <Unlink className="h-3.5 w-3.5" />Ninguna, crear nueva
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
