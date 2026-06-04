'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTimerStore, type TimeEntry } from '@/lib/time-tracking/timer-store'
import { createClient } from '@/lib/supabase/client'
import type { Cliente, TipoDeTarea, Profile } from '@/lib/types'
import {
  formatDuration,
  formatDurationShort,
  getDayLabel,
} from '@/lib/time-tracking/mock-data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { Play, Trash2, DollarSign, Clock, Loader2, ChevronLeft, ChevronRight, ChevronDown, Users } from 'lucide-react'
import { toast } from 'sonner'

// Generate a color from client id for visual distinction
function getClientColor(id: string): string {
  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// Calculate total seconds for entries
function calculateTotalSeconds(entries: TimeEntry[]): number {
  return entries.reduce((acc, e) => acc + (e.duracion_seg || 0), 0)
}

interface GroupedEntries {
  date: string
  label: string
  total: number
  entries: TimeEntry[]
}

interface EntriesListProps {
  isMaster?: boolean
  currentUserId?: string
}

export function EntriesList({ isMaster = false, currentUserId }: EntriesListProps) {
  const { entries: storeEntries, continueEntry, deleteEntry, updateEntry, isLoading: storeLoading, loadEntries, isRunning, startedAt, getElapsedSeconds } = useTimerStore()
  
  // Admin mode state
  const [adminEntries, setAdminEntries] = useState<TimeEntry[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [colaboradores, setColaboradores] = useState<Profile[]>([])
  const [selectedColaboradores, setSelectedColaboradores] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  
  // Shared state
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tiposTarea, setTiposTarea] = useState<TipoDeTarea[]>([])
  const [runningElapsed, setRunningElapsed] = useState(0)

  // Use store entries for regular users, admin entries for masters
  const entries = isMaster ? adminEntries : storeEntries
  const isLoading = isMaster ? adminLoading : storeLoading

  // Load entries from Supabase on mount (for regular users)
  useEffect(() => {
    // Rehydrate store from localStorage to avoid lock conflicts
    useTimerStore.persist.rehydrate()
    
    if (!isMaster) {
      loadEntries()
    }
  }, [loadEntries, isMaster])

  // Load colaboradores for admin mode
  useEffect(() => {
    if (!isMaster) return
    
    async function fetchColaboradores() {
      const supabase = createClient()
      const { data } = await supabase
        .from('colaboradores')
        .select('id, nombre, apellido, email, rol')
        .order('nombre')
      if (data) setColaboradores(data.map(c => ({
        id: c.id,
        full_name: `${c.nombre}${c.apellido ? ' ' + c.apellido : ''}`,
        email: c.email,
        role: c.rol,
      })))
    }
    
    fetchColaboradores()
  }, [isMaster])

  // Load admin entries when filters change
  const loadAdminEntries = useCallback(async () => {
    if (!isMaster) return
    
    setAdminLoading(true)
    try {
      const supabase = createClient()
      
      // Parse month filter
      const [year, month] = selectedMonth.split('-').map(Number)
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59)
      
      let query = supabase
        .from('entradas_de_tiempo')
        .select('*')
        .gte('iniciado_en', startDate.toISOString())
        .lte('iniciado_en', endDate.toISOString())
        .order('iniciado_en', { ascending: false })
      
      // Filter by selected colaboradores
      if (selectedColaboradores.length > 0) {
        query = query.in('colaborador_id', selectedColaboradores)
      }
      
      const { data, error } = await query
      
      if (error) {
        console.error('Error loading admin entries:', error)
        setAdminEntries([])
      } else {
        setAdminEntries(data || [])
      }
    } finally {
      setAdminLoading(false)
    }
  }, [isMaster, selectedMonth, selectedColaboradores])

  useEffect(() => {
    if (isMaster) {
      loadAdminEntries()
    }
  }, [isMaster, loadAdminEntries])

  // Fetch clientes and tipos de tarea from Supabase
  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: clientesData } = await supabase.from('clientes').select('*').order('nombre_del_negocio')
      if (clientesData) setClientes(clientesData)

      const { data: tiposData } = await supabase.from('tipo_de_tareas').select('*').eq('activo', true).order('nombre')
      if (tiposData) setTiposTarea(tiposData)
    }

    fetchData()
  }, [])

  // Update running entry elapsed time every second
  useEffect(() => {
    if (!isRunning) {
      setRunningElapsed(0)
      return
    }

    setRunningElapsed(getElapsedSeconds())

    const interval = setInterval(() => {
      setRunningElapsed(getElapsedSeconds())
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning, startedAt, getElapsedSeconds])

  // Helper to get cliente by id
  const getCliente = (clienteId: string | null): Cliente | undefined => {
    if (!clienteId) return undefined
    return clientes.find((c) => c.id === clienteId)
  }

  // Helper to get tipo tarea by id
  const getTipoTarea = (tipoId: string | null): TipoDeTarea | undefined => {
    if (!tipoId) return undefined
    return tiposTarea.find((t) => t.id === tipoId)
  }

  // Helper to get colaborador by id
  const getColaborador = (colaboradorId: string | null): Profile | undefined => {
    if (!colaboradorId) return undefined
    return colaboradores.find((c) => c.id === colaboradorId)
  }

  // Separate running entry from completed entries
  const { runningEntry, completedEntries } = useMemo(() => {
    const running = entries.find((e) => e.finalizado_en === null)
    const completed = entries.filter((e) => e.finalizado_en !== null)
    return { runningEntry: running, completedEntries: completed }
  }, [entries])

  // Group completed entries by day
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, { isoDate: string; entries: TimeEntry[] }>()
    
    // Sort entries by iniciado_en descending
    const sorted = [...completedEntries].sort(
      (a, b) => new Date(b.iniciado_en).getTime() - new Date(a.iniciado_en).getTime()
    )

    sorted.forEach((entry) => {
      const dateKey = new Date(entry.iniciado_en).toDateString()
      const existing = groups.get(dateKey)
      if (existing) {
        existing.entries.push(entry)
      } else {
        groups.set(dateKey, { isoDate: entry.iniciado_en, entries: [entry] })
      }
    })

    const result: GroupedEntries[] = []
    groups.forEach((group) => {
      result.push({
        date: group.isoDate,
        label: getDayLabel(group.isoDate),
        total: calculateTotalSeconds(group.entries),
        entries: group.entries,
      })
    })

    return result
  }, [completedEntries])

  // Calculate total hours for the month (admin mode)
  const totalMonthSeconds = useMemo(() => {
    return entries.reduce((acc, e) => acc + (e.duracion_seg || 0), 0)
  }, [entries])

  const handleContinue = async (entry: TimeEntry) => {
    await continueEntry(entry)
    toast.success('Timer iniciado')
  }

  const handleDelete = async (id: string) => {
    if (isMaster) {
      // Direct delete for admin
      const supabase = createClient()
      await supabase.from('entradas_de_tiempo').delete().eq('id', id)
      setAdminEntries(prev => prev.filter(e => e.id !== id))
      toast.success('Entrada eliminada')
    } else {
      await deleteEntry(id)
      toast.success('Entrada eliminada')
    }
  }

  const handleUpdate = async (id: string, updates: Partial<TimeEntry>) => {
    if (isMaster) {
      // Direct update for admin
      const supabase = createClient()
      await supabase.from('entradas_de_tiempo').update(updates).eq('id', id)
      setAdminEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
    } else {
      await updateEntry(id, updates)
    }
  }

  // Month navigation
  const navigateMonth = (direction: 'prev' | 'next') => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const newDate = new Date(year, month - 1 + (direction === 'next' ? 1 : -1), 1)
    setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`)
  }

  const formatMonthLabel = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number)
    const date = new Date(year, month - 1, 1)
    return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground mt-4">Cargando entradas...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Admin Filters */}
      {isMaster && (
        <div className="flex flex-wrap items-center gap-3 p-4 bg-card border border-border rounded-lg">
          {/* Month Navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center capitalize">
              {formatMonthLabel(selectedMonth)}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Colaborador Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2 min-w-[180px] justify-between">
                <Users className="h-4 w-4" />
                <span>{selectedColaboradores.length === 0 ? 'Todos los colaboradores' : `${selectedColaboradores.length} seleccionado${selectedColaboradores.length > 1 ? 's' : ''}`}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 max-h-64 overflow-y-auto">
              {colaboradores.map(col => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={selectedColaboradores.includes(col.id)}
                  onCheckedChange={(checked) => {
                    setSelectedColaboradores(prev => 
                      checked ? [...prev, col.id] : prev.filter(id => id !== col.id)
                    )
                  }}
                >
                  {col.full_name || col.email}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear Filters */}
          {selectedColaboradores.length > 0 && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedColaboradores([])}>
              Limpiar filtros
            </Button>
          )}

          {/* Total Stats */}
          <div className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
            <span>{entries.length} entradas</span>
            <span className="font-medium text-foreground">{formatDurationShort(totalMonthSeconds)} total</span>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">
            No hay entradas de tiempo
          </h3>
          <p className="text-muted-foreground text-center max-w-sm">
            {isMaster 
              ? 'No se encontraron entradas para los filtros seleccionados.'
              : 'Comienza a registrar tu tiempo usando el botón de play en la barra superior.'}
          </p>
        </div>
      ) : (
        <>
          {/* Running Entry - Always at top with pulsing indicator (only for regular users) */}
          {!isMaster && runningEntry && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-verde opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-status-verde"></span>
                </div>
                <h3 className="font-medium text-foreground">En progreso</h3>
              </div>
              <RunningEntryRow
                entry={runningEntry}
                cliente={getCliente(runningEntry.cliente_id)}
                tipoTarea={getTipoTarea(runningEntry.tipo_tarea_id)}
                elapsedSeconds={runningElapsed}
              />
            </div>
          )}

          {/* Completed Entries grouped by day */}
          {groupedEntries.map((group) => (
            <div key={group.date}>
              {/* Day Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                <h3 className="font-medium text-foreground">{group.label}</h3>
                <span className="text-sm text-muted-foreground">
                  {formatDurationShort(group.total)}
                </span>
              </div>

              {/* Entries */}
              <div className="space-y-2">
                {group.entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    cliente={getCliente(entry.cliente_id)}
                    tipoTarea={getTipoTarea(entry.tipo_tarea_id)}
                    colaborador={isMaster ? getColaborador(entry.colaborador_id) : undefined}
                    clientes={clientes}
                    tiposTarea={tiposTarea}
                    colaboradores={isMaster ? colaboradores : []}
                    showColaborador={isMaster}
                    onContinue={() => handleContinue(entry)}
                    onUpdate={handleUpdate}
                    onDelete={() => handleDelete(entry.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

interface RunningEntryRowProps {
  entry: TimeEntry
  cliente?: Cliente
  tipoTarea?: TipoDeTarea
  elapsedSeconds: number
}

function RunningEntryRow({ entry, cliente, tipoTarea, elapsedSeconds }: RunningEntryRowProps) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-status-verde/10 border border-status-verde/30">
      {/* Client Color Dot */}
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: cliente ? getClientColor(cliente.id) : '#9ca3af' }}
      />

      {/* Description & Client */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {entry.descripcion}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {cliente && (
            <p className="text-xs text-muted-foreground truncate">
              {cliente.nombre_del_negocio}
            </p>
          )}
          {tipoTarea && (
            <span className="text-xs text-primary">{tipoTarea.nombre}</span>
          )}
        </div>
      </div>

      {/* Live Duration */}
      <div className="font-mono text-lg font-semibold tabular-nums text-status-verde shrink-0">
        {formatDuration(elapsedSeconds)}
      </div>

      {/* Billable Icon */}
      <div className="shrink-0">
        <DollarSign
          className={cn(
            'h-4 w-4',
            entry.facturable ? 'text-primary' : 'text-muted-foreground/40'
          )}
        />
      </div>
    </div>
  )
}

interface EntryRowProps {
  entry: TimeEntry
  cliente?: Cliente
  tipoTarea?: TipoDeTarea
  colaborador?: Profile
  clientes: Cliente[]
  tiposTarea?: TipoDeTarea[]
  colaboradores?: Profile[]
  showColaborador?: boolean
  onContinue: () => void
  onUpdate: (id: string, updates: Partial<TimeEntry>) => Promise<void>
  onDelete: () => void
}

function EntryRow({ 
  entry, 
  cliente, 
  tipoTarea, 
  colaborador,
  clientes, 
  tiposTarea = [], 
  colaboradores = [],
  showColaborador = false,
  onContinue, 
  onUpdate, 
  onDelete 
}: EntryRowProps) {
  const [editingField, setEditingField] = useState<'description' | 'client' | 'type' | 'start' | 'end' | 'colaborador' | null>(null)
  const [tempDescription, setTempDescription] = useState(entry.descripcion)
  const [tempClienteId, setTempClienteId] = useState(entry.cliente_id)
  const [tempTipoTareaId, setTempTipoTareaId] = useState(entry.tipo_tarea_id)
  const [tempStart, setTempStart] = useState('')
  const [tempEnd, setTempEnd] = useState('')

  // Format datetime for input (YYYY-MM-DDTHH:MM)
  const formatDateTimeForInput = (isoString: string | null) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    const offset = date.getTimezoneOffset()
    const local = new Date(date.getTime() - offset * 60000)
    return local.toISOString().slice(0, 16)
  }

  // Display: DD/MM HH:MM
  const getDateTimeDisplay = (isoString: string | null) => {
    if (!isoString) return '--'
    const date = new Date(isoString)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const hours = date.getHours().toString().padStart(2, '0')
    const mins = date.getMinutes().toString().padStart(2, '0')
    return `${day}/${month} ${hours}:${mins}`
  }

  const handleStartEditDescription = () => {
    setTempDescription(entry.descripcion)
    setEditingField('description')
  }

  const handleStartEditClient = () => {
    setTempClienteId(entry.cliente_id)
    setEditingField('client')
  }

  const handleStartEditType = () => {
    setTempTipoTareaId(entry.tipo_tarea_id)
    setEditingField('type')
  }

  const handleStartEditStart = () => {
    setTempStart(formatDateTimeForInput(entry.iniciado_en))
    setEditingField('start')
  }

  const handleStartEditEnd = () => {
    setTempEnd(formatDateTimeForInput(entry.finalizado_en))
    setEditingField('end')
  }

  const handleSaveDescription = async () => {
    if (tempDescription !== entry.descripcion) {
      await onUpdate(entry.id, { descripcion: tempDescription })
    }
    setEditingField(null)
  }

  const handleSaveClient = async (newClientId: string) => {
    if (newClientId !== entry.cliente_id) {
      await onUpdate(entry.id, { cliente_id: newClientId })
    }
    setEditingField(null)
  }

  const handleSaveType = async (newTipoId: string) => {
    if (newTipoId !== entry.tipo_tarea_id) {
      await onUpdate(entry.id, { tipo_tarea_id: newTipoId || null })
    }
    setEditingField(null)
  }

  const handleSaveColaborador = async (newColaboradorId: string) => {
    if (newColaboradorId !== entry.colaborador_id) {
      await onUpdate(entry.id, { colaborador_id: newColaboradorId })
    }
    setEditingField(null)
  }

  const handleSaveDateTime = async (field: 'start' | 'end', value: string) => {
    if (!value) { setEditingField(null); return }
    const newDate = new Date(value)
    const updates: Partial<TimeEntry> = {}
    if (field === 'start') {
      updates.iniciado_en = newDate.toISOString()
      if (entry.finalizado_en) {
        const endMs = new Date(entry.finalizado_en).getTime()
        updates.duracion_seg = Math.max(0, Math.floor((endMs - newDate.getTime()) / 1000))
      }
    } else {
      updates.finalizado_en = newDate.toISOString()
      const startMs = new Date(entry.iniciado_en).getTime()
      updates.duracion_seg = Math.max(0, Math.floor((newDate.getTime() - startMs) / 1000))
    }
    await onUpdate(entry.id, updates)
    setEditingField(null)
  }

  return (
    <div className="group flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/20 transition-colors">
      {/* Colaborador Badge (Admin mode only) */}
      {showColaborador && (
        <div className="min-w-[120px]">
          {editingField === 'colaborador' ? (
            <Select 
              value={entry.colaborador_id || ''} 
              onValueChange={(val) => handleSaveColaborador(val)}
              open={true}
              onOpenChange={(open) => !open && setEditingField(null)}
            >
              <SelectTrigger className="h-7 text-xs w-[120px]">
                <SelectValue placeholder="Colaborador" />
              </SelectTrigger>
              <SelectContent>
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name || c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge 
              variant="secondary" 
              className="text-xs cursor-pointer hover:bg-secondary/80 truncate max-w-[120px]"
              onClick={() => setEditingField('colaborador')}
            >
              {colaborador?.full_name?.split(' ')[0] || colaborador?.email?.split('@')[0] || 'Sin asignar'}
            </Badge>
          )}
        </div>
      )}

      {/* Client Color Dot + Client Selector */}
      <div className="flex items-center gap-2 min-w-[140px]">
        <div
          className="h-3 w-3 rounded-full shrink-0 cursor-pointer"
          style={{ backgroundColor: cliente ? getClientColor(cliente.id) : '#9ca3af' }}
          onClick={handleStartEditClient}
        />
        {editingField === 'client' ? (
          <Select 
            value={tempClienteId || ''} 
            onValueChange={(val) => handleSaveClient(val)}
            open={true}
            onOpenChange={(open) => !open && setEditingField(null)}
          >
            <SelectTrigger className="h-7 text-xs w-[120px]">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre_del_negocio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span 
            className="text-xs text-muted-foreground truncate cursor-pointer hover:text-foreground"
            onClick={handleStartEditClient}
          >
            {cliente?.nombre_del_negocio || 'Sin cliente'}
          </span>
        )}
      </div>

      {/* Description - Editable */}
      <div className="flex-1 min-w-0">
        {editingField === 'description' ? (
          <Input
            value={tempDescription}
            onChange={(e) => setTempDescription(e.target.value)}
            onBlur={handleSaveDescription}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveDescription()}
            className="h-7 text-sm"
            autoFocus
          />
        ) : (
          <p 
            className="text-sm font-medium text-foreground truncate cursor-pointer hover:text-primary"
            onClick={handleStartEditDescription}
          >
            {entry.descripcion || 'Sin descripcion'}
          </p>
        )}
        {editingField === 'type' ? (
          <Select 
            value={tempTipoTareaId || ''} 
            onValueChange={(val) => handleSaveType(val)}
            open={true}
            onOpenChange={(open) => !open && setEditingField(null)}
          >
            <SelectTrigger className="h-6 text-xs w-full mt-1">
              <SelectValue placeholder="Tipo de tarea" />
            </SelectTrigger>
            <SelectContent>
              {tiposTarea.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p 
            className="text-xs text-primary cursor-pointer hover:text-primary/80 mt-0.5"
            onClick={handleStartEditType}
          >
            {tipoTarea?.nombre || 'Añadir tipo'}
          </p>
        )}
      </div>

      {/* DateTime Range - Editable (fecha + hora) */}
      <div className="flex items-center gap-1 text-sm shrink-0">
        {editingField === 'start' ? (
          <Input
            type="datetime-local"
            value={tempStart}
            onChange={(e) => setTempStart(e.target.value)}
            onBlur={() => handleSaveDateTime('start', tempStart)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveDateTime('start', tempStart)}
            className="h-7 w-36 text-xs"
            autoFocus
          />
        ) : (
          <span 
            className="cursor-pointer hover:text-primary px-1 rounded hover:bg-muted text-xs"
            onClick={handleStartEditStart}
          >
            {getDateTimeDisplay(entry.iniciado_en)}
          </span>
        )}
        <span className="text-muted-foreground">-</span>
        {editingField === 'end' ? (
          <Input
            type="datetime-local"
            value={tempEnd}
            onChange={(e) => setTempEnd(e.target.value)}
            onBlur={() => handleSaveDateTime('end', tempEnd)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveDateTime('end', tempEnd)}
            className="h-7 w-36 text-xs"
            autoFocus
          />
        ) : (
          <span 
            className="cursor-pointer hover:text-primary px-1 rounded hover:bg-muted text-xs"
            onClick={handleStartEditEnd}
          >
            {getDateTimeDisplay(entry.finalizado_en)}
          </span>
        )}
      </div>

      {/* Duration */}
      <div className="font-mono text-sm font-medium tabular-nums w-16 text-right shrink-0">
        {formatDurationShort(entry.duracion_seg)}
      </div>

      {/* Billable Icon */}
      <div className="shrink-0">
        <DollarSign
          className={cn(
            'h-4 w-4',
            entry.facturable ? 'text-primary' : 'text-muted-foreground/40'
          )}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {!showColaborador && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onContinue}
            title="Continuar timer"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Eliminar entrada"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
