'use client'

import { useState, useMemo, useCallback, useEffect, memo } from 'react'
import Link from 'next/link'
import type { Client, Profile, ClientPlan, UnidadNegocio, SemaforoStatus } from '@/lib/types'
import { MORA_OPTIONS, getMoraColor } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Plus,
  Search,
  Building2,
  User,
  Phone,
  Mail,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  X,
  Bookmark,
  Save,
  Trash2,
  Calendar,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  LayoutGrid,
  List,
} from 'lucide-react'

interface ClientsListContentProps {
  clients: Client[]
  profiles: Profile[]
  currentProfile: Profile | null
  assignmentMap: Record<string, { min_hours: number; max_hours: number }>
  hoursMap: Record<string, number>
  npsMap?: Record<string, number>
}


function formatTrackedHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours % 1) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}


function formatCurrency(value: number | null): string {
  if (!value) return '-'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

function getSemaforoBadge(semaforo: SemaforoStatus | undefined) {
  switch (semaforo) {
    case 'verde':
      return { label: 'Optimo', className: 'bg-status-verde/10 text-status-verde border-status-verde/25', dotClass: 'bg-status-verde' }
    case 'amarillo':
      return { label: 'Atencion', className: 'bg-status-amarillo/10 text-status-amarillo border-status-amarillo/25', dotClass: 'bg-status-amarillo' }
    case 'naranja':
      return { label: 'En riesgo', className: 'bg-status-naranja/10 text-status-naranja border-status-naranja/25', dotClass: 'bg-status-naranja' }
    case 'rojo':
      return { label: 'Critico', className: 'bg-status-rojo/10 text-status-rojo border-status-rojo/25', dotClass: 'bg-status-rojo' }
    default:
      return { label: 'Sin datos', className: 'text-muted-foreground', dotClass: 'bg-muted-foreground/40' }
  }
}

export function ClientsListContent({ clients, profiles, currentProfile, assignmentMap, hoursMap, npsMap = {} }: ClientsListContentProps) {
  const supabase = createClient()
  // Permitir crear a direccion, master, project_manager y account_manager
  const userRole = currentProfile?.role?.toLowerCase() || ''
  const canCreate = ['direccion', 'master', 'project_manager', 'account_manager'].includes(userRole) || true // TODO: ajustar permisos según necesidades

  // Local state for clients list
  const [localClients, setLocalClients] = useState<Client[]>(clients)
  const [searchTerm, setSearchTerm] = useState('')
  const [planFilters, setPlanFilters] = useState<string[]>([])
  const [pmFilters, setPmFilters] = useState<string[]>([])
  const [amFilters, setAmFilters] = useState<string[]>([])
  const [platformFilters, setPlatformFilters] = useState<string[]>([])
  const [unidadFilters, setUnidadFilters] = useState<string[]>([])
  const [fechaActivacionDesde, setFechaActivacionDesde] = useState<string>('')
  const [fechaActivacionHasta, setFechaActivacionHasta] = useState<string>('')
  const [etapaFilters, setEtapaFilters] = useState<string[]>([])
  const [moraFilters, setMoraFilters] = useState<string[]>([])
  const [activoFilter, setActivoFilter] = useState<string>('activos') // Default: solo activos
  
  // Advanced filter state
  const [feeMinFilter, setFeeMinFilter] = useState<string>('')
  const [feeMaxFilter, setFeeMaxFilter] = useState<string>('')
  const [npsOperator, setNpsOperator] = useState<'empty' | 'not_empty' | 'contains' | 'not_contains' | 'equals' | 'not_equals'>('empty')
  const [npsValue, setNpsValue] = useState<string>('')
  const [sortBy, setSortBy] = useState<string>('fee_total')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  
  // Columnas que siempre deben mostrarse en la vista de lista de Clientes
  const requiredColumns = ['cliente', 'unidad_negocio', 'plan', 'fee_mdk', 'fee_aurelia', 'fee_consultoria', 'fee_total', 'pm', 'am', 'nps', 'mora']

  // Visible columns - ahora incluye todas las columnas disponibles
  const [visibleColumns, setVisibleColumns] = useState<string[]>(requiredColumns)
  const [columnWidthsLoaded, setColumnWidthsLoaded] = useState(false)
  
  // View mode: 'table' or 'cards'
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards')

  // Column widths (resizable columns) - persisted per column id
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  
  // Load from localStorage on client side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedColumns = localStorage.getItem('clientVisibleColumns')
      if (savedColumns) {
        const base: string[] = JSON.parse(savedColumns)
        const merged = [...base]
        requiredColumns.forEach(c => { if (!merged.includes(c)) merged.push(c) })
        setVisibleColumns(merged.length ? merged : requiredColumns)
      }
      
      const savedViewMode = localStorage.getItem('clientViewMode')
      if (savedViewMode) {
        setViewMode(savedViewMode as 'table' | 'cards')
      }
      
      const savedColumnWidths = localStorage.getItem('clientColumnWidths')
      if (savedColumnWidths) {
        setColumnWidths(JSON.parse(savedColumnWidths))
      }
      
      setColumnWidthsLoaded(true)
    }
  }, [])

  // Anchos por defecto (px) para mantener la tabla equilibrada con tableLayout fixed
  const defaultColumnWidths: Record<string, number> = {
    cliente: 200,
    unidad_negocio: 120,
    contacto: 160,
    plan: 110,
    fee_mdk: 130,
    fee_aurelia: 130,
    fee_consultoria: 130,
    fee_total: 140,
    plataformas: 130,
    pm: 170,
    am: 170,
    nps: 80,
    mora: 130,
    etapa: 130,
    fecha_activacion: 120,
    fecha_venta: 120,
    fecha_inicio_trabajo: 120,
    crm: 120,
    discord: 140,
  }

  // Handle column resize via drag on the header handle
  const startResize = useCallback((columnId: string, startX: number, startWidth: number) => {
    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(80, startWidth + (e.clientX - startX))
      setColumnWidths(prev => ({ ...prev, [columnId]: newWidth }))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.userSelect = ''
      setColumnWidths(prev => {
        localStorage.setItem('clientColumnWidths', JSON.stringify(prev))
        return prev
      })
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // Click a column header to sort by it (toggles asc/desc)
  const handleHeaderSort = (columnId: string) => {
    if (sortBy === columnId) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(columnId)
      setSortOrder('asc')
    }
  }

  // Editar el estado de mora de un cliente (lista y tarjetas)
  const [savingMoraId, setSavingMoraId] = useState<string | null>(null)
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const updateMora = async (clientId: string, value: string) => {
    const newMora = value === 'Al día' ? null : value
    setSavingMoraId(clientId)
    // Optimistic update
    setLocalClients(prev => prev.map(c => (c.id === clientId ? { ...c, mora: newMora } : c)))
    await supabase.from('clientes').update({ mora: newMora }).eq('id', clientId)
    setSavingMoraId(null)
  }

  // Eliminar cliente
  const deleteClient = async (clientId: string) => {
    setIsDeleting(true)
    try {
      // Optimistic update
      setLocalClients(prev => prev.filter(c => c.id !== clientId))
      await supabase.from('clientes').delete().eq('id', clientId)
      setDeletingClientId(null)
    } catch (error) {
      console.error('[v0] Error deleting client:', error)
      // Revert optimistic update on error
      setLocalClients(prev => {
        const client = clients.find(c => c.id === clientId)
        return client ? [...prev, client] : prev
      })
    } finally {
      setIsDeleting(false)
    }
  }



  const allColumns = [
    { id: 'cliente', label: 'Cliente' },
    { id: 'unidad_negocio', label: 'Unidad de Negocio' },
  { id: 'contacto', label: 'Contacto' },
  { id: 'plan', label: 'Plan' },
  { id: 'fee_mdk', label: 'Fee MDK' },
  { id: 'fee_aurelia', label: 'Fee Aurelia' },
    { id: 'fee_consultoria', label: 'Fee Consultoría' },
    { id: 'fee_total', label: 'Fee Total' },
  { id: 'plataformas', label: 'Plataformas' },
    { id: 'pm', label: 'Project Manager' },
    { id: 'am', label: 'Account Manager' },
    { id: 'nps', label: 'NPS' },
    { id: 'mora', label: 'Mora' },
    { id: 'etapa', label: 'Etapa' },
    { id: 'fecha_activacion', label: 'Fecha Activación' },
    { id: 'fecha_venta', label: 'Fecha Venta' },
    { id: 'fecha_inicio_trabajo', label: 'Fecha Inicio Trabajo' },
    { id: 'crm', label: 'CRM' },
    { id: 'discord', label: 'Discord' },
  ]

  const toggleColumn = (columnId: string) => {
    // No permitir ocultar las columnas requeridas
    if (requiredColumns.includes(columnId)) return
    const updated = visibleColumns.includes(columnId)
      ? visibleColumns.filter(c => c !== columnId)
      : [...visibleColumns, columnId]
    setVisibleColumns(updated)
    localStorage.setItem('clientVisibleColumns', JSON.stringify(updated))
  }

  const toggleViewMode = () => {
    const newMode = viewMode === 'table' ? 'cards' : 'table'
    setViewMode(newMode)
    localStorage.setItem('clientViewMode', newMode)
  }
  
  // Saved filters
  interface SavedFilter {
    name: string
    plans: string[]
    pms: string[]
    ams: string[]
    platforms: string[]
    unidades: string[]
    etapas: string[]
    moras: string[]
    activo: string
    fechaActivacionDesde: string
    fechaActivacionHasta: string
    feeMin: string
    feeMax: string
    npsOperator?: 'empty' | 'not_empty' | 'contains' | 'not_contains' | 'equals' | 'not_equals'
    npsValue?: string
    sortBy: string
    sortOrder: 'asc' | 'desc'
    columns: string[]
  }
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  
  // Load saved filters on client side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('clientFiltersV2')
      if (saved) {
        setSavedFilters(JSON.parse(saved))
      }
    }
  }, [])
  const [saveFilterName, setSaveFilterName] = useState('')
  const [saveFilterOpen, setSaveFilterOpen] = useState(false)

  const hasActiveFilters = planFilters.length > 0 || pmFilters.length > 0 || amFilters.length > 0 || platformFilters.length > 0 || unidadFilters.length > 0 || etapaFilters.length > 0 || moraFilters.length > 0 || activoFilter !== 'activos' || searchTerm !== '' || feeMinFilter !== '' || feeMaxFilter !== '' || fechaActivacionDesde !== '' || fechaActivacionHasta !== '' || npsValue !== '' || (npsOperator !== 'empty')

  const clearAllFilters = () => {
    setSearchTerm('')
    setPlanFilters([])
    setPmFilters([])
    setAmFilters([])
    setPlatformFilters([])
    setUnidadFilters([])
    setEtapaFilters([])
    setMoraFilters([])
    setActivoFilter('activos')
    setFeeMinFilter('')
    setFeeMaxFilter('')
    setFechaActivacionDesde('')
    setFechaActivacionHasta('')
    setNpsOperator('empty')
    setNpsValue('')
  }

