'use client'

import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { Archive, ArchiveRestore, ChevronsLeft, ChevronsRight, Filter, Loader2, MessageSquare, MessagesSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScoreGauge } from './score-gauge'

export interface ConversationSummary {
  id: string
  clientId: string
  clientName: string
  updatedAt: string
  lastMessagePreview: string | null
  lastMessageRole: 'user' | 'assistant' | null
  optimizationScore: number | null
  archived: boolean
  unidadesNegocio: string[]
  semaforo: string | null
  projectManagerId: string | null
  projectManagerName: string | null
  accountManagerId: string | null
  accountManagerName: string | null
}

const fetcher = (url: string) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error('No se pudieron cargar las conversaciones.')
    return response.json() as Promise<{ conversations: ConversationSummary[] }>
  })

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffHours = Math.round(diffMin / 60)
  if (diffHours < 24) return `hace ${diffHours} h`
  const diffDays = Math.round(diffHours / 24)
  return `hace ${diffDays} d`
}

const SEMAFORO_LABEL: Record<string, string> = { verde: 'Verde', amarillo: 'Amarillo', naranja: 'Naranja', rojo: 'Rojo' }
const SEMAFORO_DOT: Record<string, string> = {
  verde: 'bg-emerald-500',
  amarillo: 'bg-amber-400',
  naranja: 'bg-orange-500',
  rojo: 'bg-red-500',
}

export const CONVERSATIONS_SWR_KEY = '/api/ai/conversations'
const ARCHIVED_SWR_KEY = '/api/ai/conversations?includeArchived=1'

interface ConversationsSidebarProps {
  /** Hay un único chat por cliente, así que resaltamos por clientId en vez de conversationId. */
  activeClientId: string | null
  onSelect: (conversation: ConversationSummary) => void
}

