'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { AlertTriangle, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { moveDevTask } from '@/app/actions/aurelia-followup'
import { DEV_CATEGORIES, DEV_STAGES, type AureliaDevData, type DevCategory, type DevStage, type DevTask } from '@/lib/aurelia/followup-shared'
import { normalizeName } from '@/lib/aurelia/onboarding-shared'
import { todayInArgentina } from '@/lib/aurelia/time-shared'
import { useAureliaDevTasks } from '../use-aurelia-followup'
import { DevTaskCard } from './dev-task-card'
import { DevTaskDialog, type DevTaskDraft } from './dev-task-dialog'

const ALL = '__all__'
const UNASSIGNED = '__none__'

type Drop = { etapa: DevStage; categoria?: DevCategory }

export function DevBoard() {
  const { data, isLoading, mutate } = useAureliaDevTasks()
  const [draft, setDraft] = useState<DevTaskDraft | null>(null)
  const [search, setSearch] = useState('')
  const [assignee, setAssignee] = useState(ALL)
  const deferredSearch = useDeferredValue(search)
  const today = todayInArgentina()
  const ready = data?.available ? data : null

  const tasks = useMemo(() => {
    const query = normalizeName(deferredSearch)
    return (ready?.tasks ?? []).filter((task) =>
      (assignee === ALL || (assignee === UNASSIGNED ? !task.asignadoId : task.asignadoId === assignee))
      && (!query || normalizeName(`${task.titulo} ${task.clientName ?? ''} ${task.descripcion ?? ''}`).includes(query)))
  }, [ready, assignee, deferredSearch])

  const move = async (taskId: string, drop: Drop) => {
    if (!ready) return
    const task = ready.tasks.find((item) => item.id === taskId)
    if (!task || (task.etapa === drop.etapa && (!drop.categoria || task.categoria === drop.categoria))) return
    const moved: DevTask = { ...task, etapa: drop.etapa, categoria: drop.categoria ?? task.categoria, posicion: Date.now() / 1000 }
    await mutate(
      async () => {
        const result = await moveDevTask(taskId, drop.etapa, drop.categoria)
        if (result.error) throw new Error(result.error)
        return undefined
      },
      {
        optimisticData: { ...ready, tasks: ready.tasks.map((item) => (item.id === taskId ? moved : item)) },
        rollbackOnError: true,
        populateCache: false,
        revalidate: true,
      },
    ).catch((error: Error) => toast.error(error.message))
  }

  if (data && !data.available) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        {data.message}
      </p>
    )
  }

  const byStage = (etapa: DevStage, categoria?: DevCategory) =>
    tasks.filter((task) => task.etapa === etapa && (!categoria || task.categoria === categoria)).sort((a, b) => a.posicion - b.posicion)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarea o cliente" className="pl-9" aria-label="Buscar tarea o cliente" />
        </div>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-48" aria-label="Filtrar por asignado"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los asignados</SelectItem>
            {ready && <SelectItem value={ready.viewerId}>Asignadas a mí</SelectItem>}
            <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
            {ready?.team.filter((member) => member.id !== ready.viewerId).map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="ml-auto gap-1.5" onClick={() => setDraft({ etapa: 'backlog', categoria: 'sugerencia' })} disabled={!ready}>
          <Plus className="size-4" aria-hidden="true" />
          Nueva tarea
        </Button>
      </div>

      <div className="flex min-h-[28rem] flex-1 gap-3 overflow-x-auto pb-2">
        {DEV_STAGES.map((stage) => stage.id === 'backlog' ? (
          <Column key={stage.id} label={stage.label} dot={stage.dot} count={byStage('backlog').length} wide>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 px-2 pb-2">
              {DEV_CATEGORIES.map((category) => (
                <DropZone key={category.id} drop={{ etapa: 'backlog', categoria: category.id }} onDrop={move} className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-[10px] bg-[var(--tasks-bg)] p-1.5">
                  <div className="flex items-center gap-1.5 px-1 pt-1">
                    <span className="text-[12px] font-semibold text-[var(--tasks-text-2)]">{category.label}</span>
                    <CountPill value={byStage('backlog', category.id).length} />
                  </div>
                  <Cards loading={isLoading} tasks={byStage('backlog', category.id)} today={today} showCategory={false} onOpen={(task) => setDraft({ task })} />
                  <AddButton label={`Agregar ${category.label.toLowerCase()}`} onClick={() => setDraft({ etapa: 'backlog', categoria: category.id })} disabled={!ready} />
                </DropZone>
              ))}
            </div>
          </Column>
        ) : (
          <Column key={stage.id} label={stage.label} dot={stage.dot} count={byStage(stage.id).length}>
            <DropZone drop={{ etapa: stage.id }} onDrop={move} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              <Cards loading={isLoading} tasks={byStage(stage.id)} today={today} showCategory onOpen={(task) => setDraft({ task })} />
            </DropZone>
            <AddButton label="Agregar tarea" onClick={() => setDraft({ etapa: stage.id, categoria: 'sugerencia' })} disabled={!ready} bordered />
          </Column>
        ))}
      </div>

      {ready && <DevTaskDialog draft={draft} team={ready.team} viewerId={ready.viewerId} onClose={() => setDraft(null)} onSaved={() => mutate()} />}
    </div>
  )
}

