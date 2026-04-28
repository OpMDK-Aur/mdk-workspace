'use client'

import { useState } from 'react'
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
  Plus,
  Search,
  Building2,
  User,
  Phone,
  Mail,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
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
  const canCreate = currentProfile?.role === 'direccion' || currentProfile?.role === 'project_manager'

  // Local state for clients list
  const [localClients, setLocalClients] = useState<Client[]>(clients)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [planFilter, setPlanFilter] = useState<string>('all')

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)

  // New client form state
  const [newClient, setNewClient] = useState({
    business_name: '',
    contact_name: '',
    contact_lastname: '',
    phone: '',
    status: 'verde' as ClientStatus,
    plan: 'Esencial' as ClientPlan,
    fee_mdk: '',
    fee_aurelia: '',
    notion_id: '',
    google_ads_customer_id: '',
    meta_ads_account_id: '',
    project_manager_id: '',
    account_manager_id: '',
  })

  const resetForm = () => {
    setNewClient({
      business_name: '',
      contact_name: '',
      contact_lastname: '',
      phone: '',
      status: 'verde',
      plan: 'Esencial',
      fee_mdk: '',
      fee_aurelia: '',
      notion_id: '',
      google_ads_customer_id: '',
      meta_ads_account_id: '',
      project_manager_id: '',
      account_manager_id: '',
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
        business_name: newClient.business_name.trim(),
        contact_name: newClient.contact_name.trim() || null,
        contact_lastname: newClient.contact_lastname.trim() || null,
        phone: newClient.phone.trim() || null,
        status: newClient.status,
        plan: newClient.plan,
        fee_mdk: newClient.fee_mdk ? parseFloat(newClient.fee_mdk) : null,
        fee_aurelia: newClient.fee_aurelia ? parseFloat(newClient.fee_aurelia) : null,
        notion_id: newClient.notion_id.trim() || null,
        google_ads_customer_id: newClient.google_ads_customer_id.trim() || null,
        meta_ads_account_id: newClient.meta_ads_account_id.trim() || null,
        project_manager_id: newClient.project_manager_id || null,
        account_manager_id: newClient.account_manager_id || null,
      }

      const { data, error } = await supabase
        .from('clients')
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
      setLocalClients(prev => [...prev, data as Client].sort((a, b) => a.business_name.localeCompare(b.business_name)))

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
    const matchesSearch = client.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.contact_lastname?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter
    const matchesPlan = planFilter === 'all' || client.plan === planFilter
    return matchesSearch && matchesStatus && matchesPlan
  })

  const projectManagers = profiles.filter(p => p.role === 'project_manager')
  const accountManagers = profiles.filter(p => p.role === 'account_manager')

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
                        <Label htmlFor="business_name">Nombre del negocio *</Label>
                        <Input
                          id="business_name"
                          value={newClient.business_name}
                          onChange={(e) => setNewClient(prev => ({ ...prev, business_name: e.target.value }))}
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
                      <div className="col-span-2">
                        <Label htmlFor="phone">Telefono</Label>
                        <Input
                          id="phone"
                          value={newClient.phone}
                          onChange={(e) => setNewClient(prev => ({ ...prev, phone: e.target.value }))}
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

                  {/* Integrations */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Integraciones (opcional)</h3>
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
                      <div className="col-span-2">
                        <Label htmlFor="notion_id">Notion ID</Label>
                        <Input
                          id="notion_id"
                          value={newClient.notion_id}
                          onChange={(e) => setNewClient(prev => ({ ...prev, notion_id: e.target.value }))}
                          placeholder="ID de la pagina de Notion"
                          className="mt-1"
                        />
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
                    <Button type="submit" disabled={creating || !newClient.business_name.trim()}>
                      {creating ? 'Creando...' : 'Crear cliente'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
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
                <SelectTrigger className="w-[150px]">
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
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los planes</SelectItem>
                  <SelectItem value="Esencial">Esencial</SelectItem>
                  <SelectItem value="Estrategico">Estrategico</SelectItem>
                  <SelectItem value="Premium">Premium</SelectItem>
                </SelectContent>
              </Select>
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
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Fee MDK</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Mi dedicacion</TableHead>
                  <TableHead>Plataformas</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No se encontraron clientes
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClients.map((client) => {
                    const status = getStatusBadge(client.status)
                    const hasGoogle = !!client.google_ads_customer_id
                    const hasMeta = !!client.meta_ads_account_id

                    // Semaforo logic
                    const assignment = assignmentMap[client.id]
                    const tracked = hoursMap[client.id] ?? 0
                    const semaforo = assignment
                      ? computeSemaforo(tracked, assignment.min_hours, assignment.max_hours)
                      : 'sin_datos'
                    const semaforoConfig = getSemaforoConfig(semaforo)
                    const trackedFormatted = formatTrackedHours(tracked)
                    const hasSemaforoBorder = semaforo !== 'sin_datos'

                    return (
                      <TableRow 
                        key={client.id} 
                        className="group"
                        style={hasSemaforoBorder ? { borderLeft: `3px solid ${semaforoConfig.borderColor}` } : undefined}
                      >
                        <TableCell>
                          <div className="font-medium">{client.business_name}</div>
                        </TableCell>
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
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{client.plan}</span>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(client.fee_mdk)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('font-medium', status.className)}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {assignment ? (
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-2 h-2 rounded-full shrink-0" 
                                style={{ backgroundColor: semaforoConfig.color }}
                              />
                              <span className="text-xs text-muted-foreground">
                                {trackedFormatted}h / {assignment.max_hours}h
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin asignacion</span>
                          )}
                        </TableCell>
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
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
