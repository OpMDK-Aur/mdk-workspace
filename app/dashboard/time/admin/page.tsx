'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Cliente, TipoDeTarea, Profile } from '@/lib/types'
import {
  formatDurationShort,
  getDayLabel,
} from '@/lib/time-tracking/mock-data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { 
  Pencil, 
  Trash2, 
  DollarSign, 
  Clock, 
  Loader2, 
  ChevronLeft, 
  ChevronRight,
  Users,
  Calendar,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { redirect } from 'next/navigation'

interface TimeEntry {
  id: string
  colaborador_id: string | null
  cliente_id: string | null
  tipo_tarea_id: string | null
  descripcion: string
  iniciado_en: string
  finalizado_en: string | null
  duracion_seg: number | null
  facturable: boolean
}

interface GroupedEntries {
  date: string
  label: string
  total: number
  entries: TimeEntry[]
}

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

function calculateTotalSeconds(entries: TimeEntry[]): number {
  return entries.reduce((acc, e) => acc + (e.duracion_seg || 0), 0)
}

export default function TimeAdminPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tiposTarea, setTiposTarea] = useState<TipoDeTarea[]>([])
  const [colaboradores, setColaboradores] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedColaboradores, setSelectedColaboradores] = useState<string[]>([])
  
  // Edit dialog
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [editClienteId, setEditClienteId] = useState<string | null>(null)
  const [editColaboradorId, setEditColaboradorId] = useState<string | null>(null)
  const [editIniciadoEn, setEditIniciadoEn] = useState('')
  const [editFinalizadoEn, setEditFinalizadoEn] = useState('')
  
  // Delete dialog
  const [deletingEntry, setDeletingEntry] = useState<TimeEntry | null>(null)

  // Check if user is master
  useEffect(() => {
    async function checkAccess() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        redirect('/login')
        return
      }
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (!profile || profile.role !== 'master') {
        redirect('/dashboard/time')
        return
      }
      
      setCurrentProfile(profile)
    }
    
    checkAccess()
  }, [])

  // Load data
  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      
      // Fetch colaboradores
      const { data: colabData } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name')
      if (colabData) setColaboradores(colabData)
      
      // Fetch clientes
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre_del_negocio')
      if (clientesData) setClientes(clientesData)
      
      // Fetch tipos de tarea
      const { data: tiposData } = await supabase
        .from('tipo_de_tareas')
        .select('*')
        .eq('activo', true)
        .order('nombre')
      if (tiposData) setTiposTarea(tiposData)
    }
    
    fetchData()
  }, [])

  // Load entries based on filters
  useEffect(() => {
    async function loadEntries() {
      if (!currentProfile) return
      
      setIsLoading(true)
      const supabase = createClient()
      
      // Calculate date range for selected month
      const [year, month] = selectedMonth.split('-').map(Number)
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59, 999)
      
      let query = supabase
        .from('entradas_de_tiempo')
        .select('*')
        .gte('iniciado_en', startDate.toISOString())
        .lte('iniciado_en', endDate.toISOString())
        .order('iniciado_en', { ascending: false })
      
      // Filter by colaboradores if selected
      if (selectedColaboradores.length > 0) {
        query = query.in('colaborador_id', selectedColaboradores)
      }
      
      const { data, error } = await query
      
      if (!error && data) {
        setEntries(data as TimeEntry[])
      }
      
      setIsLoading(false)
    }
    
    loadEntries()
  }, [currentProfile, selectedMonth, selectedColaboradores])

  // Helpers
  const getCliente = (clienteId: string | null) =>
    clienteId ? clientes.find((c) => c.id === clienteId) : undefined

  const getTipoTarea = (tipoId: string | null) =>
    tipoId ? tiposTarea.find((t) => t.id === tipoId) : undefined

  const getColaborador = (colabId: string | null) =>
    colabId ? colaboradores.find((c) => c.id === colabId) : undefined

  // Group entries by day
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, { isoDate: string; entries: TimeEntry[] }>()
    
    entries.forEach((entry) => {
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
  }, [entries])

  // Calculate totals
  const totalHours = useMemo(() => {
    const totalSec = entries.reduce((acc, e) => acc + (e.duracion_seg || 0), 0)
    return (totalSec / 3600).toFixed(1)
  }, [entries])

  const totalBillableHours = useMemo(() => {
    const totalSec = entries
      .filter(e => e.facturable)
      .reduce((acc, e) => acc + (e.duracion_seg || 0), 0)
    return (totalSec / 3600).toFixed(1)
  }, [entries])

  // Month navigation
  const navigateMonth = (direction: number) => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const newDate = new Date(year, month - 1 + direction, 1)
    setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`)
  }

  const getMonthLabel = () => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const date = new Date(year, month - 1, 1)
    return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  }

  // Edit handlers
  const handleStartEdit = (entry: TimeEntry) => {
    setEditingEntry(entry)
    setEditDescription(entry.descripcion)
    setEditClienteId(entry.cliente_id)
    setEditColaboradorId(entry.colaborador_id)
    
    const formatForInput = (isoString: string | null) => {
      if (!isoString) return ''
      const date = new Date(isoString)
      const offset = date.getTimezoneOffset()
      const localDate = new Date(date.getTime() - offset * 60000)
      return localDate.toISOString().slice(0, 16)
    }
    
    setEditIniciadoEn(formatForInput(entry.iniciado_en))
    setEditFinalizadoEn(formatForInput(entry.finalizado_en))
  }

  const handleSaveEdit = async () => {
    if (!editingEntry) return
    
    const supabase = createClient()
    
    const iniciado_en = editIniciadoEn ? new Date(editIniciadoEn).toISOString() : editingEntry.iniciado_en
    const finalizado_en = editFinalizadoEn ? new Date(editFinalizadoEn).toISOString() : editingEntry.finalizado_en
    
    let duracion_seg = editingEntry.duracion_seg
    if (iniciado_en && finalizado_en) {
      const start = new Date(iniciado_en).getTime()
      const end = new Date(finalizado_en).getTime()
      duracion_seg = Math.floor((end - start) / 1000)
    }
    
    const updates = {
      descripcion: editDescription,
      cliente_id: editClienteId,
      colaborador_id: editColaboradorId,
      iniciado_en,
      finalizado_en,
      duracion_seg,
    }
    
    const { error } = await supabase
      .from('entradas_de_tiempo')
      .update(updates)
      .eq('id', editingEntry.id)
    
    if (error) {
      toast.error('Error al actualizar la entrada')
      return
    }
    
    setEntries(prev => prev.map(e => 
      e.id === editingEntry.id ? { ...e, ...updates } : e
    ))
    
    setEditingEntry(null)
    toast.success('Entrada actualizada')
  }

  // Delete handlers
  const handleDelete = async () => {
    if (!deletingEntry) return
    
    const supabase = createClient()
    
    const { error } = await supabase
      .from('entradas_de_tiempo')
      .delete()
      .eq('id', deletingEntry.id)
    
    if (error) {
      toast.error('Error al eliminar la entrada')
      return
    }
    
    setEntries(prev => prev.filter(e => e.id !== deletingEntry.id))
    setDeletingEntry(null)
    toast.success('Entrada eliminada')
  }

  if (!currentProfile) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Administrar Marcaciones</h1>
        <p className="text-muted-foreground mt-1">
          Ver y gestionar las marcaciones de todos los colaboradores
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Horas totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalHours}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Horas facturables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalBillableHours}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Entradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{entries.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Month Navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[160px] text-center font-medium capitalize">
            {getMonthLabel()}
          </div>
          <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Colaborador Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2 min-w-[200px] justify-between">
              <Users className="h-4 w-4" />
              <span>
                {selectedColaboradores.length === 0 
                  ? 'Todos los colaboradores' 
                  : `${selectedColaboradores.length} colaborador${selectedColaboradores.length > 1 ? 'es' : ''}`}
              </span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
            {colaboradores.map(colab => (
              <DropdownMenuCheckboxItem
                key={colab.id}
                checked={selectedColaboradores.includes(colab.id)}
                onCheckedChange={(checked) => {
                  setSelectedColaboradores(prev => 
                    checked 
                      ? [...prev, colab.id]
                      : prev.filter(id => id !== colab.id)
                  )
                }}
              >
                {colab.full_name || colab.email}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {selectedColaboradores.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setSelectedColaboradores([])}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Entries List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground mt-4">Cargando entradas...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">No hay entradas</h3>
          <p className="text-muted-foreground text-center max-w-sm">
            No se encontraron marcaciones para el periodo seleccionado.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedEntries.map((group) => (
            <div key={group.date}>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                <h3 className="font-medium text-foreground">{group.label}</h3>
                <span className="text-sm text-muted-foreground">{formatDurationShort(group.total)}</span>
              </div>
              <div className="space-y-2">
                {group.entries.map((entry) => {
                  const cliente = getCliente(entry.cliente_id)
                  const tipoTarea = getTipoTarea(entry.tipo_tarea_id)
                  const colaborador = getColaborador(entry.colaborador_id)
                  
                  return (
                    <div 
                      key={entry.id}
                      className="group flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/20 transition-colors"
                    >
                      {/* Client Color Dot */}
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: cliente ? getClientColor(cliente.id) : '#9ca3af' }}
                      />
                      
                      {/* Colaborador */}
                      <div className="w-32 shrink-0">
                        <Badge variant="secondary" className="text-xs truncate max-w-full">
                          {colaborador?.full_name || 'Sin asignar'}
                        </Badge>
                      </div>
                      
                      {/* Description & Client */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{entry.descripcion}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {cliente && (
                            <p className="text-xs text-muted-foreground truncate">{cliente.nombre_del_negocio}</p>
                          )}
                          {tipoTarea && (
                            <Badge variant="outline" className="text-xs h-4 px-1.5">
                              {tipoTarea.nombre}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Time Range */}
                      <div className="text-sm text-muted-foreground shrink-0">
                        {new Date(entry.iniciado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        {' - '}
                        {entry.finalizado_en 
                          ? new Date(entry.finalizado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                          : 'En progreso'}
                      </div>
                      
                      {/* Duration */}
                      <div className="font-mono text-sm font-medium tabular-nums w-16 text-right shrink-0">
                        {formatDurationShort(entry.duracion_seg)}
                      </div>
                      
                      {/* Billable Icon */}
                      <DollarSign 
                        className={cn(
                          'h-4 w-4 shrink-0',
                          entry.facturable ? 'text-primary' : 'text-muted-foreground/40'
                        )} 
                      />
                      
                      {/* Action Buttons */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8" 
                          onClick={() => handleStartEdit(entry)}
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:text-destructive" 
                          onClick={() => setDeletingEntry(entry)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground">Colaborador</label>
              <Select value={editColaboradorId || ''} onValueChange={(val) => setEditColaboradorId(val || null)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Seleccionar colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name || c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Descripcion</label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Cliente</label>
              <Select value={editClienteId || ''} onValueChange={(val) => setEditClienteId(val || null)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre_del_negocio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Inicio</label>
                <Input
                  type="datetime-local"
                  value={editIniciadoEn}
                  onChange={(e) => setEditIniciadoEn(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Fin</label>
                <Input
                  type="datetime-local"
                  value={editFinalizadoEn}
                  onChange={(e) => setEditFinalizadoEn(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            {editIniciadoEn && editFinalizadoEn && (
              <p className="text-xs text-muted-foreground">
                Duracion: {(() => {
                  const start = new Date(editIniciadoEn).getTime()
                  const end = new Date(editFinalizadoEn).getTime()
                  const mins = Math.floor((end - start) / 60000)
                  if (mins < 0) return 'Hora de fin debe ser posterior a inicio'
                  return `${Math.floor(mins / 60)}h ${mins % 60}m`
                })()}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingEntry(null)}>Cancelar</Button>
              <Button onClick={handleSaveEdit}>Guardar cambios</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingEntry} onOpenChange={() => setDeletingEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar eliminacion
            </DialogTitle>
            <DialogDescription>
              Estas por eliminar la entrada &quot;{deletingEntry?.descripcion}&quot; 
              de {getColaborador(deletingEntry?.colaborador_id || null)?.full_name || 'colaborador desconocido'}.
              Esta accion no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingEntry(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