export function ConversationsSidebar({ activeClientId, onSelect }: ConversationsSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [unidadFilter, setUnidadFilter] = useState<string>('all')
  const [pmFilter, setPmFilter] = useState<string>('all')
  const [amFilter, setAmFilter] = useState<string>('all')
  const [semaforoFilter, setSemaforoFilter] = useState<string>('all')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const swrKey = showArchived ? ARCHIVED_SWR_KEY : CONVERSATIONS_SWR_KEY
  const { data, error, isLoading } = useSWR(swrKey, fetcher, { refreshInterval: 30000 })
  const { mutate } = useSWRConfig()

  const allConversations = data?.conversations ?? []
  const visibleConversations = showArchived ? allConversations.filter((c) => c.archived) : allConversations

  const unidadOptions = useMemo(() => {
    const set = new Set<string>()
    for (const c of allConversations) for (const u of c.unidadesNegocio) set.add(u)
    return Array.from(set).sort()
  }, [allConversations])

  const pmOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of allConversations) if (c.projectManagerId) map.set(c.projectManagerId, c.projectManagerName ?? 'Sin nombre')
    return Array.from(map.entries())
  }, [allConversations])

  const amOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of allConversations) if (c.accountManagerId) map.set(c.accountManagerId, c.accountManagerName ?? 'Sin nombre')
    return Array.from(map.entries())
  }, [allConversations])

  const conversations = visibleConversations.filter((c) => {
    if (unidadFilter !== 'all' && !c.unidadesNegocio.includes(unidadFilter)) return false
    if (pmFilter !== 'all' && c.projectManagerId !== pmFilter) return false
    if (amFilter !== 'all' && c.accountManagerId !== amFilter) return false
    if (semaforoFilter !== 'all' && c.semaforo !== semaforoFilter) return false
    return true
  })

  const activeFilterCount = [unidadFilter, pmFilter, amFilter, semaforoFilter].filter((f) => f !== 'all').length
  const hasActiveFilters = activeFilterCount > 0

  async function handleArchiveToggle(conversation: ConversationSummary, event: MouseEvent | KeyboardEvent) {
    event.stopPropagation()
    setPendingId(conversation.id)
    try {
      const response = await fetch('/api/ai/conversations', {
        method: conversation.archived ? 'PATCH' : 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'No se pudo actualizar el chat.')
      toast.success(conversation.archived ? 'Chat restaurado.' : 'Chat archivado.')
      mutate(CONVERSATIONS_SWR_KEY)
      mutate(ARCHIVED_SWR_KEY)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar el chat.')
    } finally {
      setPendingId(null)
    }
  }

  if (collapsed) {
    return (
      <aside className="flex w-full shrink-0 flex-col items-center gap-2 rounded-lg border bg-card p-2 lg:sticky lg:top-8 lg:w-12 lg:self-start">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setCollapsed(false)}
          aria-label="Mostrar panel de chats"
          title="Mostrar panel de chats"
        >
          <ChevronsRight className="size-4" aria-hidden="true" />
        </Button>
        <MessagesSquare className="size-4 text-primary" aria-hidden="true" />
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        'flex w-full shrink-0 flex-col gap-3 rounded-lg border bg-card p-4',
        // Sticky solo desde lg: en desktop el panel queda fijo mientras se
        // hace scroll del contenido principal, con su propio scroll interno
        // si la lista de chats no entra en la altura disponible. En mobile
        // sigue el flujo normal de la página (position: static).
        'lg:sticky lg:top-8 lg:w-72 lg:max-h-[calc(100vh-4rem)] lg:self-start lg:overflow-y-auto',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MessagesSquare className="size-4 text-primary" aria-hidden="true" />
          {showArchived ? 'Chats archivados' : 'Chats activos'}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground"
          onClick={() => setCollapsed(true)}
          aria-label="Colapsar panel de chats"
          title="Colapsar panel de chats"
        >
          <ChevronsLeft className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs">
              <Filter className="size-3.5" aria-hidden="true" />
              Filtros
              {hasActiveFilters && <Badge variant="secondary" className="h-4 min-w-4 rounded-full px-1 text-[10px]">{activeFilterCount}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-64 flex-col gap-1.5">
            <FilterSelect placeholder="Unidad de negocio" value={unidadFilter} onChange={setUnidadFilter} options={unidadOptions.map((u) => ({ value: u, label: u }))} />
            <FilterSelect placeholder="Project Manager" value={pmFilter} onChange={setPmFilter} options={pmOptions.map(([id, name]) => ({ value: id, label: name }))} />
            <FilterSelect placeholder="Account Manager" value={amFilter} onChange={setAmFilter} options={amOptions.map(([id, name]) => ({ value: id, label: name }))} />
            <FilterSelect
              placeholder="Semáforo"
              value={semaforoFilter}
              onChange={setSemaforoFilter}
              options={Object.entries(SEMAFORO_LABEL).map(([value, label]) => ({ value, label }))}
              renderOption={(opt) => (
                <span className="flex items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', SEMAFORO_DOT[opt.value])} aria-hidden="true" />
                  {opt.label}
                </span>
              )}
            />
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 self-start px-1.5 text-xs text-muted-foreground"
                onClick={() => {
                  setUnidadFilter('all')
                  setPmFilter('all')
                  setAmFilter('all')
                  setSemaforoFilter('all')
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? 'Ver activos' : 'Ver archivados'}
        </Button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!isLoading && error && (
        <p className="text-sm text-muted-foreground">No se pudieron cargar los chats.</p>
      )}

      {!isLoading && !error && conversations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {showArchived ? 'No hay chats archivados con estos filtros.' : 'Todavía no iniciaste ninguna conversación.'}
        </p>
      )}

      {!isLoading && conversations.length > 0 && (
        <nav aria-label={showArchived ? 'Chats archivados' : 'Chats activos'} className="flex flex-col gap-1">
          {conversations.map((conversation) => {
            const isActive = !conversation.archived && conversation.clientId === activeClientId
            const isPending = pendingId === conversation.id
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'group flex flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors',
                  isActive ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-accent',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {conversation.semaforo && (
                      <span
                        className={cn('size-2 shrink-0 rounded-full', SEMAFORO_DOT[conversation.semaforo])}
                        aria-label={`Semáforo ${SEMAFORO_LABEL[conversation.semaforo] ?? conversation.semaforo}`}
                        title={`Semáforo ${SEMAFORO_LABEL[conversation.semaforo] ?? conversation.semaforo}`}
                      />
                    )}
                    {conversation.optimizationScore !== null && <ScoreGauge score={conversation.optimizationScore} />}
                    <span className="truncate text-sm font-medium text-foreground">{conversation.clientName}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="text-xs text-muted-foreground">{relativeTime(conversation.updatedAt)}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={conversation.archived ? 'Restaurar chat' : 'Archivar chat'}
                      title={conversation.archived ? 'Restaurar chat' : 'Archivar chat'}
                      onClick={(e) => handleArchiveToggle(conversation, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleArchiveToggle(conversation, e)
                        }
                      }}
                      className={cn(
                        'flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100',
                        isPending && 'opacity-100',
                      )}
                    >
                      {isPending ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : conversation.archived ? (
                        <ArchiveRestore className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Archive className="size-3.5" aria-hidden="true" />
                      )}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageSquare className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {conversation.lastMessagePreview
                      ? `${conversation.lastMessageRole === 'user' ? 'Vos: ' : ''}${conversation.lastMessagePreview}`
                      : 'Sin mensajes todavía'}
                  </span>
                </div>
              </button>
            )
          })}
        </nav>
      )}
    </aside>
  )
}

function FilterSelect({
  placeholder,
  value,
  onChange,
  options,
  renderOption,
}: {
  placeholder: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  renderOption?: (option: { value: string; label: string }) => ReactNode
}) {
  if (options.length === 0) return null
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}: todos</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {renderOption ? renderOption(option) : option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
