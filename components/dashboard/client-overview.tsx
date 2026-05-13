'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Client, Profile, ScorecardRow, DateRange } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DollarSign, Target, TrendingDown, MousePointerClick, Eye,
  Users, Megaphone, MessageSquare, Calendar, Clock,
  ArrowLeft, RefreshCw, CheckCircle2, Facebook, Globe, ChevronDown, Pencil, Check, X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ClientBudgetAlertCard } from './client-budget-alert-card'
import { computeClientBudgetAlerts } from './budget-alerts-shared'
import { ClientMemoria } from './client-memoria'
import { DiscordChat } from './discord-chat'
import { ClientComments } from './client-comments'
import { ClientLandings } from './client-landings'
import { ClientCRMs } from './client-crms'
import { ClientAdjuntos } from './client-adjuntos'
import { ClientCotizaciones } from './client-cotizaciones'
import { ClientTareas } from './client-tareas'
import { ClientNPS } from './client-nps'
import { ClientInfoCard } from './client-info-card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface UnidadDeNegocio {
  unidad_de_negocio_id: string
  unidad_de_negocio: { id: string; nombre: string } | null
}

interface ClientOverviewProps {
  client: Client
  profiles: Profile[]
  currentProfile: Profile | null
  assignment: { min_hours: number; max_hours: number } | null
  trackedHours: number
  horasObjetivo?: number // from colaboradores.capacidad_horas_semanales (weekly)
  horasEquipo?: number // total team hours this month for this client
  misHoras?: number // current user's hours this month for this client
  unidadesDeNegocio?: UnidadDeNegocio[]
}

type DedicationStatus = 'normal' | 'baja' | 'exceso' | 'sin_datos'

function computeDedicationStatus(tracked: number, min: number, max: number): DedicationStatus {
  if (min === 0 && max === 0) return 'sin_datos'
  if (tracked > max) return 'exceso'
  if (tracked >= min) return 'normal'
  return 'baja'
}

function getDedicationConfig(status: DedicationStatus) {
  switch (status) {
    case 'normal':
      return { 
        label: 'Dedicacion normal', 
        description: 'Estas dentro del rango esperado de horas',
        color: '#22c55e', 
        bgColor: 'bg-green-500/10',
        textColor: 'text-green-500',
        borderColor: 'border-l-green-500'
      }
    case 'baja':
      return { 
        label: 'Falta de horas', 
        description: 'Necesitas dedicar mas tiempo a este cliente',
        color: '#eab308', 
        bgColor: 'bg-yellow-500/10',
        textColor: 'text-yellow-500',
        borderColor: 'border-l-yellow-500'
      }
    case 'exceso':
      return { 
        label: 'Exceso de horas', 
        description: 'Estas dedicando mas tiempo del esperado',
        color: '#ef4444', 
        bgColor: 'bg-red-500/10',
        textColor: 'text-red-500',
        borderColor: 'border-l-red-500'
      }
    case 'sin_datos':
    default:
      return { 
        label: 'Sin asignacion', 
        description: 'No tienes horas asignadas para este cliente',
        color: '#9ca3af', 
        bgColor: 'bg-muted',
        textColor: 'text-muted-foreground',
        borderColor: 'border-l-muted'
      }
  }
}

function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours % 1) * 60)
  return `${h}h ${m}m`
}

// ── helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}
function formatNumber(v: number) {
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}
function formatPct(v: number) { return `${v.toFixed(2)}%` }

function getStatusColor(s: string | null) {
  switch (s) {
    case 'verde':    return 'bg-status-verde'
    case 'amarillo': return 'bg-status-amarillo'
    case 'naranja':  return 'bg-status-naranja'
    case 'rojo':     return 'bg-status-rojo'
    default:         return 'bg-muted-foreground'
  }
}

function getStatusLabel(s: string | null) {
  switch (s) {
    case 'verde':    return 'Activo'
    case 'amarillo': return 'Atencion'
    case 'naranja':  return 'En riesgo'
    case 'rojo':     return 'Critico'
    default:         return 'Sin estado'
  }
}

