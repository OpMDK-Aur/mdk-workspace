'use client'

import { useState, useMemo, useCallback, memo } from 'react'
import Link from 'next/link'
import type { Client, Profile, ClientStatus, ClientPlan } from '@/lib/types'
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
} from 'lucide-react'

interface ClientsListContentProps {
  clients: Client[]
  profiles: Profile[]
  currentProfile: Profile | null
  assignmentMap: Record<string, { min_hours: number; max_hours: number }>
  hoursMap: Record<string, number>
}

type SemaforoStatus = 'en_rango' | 'baja' | 'sobre' | 'sin_datos'

function computeSemaforo(tracked: number, min: number, max: number): SemaforoStatus {
  if (min === 0 && max === 0) return 'sin_datos'
  if (tracked === 0) return 'sin_datos'
  if (tracked > max) return 'sobre'
  if (tracked >= min) return 'en_rango'
  return 'baja'
}

function getSemaforoConfig(status: SemaforoStatus) {
  switch (status) {
    case 'en_rango':
      return { label: 'En rango', color: '#22c55e', borderColor: '#22c55e' }
    case 'baja':
      return { label: 'Baja dedicacion', color: '#eab308', borderColor: '#eab308' }
    case 'sobre':
      return { label: 'Sobre dedicacion', color: '#ef4444', borderColor: '#ef4444' }
    case 'sin_datos':
    default:
      return { label: 'Sin datos', color: '#9ca3af', borderColor: undefined }
  }
}

function formatTrackedHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours % 1) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

function getStatusBadge(status: ClientStatus | null) {
  switch (status) {
    case 'verde':
      return { label: 'Optimo', className: 'bg-status-verde/10 text-status-verde border-status-verde/20' }
    case 'amarillo':
      return { label: 'Atencion', className: 'bg-status-amarillo/10 text-status-amarillo border-status-amarillo/20' }
    case 'naranja':
      return { label: 'Alerta', className: 'bg-status-naranja/10 text-status-naranja border-status-naranja/20' }
    case 'rojo':
      return { label: 'Critico', className: 'bg-status-rojo/10 text-status-rojo border-status-rojo/20' }
    default:
      return { label: 'Sin estado', className: 'bg-muted text-muted-foreground' }
  }
}