const saveCurrentFilter = () => {
  if (!saveFilterName.trim()) return
  const newFilter: SavedFilter = {
  name: saveFilterName.trim(),
  plans: planFilters,
  pms: pmFilters,
  ams: amFilters,
  platforms: platformFilters,
  unidades: unidadFilters,
  etapas: etapaFilters,
  moras: moraFilters,
  activo: activoFilter,
  fechaActivacionDesde,
  fechaActivacionHasta,
  feeMin: feeMinFilter,
  feeMax: feeMaxFilter,
  npsOperator,
  npsValue,
  sortBy,
  sortOrder,
  columns: visibleColumns,
  }
    const updated = [...savedFilters, newFilter]
    setSavedFilters(updated)
    localStorage.setItem('clientFiltersV2', JSON.stringify(updated))
    setSaveFilterName('')
    setSaveFilterOpen(false)
  }

const applyFilter = (filter: SavedFilter) => {
  setPlanFilters(filter.plans || [])
  setPmFilters(filter.pms || [])
  setAmFilters(filter.ams || [])
  setPlatformFilters(filter.platforms || [])
  setUnidadFilters(filter.unidades || [])
  setEtapaFilters(filter.etapas || [])
  setMoraFilters(filter.moras || [])
  setActivoFilter(filter.activo || 'activos')
  setFechaActivacionDesde(filter.fechaActivacionDesde || '')
  setFechaActivacionHasta(filter.fechaActivacionHasta || '')
  setFeeMinFilter(filter.feeMin || '')
  setFeeMaxFilter(filter.feeMax || '')
  setNpsOperator(filter.npsOperator || 'empty')
  setNpsValue(filter.npsValue || '')
  setSortBy(filter.sortBy || 'nombre_del_negocio')
  setSortOrder(filter.sortOrder || 'asc')
  if (filter.columns?.length) {
      setVisibleColumns(filter.columns)
      localStorage.setItem('clientVisibleColumns', JSON.stringify(filter.columns))
    }
  }

  const deleteFilter = (index: number) => {
    const updated = savedFilters.filter((_, i) => i !== index)
    setSavedFilters(updated)
    localStorage.setItem('clientFiltersV2', JSON.stringify(updated))
  }

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)

  // New client form state
  const [newClient, setNewClient] = useState({
  nombre_del_negocio: '',
  nombre: '',
  apellido: '',
  telefono: '',
  status: 'verde' as SemaforoStatus,
  plan: null as ClientPlan | null,
  fee_mdk: '',
    fee_aurelia: '',
    nps_score: '',
    notion_id: '',
    google_ads_customer_id: '',
    meta_ads_account_id: '',
    discord_channel_name: '',
    discord_channel_id: '',
    project_manager_id: '',
    account_manager_id: '',
    crm_tipo: '',
    crm_url: '',
    crm_location_id: '',
    landing_url: '',
  })

  const resetForm = () => {
    setNewClient({
  nombre_del_negocio: '',
  nombre: '',
  apellido: '',
  telefono: '',
  status: 'verde',
  plan: null,
  fee_mdk: '',
      fee_aurelia: '',
      nps_score: '',
      notion_id: '',
      google_ads_customer_id: '',
      meta_ads_account_id: '',
      discord_channel_name: '',
      discord_channel_id: '',
      project_manager_id: '',
      account_manager_id: '',
      crm_tipo: '',
      crm_url: '',
      crm_location_id: '',
      landing_url: '',
    })
    setCreateError(null)
    setCreateSuccess(false)
  }

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)

    try {
      const clientData = {
  nombre_del_negocio: newClient.nombre_del_negocio.trim(),
  nombre: newClient.nombre.trim() || null,
  apellido: newClient.apellido.trim() || null,
  telefono: newClient.telefono.trim() || null,
  status: newClient.status,
  plan: null, // Plan se asigna desde la ficha del cliente solo si es MDK
  fee_mdk: newClient.fee_mdk ? parseFloat(newClient.fee_mdk) : null,
        fee_aurelia: newClient.fee_aurelia ? parseFloat(newClient.fee_aurelia) : null,
        nps_score: newClient.nps_score ? parseInt(newClient.nps_score) : null,
        notion_id: newClient.notion_id.trim() || null,
        google_ads_customer_id: newClient.google_ads_customer_id.trim() || null,
        meta_ads_account_id: newClient.meta_ads_account_id.trim() || null,
        discord_channel_name: newClient.discord_channel_name.trim() || null,
        discord_channel_id: newClient.discord_channel_id.trim() || null,
        project_manager_id: newClient.project_manager_id || null,
        account_manager_id: newClient.account_manager_id || null,
        crm_tipo: newClient.crm_tipo || null,
        crm_url: newClient.crm_url.trim() || null,
        crm_location_id: newClient.crm_location_id.trim() || null,
        landings: newClient.landing_url.trim() ? [{ nombre: 'Principal', url: newClient.landing_url.trim(), tipo: 'landing' }] : [],
      }

      const { data, error } = await supabase
        .from('clientes')
        .insert(clientData)
        .select()
        .single()

      if (error) {
        setCreateError(error.message)
        return
      }

      // If managers were assigned, also create user_client_access entries
      if (newClient.project_manager_id) {
        await supabase.from('user_client_access').insert({
          user_id: newClient.project_manager_id,
          client_id: data.id,
          access_level: 'admin',
        })
      }
      if (newClient.account_manager_id && newClient.account_manager_id !== newClient.project_manager_id) {
        await supabase.from('user_client_access').insert({
          user_id: newClient.account_manager_id,
          client_id: data.id,
          access_level: 'write',
        })
      }

      // Add to local state
      setLocalClients(prev => [...prev, data as Client].sort((a, b) => a.nombre_del_negocio.localeCompare(b.nombre_del_negocio)))

      setCreateSuccess(true)
      setTimeout(() => {
        setCreateSuccess(false)
        setCreateOpen(false)
        resetForm()
      }, 1500)
    } catch (err) {
      setCreateError('Error al crear el cliente')
    } finally {
      setCreating(false)
    }
  }

  // Filter clients
  const filteredClients = localClients.filter(client => {
  // Filter by activo status - null or true = activo (backwards compatible)
  const isClientActivo = client.activo === true || client.activo === null || client.activo === undefined
  const matchesActivo = activoFilter === 'todos' ||
  (activoFilter === 'activos' && isClientActivo) ||
  (activoFilter === 'inactivos' && client.activo === false)
  
  const matchesSearch = client.nombre_del_negocio.toLowerCase().includes(searchTerm.toLowerCase()) ||
  client.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
  client.apellido?.toLowerCase().includes(searchTerm.toLowerCase())
  // Filter by plan - empty array = all
  const clientUnidades = client.unidades_negocio || (client.unidad_negocio ? [client.unidad_negocio] : [])
  const matchesPlan = planFilters.length === 0 || (clientUnidades.includes('MDK') && planFilters.includes(client.plan || ''))
    const clientPmIds = (client.project_manager_ids && client.project_manager_ids.length > 0)
      ? client.project_manager_ids
      : (client.project_manager_id ? [client.project_manager_id] : [])
    const clientAmIds = (client.account_manager_ids && client.account_manager_ids.length > 0)
      ? client.account_manager_ids
      : (client.account_manager_id ? [client.account_manager_id] : [])
    const matchesPm = pmFilters.length === 0 || pmFilters.some(id => clientPmIds.includes(id))
    const matchesAm = amFilters.length === 0 || amFilters.some(id => clientAmIds.includes(id))
  const matchesPlatform = platformFilters.length === 0 ||
  (platformFilters.includes('google') && client.google_ads_customer_id) ||
  (platformFilters.includes('meta') && client.meta_ads_account_id) ||
  (platformFilters.includes('both') && client.google_ads_customer_id && client.meta_ads_account_id) ||
  (platformFilters.includes('none') && !client.google_ads_customer_id && !client.meta_ads_account_id)
  const matchesUnidad = unidadFilters.length === 0 || clientUnidades.some(u => unidadFilters.includes(u))
  const matchesEtapa = etapaFilters.length === 0 || etapaFilters.includes(client.etapa || '')
  const matchesMora = moraFilters.length === 0 || moraFilters.includes(client.mora || 'Al día')
  const matchesFechaDesde = !fechaActivacionDesde || (client.fecha_activacion && client.fecha_activacion >= fechaActivacionDesde)
    const matchesFechaHasta = !fechaActivacionHasta || (client.fecha_activacion && client.fecha_activacion <= fechaActivacionHasta)
    const totalFee = (client.fee_mdk || 0) + (client.fee_aurelia || 0)
    const matchesFeeMin = !feeMinFilter || totalFee >= parseFloat(feeMinFilter)
    const matchesFeeMax = !feeMaxFilter || totalFee <= parseFloat(feeMaxFilter)
    
    // NPS filter matching
    let matchesNps = true
    if (npsOperator === 'empty') {
      matchesNps = client.nps === null || client.nps === undefined || client.nps === ''
    } else if (npsOperator === 'not_empty') {
      matchesNps = client.nps !== null && client.nps !== undefined && client.nps !== ''
    } else if (npsValue) {
      const npsNumValue = parseFloat(npsValue)
      const clientNps = parseFloat(String(client.nps || 0))
      if (npsOperator === 'contains') {
        matchesNps = String(client.nps).includes(npsValue)
      } else if (npsOperator === 'not_contains') {
        matchesNps = !String(client.nps).includes(npsValue)
      } else if (npsOperator === 'equals') {
        matchesNps = clientNps === npsNumValue
      } else if (npsOperator === 'not_equals') {
        matchesNps = clientNps !== npsNumValue
      }
    }
    
    return matchesActivo && matchesSearch && matchesPlan && matchesPm && matchesAm && matchesPlatform && matchesUnidad && matchesEtapa && matchesMora && matchesFechaDesde && matchesFechaHasta && matchesFeeMin && matchesFeeMax && matchesNps
  }).sort((a, b) => {
    let valueA: string | number = ''
    let valueB: string | number = ''
    
    const unidadesA = a.unidades_negocio || (a.unidad_negocio ? [a.unidad_negocio] : [])
    const unidadesB = b.unidades_negocio || (b.unidad_negocio ? [b.unidad_negocio] : [])

    switch (sortBy) {
      case 'cliente':
      case 'nombre_del_negocio':
        valueA = a.nombre_del_negocio.toLowerCase()
        valueB = b.nombre_del_negocio.toLowerCase()
        break
      case 'contacto':
        valueA = `${a.nombre || ''} ${a.apellido || ''}`.trim().toLowerCase()
        valueB = `${b.nombre || ''} ${b.apellido || ''}`.trim().toLowerCase()
        break
      case 'plan':
        valueA = (unidadesA.includes('MDK') ? a.plan || '' : '').toLowerCase()
        valueB = (unidadesB.includes('MDK') ? b.plan || '' : '').toLowerCase()
        break
      case 'fee_mdk':
        valueA = a.fee_mdk || 0
        valueB = b.fee_mdk || 0
        break
      case 'fee_aurelia':
        valueA = a.fee_aurelia || 0
        valueB = b.fee_aurelia || 0
        break
      case 'fee_consultoria':
        valueA = a.fee_consultoria || 0
        valueB = b.fee_consultoria || 0
        break
      case 'fee_total':
        valueA = (a.fee_mdk || 0) + (a.fee_aurelia || 0) + (a.fee_consultoria || 0)
        valueB = (b.fee_mdk || 0) + (b.fee_aurelia || 0) + (b.fee_consultoria || 0)
        break
      case 'plataformas':
        valueA = (a.google_ads_customer_id ? 2 : 0) + (a.meta_ads_account_id ? 1 : 0)
        valueB = (b.google_ads_customer_id ? 2 : 0) + (b.meta_ads_account_id ? 1 : 0)
        break
      case 'pm': {
        const firstPmId = (x: typeof a) => (x.project_manager_ids?.[0]) || x.project_manager_id || ''
        valueA = (profiles.find(p => p.id === firstPmId(a))?.full_name || '').toLowerCase()
        valueB = (profiles.find(p => p.id === firstPmId(b))?.full_name || '').toLowerCase()
        break
      }
      case 'am': {
        const firstAmId = (x: typeof a) => (x.account_manager_ids?.[0]) || x.account_manager_id || ''
        valueA = (profiles.find(p => p.id === firstAmId(a))?.full_name || '').toLowerCase()
        valueB = (profiles.find(p => p.id === firstAmId(b))?.full_name || '').toLowerCase()
        break
      }
      case 'nps':
        valueA = a.nps_score ?? -1
        valueB = b.nps_score ?? -1
        break
      case 'mora':
        valueA = a.mora || ''
        valueB = b.mora || ''
        break

      case 'etapa':
        valueA = (a.etapa || '').toLowerCase()
        valueB = (b.etapa || '').toLowerCase()
        break
      case 'status':
        const statusOrder = { verde: 0, amarillo: 1, naranja: 2, rojo: 3 }
        valueA = statusOrder[a.status as keyof typeof statusOrder] ?? 4
        valueB = statusOrder[b.status as keyof typeof statusOrder] ?? 4
        break
      case 'unidad_negocio':
        valueA = (unidadesA[0] || '').toLowerCase()
        valueB = (unidadesB[0] || '').toLowerCase()
        break
      case 'fecha_activacion':
        valueA = a.fecha_activacion || ''
        valueB = b.fecha_activacion || ''
        break
      case 'fecha_venta':
        valueA = a.fecha_venta || ''
        valueB = b.fecha_venta || ''
        break
      case 'fecha_inicio_trabajo':
        valueA = a.fecha_inicio_trabajo || ''
        valueB = b.fecha_inicio_trabajo || ''
        break
      case 'crm':
        valueA = (a.crm_tipo || '').toLowerCase()
        valueB = (b.crm_tipo || '').toLowerCase()
        break
      case 'discord':
        valueA = (a.discord_channel_name || '').toLowerCase()
        valueB = (b.discord_channel_name || '').toLowerCase()
        break
      default:
        valueA = a.nombre_del_negocio.toLowerCase()
        valueB = b.nombre_del_negocio.toLowerCase()
    }
    
    if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1
    if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const projectManagers = profiles.filter(p => {
    const puesto = (p.puesto || '').toLowerCase()
    return puesto.includes('project manager') || puesto === 'pm' || p.role === 'project_manager' || p.role === 'direccion'
  })
  const accountManagers = profiles.filter(p => {
    const puesto = (p.puesto || '').toLowerCase()
    return puesto.includes('account manager') || puesto === 'am' || p.role === 'account_manager' || p.role === 'direccion'
  })

  // Resolver TODOS los PM/AM de un cliente desde los arrays (con fallback al campo singular)
  const profilesById = new Map(profiles.map(p => [p.id, p]))
  const getClientPms = (client: Client): Profile[] => {
    const ids = (client.project_manager_ids && client.project_manager_ids.length > 0)
      ? client.project_manager_ids
      : (client.project_manager_id ? [client.project_manager_id] : [])
    return ids.map(id => profilesById.get(id)).filter((p): p is Profile => !!p)
  }
  const getClientAms = (client: Client): Profile[] => {
    const ids = (client.account_manager_ids && client.account_manager_ids.length > 0)
      ? client.account_manager_ids
      : (client.account_manager_id ? [client.account_manager_id] : [])
    return ids.map(id => profilesById.get(id)).filter((p): p is Profile => !!p)
  }

  // Calculate totals
  const totalFeeMdk = filteredClients.reduce((sum, c) => sum + (c.fee_mdk || 0), 0)
  const totalFeeAurelia = filteredClients.reduce((sum, c) => sum + (c.fee_aurelia || 0), 0)
  const totalFeeConsultoria = filteredClients.reduce((sum, c) => sum + (c.fee_consultoria || 0), 0)
  const totalFee = totalFeeMdk + totalFeeAurelia

  // Sortable + resizable column header
  const SortableHead = ({ columnId, label, align = 'left' }: { columnId: string; label: string; align?: 'left' | 'right' }) => {
    const isActive = sortBy === columnId
    const width = columnWidths[columnId] ?? defaultColumnWidths[columnId]
    return (
      <TableHead
        style={width ? { width, minWidth: width, maxWidth: width } : undefined}
        className="relative select-none p-0"
      >
        <div className={cn('flex items-center gap-1', align === 'right' && 'justify-end')}>
          <button
            type="button"
            onClick={() => handleHeaderSort(columnId)}
            className="flex items-center gap-1 px-4 py-3 hover:text-foreground transition-colors w-full"
            style={align === 'right' ? { justifyContent: 'flex-end' } : undefined}
          >
            <span className="truncate">{label}</span>
            {isActive ? (
              sortOrder === 'asc' ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              )
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
            )}
          </button>
        </div>
        <span
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const th = (e.currentTarget.parentElement as HTMLElement)
            startResize(columnId, e.clientX, width || th.offsetWidth)
          }}
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
        />
      </TableHead>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredClients.length} de {localClients.length} clientes
              {activoFilter === 'activos' && ` (${localClients.filter(c => c.activo === false).length} inactivos ocultos)`}
            </p>
          </div>
          {canCreate && (
            <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nuevo cliente
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Crear nuevo cliente</DialogTitle>
                  <DialogDescription>
                    Completa la informacion del cliente. Los campos marcados con * son obligatorios.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleCreateClient} className="space-y-6 mt-4">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Informacion del negocio
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
<Label htmlFor="nombre_del_negocio">Nombre del negocio *</Label>
                      <Input
                        id="nombre_del_negocio"
                        value={newClient.nombre_del_negocio}
                        onChange={(e) => setNewClient(prev => ({ ...prev, nombre_del_negocio: e.target.value }))}
                          placeholder="Ej: Mi Empresa S.A."
                          required
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="status">Estado inicial</Label>
                        <Select
                          value={newClient.status}
                          onValueChange={(v) => setNewClient(prev => ({ ...prev, status: v as SemaforoStatus }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="verde">Optimo</SelectItem>
                            <SelectItem value="amarillo">Atencion</SelectItem>
                            <SelectItem value="naranja">Alerta</SelectItem>
                            <SelectItem value="rojo">Critico</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Contacto principal
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="nombre">Nombre</Label>
                        <Input
                          id="nombre"
                          value={newClient.nombre}
                          onChange={(e) => setNewClient(prev => ({ ...prev, nombre: e.target.value }))}
                          placeholder="Juan"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="apellido">Apellido</Label>
                        <Input
                          id="apellido"
                          value={newClient.apellido}
                          onChange={(e) => setNewClient(prev => ({ ...prev, apellido: e.target.value }))}
                          placeholder="Perez"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="telefono">Telefono</Label>
                        <Input
                          id="telefono"
                          value={newClient.telefono}
                          onChange={(e) => setNewClient(prev => ({ ...prev, telefono: e.target.value }))}
                          placeholder="+54 9 11 1234-5678"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Fees */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Honorarios</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="fee_mdk">Fee MDK (ARS)</Label>
                        <Input
                          id="fee_mdk"
                          type="number"
                          value={newClient.fee_mdk}
                          onChange={(e) => setNewClient(prev => ({ ...prev, fee_mdk: e.target.value }))}
                          placeholder="0"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="fee_aurelia">Fee Aurelia (ARS)</Label>
                        <Input
                          id="fee_aurelia"
                          type="number"
                          value={newClient.fee_aurelia}
                          onChange={(e) => setNewClient(prev => ({ ...prev, fee_aurelia: e.target.value }))}
                          placeholder="0"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="nps_score">NPS Score (0-10)</Label>
                        <Input
                          id="nps_score"
                          type="number"
                          min="0"
                          max="10"
                          value={newClient.nps_score}
                          onChange={(e) => setNewClient(prev => ({ ...prev, nps_score: e.target.value }))}
                          placeholder="8"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Team Assignment */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Asignacion de equipo</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="project_manager">Project Manager</Label>
                        <Select
                          value={newClient.project_manager_id || 'none'}
                          onValueChange={(v) => setNewClient(prev => ({ ...prev, project_manager_id: v === 'none' ? '' : v }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin asignar</SelectItem>
                            {projectManagers.map(pm => (
                              <SelectItem key={pm.id} value={pm.id}>
                                {pm.full_name || pm.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="account_manager">Account Manager</Label>
                        <Select
                          value={newClient.account_manager_id || 'none'}
                          onValueChange={(v) => setNewClient(prev => ({ ...prev, account_manager_id: v === 'none' ? '' : v }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin asignar</SelectItem>
                            {accountManagers.map(am => (
                              <SelectItem key={am.id} value={am.id}>
                                {am.full_name || am.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* CRM & Landing */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">CRM y Landing</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="crm_tipo">Tipo de CRM</Label>
                        <Select
                          value={newClient.crm_tipo || 'none'}
                          onValueChange={(v) => setNewClient(prev => ({ ...prev, crm_tipo: v === 'none' ? '' : v }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin CRM</SelectItem>
                            <SelectItem value="ghl">GoHighLevel</SelectItem>
                            <SelectItem value="hubspot">HubSpot</SelectItem>
                            <SelectItem value="salesforce">Salesforce</SelectItem>
                            <SelectItem value="pipedrive">Pipedrive</SelectItem>
                            <SelectItem value="otro">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="crm_url">URL del CRM</Label>
                        <Input
                          id="crm_url"
                          value={newClient.crm_url}
                          onChange={(e) => setNewClient(prev => ({ ...prev, crm_url: e.target.value }))}
                          placeholder="https://app.gohighlevel.com/..."
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="crm_location_id">CRM Location ID</Label>
                        <Input
                          id="crm_location_id"
                          value={newClient.crm_location_id}
                          onChange={(e) => setNewClient(prev => ({ ...prev, crm_location_id: e.target.value }))}
                          placeholder="xxxxxxxxxxxxxxx"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="landing_url">URL Landing principal</Label>
                        <Input
                          id="landing_url"
                          value={newClient.landing_url}
                          onChange={(e) => setNewClient(prev => ({ ...prev, landing_url: e.target.value }))}
                          placeholder="https://www.ejemplo.com"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Integrations */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Integraciones Ads (opcional)</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="google_ads_customer_id">Google Ads Customer ID</Label>
                        <Input
                          id="google_ads_customer_id"
                          value={newClient.google_ads_customer_id}
                          onChange={(e) => setNewClient(prev => ({ ...prev, google_ads_customer_id: e.target.value }))}
                          placeholder="123-456-7890"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="meta_ads_account_id">Meta Ads Account ID</Label>
                        <Input
                          id="meta_ads_account_id"
                          value={newClient.meta_ads_account_id}
                          onChange={(e) => setNewClient(prev => ({ ...prev, meta_ads_account_id: e.target.value }))}
                          placeholder="act_123456789"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="notion_id">Notion ID</Label>
                        <Input
                          id="notion_id"
                          value={newClient.notion_id}
                          onChange={(e) => setNewClient(prev => ({ ...prev, notion_id: e.target.value }))}
                          placeholder="ID de la pagina de Notion"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="discord_channel_name">Canal de Discord</Label>
                        <Input
                          id="discord_channel_name"
                          value={newClient.discord_channel_name}
                          onChange={(e) => setNewClient(prev => ({ ...prev, discord_channel_name: e.target.value }))}
                          placeholder="ADT | Comunicacion interna"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="discord_channel_id">Discord Channel ID</Label>
                        <Input
                          id="discord_channel_id"
                          value={newClient.discord_channel_id}
                          onChange={(e) => setNewClient(prev => ({ ...prev, discord_channel_id: e.target.value }))}
                          placeholder="1234567890123456789"
                          className="mt-1"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Click derecho en el canal &gt; Copiar ID del canal
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Error/Success Messages */}
                  {createError && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {createError}
                    </div>
                  )}
                  {createSuccess && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-status-verde/10 text-status-verde text-sm">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Cliente creado exitosamente
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={creating || !newClient.nombre_del_negocio.trim()}>
                      {creating ? 'Creando...' : 'Crear cliente'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Fee MDK Total</div>
              <div className="text-2xl font-bold text-foreground">{formatCurrency(totalFeeMdk)}</div>
              <div className="text-xs text-muted-foreground mt-1">{filteredClients.length} clientes</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Fee Aurelia Total</div>
              <div className="text-2xl font-bold text-foreground">{formatCurrency(totalFeeAurelia)}</div>
              <div className="text-xs text-muted-foreground mt-1">{filteredClients.filter(c => c.fee_aurelia).length} con Aurelia</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Fee Consultoría Total</div>
              <div className="text-2xl font-bold text-foreground">{formatCurrency(totalFeeConsultoria)}</div>
              <div className="text-xs text-muted-foreground mt-1">{filteredClients.filter(c => c.fee_consultoria).length} con Consultoría</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Fee Total Combinado</div>
              <div className="text-2xl font-bold text-primary">{formatCurrency(totalFee)}</div>
              <div className="text-xs text-muted-foreground mt-1">MDK + Aurelia</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={activoFilter} onValueChange={setActivoFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activos">Activos</SelectItem>
                  <SelectItem value="inactivos">Inactivos</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Plan - Multi-select */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2 min-w-[140px] justify-between">
                    <span>{planFilters.length === 0 ? 'Todos los planes' : `${planFilters.length} plan${planFilters.length > 1 ? 'es' : ''}`}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuCheckboxItem checked={planFilters.includes('Esencial')} onCheckedChange={(checked) => setPlanFilters(prev => checked ? [...prev, 'Esencial'] : prev.filter(p => p !== 'Esencial'))}>Esencial</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={planFilters.includes('Estrategico')} onCheckedChange={(checked) => setPlanFilters(prev => checked ? [...prev, 'Estrategico'] : prev.filter(p => p !== 'Estrategico'))}>Estrategico</DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* PM - Multi-select */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2 min-w-[160px] justify-between">
                    <span>{pmFilters.length === 0 ? 'Todos los PM' : `${pmFilters.length} PM`}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
                  {projectManagers.map(pm => (
                    <DropdownMenuCheckboxItem key={pm.id} checked={pmFilters.includes(pm.id)} onCheckedChange={(checked) => setPmFilters(prev => checked ? [...prev, pm.id] : prev.filter(p => p !== pm.id))}>{pm.full_name || pm.email}</DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* AM - Multi-select */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2 min-w-[160px] justify-between">
                    <span>{amFilters.length === 0 ? 'Todos los AM' : `${amFilters.length} AM`}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
                  {accountManagers.map(am => (
                    <DropdownMenuCheckboxItem key={am.id} checked={amFilters.includes(am.id)} onCheckedChange={(checked) => setAmFilters(prev => checked ? [...prev, am.id] : prev.filter(a => a !== am.id))}>{am.full_name || am.email}</DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Platform - Multi-select */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2 min-w-[140px] justify-between">
                    <span>{platformFilters.length === 0 ? 'Plataformas' : `${platformFilters.length} sel.`}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuCheckboxItem checked={platformFilters.includes('google')} onCheckedChange={(checked) => setPlatformFilters(prev => checked ? [...prev, 'google'] : prev.filter(p => p !== 'google'))}>Google Ads</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={platformFilters.includes('meta')} onCheckedChange={(checked) => setPlatformFilters(prev => checked ? [...prev, 'meta'] : prev.filter(p => p !== 'meta'))}>Meta Ads</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={platformFilters.includes('both')} onCheckedChange={(checked) => setPlatformFilters(prev => checked ? [...prev, 'both'] : prev.filter(p => p !== 'both'))}>Ambas</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={platformFilters.includes('none')} onCheckedChange={(checked) => setPlatformFilters(prev => checked ? [...prev, 'none'] : prev.filter(p => p !== 'none'))}>Sin plataformas</DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Unidad - Multi-select */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2 min-w-[160px] justify-between">
                    <span>{unidadFilters.length === 0 ? 'Todas las unidades' : `${unidadFilters.length} unidad${unidadFilters.length > 1 ? 'es' : ''}`}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuCheckboxItem checked={unidadFilters.includes('MDK')} onCheckedChange={(checked) => setUnidadFilters(prev => checked ? [...prev, 'MDK'] : prev.filter(u => u !== 'MDK'))}>MDK</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={unidadFilters.includes('Aurelia')} onCheckedChange={(checked) => setUnidadFilters(prev => checked ? [...prev, 'Aurelia'] : prev.filter(u => u !== 'Aurelia'))}>Aurelia</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={unidadFilters.includes('Consultoría')} onCheckedChange={(checked) => setUnidadFilters(prev => checked ? [...prev, 'Consultoría'] : prev.filter(u => u !== 'Consultoría'))}>Consultoría</DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Etapa - Multi-select */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2 min-w-[160px] justify-between">
                    <span>{etapaFilters.length === 0 ? 'Todas las etapas' : `${etapaFilters.length} etapa${etapaFilters.length > 1 ? 's' : ''}`}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuCheckboxItem checked={etapaFilters.includes('activacion')} onCheckedChange={(checked) => setEtapaFilters(prev => checked ? [...prev, 'activacion'] : prev.filter(e => e !== 'activacion'))}>Activacion</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={etapaFilters.includes('1_3_meses')} onCheckedChange={(checked) => setEtapaFilters(prev => checked ? [...prev, '1_3_meses'] : prev.filter(e => e !== '1_3_meses'))}>1-3 meses</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={etapaFilters.includes('4_6_meses')} onCheckedChange={(checked) => setEtapaFilters(prev => checked ? [...prev, '4_6_meses'] : prev.filter(e => e !== '4_6_meses'))}>4-6 meses</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={etapaFilters.includes('7_mas')} onCheckedChange={(checked) => setEtapaFilters(prev => checked ? [...prev, '7_mas'] : prev.filter(e => e !== '7_mas'))}>7+ meses</DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={etapaFilters.includes('solicito_baja')} onCheckedChange={(checked) => setEtapaFilters(prev => checked ? [...prev, 'solicito_baja'] : prev.filter(e => e !== 'solicito_baja'))} className="text-red-500">Solicito la Baja</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={etapaFilters.includes('inhabilitado_mora')} onCheckedChange={(checked) => setEtapaFilters(prev => checked ? [...prev, 'inhabilitado_mora'] : prev.filter(e => e !== 'inhabilitado_mora'))} className="text-red-500">Inhabilitado por mora</DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Mora - Multi-select */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2 min-w-[160px] justify-between">
                    <span>{moraFilters.length === 0 ? 'Toda la mora' : `${moraFilters.length} estado${moraFilters.length > 1 ? 's' : ''}`}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {MORA_OPTIONS.map(opt => (
                    <DropdownMenuCheckboxItem
                      key={opt.value}
                      checked={moraFilters.includes(opt.value)}
                      onCheckedChange={(checked) => setMoraFilters(prev => checked ? [...prev, opt.value] : prev.filter(m => m !== opt.value))}
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-full', opt.dot)} />
                        {opt.label}
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* NPS Filter */}
              <div className="flex gap-2 items-center">
                <Select value={npsOperator} onValueChange={(value: any) => setNpsOperator(value)}>
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empty">Está vacío</SelectItem>
                    <SelectItem value="not_empty">No está vacío</SelectItem>
                    <SelectItem value="contains">Contiene</SelectItem>
                    <SelectItem value="not_contains">No contiene</SelectItem>
                    <SelectItem value="equals">Es igual</SelectItem>
                    <SelectItem value="not_equals">No es igual</SelectItem>
                  </SelectContent>
                </Select>
                {(npsOperator === 'contains' || npsOperator === 'not_contains' || npsOperator === 'equals' || npsOperator === 'not_equals') && (
                  <Input
                    type="text"
                    placeholder="Valor"
                    value={npsValue}
                    onChange={(e) => setNpsValue(e.target.value)}
                    className="h-9 w-[100px]"
                  />
                )}
              </div>
              
              {/* Clear filters */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-9 px-2 gap-1">
                  <X className="h-4 w-4" />
                  Limpiar
                </Button>
              )}
              
              {/* Save/Load filters */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1">
                    <Bookmark className="h-4 w-4" />
                    Filtros
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {savedFilters.length > 0 && (
                    <>
                      {savedFilters.map((filter, i) => (
                        <DropdownMenuItem key={i} className="flex justify-between">
                          <span onClick={() => applyFilter(filter)} className="flex-1 cursor-pointer">
                            {filter.name}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-5 w-5 p-0 hover:bg-destructive/20"
                            onClick={(e) => { e.stopPropagation(); deleteFilter(i); }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <Dialog open={saveFilterOpen} onOpenChange={setSaveFilterOpen}>
                    <DialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Save className="h-4 w-4 mr-2" />
                        Guardar filtro actual
                      </DropdownMenuItem>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[300px]">
                      <DialogHeader>
                        <DialogTitle>Guardar filtro</DialogTitle>
                        <DialogDescription>
                          Guarda la combinacion actual de filtros
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <Input
                          placeholder="Nombre del filtro..."
                          value={saveFilterName}
                          onChange={(e) => setSaveFilterName(e.target.value)}
                        />
                        <Button onClick={saveCurrentFilter} disabled={!saveFilterName.trim()} className="w-full gap-2">
                          Guardar
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Advanced Filters Popover */}
              <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    Personalizar
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-96">
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Filtros Avanzados</h4>
                    
                    {/* Fee Range */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Rango de Fee Total</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Min"
                          value={feeMinFilter}
                          onChange={(e) => setFeeMinFilter(e.target.value)}
                          className="h-8"
                        />
                        <Input
                          type="number"
                          placeholder="Max"
                          value={feeMaxFilter}
                          onChange={(e) => setFeeMaxFilter(e.target.value)}
                          className="h-8"
                        />
                      </div>
                    </div>
                    
                    {/* Fecha Activacion Range */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Fecha de Activacion</Label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          placeholder="Desde"
                          value={fechaActivacionDesde}
                          onChange={(e) => setFechaActivacionDesde(e.target.value)}
                          className="h-8"
                        />
                        <Input
                          type="date"
                          placeholder="Hasta"
                          value={fechaActivacionHasta}
                          onChange={(e) => setFechaActivacionHasta(e.target.value)}
                          className="h-8"
                        />
                      </div>
                    </div>
                    
                    {/* Sort By */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Ordenar por</Label>
                      <div className="flex gap-2">
                        <Select value={sortBy} onValueChange={setSortBy}>
                          <SelectTrigger className="h-8 flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nombre_del_negocio">Nombre</SelectItem>
                            <SelectItem value="unidad_negocio">Unidad de Negocio</SelectItem>
                            <SelectItem value="fee_mdk">Fee MDK</SelectItem>
                            <SelectItem value="fee_aurelia">Fee Aurelia</SelectItem>
                            <SelectItem value="fee_total">Fee Total</SelectItem>
                            <SelectItem value="nps">NPS</SelectItem>
                            <SelectItem value="status">Estado</SelectItem>
                            <SelectItem value="fecha_activacion">Fecha Activacion</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                        >
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Visible Columns */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Columnas visibles</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {allColumns.map(col => {
                          const isRequired = requiredColumns.includes(col.id)
                          return (
                            <label key={col.id} className={cn("flex items-center gap-2 text-sm", isRequired ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                              <Checkbox
                                checked={visibleColumns.includes(col.id)}
                                disabled={isRequired}
                                onCheckedChange={() => toggleColumn(col.id)}
                              />
                              {col.label}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* View Mode Toggle */}
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-9 px-2 rounded-r-none"
                  onClick={() => { setViewMode('cards'); localStorage.setItem('clientViewMode', 'cards') }}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-9 px-2 rounded-l-none border-l"
                  onClick={() => { setViewMode('table'); localStorage.setItem('clientViewMode', 'table') }}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Clients - Cards View */}
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                No se encontraron clientes
              </div>
            ) : (
              filteredClients.map((client) => {
                const clientUnidades = client.unidades_negocio || (client.unidad_negocio ? [client.unidad_negocio] : [])
                const clientPms = getClientPms(client)
                const clientAms = getClientAms(client)
                const isInactivo = client.activo === false
                const isEnRiesgo = client.etapa === 'solicito_baja' || client.etapa === 'inhabilitado_mora'
                const hasGoogle = !!client.google_ads_customer_id
                const hasMeta = !!client.meta_ads_account_id
                
                return (
                  <div key={client.id} className="relative group">
                    <Link href={`/dashboard/clients/${client.id}`}>
                      <Card className={cn(
                        "h-full hover:border-primary/50 transition-colors cursor-pointer",
                        isInactivo && "opacity-60 bg-muted/30",
                        isEnRiesgo && "border-red-500/50 bg-red-500/5"
                      )}>
                        <CardContent className="p-4 space-y-3">
                          {/* Header with name and badges */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h3 className={cn(
                                "font-semibold group-hover:text-primary transition-colors",
                                isEnRiesgo && "text-red-500"
                              )}>
                                {client.nombre_del_negocio}
                              </h3>
                              {visibleColumns.includes('contacto') && (client.nombre || client.apellido) && (
                                <p className="text-sm text-muted-foreground">
                                  {client.nombre} {client.apellido || ''}
                                </p>
                              )}
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </div>
                        
                        {/* Unidades de negocio */}
                        {visibleColumns.includes('unidad_negocio') && (
                          <div className="flex flex-wrap gap-1">
                            {clientUnidades.length > 0 ? (
                              clientUnidades.map(unidad => {
                                const sem = getSemaforoBadge(client.semaforo_unidades?.[unidad])
                                return (
                                  <Badge 
                                    key={unidad} 
                                    variant="outline" 
                                    className={cn('text-xs gap-1.5', sem.className)}
                                  >
                                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', sem.dotClass)} />
                                    {unidad}
                                  </Badge>
                                )
                              })
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">Sin unidad</Badge>
                            )}
                            {isInactivo && (
                              <Badge variant="secondary" className="text-xs">Inactivo</Badge>
                            )}
                            {isEnRiesgo && (
                              <Badge variant="destructive" className="text-xs">
                                {client.etapa === 'solicito_baja' ? 'Baja' : 'Mora'}
                              </Badge>
                            )}
                          </div>
                        )}
                        
                        {/* Info grid - respects visible columns */}
                        <div className="flex flex-col gap-1.5 text-sm">
                          {visibleColumns.includes('plan') && clientUnidades.includes('MDK') && client.plan && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">Plan</span>
                              <span className="font-medium">{client.plan}</span>
                            </div>
                          )}
                          {visibleColumns.includes('fee_mdk') && client.fee_mdk && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">Fee MDK</span>
                              <span className="font-medium tabular-nums">{formatCurrency(client.fee_mdk)}</span>
                            </div>
                          )}
                          {visibleColumns.includes('fee_aurelia') && client.fee_aurelia && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">Fee Aurelia</span>
                              <span className="font-medium tabular-nums">{formatCurrency(client.fee_aurelia)}</span>
                            </div>
                          )}
                          {visibleColumns.includes('fee_consultoria') && client.fee_consultoria && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">Fee Consultoria</span>
                              <span className="font-medium tabular-nums">{formatCurrency(client.fee_consultoria)}</span>
                            </div>
                          )}

                          {visibleColumns.includes('pm') && clientPms.length > 0 && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">PM</span>
                              <span className="min-w-0">{clientPms.map(p => p.full_name || p.email).join(', ')}</span>
                            </div>
                          )}
                          {visibleColumns.includes('am') && clientAms.length > 0 && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">AM</span>
                              <span className="min-w-0">{clientAms.map(p => p.full_name || p.email).join(', ')}</span>
                            </div>
                          )}
                          {visibleColumns.includes('plataformas') && (hasGoogle || hasMeta) && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">Plataformas</span>
                              <span className="flex gap-1">
                                {hasGoogle && <Badge variant="secondary" className="text-xs">Google</Badge>}
                                {hasMeta && <Badge variant="secondary" className="text-xs">Meta</Badge>}
                              </span>
                            </div>
                          )}
                        {visibleColumns.includes('nps') && npsMap[client.id] != null && (
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground w-24 shrink-0">NPS</span>
                            <span className="font-medium">{npsMap[client.id]}</span>
                            </div>
                          )}
                          {visibleColumns.includes('etapa') && client.etapa && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">Etapa</span>
                              <span className="capitalize">{client.etapa.replace(/_/g, ' ')}</span>
                            </div>
                          )}
                          {visibleColumns.includes('mora') && (
                            <div
                              className="flex items-center gap-2"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                            >
                              <span className="text-muted-foreground w-24 shrink-0">Mora</span>
                              <Select
                                value={client.mora || 'Al día'}
                                onValueChange={(v) => updateMora(client.id, v)}
                              >
                                <SelectTrigger
                                  className={cn(
                                    'h-7 flex-1 text-xs font-medium',
                                    getMoraColor(client.mora || 'Al día').color
                                  )}
                                >
                                  <SelectValue placeholder="Al día" />
                                </SelectTrigger>
                                <SelectContent>
                                  {MORA_OPTIONS.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                      <span className="flex items-center gap-2">
                                        <span className={cn('h-2 w-2 rounded-full', opt.dot)} />
                                        {opt.label}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                          </div>
                          )}
                          {visibleColumns.includes('fecha_activacion') && client.fecha_activacion && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">Activacion</span>
                              <span>{new Date(client.fecha_activacion).toLocaleDateString('es-AR')}</span>
                            </div>
                          )}
                          {visibleColumns.includes('fecha_venta') && client.fecha_venta && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">Venta</span>
                              <span>{new Date(client.fecha_venta).toLocaleDateString('es-AR')}</span>
                            </div>
                          )}
                          {visibleColumns.includes('fecha_inicio_trabajo') && client.fecha_inicio_trabajo && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">Inicio</span>
                              <span>{new Date(client.fecha_inicio_trabajo).toLocaleDateString('es-AR')}</span>
                            </div>
                          )}
                          {visibleColumns.includes('crm') && client.crm_tipo && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">CRM</span>
                              <span>{client.crm_tipo}</span>
                            </div>
                          )}
                          {visibleColumns.includes('discord') && client.discord_channel_name && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-24 shrink-0">Discord</span>
                              <span className="min-w-0 truncate">{client.discord_channel_name}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    </Link>
                    
                    {/* Delete Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDeletingClientId(client.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Clients Table View */}
        {viewMode === 'table' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {filteredClients.length} cliente{filteredClients.length !== 1 ? 's' : ''} encontrado{filteredClients.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table style={{ tableLayout: 'fixed', width: '100%' }}>
              <TableHeader>
                <TableRow>
                  {visibleColumns.includes('cliente') && <SortableHead columnId="cliente" label="Cliente" />}
                  {visibleColumns.includes('unidad_negocio') && <SortableHead columnId="unidad_negocio" label="Unidad" />}
                  {visibleColumns.includes('contacto') && <SortableHead columnId="contacto" label="Contacto" />}
                  {visibleColumns.includes('plan') && <SortableHead columnId="plan" label="Plan" />}
                  {visibleColumns.includes('fee_mdk') && <SortableHead columnId="fee_mdk" label="Fee MDK" align="right" />}
                  {visibleColumns.includes('fee_aurelia') && <SortableHead columnId="fee_aurelia" label="Fee Aurelia" align="right" />}
                  {visibleColumns.includes('fee_consultoria') && <SortableHead columnId="fee_consultoria" label="Fee Cons." align="right" />}
                  {visibleColumns.includes('fee_total') && <SortableHead columnId="fee_total" label="Fee Total" align="right" />}

                  {visibleColumns.includes('plataformas') && <SortableHead columnId="plataformas" label="Plataformas" />}
                  {visibleColumns.includes('pm') && <SortableHead columnId="pm" label="PM" />}
                  {visibleColumns.includes('am') && <SortableHead columnId="am" label="AM" />}
                  {visibleColumns.includes('nps') && <SortableHead columnId="nps" label="NPS" />}
                  {visibleColumns.includes('mora') && <SortableHead columnId="mora" label="Mora" />}
  
                  {visibleColumns.includes('etapa') && <SortableHead columnId="etapa" label="Etapa" />}
                  {visibleColumns.includes('fecha_activacion') && <SortableHead columnId="fecha_activacion" label="F. Activacion" />}
                  {visibleColumns.includes('fecha_venta') && <SortableHead columnId="fecha_venta" label="F. Venta" />}
                  {visibleColumns.includes('fecha_inicio_trabajo') && <SortableHead columnId="fecha_inicio_trabajo" label="F. Inicio" />}
                  {visibleColumns.includes('crm') && <SortableHead columnId="crm" label="CRM" />}
                  {visibleColumns.includes('discord') && <SortableHead columnId="discord" label="Discord" />}
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + 2} className="text-center py-8 text-muted-foreground">
                      No se encontraron clientes
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClients.map((client) => {
                    const clientUnidades = client.unidades_negocio || (client.unidad_negocio ? [client.unidad_negocio] : [])
                    const hasGoogle = !!client.google_ads_customer_id
                    const hasMeta = !!client.meta_ads_account_id
                    const pmList = getClientPms(client)
                    const amList = getClientAms(client)
                    const isInactivo = client.activo === false
                    const isEnRiesgo = client.etapa === 'solicito_baja' || client.etapa === 'inhabilitado_mora'

                    return (
                      <TableRow 
                        key={client.id} 
                        className={cn(
                          "group cursor-pointer hover:bg-muted/50",
                          isInactivo && "opacity-60 bg-muted/30",
                          isEnRiesgo && "bg-red-500/10 hover:bg-red-500/20"
                        )}
                        onClick={() => window.location.href = `/dashboard/clients/${client.id}`}
                      >
                        {visibleColumns.includes('cliente') && (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className={cn("font-medium hover:text-primary", isEnRiesgo && "text-red-500")}>{client.nombre_del_negocio}</span>
                              {isInactivo && (
                                <Badge variant="secondary" className="text-xs">Inactivo</Badge>
                              )}
                              {isEnRiesgo && (
                                <Badge variant="destructive" className="text-xs">
                                  {client.etapa === 'solicito_baja' ? 'Baja' : 'Mora'}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {visibleColumns.includes('unidad_negocio') && (
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {clientUnidades.length > 0 ? (
                                clientUnidades.map(unidad => {
                                  const sem = getSemaforoBadge(client.semaforo_unidades?.[unidad])
                                  return (
                                    <Badge 
                                      key={unidad} 
                                      variant="outline" 
                                      className={cn('text-xs gap-1.5', sem.className)}
                                    >
                                      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', sem.dotClass)} />
                                      {unidad}
                                    </Badge>
                                  )
                                })
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {visibleColumns.includes('contacto') && (
                          <TableCell>
                            <div className="text-sm">
                              {client.nombre || client.apellido
                                ? `${client.nombre || ''} ${client.apellido || ''}`.trim()
                                : '-'}
                            </div>
                            {client.telefono && (
                              <div className="text-xs text-muted-foreground">{client.telefono}</div>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.includes('plan') && (
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {clientUnidades.includes('MDK') ? client.plan || '-' : '-'}
                            </span>
                          </TableCell>
                        )}
                        {visibleColumns.includes('fee_mdk') && (
                          <TableCell className="text-right font-medium">
                            {formatCurrency(client.fee_mdk)}
                          </TableCell>
                        )}
                        {visibleColumns.includes('fee_aurelia') && (
                          <TableCell className="text-right font-medium">
                            {formatCurrency(client.fee_aurelia)}
                          </TableCell>
                        )}
                        {visibleColumns.includes('fee_consultoria') && (
                          <TableCell className="text-right font-medium">
                            {formatCurrency(client.fee_consultoria || null)}
                          </TableCell>
                        )}
                        {visibleColumns.includes('fee_total') && (
                          <TableCell className="text-right font-semibold">
                            {formatCurrency((client.fee_mdk || 0) + (client.fee_aurelia || 0) + (client.fee_consultoria || 0))}
                          </TableCell>
                        )}

                        {visibleColumns.includes('plataformas') && (
                          <TableCell>
                            <div className="flex gap-1">
                              {hasGoogle && (
                                <Badge variant="secondary" className="text-xs">Google</Badge>
                              )}
                              {hasMeta && (
                                <Badge variant="secondary" className="text-xs">Meta</Badge>
                              )}
                              {!hasGoogle && !hasMeta && (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {visibleColumns.includes('pm') && (
                          <TableCell className="align-top">
                            {pmList.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {pmList.map(p => (
                                  <span key={p.id} className="text-sm leading-tight break-words">{p.full_name || p.email}</span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.includes('am') && (
                          <TableCell className="align-top">
                            {amList.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {amList.map(p => (
                                  <span key={p.id} className="text-sm leading-tight break-words">{p.full_name || p.email}</span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.includes('nps') && (
                          <TableCell className="text-sm">
                            <span className="text-sm">{npsMap[client.id] ?? '-'}</span>
                          </TableCell>
                        )}
                        {visibleColumns.includes('mora') && (
                          <TableCell>
                            <Select
                              value={client.mora || 'Al día'}
                              onValueChange={(v) => updateMora(client.id, v)}
                            >
                              <SelectTrigger
                                className={cn(
                                  'h-7 w-full text-xs font-medium',
                                  getMoraColor(client.mora || 'Al día').color
                                )}
                              >
                                <SelectValue placeholder="Al día" />
                              </SelectTrigger>
                              <SelectContent>
                                {MORA_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                    <span className="flex items-center gap-2">
                                      <span className={cn('h-2 w-2 rounded-full', opt.dot)} />
                                      {opt.label}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}

                        {visibleColumns.includes('etapa') && (
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {client.etapa ? client.etapa.replace(/_/g, ' ') : '-'}
                            </span>
                          </TableCell>
                        )}
                        {visibleColumns.includes('fecha_activacion') && (
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {client.fecha_activacion ? new Date(client.fecha_activacion).toLocaleDateString('es-AR') : '-'}
                            </span>
                          </TableCell>
                        )}
                        {visibleColumns.includes('fecha_venta') && (
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {client.fecha_venta ? new Date(client.fecha_venta).toLocaleDateString('es-AR') : '-'}
                            </span>
                          </TableCell>
                        )}
                        {visibleColumns.includes('fecha_inicio_trabajo') && (
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {client.fecha_inicio_trabajo ? new Date(client.fecha_inicio_trabajo).toLocaleDateString('es-AR') : '-'}
                            </span>
                          </TableCell>
                        )}
                        {visibleColumns.includes('crm') && (
                          <TableCell>
                            <span className="text-sm">{client.crm_tipo || '-'}</span>
                          </TableCell>
                        )}
                        {visibleColumns.includes('discord') && (
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {client.discord_channel_name || '-'}
                            </span>
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeletingClientId(client.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              {/* Footer with totals */}
                {filteredClients.length > 0 && (
                  <TableRow className="bg-muted/50 font-medium">
                    {visibleColumns.includes('cliente') && <TableCell className="font-bold">Total ({filteredClients.length})</TableCell>}
                    {visibleColumns.includes('unidad_negocio') && <TableCell></TableCell>}
                    {visibleColumns.includes('contacto') && <TableCell></TableCell>}
                    {visibleColumns.includes('plan') && <TableCell></TableCell>}
                    {visibleColumns.includes('fee_mdk') && (
                      <TableCell className="text-right font-bold">{formatCurrency(totalFeeMdk)}</TableCell>
                    )}
                    {visibleColumns.includes('fee_aurelia') && (
                      <TableCell className="text-right font-bold">{formatCurrency(totalFeeAurelia)}</TableCell>
                    )}
                    {visibleColumns.includes('fee_consultoria') && (
                      <TableCell className="text-right font-bold">
                        {formatCurrency(filteredClients.reduce((sum, c) => sum + (c.fee_consultoria || 0), 0))}
                      </TableCell>
                    )}
                    {visibleColumns.includes('fee_total') && (
                      <TableCell className="text-right font-bold">
                        {formatCurrency(filteredClients.reduce((sum, c) => sum + (c.fee_mdk || 0) + (c.fee_aurelia || 0) + (c.fee_consultoria || 0), 0))}
                      </TableCell>
                    )}

                    {visibleColumns.includes('plataformas') && <TableCell></TableCell>}
                    {visibleColumns.includes('pm') && <TableCell></TableCell>}
                    {visibleColumns.includes('am') && <TableCell></TableCell>}
                    {visibleColumns.includes('nps') && <TableCell></TableCell>}
                    {visibleColumns.includes('mora') && <TableCell></TableCell>}

                    {visibleColumns.includes('etapa') && <TableCell></TableCell>}
                    {visibleColumns.includes('fecha_activacion') && <TableCell></TableCell>}
                    {visibleColumns.includes('fecha_venta') && <TableCell></TableCell>}
                    {visibleColumns.includes('fecha_inicio_trabajo') && <TableCell></TableCell>}
                    {visibleColumns.includes('crm') && <TableCell></TableCell>}
                    {visibleColumns.includes('discord') && <TableCell></TableCell>}
                    <TableCell></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
        )}
      </div>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deletingClientId !== null} onOpenChange={(open) => !open && setDeletingClientId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cliente</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Está seguro de que desea eliminar este cliente? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deletingClientId && deleteClient(deletingClientId)}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
