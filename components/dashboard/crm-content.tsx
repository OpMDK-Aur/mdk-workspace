'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import type { Client, Profile } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  RefreshCw,
  Search,
  Users,
  Target,
  Mail,
  Phone,
  X,
  Calendar,
  DollarSign,
  Filter,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'

interface CRMContentProps {
  clients: Client[]
  allClients: Client[]
  profile?: Profile | null
}

interface GHLOpportunity {
  id: string
  name: string
  monetaryValue: number | null
  pipelineId: string
  pipelineStageId: string
  status: string
  source: string | null
  contact: {
    id: string
    name: string
    email: string | null
    phone: string | null
    tags: string[]
  } | null
  createdAt: string
  updatedAt: string
}

interface GHLContact {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  source: string | null
  tags: string[]
  dateAdded: string | null
  locationId: string
}

type DatePreset = 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d' | 'custom'

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'last_7d', label: 'Ultimos 7 dias' },
  { value: 'last_14d', label: 'Ultimos 14 dias' },
  { value: 'last_30d', label: 'Ultimos 30 dias' },
  { value: 'last_90d', label: 'Ultimos 90 dias' },
  { value: 'custom', label: 'Personalizado' },
]

function getDateRangeFromPreset(preset: DatePreset, customStart?: string, customEnd?: string) {
  const today = new Date()
  const pad = (d: Date) => format(d, 'yyyy-MM-dd')
  
  if (preset === 'custom' && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd }
  }
  
  const presetDays: Record<DatePreset, number> = {
    last_7d: 7,
    last_14d: 14,
    last_30d: 30,
    last_90d: 90,
    custom: 30,
  }
  
  const days = presetDays[preset]
  return { startDate: pad(subDays(today, days)), endDate: pad(today) }
}