function formatCurrency(value: number | null): string {
  if (!value) return '-'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

export function ClientsListContent({ clients, profiles, currentProfile, assignmentMap, hoursMap }: ClientsListContentProps) {
  const supabase = createClient()
  // Permitir crear a direccion, master, project_manager y account_manager
  const userRole = currentProfile?.role?.toLowerCase() || ''
  const canCreate = ['direccion', 'master', 'project_manager', 'account_manager'].includes(userRole) || true // TODO: ajustar permisos según necesidades

  // Local state for clients list
  const [localClients, setLocalClients] = useState<Client[]>(clients)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [planFilter, setPlanFilter] = useState<string>('all')
  const [pmFilter, setPmFilter] = useState<string>('all')
  const [amFilter, setAmFilter] = useState<string>('all')
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  
  // Advanced filter state
  const [feeMinFilter, setFeeMinFilter] = useState<string>('')
  const [feeMaxFilter, setFeeMaxFilter] = useState<string>('')
  const [sortBy, setSortBy] = useState<string>('nombre_del_negocio')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  
  // Visible columns
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('clientVisibleColumns')
      return saved ? JSON.parse(saved) : ['cliente', 'contacto', 'plan', 'fee_mdk', 'fee_aurelia', 'estado', 'plataformas']
    }
    return ['cliente', 'contacto', 'plan', 'fee_mdk', 'fee_aurelia', 'estado', 'plataformas']
  })

  const allColumns = [
    { id: 'cliente', label: 'Cliente' },
    { id: 'contacto', label: 'Contacto' },
    { id: 'plan', label: 'Plan' },
    { id: 'fee_mdk', label: 'Fee MDK' },
    { id: 'fee_aurelia', label: 'Fee Aurelia' },
    { id: 'estado', label: 'Estado' },
    { id: 'plataformas', label: 'Plataformas' },
    { id: 'pm', label: 'Project Manager' },
    { id: 'am', label: 'Account Manager' },
    { id: 'nps', label: 'NPS' },
  ]

  const toggleColumn = (columnId: string) => {
    const updated = visibleColumns.includes(columnId)
      ? visibleColumns.filter(c => c !== columnId)
      : [...visibleColumns, columnId]
    setVisibleColumns(updated)
    localStorage.setItem('clientVisibleColumns', JSON.stringify(updated))
  }
  
  // Saved filters
  interface SavedFilter {
    name: string
    status: string
    plan: string
    pm: string
    am: string
    platform: string
    feeMin: string
    feeMax: string
    sortBy: string
    sortOrder: 'asc' | 'desc'
    columns: string[]
  }
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('clientFiltersV2')
      return saved ? JSON.parse(saved) : []
    }
    return []
  })
  const [saveFilterName, setSaveFilterName] = useState('')
  const [saveFilterOpen, setSaveFilterOpen] = useState(false)

  const hasActiveFilters = statusFilter !== 'all' || planFilter !== 'all' || pmFilter !== 'all' || amFilter !== 'all' || platformFilter !== 'all' || searchTerm !== '' || feeMinFilter !== '' || feeMaxFilter !== ''

  const clearAllFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setPlanFilter('all')
    setPmFilter('all')
    setAmFilter('all')
    setPlatformFilter('all')
    setFeeMinFilter('')
    setFeeMaxFilter('')
  }

  const saveCurrentFilter = () => {
    if (!saveFilterName.trim()) return
    const newFilter: SavedFilter = {
      name: saveFilterName.trim(),
      status: statusFilter,
      plan: planFilter,
      pm: pmFilter,
      am: amFilter,
      platform: platformFilter,
      feeMin: feeMinFilter,
      feeMax: feeMaxFilter,
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
    setStatusFilter(filter.status)
    setPlanFilter(filter.plan)
    setPmFilter(filter.pm)
    setAmFilter(filter.am)
    setPlatformFilter(filter.platform)
    setFeeMinFilter(filter.feeMin || '')
    setFeeMaxFilter(filter.feeMax || '')
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
    contact_name: '',
    contact_lastname: '',
    phone: '',
    email: '',
    status: 'verde' as ClientStatus,
    plan: 'Esencial' as ClientPlan,
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
      contact_name: '',
      contact_lastname: '',
      phone: '',
      email: '',
      status: 'verde',
      plan: 'Esencial',
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
        contact_name: newClient.contact_name.trim() || null,
        contact_lastname: newClient.contact_lastname.trim() || null,
        phone: newClient.phone.trim() || null,
        email: newClient.email.trim() || null,
        status: newClient.status,
        plan: newClient.plan,
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
    const matchesSearch = client.nombre_del_negocio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.contact_lastname?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter
    const matchesPlan = planFilter === 'all' || client.plan === planFilter
    const matchesPm = pmFilter === 'all' || client.project_manager_id === pmFilter
    const matchesAm = amFilter === 'all' || client.account_manager_id === amFilter
    const matchesPlatform = platformFilter === 'all' || 
      (platformFilter === 'google' && client.google_ads_customer_id) ||
      (platformFilter === 'meta' && client.meta_ads_account_id) ||
      (platformFilter === 'both' && client.google_ads_customer_id && client.meta_ads_account_id) ||
      (platformFilter === 'none' && !client.google_ads_customer_id && !client.meta_ads_account_id)
    const totalFee = (client.fee_mdk || 0) + (client.fee_aurelia || 0)
    const matchesFeeMin = !feeMinFilter || totalFee >= parseFloat(feeMinFilter)
    const matchesFeeMax = !feeMaxFilter || totalFee <= parseFloat(feeMaxFilter)
    return matchesSearch && matchesStatus && matchesPlan && matchesPm && matchesAm && matchesPlatform && matchesFeeMin && matchesFeeMax
  }).sort((a, b) => {
    let valueA: string | number = ''
    let valueB: string | number = ''
    
    switch (sortBy) {
      case 'nombre_del_negocio':
        valueA = a.nombre_del_negocio.toLowerCase()
        valueB = b.nombre_del_negocio.toLowerCase()
        break
      case 'fee_mdk':
        valueA = a.fee_mdk || 0
        valueB = b.fee_mdk || 0
        break
      case 'fee_aurelia':
        valueA = a.fee_aurelia || 0
        valueB = b.fee_aurelia || 0
        break
      case 'fee_total':
        valueA = (a.fee_mdk || 0) + (a.fee_aurelia || 0)
        valueB = (b.fee_mdk || 0) + (b.fee_aurelia || 0)
        break
      case 'nps':
        valueA = a.nps_score ?? -1
        valueB = b.nps_score ?? -1
        break
      case 'status':
        const statusOrder = { verde: 0, amarillo: 1, naranja: 2, rojo: 3 }
        valueA = statusOrder[a.status as keyof typeof statusOrder] ?? 4
        valueB = statusOrder[b.status as keyof typeof statusOrder] ?? 4
        break
      default:
        valueA = a.nombre_del_negocio.toLowerCase()
        valueB = b.nombre_del_negocio.toLowerCase()
    }
    
    if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1
    if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const projectManagers = profiles.filter(p => p.role === 'project_manager' || p.role === 'direccion')
  const accountManagers = profiles.filter(p => p.role === 'account_manager' || p.role === 'direccion')

  // Calculate totals
  const totalFeeMdk = filteredClients.reduce((sum, c) => sum + (c.fee_mdk || 0), 0)
  const totalFeeAurelia = filteredClients.reduce((sum, c) => sum + (c.fee_aurelia || 0), 0)
  const totalFee = totalFeeMdk + totalFeeAurelia

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {localClients.length} clientes en total
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
                        <Label htmlFor="plan">Plan</Label>
                        <Select
                          value={newClient.plan}
                          onValueChange={(v) => setNewClient(prev => ({ ...prev, plan: v as ClientPlan }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Esencial">Esencial</SelectItem>
                            <SelectItem value="Estrategico">Estrategico</SelectItem>
                            <SelectItem value="Premium">Premium</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="status">Estado inicial</Label>
                        <Select
                          value={newClient.status}
                          onValueChange={(v) => setNewClient(prev => ({ ...prev, status: v as ClientStatus }))}
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
                        <Label htmlFor="contact_name">Nombre</Label>
                        <Input
                          id="contact_name"
                          value={newClient.contact_name}
                          onChange={(e) => setNewClient(prev => ({ ...prev, contact_name: e.target.value }))}
                          placeholder="Juan"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contact_lastname">Apellido</Label>
                        <Input
                          id="contact_lastname"
                          value={newClient.contact_lastname}
                          onChange={(e) => setNewClient(prev => ({ ...prev, contact_lastname: e.target.value }))}
                          placeholder="Perez"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Telefono</Label>
                        <Input
                          id="phone"
                          value={newClient.phone}
                          onChange={(e) => setNewClient(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="+54 9 11 1234-5678"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newClient.email}
                          onChange={(e) => setNewClient(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="contacto@empresa.com"
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="verde">Optimo</SelectItem>
                  <SelectItem value="amarillo">Atencion</SelectItem>
                  <SelectItem value="naranja">Alerta</SelectItem>
                  <SelectItem value="rojo">Critico</SelectItem>
                </SelectContent>
              </Select>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los planes</SelectItem>
                  <SelectItem value="Esencial">Esencial</SelectItem>
                  <SelectItem value="Estrategico">Estrategico</SelectItem>
                  <SelectItem value="Premium">Premium</SelectItem>
                </SelectContent>
              </Select>
              <Select value={pmFilter} onValueChange={setPmFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Project Manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los PM</SelectItem>
                  {projectManagers.map(pm => (
                    <SelectItem key={pm.id} value={pm.id}>
                      {pm.full_name || pm.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={amFilter} onValueChange={setAmFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Account Manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los AM</SelectItem>
                  {accountManagers.map(am => (
                    <SelectItem key={am.id} value={am.id}>
                      {am.full_name || am.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={platformFilter} onValueChange={setPlatformFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Plataforma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="google">Solo Google</SelectItem>
                  <SelectItem value="meta">Solo Meta</SelectItem>
                  <SelectItem value="both">Ambas</SelectItem>
                  <SelectItem value="none">Sin plataformas</SelectItem>
                </SelectContent>
              </Select>
              
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
                <PopoverContent align="end" className="w-80">
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
                            <SelectItem value="fee_mdk">Fee MDK</SelectItem>
                            <SelectItem value="fee_aurelia">Fee Aurelia</SelectItem>
                            <SelectItem value="fee_total">Fee Total</SelectItem>
                            <SelectItem value="nps">NPS</SelectItem>
                            <SelectItem value="status">Estado</SelectItem>
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
                        {allColumns.map(col => (
                          <label key={col.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={visibleColumns.includes(col.id)}
                              onCheckedChange={() => toggleColumn(col.id)}
                            />
                            {col.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Clients Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {filteredClients.length} cliente{filteredClients.length !== 1 ? 's' : ''} encontrado{filteredClients.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.includes('cliente') && <TableHead>Cliente</TableHead>}
                  {visibleColumns.includes('contacto') && <TableHead>Contacto</TableHead>}
                  {visibleColumns.includes('plan') && <TableHead>Plan</TableHead>}
                  {visibleColumns.includes('fee_mdk') && <TableHead className="text-right">Fee MDK</TableHead>}
                  {visibleColumns.includes('fee_aurelia') && <TableHead className="text-right">Fee Aurelia</TableHead>}
                  {visibleColumns.includes('estado') && <TableHead>Estado</TableHead>}
                  {visibleColumns.includes('plataformas') && <TableHead>Plataformas</TableHead>}
                  {visibleColumns.includes('pm') && <TableHead>PM</TableHead>}
                  {visibleColumns.includes('am') && <TableHead>AM</TableHead>}
                  {visibleColumns.includes('nps') && <TableHead>NPS</TableHead>}
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + 1} className="text-center py-8 text-muted-foreground">
                      No se encontraron clientes
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClients.map((client) => {
                    const status = getStatusBadge(client.status)
                    const hasGoogle = !!client.google_ads_customer_id
                    const hasMeta = !!client.meta_ads_account_id
                    const pm = profiles.find(p => p.id === client.project_manager_id)
                    const am = profiles.find(p => p.id === client.account_manager_id)

                    return (
                      <TableRow 
                        key={client.id} 
                        className="group"
                      >
                        {visibleColumns.includes('cliente') && (
                          <TableCell>
                            <div className="font-medium">{client.nombre_del_negocio}</div>
                          </TableCell>
                        )}
                        {visibleColumns.includes('contacto') && (
                          <TableCell>
                            <div className="text-sm">
                              {client.contact_name || client.contact_lastname
                                ? `${client.contact_name || ''} ${client.contact_lastname || ''}`.trim()
                                : '-'}
                            </div>
                            {client.phone && (
                              <div className="text-xs text-muted-foreground">{client.phone}</div>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.includes('plan') && (
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{client.plan}</span>
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
                        {visibleColumns.includes('estado') && (
                          <TableCell>
                            <Badge variant="outline" className={cn('font-medium', status.className)}>
                              {status.label}
                            </Badge>
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
                          <TableCell>
                            <span className="text-sm">{pm?.full_name || '-'}</span>
                          </TableCell>
                        )}
                        {visibleColumns.includes('am') && (
                          <TableCell>
                            <span className="text-sm">{am?.full_name || '-'}</span>
                          </TableCell>
                        )}
                        {visibleColumns.includes('nps') && (
                          <TableCell>
                            <span className="text-sm">{client.nps_score ?? '-'}</span>
                          </TableCell>
                        )}
                        <TableCell>
                          <Link href={`/dashboard/clients/${client.id}`}>
                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              {/* Footer with totals */}
                {filteredClients.length > 0 && (
                  <TableRow className="bg-muted/50 font-medium">
                    {visibleColumns.includes('cliente') && <TableCell className="font-bold">Total ({filteredClients.length})</TableCell>}
                    {visibleColumns.includes('contacto') && <TableCell></TableCell>}
                    {visibleColumns.includes('plan') && <TableCell></TableCell>}
                    {visibleColumns.includes('fee_mdk') && (
                      <TableCell className="text-right font-bold">{formatCurrency(totalFeeMdk)}</TableCell>
                    )}
                    {visibleColumns.includes('fee_aurelia') && (
                      <TableCell className="text-right font-bold">{formatCurrency(totalFeeAurelia)}</TableCell>
                    )}
                    {visibleColumns.includes('estado') && <TableCell></TableCell>}
                    {visibleColumns.includes('plataformas') && <TableCell></TableCell>}
                    {visibleColumns.includes('pm') && <TableCell></TableCell>}
                    {visibleColumns.includes('am') && <TableCell></TableCell>}
                    {visibleColumns.includes('nps') && <TableCell></TableCell>}
                    <TableCell></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
