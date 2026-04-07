'use client'

import type { Client, DateRange } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Users, RefreshCw, Phone, Mail, Tag, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface GHLContact {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  source: string | null
  tags: string[]
  dateAdded: string | null
}

interface GHLResponse {
  contacts: GHLContact[]
  total: number
  totalUnfiltered?: number
  nextStartAfter: number | null
  nextStartAfterId: string | null
  error?: string
}

function getSourceBadge(source: string | null): { label: string; color: string } {
  const s = (source ?? '').toLowerCase().trim()
  if (s.includes('meta formulario')) return { label: source!, color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
  if (s.includes('meta whatsapp'))   return { label: source!, color: 'bg-green-500/15 text-green-400 border-green-500/30' }
  if (s.includes('meta'))            return { label: source!, color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
  if (s.includes('google'))          return { label: source!, color: 'bg-red-500/15 text-red-400 border-red-500/30' }
  return { label: source ?? 'Sin fuente', color: 'bg-muted text-muted-foreground border-border' }
}

function getDateBoundsFromRange(dateRange: DateRange) {
  const today = new Date()
  const pad = (d: Date) => d.toISOString().split('T')[0]
  if (dateRange.preset === 'custom' && dateRange.start && dateRange.end) {
    return { startDate: dateRange.start, endDate: dateRange.end }
  }
  const presetDays: Record<string, number> = {
    last_30d: 30, last_14d: 14, last_7d: 7, daily: 1, monthly: 30, yearly: 365,
  }
  const days = presetDays[dateRange.preset] ?? 30
  const start = new Date(today)
  start.setDate(today.getDate() - days)
  return { startDate: pad(start), endDate: pad(today) }
}

interface Filters { name: string; email: string; phone: string; source: string; tag: string }
const EMPTY: Filters = { name: '', email: '', phone: '', source: '', tag: '' }

export function GHLContactsCard({ client, dateRange }: { client: Client; dateRange: DateRange }) {
  const [contacts, setContacts]       = useState<GHLContact[]>([])
  const [total, setTotal]             = useState<number | null>(null)
  const [nextStartAfter, setNextSA]   = useState<number | null>(null)
  const [status, setStatus]           = useState<'loading' | 'error' | 'done'>('loading')
  const [error, setError]             = useState('')
  const [listOpen, setListOpen]       = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filters, setFilters]         = useState<Filters>(EMPTY)
  const nextSARef                     = useRef<number | null>(null)
  const fetchRef                      = useRef<((append: boolean, dr: DateRange) => Promise<void>) | null>(null)

  const doFetch = useCallback(async (append: boolean, dr: DateRange) => {
    if (!append) { setStatus('loading'); setContacts([]); setTotal(null); nextSARef.current = null; setNextSA(null) }
    else setLoadingMore(true)

    const { startDate, endDate } = getDateBoundsFromRange(dr)
    const params = new URLSearchParams({ client_id: client.id, startDate, endDate })
    if (append && nextSARef.current) params.set('startAfter', String(nextSARef.current))

    try {
      const res  = await fetch(`/api/ghl/contacts?${params}`)
      const data: GHLResponse = await res.json()
      if (data.error) throw new Error(data.error)
      setContacts(prev => append ? [...prev, ...data.contacts] : data.contacts)
      setTotal(data.total)
      nextSARef.current = data.nextStartAfter ?? null
      setNextSA(data.nextStartAfter ?? null)
      setStatus('done')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setError(msg)
      setStatus('error')
    } finally {
      setLoadingMore(false)
    }
  }, [client.id])

  // Stable string derived from dateRange — triggers re-fetch on any change
  const dateRangeKey = dateRange.preset === 'custom'
    ? `custom|${dateRange.start ?? ''}|${dateRange.end ?? ''}`
    : dateRange.preset

  // Keep ref in sync so the effect below can call it without being a dependency
  fetchRef.current = doFetch

  useEffect(() => {
    setFilters(EMPTY)
    setContacts([])
    setTotal(null)
    setNextSA(null)
    nextSARef.current = null
    setListOpen(false)
    fetchRef.current?.(false, dateRange)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, dateRangeKey])

  const uniqueSources = useMemo(() => {
    const set = new Set<string>()
    contacts.forEach(c => { if (c.source) set.add(c.source) })
    return Array.from(set).sort()
  }, [contacts])

  const uniqueTags = useMemo(() => {
    const set = new Set<string>()
    contacts.forEach(c => c.tags.forEach(t => set.add(t)))
    return Array.from(set).sort()
  }, [contacts])

  const filtered = useMemo(() => contacts.filter(c => {
    const fullName = `${c.firstName ?? ''} ${c.lastName ?? ''}`.toLowerCase()
    if (filters.name   && !fullName.includes(filters.name.toLowerCase())) return false
    if (filters.email  && !(c.email  ?? '').toLowerCase().includes(filters.email.toLowerCase())) return false
    if (filters.phone  && !(c.phone  ?? '').toLowerCase().includes(filters.phone.toLowerCase())) return false
    if (filters.source && (c.source ?? '') !== filters.source) return false
    if (filters.tag    && !c.tags.includes(filters.tag)) return false
    return true
  }), [contacts, filters])

  const activeCount  = Object.values(filters).filter(v => v !== '').length
  const displayName  = (c: GHLContact) => [c.firstName, c.lastName].filter(Boolean).join(' ') || '—'
  const formatDate   = (d: string | null) => d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—'
  const setF         = (k: keyof Filters, v: string) => setFilters(f => ({ ...f, [k]: f[k] === v ? '' : v }))
  const displayTotal = activeCount > 0 ? filtered.length : (total ?? null)

  return (
    <Card className="overflow-hidden relative border-border/60">
      <div className="h-0.5 w-full absolute top-0 left-0 bg-violet-500" />
      <CardContent className="pt-5 pb-5 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Contactos CRM</p>
            <p className="text-[11px] text-muted-foreground/60">{client.business_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-7 px-2"
              onClick={() => doFetch(false, dateRange)}>
              <RefreshCw className={cn('h-3 w-3', status === 'loading' && 'animate-spin')} />
            </Button>
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-violet-500/10">
              <Users className="h-4 w-4 text-violet-400" />
            </div>
          </div>
        </div>

        {/* Count */}
        <div>
          <p className="text-3xl font-bold tracking-tight text-foreground">
            {status === 'loading' ? '…' : displayTotal !== null ? displayTotal.toLocaleString('es-AR') : '—'}
          </p>
          {activeCount > 0 && total !== null && filtered.length !== total && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              de {total.toLocaleString('es-AR')} cargados
            </p>
          )}
          {status === 'error' && (
            <p className="text-xs text-destructive mt-1">{error}</p>
          )}
        </div>

        {/* Filters — always visible once data is loaded */}
        {status !== 'loading' && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-1.5">
              <Input placeholder="Nombre..." value={filters.name}
                onChange={e => setFilters(f => ({ ...f, name: e.target.value }))}
                className="h-7 text-xs" />
              <div className="grid grid-cols-2 gap-1.5">
                <Input placeholder="Email..." value={filters.email}
                  onChange={e => setFilters(f => ({ ...f, email: e.target.value }))}
                  className="h-7 text-xs" />
                <Input placeholder="Telefono..." value={filters.phone}
                  onChange={e => setFilters(f => ({ ...f, phone: e.target.value }))}
                  className="h-7 text-xs" />
              </div>
            </div>

            {uniqueSources.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Fuente</p>
                <div className="flex flex-wrap gap-1">
                  {uniqueSources.map(src => {
                    const badge = getSourceBadge(src)
                    const active = filters.source === src
                    return (
                      <button key={src} onClick={() => setF('source', src)}
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all',
                          active ? badge.color + ' ring-1 ring-violet-500/50'
                            : 'bg-transparent text-muted-foreground border-border/50 hover:border-border hover:text-foreground'
                        )}>
                        {src}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {uniqueTags.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {uniqueTags.map(tag => {
                    const active = filters.tag === tag
                    return (
                      <button key={tag} onClick={() => setF('tag', tag)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all',
                          active ? 'bg-violet-600/20 text-violet-300 border-violet-500/50 ring-1 ring-violet-500/50'
                            : 'bg-transparent text-muted-foreground border-border/50 hover:border-border hover:text-foreground'
                        )}>
                        <Tag className="h-2.5 w-2.5" />{tag}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {activeCount > 0 && (
              <button onClick={() => setFilters(EMPTY)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3 w-3" /> Limpiar filtros ({activeCount})
              </button>
            )}
          </div>
        )}

        {/* List toggle */}
        {status === 'done' && contacts.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => setListOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <ChevronDown className={cn('h-3 w-3 transition-transform', listOpen && 'rotate-180')} />
              {listOpen ? 'Ocultar lista' : `Ver lista (${filtered.length})`}
            </button>

            {listOpen && (
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Sin resultados para los filtros aplicados.</p>
                ) : filtered.map(c => {
                  const badge = getSourceBadge(c.source)
                  return (
                    <div key={c.id} className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{displayName(c)}</p>
                        <p className="text-[10px] text-muted-foreground shrink-0">{formatDate(c.dateAdded)}</p>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                        {c.email && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                            <Mail className="h-3 w-3 shrink-0" /><span className="truncate">{c.email}</span>
                          </span>
                        )}
                        {c.phone && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" />{c.phone}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 items-center">
                        {c.source && (
                          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', badge.color)}>
                            {badge.label}
                          </span>
                        )}
                        {c.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5 rounded-full">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {nextStartAfter && (
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5"
                    onClick={() => doFetch(true, dateRange)} disabled={loadingMore}>
                    {loadingMore ? <><RefreshCw className="h-3 w-3 animate-spin" /> Cargando...</> : 'Cargar mas'}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {status === 'done' && contacts.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin contactos en el periodo.</p>
        )}
      </CardContent>
    </Card>
  )
}

export function GHLComingSoonCard() {
  return (
    <Card className="overflow-hidden relative border-border/60 border-dashed opacity-70">
      <div className="h-0.5 w-full absolute top-0 left-0 bg-violet-500/40" />
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between mb-4">
          <p className="text-sm text-muted-foreground font-medium">Contactos CRM</p>
          <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-violet-500/10">
            <Users className="h-4 w-4 text-violet-400/60" />
          </div>
        </div>
        <p className="text-3xl font-bold tracking-tight text-foreground mb-3">—</p>
        <Button size="sm" variant="outline"
          className="h-7 text-xs gap-1.5 border-violet-500/40 text-violet-400">
          Configura CRM en Plataformas
        </Button>
      </CardContent>
    </Card>
  )
}