function Column({ label, dot, count, wide, children }: { label: string; dot: string; count: number; wide?: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={label} className={cn('flex shrink-0 flex-col overflow-hidden rounded-[14px] border border-[var(--tasks-border)] bg-[var(--tasks-col)]', wide ? 'w-[520px]' : 'w-[280px]')}>
      <header className="flex items-center gap-2 px-[14px] pb-2.5 pt-3">
        <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />
        <h3 className="truncate text-[13px] font-bold uppercase tracking-wide text-[var(--tasks-text)]">{label}</h3>
        <CountPill value={count} />
      </header>
      {children}
    </section>
  )
}

function CountPill({ value }: { value: number }) {
  return <span className="shrink-0 rounded-full bg-[var(--tasks-count)] px-1.5 text-[11.5px] font-semibold leading-5 text-[var(--tasks-text-2)]">{value}</span>
}

function DropZone({ drop, onDrop, className, children }: { drop: Drop; onDrop: (taskId: string, drop: Drop) => void; className?: string; children: React.ReactNode }) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(event) => { event.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const taskId = event.dataTransfer.getData('devTaskId')
        if (taskId) onDrop(taskId, drop)
      }}
      className={cn(className, 'outline-offset-[-2px] transition-[outline-color]', over ? 'outline-2 outline-dashed outline-[var(--tasks-brand)]' : 'outline-transparent')}
    >
      {children}
    </div>
  )
}

function Cards({ loading, tasks, today, showCategory, onOpen }: { loading: boolean; tasks: DevTask[]; today: string; showCategory: boolean; onOpen: (task: DevTask) => void }) {
  if (loading && tasks.length === 0) return <>{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-20 rounded-[10px]" />)}</>
  return (
    <>
      {tasks.map((task) => (
        <div
          key={task.id}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('devTaskId', task.id)
            event.dataTransfer.effectAllowed = 'move'
            event.currentTarget.classList.add('opacity-50')
          }}
          onDragEnd={(event) => event.currentTarget.classList.remove('opacity-50')}
        >
          <DevTaskCard task={task} today={today} showCategory={showCategory} onOpen={() => onOpen(task)} />
        </div>
      ))}
    </>
  )
}

function AddButton({ label, onClick, disabled, bordered }: { label: string; onClick: () => void; disabled?: boolean; bordered?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 px-[14px] pb-3 pt-2 text-left text-[12.5px] text-[var(--tasks-text-3)] hover:text-[var(--tasks-text)] disabled:opacity-50',
        bordered ? 'border-t border-[var(--tasks-border-soft)]' : 'mt-auto px-2 pb-1.5',
      )}
    >
      <Plus className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  )
}