function getRoleName(role: string) {
  switch (role) {
    case 'direccion':       return 'Direccion'
    case 'project_manager': return 'Project Manager'
    case 'account_manager': return 'Account Manager'
    case 'consultor':       return 'Consultor'
    default:                return role
  }
}

function initials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// Active platforms derived from client config
function getActivePlatforms(client: Client) {
  const p: { id: string; label: string; icon: React.ReactNode; accountId: string }[] = []
  if (client.meta_ads_account_id) {
    p.push({ id: 'meta', label: 'Meta Ads', icon: <Facebook className="h-3.5 w-3.5" />, accountId: client.meta_ads_account_id })
  }
  if (client.google_ads_customer_id) {
    p.push({ id: 'google', label: 'Google Ads', icon: <Globe className="h-3.5 w-3.5" />, accountId: client.google_ads_customer_id })
  }
  return p
}

// Date preset options (same as filters-bar)
const DATE_PRESETS: { value: string; label: string; days: number }[] = [
  { value: 'last_7d',   label: 'Ultimos 7 dias',  days: 7  },
  { value: 'last_14d',  label: 'Ultimos 14 dias', days: 14 },
  { value: 'last_30d',  label: 'Ultimos 30 dias', days: 30 },
  { value: 'monthly',   label: 'Este mes',        days: 30 },
]

function resolveDateRange(preset: string): { start: string; end: string } {
  const today = new Date()
  const pad = (d: Date) => d.toISOString().split('T')[0]
  const entry = DATE_PRESETS.find(p => p.value === preset)
  const days = entry?.days ?? 30
  const start = new Date(today)
  start.setDate(today.getDate() - days)
  return { start: pad(start), end: pad(today) }
}

// ── mini KPI card used in Top 5 ──────────────────────────────────────────────
function MiniKPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</span>
      <span className="text-sm font-bold text-foreground">{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  )
}