function getSourceBadge(source: string | null): { label: string; color: string } {
  const s = (source ?? '').toLowerCase().trim()
  if (s.includes('meta formulario')) return { label: source!, color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
  if (s.includes('meta whatsapp'))   return { label: source!, color: 'bg-green-500/15 text-green-400 border-green-500/30' }
  if (s.includes('meta'))            return { label: source!, color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
  if (s.includes('google'))          return { label: source!, color: 'bg-red-500/15 text-red-400 border-red-500/30' }
  if (s.includes('direct') || s.includes('directo')) return { label: source!, color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' }
  if (s.includes('organic') || s.includes('organico')) return { label: source!, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
  return { label: source ?? 'Sin fuente', color: 'bg-muted text-muted-foreground border-border' }
}

function getStatusBadge(status: string): { label: string; color: string } {
  const s = status.toLowerCase()
  if (s === 'won') return { label: 'Ganado', color: 'bg-green-500/15 text-green-400 border-green-500/30' }
  if (s === 'lost') return { label: 'Perdido', color: 'bg-red-500/15 text-red-400 border-red-500/30' }
  if (s === 'open') return { label: 'Abierto', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' }
  if (s === 'abandoned') return { label: 'Abandonado', color: 'bg-gray-500/15 text-gray-400 border-gray-500/30' }
  return { label: status, color: 'bg-muted text-muted-foreground border-border' }
}

export function CRMContent({ clients, allClients }: CRMContentProps) {
  // Filters state
  const [selectedClientId, setSelectedClientId] = useState<string>(clients?.[0]?.id ?? '')
  const [datePreset, setDatePreset] = useState<DatePreset>('last_30d')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [tagFilter, setTagFilter] = useState<string>('')

  // Data state
  const [opportunities, setOpportunities] = useState<GHLOpportunity[]>([])
  const [contacts, setContacts] = useState<GHLContact[]>([])
  const [loadingOpps, setLoadingOpps] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [errorOpps, setErrorOpps] = useState('')
  const [errorContacts, setErrorContacts] = useState('')
  const [totalOppsUnfiltered, setTotalOppsUnfiltered] = useState(0)
  const [totalContactsUnfiltered, setTotalContactsUnfiltered] = useState(0)

  const selectedClient = clients.find(c => c.id === selectedClientId)

  const fetchOpportunities = useCallback(async () => {
    if (!selectedClientId) return
    
    setLoadingOpps(true)
    setErrorOpps('')
    
    const { startDate, endDate } = getDateRangeFromPreset(datePreset, customStartDate, customEndDate)
    const params = new URLSearchParams({ client_id: selectedClientId, startDate, endDate })

    try {
      const res = await fetch(`/api/ghl/opportunities?${params}`)
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOpportunities(data.opportunities ?? [])
      setTotalOppsUnfiltered(data.totalUnfiltered ?? data.opportunities?.length ?? 0)
    } catch (e) {
      setErrorOpps(e instanceof Error ? e.message : 'Error desconocido')
      setOpportunities([])
    } finally {
      setLoadingOpps(false)
    }
  }, [selectedClientId, datePreset, customStartDate, customEndDate])

  const fetchContacts = useCallback(async () => {
    if (!selectedClientId) return
    
    setLoadingContacts(true)
    setErrorContacts('')
    
    const { startDate, endDate } = getDateRangeFromPreset(datePreset, customStartDate, customEndDate)
    const params = new URLSearchParams({ client_id: selectedClientId, startDate, endDate })

    try {
      const res = await fetch(`/api/ghl/contacts?${params}`)
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setContacts(data.contacts ?? [])
      setTotalContactsUnfiltered(data.totalUnfiltered ?? data.contacts?.length ?? 0)
    } catch (e) {
      setErrorContacts(e instanceof Error ? e.message : 'Error desconocido')
      setContacts([])
    } finally {
      setLoadingContacts(false)
    }
  }, [selectedClientId, datePreset, customStartDate, customEndDate])

  // Fetch data when filters change
  useEffect(() => {
    if (selectedClientId) {
      fetchOpportunities()
      fetchContacts()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId, datePreset, customStartDate, customEndDate])

  // Extract unique values for filters
  const uniqueSources = useMemo(() => {
    const set = new Set<string>()
    opportunities.forEach(o => { if (o.source) set.add(o.source) })
    contacts.forEach(c => { if (c.source) set.add(c.source) })
    return Array.from(set).sort()
  }, [opportunities, contacts])

  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>()
    opportunities.forEach(o => { if (o.status) set.add(o.status) })
    return Array.from(set).sort()
  }, [opportunities])

  const uniqueTags = useMemo(() => {
    const set = new Set<string>()
    opportunities.forEach(o => o.contact?.tags.forEach(t => set.add(t)))
    contacts.forEach(c => c.tags.forEach(t => set.add(t)))
    return Array.from(set).sort()
  }, [opportunities, contacts])

  // Filter opportunities
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter(o => {
      const contactName = o.contact?.name?.toLowerCase() ?? ''
      const oppName = o.name?.toLowerCase() ?? ''
      const email = o.contact?.email?.toLowerCase() ?? ''
      const phone = o.contact?.phone?.toLowerCase() ?? ''
      
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        if (!contactName.includes(term) && !oppName.includes(term) && !email.includes(term) && !phone.includes(term)) {
          return false
        }
      }
      if (sourceFilter && o.source !== sourceFilter) return false
      if (statusFilter && o.status !== statusFilter) return false
      if (tagFilter && !o.contact?.tags.includes(tagFilter)) return false
      return true
    })
  }, [opportunities, searchTerm, sourceFilter, statusFilter, tagFilter])

  // Filter contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const fullName = `${c.firstName ?? ''} ${c.lastName ?? ''}`.toLowerCase()
      const email = c.email?.toLowerCase() ?? ''
      const phone = c.phone?.toLowerCase() ?? ''
      
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        if (!fullName.includes(term) && !email.includes(term) && !phone.includes(term)) {
          return false
        }
      }
      if (sourceFilter && c.source !== sourceFilter) return false
      if (tagFilter && !c.tags.includes(tagFilter)) return false
      return true
    })
  }, [contacts, searchTerm, sourceFilter, tagFilter])

  const clearFilters = () => {
    setSearchTerm('')
    setSourceFilter('')
    setStatusFilter('')
    setTagFilter('')
  }

  const activeFilterCount = [searchTerm, sourceFilter, statusFilter, tagFilter].filter(Boolean).length

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    try {
      return format(new Date(d), 'dd MMM yyyy', { locale: es })
    } catch {
      return d
    }
  }

  const formatMoney = (v: number | null) => {
    if (v == null) return '—'
    return `$${v.toLocaleString('es-AR')}`
  }

  if (clients.length === 0) {
    return (
      <div className="h-full">
        <header className="border-b border-border bg-card sticky top-0 z-10">
          <div className="px-6 py-4">
            <h1 className="text-xl font-semibold">CRM</h1>
            <div className="h-0.5 w-12 bg-primary mt-1.5 rounded-full" />
          </div>
        </header>
        <div className="p-6">
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg mb-2">Sin clientes con CRM configurado</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Configura las credenciales de Go High Level en la seccion de Plataformas para ver los datos del CRM.
              </p>
              <Button variant="outline" asChild>
                <a href="/dashboard/platform">Ir a Plataformas</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold">CRM</h1>
              <div className="h-0.5 w-12 bg-primary mt-1.5 rounded-full" />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Client selector */}
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Date preset selector */}
              <Select value={datePreset} onValueChange={(v: DatePreset) => setDatePreset(v)}>
                <SelectTrigger className="w-[160px] h-9">
                  <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {datePreset === 'custom' && (
                <>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="w-[140px] h-9"
                  />
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="w-[140px] h-9"
                  />
                </>
              )}

              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-2"
                disabled={loadingOpps || loadingContacts}
                onClick={() => { fetchOpportunities(); fetchContacts() }}
              >
                <RefreshCw className={cn('h-4 w-4', (loadingOpps || loadingContacts) && 'animate-spin')} />
                Actualizar
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Oportunidades</p>
                  <p className="text-2xl font-bold">{filteredOpportunities.length}</p>
                  {filteredOpportunities.length !== totalOppsUnfiltered && (
                    <p className="text-xs text-muted-foreground">de {totalOppsUnfiltered} totales</p>
                  )}
                </div>
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-violet-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Contactos</p>
                  <p className="text-2xl font-bold">{filteredContacts.length}</p>
                  {filteredContacts.length !== totalContactsUnfiltered && (
                    <p className="text-xs text-muted-foreground">de {totalContactsUnfiltered} totales</p>
                  )}
                </div>
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Valor total oportunidades</p>
                  <p className="text-2xl font-bold">
                    {formatMoney(filteredOpportunities.reduce((sum, o) => sum + (o.monetaryValue ?? 0), 0))}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Oportunidades ganadas</p>
                  <p className="text-2xl font-bold">
                    {filteredOpportunities.filter(o => o.status.toLowerCase() === 'won').length}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filtros
              </CardTitle>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                  <X className="h-3 w-3 mr-1" />
                  Limpiar ({activeFilterCount})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, email o telefono..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>

              {/* Source filter */}
              <Select value={sourceFilter || 'all'} onValueChange={v => setSourceFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Fuente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las fuentes</SelectItem>
                  {uniqueSources.map(src => (
                    <SelectItem key={src} value={src}>{src}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status filter */}
              <Select value={statusFilter || 'all'} onValueChange={v => setStatusFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {uniqueStatuses.map(st => {
                    const badge = getStatusBadge(st)
                    return <SelectItem key={st} value={st}>{badge.label}</SelectItem>
                  })}
                </SelectContent>
              </Select>

              {/* Tag filter */}
              {uniqueTags.length > 0 && (
                <Select value={tagFilter || 'all'} onValueChange={v => setTagFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-[150px] h-9">
                    <SelectValue placeholder="Etiqueta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las etiquetas</SelectItem>
                    {uniqueTags.map(tag => (
                      <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Opportunities and Contacts */}
        <Tabs defaultValue="opportunities" className="space-y-4">
          <TabsList>
            <TabsTrigger value="opportunities" className="gap-2">
              <Target className="h-4 w-4" />
              Oportunidades ({filteredOpportunities.length})
            </TabsTrigger>
            <TabsTrigger value="contacts" className="gap-2">
              <Users className="h-4 w-4" />
              Contactos ({filteredContacts.length})
            </TabsTrigger>
          </TabsList>

          {/* Opportunities Tab */}
          <TabsContent value="opportunities">
            <Card>
              <CardContent className="p-0">
                {errorOpps && (
                  <div className="p-4 text-sm text-destructive bg-destructive/10 border-b border-destructive/20">
                    {errorOpps}
                  </div>
                )}
                {loadingOpps ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Cargando oportunidades...
                  </div>
                ) : filteredOpportunities.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No hay oportunidades para los filtros seleccionados.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Contacto</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Telefono</TableHead>
                          <TableHead>Fuente</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Tags</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOpportunities.map(opp => {
                          const sourceBadge = getSourceBadge(opp.source)
                          const statusBadge = getStatusBadge(opp.status)
                          return (
                            <TableRow key={opp.id}>
                              <TableCell className="font-medium">{opp.name || '—'}</TableCell>
                              <TableCell>{opp.contact?.name || '—'}</TableCell>
                              <TableCell>
                                {opp.contact?.email ? (
                                  <span className="flex items-center gap-1 text-sm">
                                    <Mail className="h-3 w-3 text-muted-foreground" />
                                    {opp.contact.email}
                                  </span>
                                ) : '—'}
                              </TableCell>
                              <TableCell>
                                {opp.contact?.phone ? (
                                  <span className="flex items-center gap-1 text-sm">
                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                    {opp.contact.phone}
                                  </span>
                                ) : '—'}
                              </TableCell>
                              <TableCell>
                                <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold', sourceBadge.color)}>
                                  {sourceBadge.label}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold', statusBadge.color)}>
                                  {statusBadge.label}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatMoney(opp.monetaryValue)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDate(opp.createdAt)}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {opp.contact?.tags.slice(0, 2).map(tag => (
                                    <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                                  ))}
                                  {(opp.contact?.tags.length ?? 0) > 2 && (
                                    <Badge variant="secondary" className="text-[10px]">+{(opp.contact?.tags.length ?? 0) - 2}</Badge>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts">
            <Card>
              <CardContent className="p-0">
                {errorContacts && (
                  <div className="p-4 text-sm text-destructive bg-destructive/10 border-b border-destructive/20">
                    {errorContacts}
                  </div>
                )}
                {loadingContacts ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Cargando contactos...
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No hay contactos para los filtros seleccionados.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Telefono</TableHead>
                          <TableHead>Fuente</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Tags</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredContacts.map(contact => {
                          const sourceBadge = getSourceBadge(contact.source)
                          const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—'
                          return (
                            <TableRow key={contact.id}>
                              <TableCell className="font-medium">{fullName}</TableCell>
                              <TableCell>
                                {contact.email ? (
                                  <span className="flex items-center gap-1 text-sm">
                                    <Mail className="h-3 w-3 text-muted-foreground" />
                                    {contact.email}
                                  </span>
                                ) : '—'}
                              </TableCell>
                              <TableCell>
                                {contact.phone ? (
                                  <span className="flex items-center gap-1 text-sm">
                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                    {contact.phone}
                                  </span>
                                ) : '—'}
                              </TableCell>
                              <TableCell>
                                <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold', sourceBadge.color)}>
                                  {sourceBadge.label}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDate(contact.dateAdded)}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {contact.tags.slice(0, 2).map(tag => (
                                    <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                                  ))}
                                  {contact.tags.length > 2 && (
                                    <Badge variant="secondary" className="text-[10px]">+{contact.tags.length - 2}</Badge>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