// ── Person chip (editable) ────────────────────────────────────────────────────
function EditablePersonChip({ 
  profile, 
  label, 
  profiles, 
  onChange, 
  updating 
}: { 
  profile: Profile | null
  label: string
  profiles: Profile[]
  onChange: (id: string | null) => void
  updating: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={updating}>
          <button className="flex items-center gap-2 hover:bg-muted/50 rounded-lg p-1 -m-1 transition-colors cursor-pointer text-left">
            {profile ? (
              <>
                <Avatar className="h-8 w-8 shrink-0">
                  {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? ''} />}
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    {initials(profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{profile.full_name ?? profile.email}</p>
                  <p className="text-[11px] text-muted-foreground">{getRoleName(profile.role)}</p>
                </div>
              </>
            ) : (
              <>
                <div className="h-8 w-8 rounded-full border-2 border-dashed border-border flex items-center justify-center shrink-0 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm text-muted-foreground">Sin asignar</span>
              </>
            )}
            {updating ? (
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin ml-auto" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem 
            onClick={() => onChange(null)}
            className="gap-2 cursor-pointer"
          >
            <div className="h-6 w-6 rounded-full border-2 border-dashed border-border flex items-center justify-center shrink-0">
              <Users className="h-3 w-3 text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Sin asignar</span>
            {!profile && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary" />}
          </DropdownMenuItem>
          {profiles.map(p => (
            <DropdownMenuItem 
              key={p.id} 
              onClick={() => onChange(p.id)}
              className="gap-2 cursor-pointer"
            >
              <Avatar className="h-6 w-6 shrink-0">
                {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.full_name ?? ''} />}
                <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                  {initials(p.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{p.full_name ?? p.email}</span>
              {profile?.id === p.id && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ── Coming soon block ─────────────────────────────────────────────────────────
function ComingSoonBlock({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="border-dashed border-border/60 opacity-70">
      <CardContent className="flex items-center gap-4 py-6">
        <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <Badge variant="outline" className="ml-auto shrink-0 text-[10px] uppercase tracking-wide">
          Proximamente
        </Badge>
      </CardContent>
    </Card>
  )
}

// Orden de prioridad para unidades de negocio
const UNIDAD_ORDEN: Record<string, number> = {
  'MDK': 0,
  'Aurelia': 1,
  'Consultoría': 2,
  'Consultoria': 2, // sin tilde
}

function sortUnidades(unidades: UnidadDeNegocio[]): UnidadDeNegocio[] {
  return [...unidades].sort((a, b) => {
    const nombreA = a.unidad_de_negocio?.nombre ?? ''
    const nombreB = b.unidad_de_negocio?.nombre ?? ''
    const ordenA = UNIDAD_ORDEN[nombreA] ?? 99
    const ordenB = UNIDAD_ORDEN[nombreB] ?? 99
    return ordenA - ordenB
  })
}

// Status options for the semaphore (UUIDs from semaforo table)
const SEMAFORO_OPTIONS = [
  { id: 'd3f4361f-477e-4f7a-9f98-9868cddef57f', nombre: 'verde', label: 'Activo', color: '#22c55e', bgClass: 'bg-status-verde' },
  { id: '04dca848-a17e-4626-b83a-5377aef062ec', nombre: 'amarillo', label: 'Atenci��n', color: '#eab308', bgClass: 'bg-status-amarillo' },
  { id: 'c19b9591-862e-49a8-898c-b29ed35fcd3b', nombre: 'naranja', label: 'En riesgo', color: '#f97316', bgClass: 'bg-status-naranja' },
  { id: '753e6c36-5a9f-4b4b-b5fa-aac7d6f281af', nombre: 'rojo', label: 'Crítico', color: '#ef4444', bgClass: 'bg-status-rojo' },
  { id: '3876a424-6749-4205-b5b2-a59c49ca8eb9', nombre: 'inhabilitado', label: 'Inhabilitado por mora', color: '#7f1d1d', bgClass: 'bg-red-900' },
  { id: '550f7375-4aec-4e76-a006-16b427d493e9', nombre: 'inactivo', label: 'Baja / Inactivo', color: '#64748b', bgClass: 'bg-slate-500' },
]

// Helper to get semaforo by ID
const getSemaforoById = (id: string | null) => {
  return SEMAFORO_OPTIONS.find(s => s.id === id) || SEMAFORO_OPTIONS[0]
}

// Helper to get semaforo color by name (verde, amarillo, etc)
const getSemaforoByNombre = (nombre: string | null) => {
  if (!nombre) return null
  return SEMAFORO_OPTIONS.find(s => s.nombre === nombre) || null
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ClientOverview({ client, profiles, currentProfile, assignment, trackedHours, horasObjetivo = 0, horasEquipo = 0, misHoras = 0, unidadesDeNegocio = [] }: ClientOverviewProps) {
  const sortedUnidades = sortUnidades(unidadesDeNegocio)
  const [preset, setPreset]           = useState('last_30d')
  const [rows, setRows]               = useState<ScorecardRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [semaforoId, setSemaforoId] = useState(client.semaforo_id)
  const currentSemaforo = getSemaforoById(semaforoId)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [pmId, setPmId] = useState(client.project_manager_id)
  const [amId, setAmId] = useState(client.account_manager_id)
  const [updatingPM, setUpdatingPM] = useState(false)
  const [updatingAM, setUpdatingAM] = useState(false)
  
  // Fee editing
  const [editingFee, setEditingFee] = useState(false)
  const [feeMdk, setFeeMdk] = useState(client.fee_mdk ?? 0)
  const [feeAurelia, setFeeAurelia] = useState(client.fee_aurelia ?? 0)
  const [feeConsultoria, setFeeConsultoria] = useState(client.fee_consultoria ?? 0)
  const [savingFee, setSavingFee] = useState(false)
  
  // Selected unit for dynamic semaphore display - default to first (highest priority) unit
  const firstUnidadId = sortedUnidades[0]?.unidad_de_negocio_id || null
  const [selectedUnidadId, setSelectedUnidadId] = useState<string | null>(firstUnidadId)
  
  // Get the active semaphore based on selected unit
  const getActiveSemaforo = () => {
    const activeUnidadId = selectedUnidadId || firstUnidadId
    if (activeUnidadId && client.semaforo_unidades) {
      const unidadSemaforo = client.semaforo_unidades[activeUnidadId]
      if (unidadSemaforo) {
        const semaforoByNombre = getSemaforoByNombre(unidadSemaforo)
        if (semaforoByNombre) return semaforoByNombre
      }
    }
    return currentSemaforo
  }
  
  const activeSemaforo = getActiveSemaforo()
  const selectedUnidad = sortedUnidades.find(u => u.unidad_de_negocio_id === (selectedUnidadId || firstUnidadId))
  
  const supabase = createClient()

  const handleSemaforoChange = async (newSemaforoId: string) => {
    setUpdatingStatus(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ semaforo_id: newSemaforoId })
        .eq('id', client.id)
      
      if (!error) {
        setSemaforoId(newSemaforoId)
      }
    } catch (e) {
      console.error('Error updating semaforo:', e)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handlePMChange = async (newPmId: string | null) => {
    setUpdatingPM(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ project_manager_id: newPmId })
        .eq('id', client.id)
      
      if (!error) {
        setPmId(newPmId)
      }
    } catch (e) {
      console.error('Error updating PM:', e)
    } finally {
      setUpdatingPM(false)
    }
  }

  const handleAMChange = async (newAmId: string | null) => {
    setUpdatingAM(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ account_manager_id: newAmId })
        .eq('id', client.id)
      
      if (!error) {
        setAmId(newAmId)
      }
    } catch (e) {
      console.error('Error updating AM:', e)
    } finally {
      setUpdatingAM(false)
    }
  }

  const handleSaveFee = async () => {
    setSavingFee(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ 
          fee_mdk: feeMdk,
          fee_aurelia: feeAurelia,
          fee_consultoria: feeConsultoria
        })
        .eq('id', client.id)
      
      if (!error) {
        setEditingFee(false)
      } else {
        console.error('Error saving fee:', error)
      }
    } catch (e) {
      console.error('Error saving fee:', e)
    } finally {
      setSavingFee(false)
    }
  }

  const handleCancelFeeEdit = () => {
    setFeeMdk(client.fee_mdk ?? 0)
    setFeeAurelia(client.fee_aurelia ?? 0)
    setFeeConsultoria(client.fee_consultoria ?? 0)
    setEditingFee(false)
  }

  const pm = profiles.find(p => p.id === pmId) ?? null
  const am = profiles.find(p => p.id === amId) ?? null
  const platforms = getActivePlatforms(client)

  // Dedication status
  const dedicationStatus = assignment
    ? computeDedicationStatus(trackedHours, assignment.min_hours, assignment.max_hours)
    : 'sin_datos'
  const dedicationConfig = getDedicationConfig(dedicationStatus)

  const fetchData = useCallback(async (p: string) => {
    setLoading(true)
    setError(null)
    const { start, end } = resolveDateRange(p)
    const collected: ScorecardRow[] = []

    try {
      // Meta — endpoint expects `account_id`, returns campaigns[].id/.name
      if (client.meta_ads_account_id) {
        const params = new URLSearchParams({
          account_id:  client.meta_ads_account_id,
          date_range:  p,
          start_date:  start,
          end_date:    end,
        })
        const res  = await fetch(`/api/ads/meta?${params}`)
        const data = await res.json()
        if (data.campaigns) {
          for (const c of data.campaigns) {
            collected.push({
              clientId:     client.id,
              clientName:   client.business_name,
              campaignId:   c.id,
              campaignName: c.name,
              platform:     'meta',
              budget:       null,
              daysToEnd:    null,
              leads:        Number(c.leads ?? 0),
              leadType:     c.objective ?? '',
              cpl:          Number(c.cpl ?? 0),
              ctr:          Number(c.ctr ?? 0),
              impressions:  Number(c.impressions ?? 0),
              clicks:       Number(c.clicks ?? 0),
              spend:        Number(c.spend ?? 0),
              crmContacts:  0,
            })
          }
        }
      }

      // Google — endpoint expects `customer_id`, returns campaigns[].id/.name
      if (client.google_ads_customer_id) {
        const params = new URLSearchParams({
          customer_id: client.google_ads_customer_id,
          date_range:  p,
          start_date:  start,
          end_date:    end,
        })
        const res  = await fetch(`/api/ads/google?${params}`)
        const data = await res.json()
        if (data.campaigns) {
          for (const c of data.campaigns) {
            const spend       = Number(c.spend ?? (Number(c.cost_micros ?? 0) / 1_000_000))
            const leads       = Number(c.leads ?? c.conversions ?? 0)
            const impressions = Number(c.impressions ?? 0)
            const clicks      = Number(c.clicks ?? 0)
            collected.push({
              clientId:     client.id,
              clientName:   client.business_name,
              campaignId:   c.id,
              campaignName: c.name,
              platform:     'google',
              budget:       null,
              daysToEnd:    null,
              leads,
              leadType:     c.campaign_type ?? c.advertising_channel_type ?? '',
              cpl:          Number(c.cpl ?? (leads > 0 ? spend / leads : 0)),
              ctr:          Number(c.ctr ?? (impressions > 0 ? (clicks / impressions) * 100 : 0)),
              impressions,
              clicks,
              spend,
              crmContacts:  0,
            })
          }
        }
      }

      setRows(collected)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => { fetchData(preset) }, [preset, fetchData])

  // Aggregate totals
  const totalSpend    = rows.reduce((s, r) => s + r.spend, 0)
  const totalLeads    = rows.reduce((s, r) => s + r.leads, 0)
  const avgCpl        = totalLeads > 0 ? totalSpend / totalLeads : 0
  const totalClicks   = rows.reduce((s, r) => s + r.clicks, 0)
  const totalImpr     = rows.reduce((s, r) => s + r.impressions, 0)
  const avgCtr        = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0

  // Top 5 campaigns by leads
  const top5 = [...rows].sort((a, b) => b.leads - a.leads).slice(0, 5)

  // Campaign types
  const typeMap: Record<string, number> = {}
  for (const r of rows) {
    const t = r.leadType || 'Otro'
    typeMap[t] = (typeMap[t] ?? 0) + 1
  }
  const campaignTypes = Object.entries(typeMap).sort((a, b) => b[1] - a[1])

  const totalFee = (client.fee_mdk ?? 0) + (client.fee_aurelia ?? 0)

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Back + header */}
        <div className="flex items-start gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2 mt-0.5">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Semaphore - Editable Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={updatingStatus || !!selectedUnidadId}>
                <button 
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full transition-all ring-2 ring-offset-2 ring-offset-background",
                    selectedUnidadId ? "cursor-default" : "cursor-pointer hover:opacity-80"
                  )}
                  style={{ 
                    backgroundColor: activeSemaforo.color,
                    // @ts-expect-error - CSS custom property for ring color
                    '--tw-ring-color': activeSemaforo.color 
                  } as React.CSSProperties}
                  title={selectedUnidadId ? `Semaforo de ${selectedUnidad?.unidad_de_negocio?.nombre}` : 'Cambiar semaforo global'}
                >
                  {updatingStatus && <RefreshCw className="h-4 w-4 text-white animate-spin" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {SEMAFORO_OPTIONS.map(opt => (
                  <DropdownMenuItem 
                    key={opt.id} 
                    onClick={() => handleSemaforoChange(opt.id)}
                    className="gap-2 cursor-pointer"
                  >
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: opt.color }} />
                    <span>{opt.label}</span>
                    {semaforoId === opt.id && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
  </DropdownMenu>
  <div>
  <div className="flex items-center gap-2 flex-wrap">
    <h1 className="text-2xl font-bold text-foreground text-balance">{client.business_name}</h1>
    {sortedUnidades.map((u) => {
      const isSelected = selectedUnidadId === u.unidad_de_negocio_id
      const unidadSemaforoNombre = client.semaforo_unidades?.[u.unidad_de_negocio_id]
      const unidadSemaforo = unidadSemaforoNombre ? getSemaforoByNombre(unidadSemaforoNombre) : null
      
      return (
        <Badge 
          key={u.unidad_de_negocio_id} 
          className={cn(
            "text-xs cursor-pointer transition-all",
            isSelected 
              ? "ring-2 ring-offset-2 ring-offset-background" 
              : "hover:bg-zinc-700",
            unidadSemaforo ? `bg-opacity-80` : "bg-zinc-800 text-white"
          )}
          style={unidadSemaforo ? { 
            backgroundColor: unidadSemaforo.color,
            color: 'white',
            ...(isSelected ? { ringColor: unidadSemaforo.color } : {})
          } : undefined}
          onClick={() => setSelectedUnidadId(isSelected ? null : u.unidad_de_negocio_id)}
        >
          {u.unidad_de_negocio?.nombre}
        </Badge>
      )
    })}
  </div>
  <p className="text-sm text-muted-foreground mt-0.5">
    {selectedUnidad ? `${selectedUnidad.unidad_de_negocio?.nombre}: ${activeSemaforo.label}` : activeSemaforo.label}
  </p>
  </div>
  </div>

          {/* Date filter */}
          <div className="flex items-center gap-2 shrink-0">
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="h-9 w-44 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => fetchData(preset)} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* ── Info row: PM / AM / Fee / Dedicacion / Plataformas ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-5 pb-5">
              <EditablePersonChip 
                profile={pm} 
                label="Project Manager" 
                profiles={profiles}
                onChange={handlePMChange}
                updating={updatingPM}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-5">
              <EditablePersonChip 
                profile={am} 
                label="Account Manager" 
                profiles={profiles}
                onChange={handleAMChange}
                updating={updatingAM}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground font-medium">Fee mensual</p>
                {!editingFee && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingFee(true)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
              
              {editingFee ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Fee MDK</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        type="number"
                        value={feeMdk}
                        onChange={(e) => setFeeMdk(Number(e.target.value))}
                        className="pl-7 h-9"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Fee Aurelia</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        type="number"
                        value={feeAurelia}
                        onChange={(e) => setFeeAurelia(Number(e.target.value))}
                        className="pl-7 h-9"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Fee Consultoría</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        type="number"
                        value={feeConsultoria}
                        onChange={(e) => setFeeConsultoria(Number(e.target.value))}
                        className="pl-7 h-9"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button 
                      size="sm" 
                      onClick={handleSaveFee}
                      disabled={savingFee}
                      className="h-7 text-xs gap-1"
                    >
                      <Check className="h-3 w-3" />
                      Guardar
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleCancelFeeEdit}
                      disabled={savingFee}
                      className="h-7 text-xs"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-2">
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(feeMdk + feeAurelia + feeConsultoria)}</p>
                    <p className="text-xs text-muted-foreground mb-1">/ mes</p>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {feeMdk > 0 && <span className="text-[11px] text-muted-foreground">MDK: {formatCurrency(feeMdk)}</span>}
                    {feeAurelia > 0 && <span className="text-[11px] text-muted-foreground">Aurelia: {formatCurrency(feeAurelia)}</span>}
                    {feeConsultoria > 0 && <span className="text-[11px] text-muted-foreground">Consultoría: {formatCurrency(feeConsultoria)}</span>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Hours Card - Objetivo vs Acumuladas */}
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground font-medium">Horas del equipo</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Horas objetivo</span>
                  <span className="text-sm font-semibold text-foreground">{horasObjetivo}h / semana</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Horas acumuladas</span>
                  <span className="text-sm font-semibold text-foreground">{formatHours(horasEquipo)}</span>
                </div>
              </div>
              
              {/* Mis horas (colaborador actual) */}
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground font-medium mb-2">Mis horas este mes</p>
                <div className="flex items-end gap-2">
                  <span className="text-xl font-bold text-foreground">{formatHours(misHoras)}</span>
                  {assignment && (
                    <span className="text-xs text-muted-foreground mb-0.5">/ {assignment.max_hours}h asignadas</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-5">
              <p className="text-xs text-muted-foreground font-medium mb-3">Plataformas activas</p>
              {platforms.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {platforms.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <div className={cn(
                        'h-6 w-6 rounded flex items-center justify-center shrink-0',
                        p.id === 'meta' ? 'bg-blue-600/15 text-blue-400' : 'bg-green-600/15 text-green-400'
                      )}>
                        {p.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">{p.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate font-mono">{p.accountId}</p>
                      </div>
                      <CheckCircle2 className="h-3.5 w-3.5 text-status-verde ml-auto shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin plataformas</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Info del Cliente: Servicios, Contacto, Fechas, Etapa, Semaforos ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Informacion del cliente</h2>
          <ClientInfoCard client={client} unidadesDeNegocio={unidadesDeNegocio} userRole={currentProfile?.role} />
        </div>

        {/* ── KPIs del periodo ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">KPIs del periodo</h2>
          {error && (
            <p className="text-sm text-destructive mb-3">{error}</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Inversion',    value: loading ? '…' : formatCurrency(totalSpend),  icon: <DollarSign className="h-4 w-4" />, color: 'text-primary' },
              { label: 'Leads',        value: loading ? '…' : formatNumber(totalLeads),    icon: <Target className="h-4 w-4" />,     color: 'text-status-verde' },
              { label: 'CPL prom.',    value: loading ? '…' : formatCurrency(avgCpl),      icon: <TrendingDown className="h-4 w-4" />, color: 'text-status-amarillo' },
              { label: 'CTR prom.',    value: loading ? '…' : formatPct(avgCtr),           icon: <MousePointerClick className="h-4 w-4" />, color: 'text-blue-400' },
              { label: 'Clics',        value: loading ? '…' : formatNumber(totalClicks),   icon: <MousePointerClick className="h-4 w-4" />, color: 'text-blue-400' },
              { label: 'Impresiones',  value: loading ? '…' : formatNumber(totalImpr),     icon: <Eye className="h-4 w-4" />,        color: 'text-muted-foreground' },
            ].map(kpi => (
              <Card key={kpi.label} className="overflow-hidden">
                <CardContent className="pt-4 pb-4">
                  <div className={cn('mb-2', kpi.color)}>{kpi.icon}</div>
                  <p className="text-lg font-bold text-foreground leading-none">{kpi.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{kpi.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ── Estado de presupuesto publicitario ── */}
        {(client.meta_ads_account_id || client.google_ads_customer_id) && (
          <div>
            <ClientBudgetAlertCard
              loading={loading}
              alert={rows.length > 0
                ? computeClientBudgetAlerts(
                    client.id,
                    client.business_name,
                    rows.map(r => ({
                      campaignId:   r.campaignId,
                      campaignName: r.campaignName,
                      platform:     r.platform,
                      spend:        r.spend,
                      budget:       r.budget,
                      leadType:     r.leadType,
                    }))
                  )
                : null
              }
            />
          </div>
        )}

        {/* ── Tipo de campaña ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tipo de campanas</h2>
          <Card>
            <CardContent className="pt-5 pb-5">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Cargando...
                </div>
              ) : campaignTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos para el periodo</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {campaignTypes.map(([type, count]) => (
                    <Badge key={type} variant="secondary" className="gap-1.5 py-1 px-3">
                      <Megaphone className="h-3 w-3" />
                      {type}
                      <span className="text-muted-foreground ml-1">{count}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Top 5 campanas ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Top 5 campanas con mejor resultado
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[0,1,2].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="py-4"><div className="h-4 w-3/4 bg-muted rounded-full" /></CardContent>
                </Card>
              ))}
            </div>
          ) : top5.length === 0 ? (
            <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Sin campanas activas en el periodo</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {top5.map((row, i) => (
                <Card key={row.campaignId ?? i} className="overflow-hidden">
                  <div className={cn('h-0.5 w-full', row.platform === 'meta' ? 'bg-blue-500' : 'bg-green-500')} />
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground shrink-0">#{i + 1}</span>
                        <p className="text-sm font-medium text-foreground truncate">{row.campaignName}</p>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 text-[10px]', row.platform === 'meta' ? 'border-blue-500/30 text-blue-400' : 'border-green-500/30 text-green-400')}>
                        {row.platform === 'meta' ? 'Meta' : 'Google'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-3 border-t border-border/50 pt-3">
                      <MiniKPI label="Inversion"   value={formatCurrency(row.spend)} />
                      <MiniKPI label="Resultados"  value={String(row.leads)} sub={row.leadType || undefined} />
                      <MiniKPI label="CPL"         value={formatCurrency(row.cpl)} />
                      <MiniKPI label="CTR"         value={formatPct(row.ctr)} />
                      <MiniKPI label="Clics"       value={formatNumber(row.clicks)} />
                      <MiniKPI label="Impresiones" value={formatNumber(row.impressions)} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Landings, CRMs y NPS ── */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card p-5">
            <ClientLandings clientId={client.id} />
          </div>
          <div className="rounded-xl border bg-card p-5">
            <ClientCRMs clientId={client.id} />
          </div>
          <ClientNPS clientId={client.id} currentUserId={currentProfile?.id} />
        </div>

        {/* ── Tareas, Cotizaciones, Adjuntos ── */}
        <div className="grid md:grid-cols-2 gap-4">
          <ClientTareas clientId={client.id} />
          <ClientCotizaciones clientId={client.id} currentUserId={currentProfile?.id} />
        </div>

        {/* ── Adjuntos ── */}
        <ClientAdjuntos clientId={client.id} currentUserId={currentProfile?.id} />

        {/* ── Comentarios del Cliente ── */}
        <ClientComments 
          clientId={client.id} 
          currentUser={currentProfile ? {
            id: currentProfile.id,
            nombre: currentProfile.nombre,
            apellido: currentProfile.apellido,
            avatar_url: currentProfile.avatar_url,
          } : null}
        />

        {/* ── Memoria del Cliente ── */}
        <ClientMemoria clienteId={client.id} />

        {/* ── Canal de Discord ── */}
        {client.discord_channel_id ? (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Canal de Discord
            </h2>
            <DiscordChat 
              channelId={client.discord_channel_id} 
              channelName={client.discord_channel_name || 'Canal del cliente'}
              currentUser={currentProfile ? {
                id: currentProfile.id,
                nombre: currentProfile.nombre,
                apellido: currentProfile.apellido,
                avatar_url: currentProfile.avatar_url,
              } : null}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">Proximas funciones</h2>
            <ComingSoonBlock
              icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>}
              title="Canal de Discord"
              description="Agrega el discord_channel_id al cliente para habilitar el chat"
            />
          </div>
        )}
        
        {/* ── Coming soon sections ── */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">Proximas funciones</h2>
          <ComingSoonBlock
            icon={<Calendar className="h-5 w-5" />}
            title="Proximas reuniones y actividades"
            description="Agenda sincronizada con Google Calendar y actividades del cliente"
          />
        </div>

      </div>
    </div>
  )
}
