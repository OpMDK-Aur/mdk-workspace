'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Client, Profile, ScorecardRow, DateRange } from '@/lib/types'
import { MORA_OPTIONS, getMoraColor, MESES_CARGA } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DollarSign, Target, TrendingDown, MousePointerClick, Eye,
  Users, MessageSquare, Calendar, Clock,
  ArrowLeft, RefreshCw, CheckCircle2, Facebook, Globe, ChevronDown, Pencil, Check, X, Plus, Loader2,
  AlertCircle, Trash2, BarChart3, Pin, PinOff,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { updateClientHitosAccountManager } from '@/app/actions/client-hitos'
import { ClientBudgetAlertCard } from './client-budget-alert-card'
import { computeClientBudgetAlerts } from './budget-alerts-shared'
import { ClientMemoria } from './client-memoria'
import { DiscordChat } from './discord-chat'
import { ClientComments } from './client-comments'
import { ClientActivityTabs } from './client-activity-tabs'
import { ClientLandings } from './client-landings'
  import { ClientCRMs } from './client-crms'
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

interface MetricaColaborador {
  id: string
  colaborador_id: string
  fee_administrado: number
  valor_hora: number
  horas_teoricas_cliente: number
  minimo_no_negociable_horas: number
  horas_objetivo: number
  acumulado_mes_asignado: number
  porcentaje_asignacion: number
  colaboradores: {
    id: string
    nombre: string
    apellido: string
    avatar_url: string | null
  } | null
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
  metricasColaborador?: MetricaColaborador[]
  horasPorColaborador?: HorasColaborador[]
  npsNotas?: NpsNota[]
}

interface HorasColaborador {
  id: string
  nombre: string
  apellido: string
  avatar_url: string | null
  horas: number
}

interface NpsNota {
  id: string
  score: number
  comentario: string | null
  fecha: string
  encuestado_nombre: string | null
  encuestado_cargo: string | null
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
// Full currency — no abbreviation, used for fees
function formatCurrencyFull(v: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(v)
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

function getPuestoDisplay(profile: Profile) {
  return profile.puesto || ''
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

// ── Month selector helpers (for "Horas del equipo") ─────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0')

// Current month value, e.g. "2026-06"
function currentMonthValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

// Build the last `count` months (current first), value "YYYY-MM"
function getMonthOptions(count = 12): { value: string; label: string }[] {
  const now = new Date()
  const opts: { value: string; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
    let label = d.toLocaleDateString('es', { month: 'long', year: 'numeric' })
    label = label.charAt(0).toUpperCase() + label.slice(1)
    opts.push({ value, label })
  }
  return opts
}

// Resolve a "YYYY-MM" value into the first/last calendar day of that month
function resolveMonthRange(monthValue: string): { start: string; end: string } {
  const [y, m] = monthValue.split('-').map(Number)
  const startDate = new Date(y, m - 1, 1)
  const endDate = new Date(y, m, 0) // day 0 of next month = last day of this month
  const fmt = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  return { start: fmt(startDate), end: fmt(endDate) }
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

// ── Person chip (editable) ──────────────────────────────────────────────────��─
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
  return null // replaced by EditableMultiPersonChip
}

// ── Multi-person chip (editable, multi-select) ────────────────────────────────
function EditableMultiPersonChip({
  profileIds,
  label,
  profiles,
  onChange,
  updating,
  compact = false,
}: {
  profileIds: string[]
  label: string
  profiles: Profile[]
  onChange: (ids: string[]) => void
  updating: boolean
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selectedProfiles = profiles.filter(p => profileIds.includes(p.id))

  const toggle = (id: string) => {
    const next = profileIds.includes(id)
      ? profileIds.filter(x => x !== id)
      : [...profileIds, id]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild disabled={updating}>
          <button className="flex items-center gap-2 hover:bg-muted/50 rounded-lg p-1 -m-1 transition-colors cursor-pointer text-left w-full">
            <div className="flex-1 min-w-0">
              {selectedProfiles.length === 0 ? (
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full border-2 border-dashed border-border flex items-center justify-center shrink-0 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                  </div>
                  {!compact && <span className="text-sm text-muted-foreground">Sin asignar</span>}
                </div>
              ) : compact ? (
                <div className="flex items-center -space-x-2">
                  {selectedProfiles.map(p => (
                    <Avatar
                      key={p.id}
                      className="h-8 w-8 shrink-0 ring-2 ring-card"
                      title={p.full_name ?? p.email ?? ''}
                    >
                      {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.full_name ?? ''} />}
                      <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                        {initials(p.full_name)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {selectedProfiles.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 shrink-0">
                        {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.full_name ?? ''} />}
                        <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                          {initials(p.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">{p.full_name ?? p.email}</p>
                        {getPuestoDisplay(p) && (
                          <p className="text-[10px] text-muted-foreground">{getPuestoDisplay(p)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {updating ? (
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuItem
            onClick={(e) => { e.preventDefault(); onChange([]) }}
            className="gap-2 cursor-pointer"
          >
            <div className="h-6 w-6 rounded-full border-2 border-dashed border-border flex items-center justify-center shrink-0">
              <Users className="h-3 w-3 text-muted-foreground" />
            </div>
            <span className="text-muted-foreground flex-1">Limpiar selección</span>
          </DropdownMenuItem>
          {profiles.map(p => {
            const selected = profileIds.includes(p.id)
            return (
              <DropdownMenuItem
                key={p.id}
                onClick={(e) => { e.preventDefault(); toggle(p.id) }}
                className="gap-2 cursor-pointer"
              >
                <Avatar className="h-6 w-6 shrink-0">
                  {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.full_name ?? ''} />}
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                    {initials(p.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate flex-1">{p.full_name ?? p.email}</span>
                {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ���─ Multi-account editor (for Meta/Google IDs) ────────────────────────────────
function EditableAccountsEditor({
  accounts,
  label,
  platform,
  onChange,
  updating,
  nameMap = {},
  loadingNames = false,
  compact = false,
}: {
  accounts: string[]
  label: string
  platform: 'meta' | 'google'
  onChange: (ids: string[]) => void
  updating: boolean
  nameMap?: Record<string, string>
  loadingNames?: boolean
  compact?: boolean
}) {
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)

  const addAccount = (id: string) => {
    const trimmed = id.trim()
    if (trimmed && !accounts.includes(trimmed)) {
      onChange([...accounts, trimmed])
      setInput('')
    }
  }

  const removeAccount = (id: string) => {
    onChange(accounts.filter(a => a !== id))
  }

  // Resolve display name for an account id (try with/without act_ prefix)
  const resolveName = (acc: string): string | null => {
    const clean = acc.replace(/^act_/, '').replace(/-/g, '')
    return nameMap[acc] ?? nameMap[clean] ?? null
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        {compact && !adding && (
          <button
            onClick={() => setAdding(true)}
            disabled={updating}
            className="h-6 w-6 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors shrink-0"
            aria-label={`Agregar cuenta de ${label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {accounts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {accounts.map(acc => {
              const name = resolveName(acc)
              return (
                <div
                  key={acc}
                  className="flex items-start gap-1.5 bg-muted text-foreground rounded-md px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-tight truncate" title={name ?? acc}>
                      {name ?? (loadingNames ? 'Cargando…' : 'Cuenta sin nombre')}
                    </p>
                    {!compact && (
                      <code className="text-[10px] font-mono text-muted-foreground break-all">{acc}</code>
                    )}
                  </div>
                  <button
                    onClick={() => removeAccount(acc)}
                    disabled={updating}
                    className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {(!compact || adding) && (
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder={platform === 'meta' ? 'act_...' : 'Customer ID'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addAccount(input)
                }
              }}
              disabled={updating}
              autoFocus={adding}
              className="h-8 text-xs flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => addAccount(input)}
              disabled={!input.trim() || updating}
              className="h-8"
            >
              Agregar
            </Button>
          </div>
        )}
        {accounts.length === 0 && !compact && (
          <p className="text-xs text-muted-foreground">Sin cuentas agregadas</p>
        )}
        {accounts.length === 0 && compact && !adding && (
          <p className="text-xs text-muted-foreground">Sin cuentas</p>
        )}
      </div>
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

// ── Main component ─────────────────────────────────────────────────────────────
export function ClientOverview({ client, profiles, currentProfile, assignment, trackedHours, horasObjetivo = 0, horasEquipo = 0, misHoras = 0, unidadesDeNegocio = [], metricasColaborador = [], horasPorColaborador = [], npsNotas = [] }: ClientOverviewProps) {
  const router = useRouter()
  const [preset, setPreset] = useState('last_30d')
  // Month filter for "Horas del equipo" (defaults to the current month)
  const [teamMonth, setTeamMonth] = useState<string>(() => currentMonthValue())
  const monthOptions = useMemo(() => getMonthOptions(12), [])
  const [platformFilter, setPlatformFilter] = useState<'all' | 'meta' | 'google'>('all')
  const [campaignFilter, setCampaignFilter] = useState<string>('all')
  // Team hours recomputed for the selected date range (seeded with the server-provided monthly data)
  const [teamHours, setTeamHours] = useState<HorasColaborador[]>(horasPorColaborador)
  const [loadingHours, setLoadingHours] = useState(false)
  const [rows, setRows]               = useState<ScorecardRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [editingBusinessName, setEditingBusinessName] = useState(false)
  const [businessName, setBusinessName] = useState(client.business_name)

  // Detectar si el cliente tiene Consultoría y GoHighLevel
  const hasConsultoria = unidadesDeNegocio?.some(u => u.unidad_de_negocio?.nombre === 'Consultoría') ?? false
  const hasGHL = client.crm_type === 'ghl' && !!client.ghl_location_id && !!client.ghl_token
  
  // Debug: Verificar qué unidades de negocio se están trayendo
  if (client.nombre === 'Donadio') {
    console.log('[v0] DEBUG - Donadio unidadesDeNegocio:', {
      unidadesDeNegocio,
      hasConsultoria,
      hasGHL,
      unidadesLength: unidadesDeNegocio?.length,
      nombres: unidadesDeNegocio?.map(u => u.unidad_de_negocio?.nombre)
    })
  }
  
  // Mostrar RevOps button en todos los clientes con Consultoría
  const showRevOpsButton = hasConsultoria
  const [savingBusinessName, setSavingBusinessName] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingClient, setDeletingClient] = useState(false)
  const [pmIds, setPmIds] = useState<string[]>(() => {
    if (client.project_manager_ids?.length) return client.project_manager_ids
    return client.project_manager_id ? [client.project_manager_id] : []
  })
  const [amIds, setAmIds] = useState<string[]>(() => {
    if (client.account_manager_ids?.length) return client.account_manager_ids
    return client.account_manager_id ? [client.account_manager_id] : []
  })
  const [metaIds, setMetaIds] = useState<string[]>(() => {
    if (client.meta_ads_account_ids?.length) return client.meta_ads_account_ids
    return client.meta_ads_account_id ? [client.meta_ads_account_id] : []
  })
  const [googleIds, setGoogleIds] = useState<string[]>(() => {
    if (client.google_ads_customer_ids?.length) return client.google_ads_customer_ids
    return client.google_ads_customer_id ? [client.google_ads_customer_id] : []
  })
  const [updatingPM, setUpdatingPM] = useState(false)
  const [updatingAM, setUpdatingAM] = useState(false)
  const [updatingMeta, setUpdatingMeta] = useState(false)
  const [updatingGoogle, setUpdatingGoogle] = useState(false)
  
  // Fee editing
  const [editingFee, setEditingFee] = useState(false)
  const [feeMdk, setFeeMdk] = useState(client.fee_mdk ?? 0)
  const [feeAurelia, setFeeAurelia] = useState(client.fee_aurelia ?? 0)
  const [feeConsultoria, setFeeConsultoria] = useState(client.fee_consultoria ?? 0)
  const [feeMesCarga, setFeeMesCarga] = useState<number | null>(client.fee_mes_carga ?? null)
  const [feeAnioCarga, setFeeAnioCarga] = useState<number | null>(client.fee_anio_carga ?? null)
  const [savingFee, setSavingFee] = useState(false)

  // Mora editing
  const [mora, setMora] = useState<string | null>(client.mora ?? null)
  const [savingMora, setSavingMora] = useState(false)
  const moraColor = getMoraColor(mora || 'Al día')
  
  // Active/Inactive status
  const [isActivo, setIsActivo] = useState(client.activo !== false) // null or true = activo
  const [updatingActivo, setUpdatingActivo] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [activityPinned, setActivityPinned] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('activity-panel-pinned')
    return stored === 'true'
  })
  
  // Auto-collapse performance section when activity is open for better layout
  const showPerformanceSection = !showActivity

  // Ad account names (resolved from the platform account listing endpoints)
  const [metaNames, setMetaNames] = useState<Record<string, string>>({})
  const [googleNames, setGoogleNames] = useState<Record<string, string>>({})
  const [loadingNames, setLoadingNames] = useState(false)

  const supabase = createClient()

  // Persist activity panel pinned state to localStorage
  useEffect(() => {
    localStorage.setItem('activity-panel-pinned', String(activityPinned))
  }, [activityPinned])

  // Load human-readable account names once
  useEffect(() => {
    let cancelled = false
    const loadNames = async () => {
      setLoadingNames(true)
      try {
        const [metaRes, googleRes] = await Promise.all([
          fetch('/api/ads/meta/accounts').then(r => r.ok ? r.json() : { accounts: [] }).catch(() => ({ accounts: [] })),
          fetch('/api/ads/google/accounts').then(r => r.ok ? r.json() : { accounts: [] }).catch(() => ({ accounts: [] })),
        ])
        if (cancelled) return
        const metaMap: Record<string, string> = {}
        for (const a of metaRes.accounts ?? []) {
          if (a.id) metaMap[String(a.id)] = a.name
          if (a.raw_id) metaMap[String(a.raw_id)] = a.name
        }
        const googleMap: Record<string, string> = {}
        for (const a of googleRes.accounts ?? []) {
          if (a.id) googleMap[String(a.id).replace(/-/g, '')] = a.name
        }
        setMetaNames(metaMap)
        setGoogleNames(googleMap)
      } finally {
        if (!cancelled) setLoadingNames(false)
      }
    }
    loadNames()
    return () => { cancelled = true }
  }, [])

  const handleActivoChange = async (newActivo: boolean) => {
    setUpdatingActivo(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ activo: newActivo })
        .eq('id', client.id)
      
      if (!error) {
        setIsActivo(newActivo)
      }
    } catch (e) {
      console.error('Error updating activo status:', e)
    } finally {
      setUpdatingActivo(false)
    }
  }

  const handleActivoToggle = async () => {
    await handleActivoChange(!isActivo)
  }

  const saveBusinessName = async () => {
    const trimmedName = businessName.trim()
    if (!trimmedName || trimmedName === client.business_name) {
      setEditingBusinessName(false)
      return
    }
    
    setSavingBusinessName(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ nombre_del_negocio: trimmedName })
        .eq('id', client.id)
      
      if (!error) {
        // Keep the updated name in state for immediate UI update
        setBusinessName(trimmedName)
        setEditingBusinessName(false)
      } else {
        setBusinessName(client.business_name)
      }
    } catch (err) {
      console.error('[v0] Error saving business name:', err)
      setBusinessName(client.business_name)
    } finally {
      setSavingBusinessName(false)
    }
  }

  const handlePMChange = async (newIds: string[]) => {
    setUpdatingPM(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ 
          project_manager_ids: newIds,
          project_manager_id: newIds[0] ?? null,
        })
        .eq('id', client.id)
      if (!error) setPmIds(newIds)
    } catch (e) {
      console.error('Error updating PM:', e)
    } finally {
      setUpdatingPM(false)
    }
  }

  const handleAMChange = async (newIds: string[]) => {
    setUpdatingAM(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ 
          account_manager_ids: newIds,
          account_manager_id: newIds[0] ?? null,
        })
        .eq('id', client.id)
      if (!error) {
        setAmIds(newIds)
        // Actualizar automáticamente todos los hitos del cliente con el nuevo Account Manager
        try {
          const result = await updateClientHitosAccountManager(client.id, newIds[0] ?? null)
          console.log('[v0] Updated', result.updated, 'hitos for client:', client.id)
        } catch (hitoError) {
          console.error('[v0] Error updating hitos:', hitoError)
          // No lanzar error, pero loguear - esto es una operación secundaria
        }
      }
    } catch (e) {
      console.error('Error updating AM:', e)
    } finally {
      setUpdatingAM(false)
    }
  }

  const handleDeleteClient = async () => {
    setDeletingClient(true)
    try {
      await supabase
        .from('clientes')
        .delete()
        .eq('id', client.id)
      
      router.push('/dashboard/clients')
    } catch (err) {
      console.error('[v0] Error deleting client:', err)
      setDeletingClient(false)
    }
  }

  const handleMetaChange = async (newIds: string[]) => {
    setUpdatingMeta(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ 
          meta_ads_account_ids: newIds,
          meta_ads_account_id: newIds[0] ?? null,
        })
        .eq('id', client.id)
      if (!error) setMetaIds(newIds)
    } catch (e) {
      console.error('Error updating Meta accounts:', e)
    } finally {
      setUpdatingMeta(false)
    }
  }

  const handleGoogleChange = async (newIds: string[]) => {
    setUpdatingGoogle(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ 
          google_ads_customer_ids: newIds,
          google_ads_customer_id: newIds[0] ?? null,
        })
        .eq('id', client.id)
      if (!error) setGoogleIds(newIds)
    } catch (e) {
      console.error('Error updating Google accounts:', e)
    } finally {
      setUpdatingGoogle(false)
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
          fee_consultoria: feeConsultoria,
          fee_mes_carga: feeMesCarga,
          fee_anio_carga: feeAnioCarga
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
    setFeeMesCarga(client.fee_mes_carga ?? null)
    setFeeAnioCarga(client.fee_anio_carga ?? null)
    setEditingFee(false)
  }

  const handleSaveMora = async (value: string) => {
    // 'Al día' es el estado sin mora -> guardamos null
    const newMora = value === 'Al día' ? null : value
    setSavingMora(true)
    setMora(newMora)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ mora: newMora })
        .eq('id', client.id)
      if (error) console.error('Error saving mora:', error)
    } catch (e) {
      console.error('Error saving mora:', e)
    } finally {
      setSavingMora(false)
    }
  }

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
      // Meta — endpoint expects `account_id`, returns { campaigns[], totals }
      const metaAccountIds = metaIds.length > 0 ? metaIds : (client.meta_ads_account_id ? [client.meta_ads_account_id] : [])
      if (metaAccountIds.length > 0) {
        for (const account_id of metaAccountIds) {
          const params = new URLSearchParams({
            account_id,
            date_range: p,
            start_date: start,
            end_date: end,
          })
          const res = await fetch(`/api/ads/meta?${params}`)
          const data = await res.json()
          if (!res.ok) {
            throw new Error(data.error || 'Error al cargar Meta Ads')
          }
          if (data.campaigns) {
            for (const c of data.campaigns) {
              const spend = Number(c.spend ?? 0)
              const leads = Number(c.leads ?? 0)
              const impressions = Number(c.impressions ?? 0)
              const clicks = Number(c.clicks ?? 0)
              collected.push({
                clientId:     client.id,
                clientName:   client.business_name,
                campaignId:   c.id,
                campaignName: c.name,
                platform:     'meta',
                budget:       null,
                daysToEnd:    null,
                leads,
                leadType:     c.lead_type ?? '',
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
      }

      // Google — endpoint expects `customer_id`, returns campaigns[].id/.name
      const googleCustomerIds = googleIds.length > 0 ? googleIds : (client.google_ads_customer_id ? [client.google_ads_customer_id] : [])
      if (googleCustomerIds.length > 0) {
        for (const customer_id of googleCustomerIds) {
          const params = new URLSearchParams({
            customer_id: customer_id,
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
      }

      setRows(collected)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [client, metaIds, googleIds])

  useEffect(() => { fetchData(preset) }, [preset, fetchData])

  // Recompute team hours (entradas_de_tiempo) for the selected month
  const fetchTeamHours = useCallback(async (monthValue: string) => {
    setLoadingHours(true)
    const { start, end } = resolveMonthRange(monthValue)
    try {
      const { data, error } = await supabase
        .from('entradas_de_tiempo')
        .select('duracion_seg, colaborador_id, colaboradores:colaborador_id(id, nombre, apellido, avatar_url, activo)')
        .eq('cliente_id', client.id)
        .gte('iniciado_en', `${start}T00:00:00`)
        .lte('iniciado_en', `${end}T23:59:59`)
        .not('finalizado_en', 'is', null)
      if (error) throw error
      const map = new Map<string, HorasColaborador>()
      for (const e of (data ?? []) as unknown as Array<{ duracion_seg: number | null; colaborador_id: string | null; colaboradores: { id: string; nombre: string; apellido: string; avatar_url: string | null; activo: boolean | null } | { id: string; nombre: string; apellido: string; avatar_url: string | null; activo: boolean | null }[] | null }>) {
        const col = Array.isArray(e.colaboradores) ? e.colaboradores[0] ?? null : e.colaboradores
        // Skip inactive collaborators entirely
        if (col && col.activo === false) continue
        const id = col?.id || e.colaborador_id
        if (!id) continue
        const horas = (e.duracion_seg ?? 0) / 3600
        const prev = map.get(id)
        if (prev) {
          prev.horas += horas
        } else {
          map.set(id, {
            id,
            nombre: col?.nombre ?? '',
            apellido: col?.apellido ?? '',
            avatar_url: col?.avatar_url ?? null,
            horas,
          })
        }
      }
      setTeamHours(Array.from(map.values()).sort((a, b) => b.horas - a.horas))
    } catch {
      setTeamHours([])
    } finally {
      setLoadingHours(false)
    }
  }, [client.id, supabase])

  useEffect(() => { fetchTeamHours(teamMonth) }, [teamMonth, fetchTeamHours])

  // Reset campaign filter if it no longer exists in the data
  useEffect(() => {
    if (campaignFilter !== 'all' && !rows.some(r => r.campaignId === campaignFilter)) {
      setCampaignFilter('all')
    }
  }, [rows, campaignFilter])

  // Apply platform + campaign filters before aggregating
  const filteredRows = rows.filter(r => {
    if (platformFilter !== 'all' && r.platform !== platformFilter) return false
    if (campaignFilter !== 'all' && r.campaignId !== campaignFilter) return false
    return true
  })

  // Unique campaign options for the campaign filter (respecting the platform filter)
  const campaignOptions = Array.from(
    new Map(
      rows
        .filter(r => platformFilter === 'all' || r.platform === platformFilter)
        .filter(r => r.campaignId)
        .map(r => [r.campaignId as string, r.campaignName])
    ).entries()
  )

  // Aggregate totals
  const totalSpend    = filteredRows.reduce((s, r) => s + r.spend, 0)
  const totalLeads    = filteredRows.reduce((s, r) => s + r.leads, 0)
  const avgCpl        = totalLeads > 0 ? totalSpend / totalLeads : 0
  const totalClicks   = filteredRows.reduce((s, r) => s + r.clicks, 0)
  const totalImpr     = filteredRows.reduce((s, r) => s + r.impressions, 0)
  const avgCtr        = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0

  // Top 5 campaigns by leads
  const top5 = [...filteredRows].sort((a, b) => b.leads - a.leads).slice(0, 5)

  const totalFee = (client.fee_mdk ?? 0) + (client.fee_aurelia ?? 0)

  // Merge tracked hours (everyone who logged time) with assigned metrics (objetivo/minimo)
  // so the team list shows ALL people who worked on this client, not only assigned ones.
  type TeamMember = {
    id: string
    nombre: string
    apellido: string
    avatar_url: string | null
    horas: number
    horasObjetivo: number
    minimo: number
    porcentaje: number
  }
  const teamMap = new Map<string, TeamMember>()
  // Seed from assigned metrics (objetivo / minimo only — hours start at 0 and are
  // filled exclusively from real tracked time for the selected range below)
  for (const m of metricasColaborador) {
    const col = m.colaboradores
    const id = col?.id || m.colaborador_id
    if (!id) continue
    teamMap.set(id, {
      id,
      nombre: col?.nombre ?? '',
      apellido: col?.apellido ?? '',
      avatar_url: col?.avatar_url ?? null,
      horas: 0,
      horasObjetivo: m.horas_objetivo || 0,
      minimo: m.minimo_no_negociable_horas || 0,
      porcentaje: m.porcentaje_asignacion || 0,
    })
  }
  // Set actual tracked hours for the selected range (covers people without assigned metrics)
  for (const h of teamHours) {
    const existing = teamMap.get(h.id)
    if (existing) {
      existing.horas = h.horas
      if (!existing.nombre) existing.nombre = h.nombre
      if (!existing.apellido) existing.apellido = h.apellido
      if (!existing.avatar_url) existing.avatar_url = h.avatar_url
    } else {
      teamMap.set(h.id, {
        id: h.id,
        nombre: h.nombre,
        apellido: h.apellido,
        avatar_url: h.avatar_url,
        horas: h.horas,
        horasObjetivo: 0,
        minimo: 0,
        porcentaje: 0,
      })
    }
  }
  // Only show people who actually logged time in the selected range. Assigned metrics
  // (objetivo / minimo) are used only to enrich those rows — they never introduce a
  // collaborator on their own, so inactive people and people who didn't track any time
  // in the period are excluded.
  const teamMembers = Array.from(teamMap.values())
    .filter(m => m.horas > 0)
    .sort((a, b) => b.horas - a.horas)
  const totalHorasAcumuladas = teamMembers.reduce((acc, m) => acc + m.horas, 0)
  const totalHorasObjetivo = teamMembers.reduce((acc, m) => acc + m.horasObjetivo, 0)
  const totalMinimo = teamMembers.reduce((acc, m) => acc + m.minimo, 0)

  return (
    <div className="flex-1 min-h-0 bg-background flex overflow-hidden">
      {/* Main scrollable content — re-centers/shifts left when the activity panel opens */}
      <div
        className={cn(
          'flex-1 overflow-y-auto transition-[padding] duration-300 ease-in-out',
          showActivity ? 'sm:pr-[520px] lg:pr-[640px]' : ''
        )}
      >
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-8 transition-all duration-300 ease-in-out">

        {/* Back + header */}
        <div className="flex items-start gap-2">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2 mt-0.5">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          <Link href="/dashboard/clients">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground mt-0.5">
              <Users className="h-4 w-4" />
              Clientes
            </Button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
  <div>
  <div className="flex items-center gap-2 flex-wrap">
    {editingBusinessName ? (
      <div className="flex items-center gap-2">
        <Input 
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveBusinessName()
            if (e.key === 'Escape') {
              setEditingBusinessName(false)
              setBusinessName(client.business_name)
            }
          }}
          className="text-2xl font-bold"
          autoFocus
        />
        <Button size="sm" variant="ghost" onClick={saveBusinessName} disabled={savingBusinessName}>
          {savingBusinessName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => {
          setEditingBusinessName(false)
          setBusinessName(client.business_name)
        }}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    ) : (
      <>
        <h1 className="text-2xl font-bold text-foreground text-balance">{businessName}</h1>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingBusinessName(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </>
    )}
    {/* Active/Inactive status badge */}
    <Badge 
      variant={isActivo ? "default" : "secondary"}
      className={cn(
        "text-xs cursor-pointer transition-all",
        isActivo 
          ? "bg-green-500/20 text-green-500 hover:bg-green-500/30" 
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
      onClick={handleActivoToggle}
      title={isActivo ? "Clic para marcar como inactivo" : "Clic para marcar como activo"}
    >
      {updatingActivo ? (
        <RefreshCw className="h-3 w-3 animate-spin" />
      ) : (
        isActivo ? "Activo" : "Inactivo"
      )}
    </Badge>
  </div>
  </div>
  </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={showActivity ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => setShowActivity(v => !v)}
            >
              <MessageSquare className="h-4 w-4" />
              {showActivity ? 'Ocultar actividad' : 'Ver actividad'}
            </Button>
            {showRevOpsButton && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => router.push('/dashboard/agentes/revops')}
              >
                <BarChart3 className="h-4 w-4" />
                Ejecutar RevOps
              </Button>
            )}
          </div>
        </div>

        {/* ── Info row: PM / AM / Fee / Dedicacion / Plataformas ── */}
        <div className={cn(
          'grid grid-cols-1 sm:grid-cols-2 gap-4',
          showActivity ? 'lg:grid-cols-2 xl:grid-cols-3' : 'lg:grid-cols-5'
        )}>
          <Card>
            <CardContent className="pt-5 pb-5">
              <EditableMultiPersonChip
                profileIds={pmIds}
                label="Project Manager"
                profiles={profiles}
                onChange={handlePMChange}
                updating={updatingPM}
                compact={showActivity}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-5">
              <EditableMultiPersonChip
                profileIds={amIds}
                label="Account Manager"
                profiles={profiles}
                onChange={handleAMChange}
                updating={updatingAM}
                compact={showActivity}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-5">
              <EditableAccountsEditor
                accounts={metaIds}
                label="Meta Ads"
                platform="meta"
                onChange={handleMetaChange}
                updating={updatingMeta}
                nameMap={metaNames}
                loadingNames={loadingNames}
                compact={showActivity}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-5">
              <EditableAccountsEditor
                accounts={googleIds}
                label="Google Ads"
                platform="google"
                onChange={handleGoogleChange}
                updating={updatingGoogle}
                nameMap={googleNames}
                loadingNames={loadingNames}
                compact={showActivity}
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Mes de carga</label>
                      <Select
                        value={feeMesCarga ? String(feeMesCarga) : undefined}
                        onValueChange={(v) => setFeeMesCarga(Number(v))}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Mes" />
                        </SelectTrigger>
                        <SelectContent>
                          {MESES_CARGA.map(m => (
                            <SelectItem key={m.value} value={String(m.value)} className="text-xs">
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Año de carga</label>
                      <Input
                        type="number"
                        value={feeAnioCarga ?? ''}
                        onChange={(e) => setFeeAnioCarga(e.target.value === '' ? null : Number(e.target.value))}
                        className="h-9"
                        placeholder="Ej: 2026"
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
                  <div className="flex flex-col min-w-0">
                    <p className="text-base font-bold text-foreground leading-tight truncate">{formatCurrencyFull(feeMdk + feeAurelia + feeConsultoria)}</p>
                    <p className="text-xs text-muted-foreground">/ mes</p>
                  </div>
                  <div className="flex flex-col gap-0.5 mt-2">
                    {feeMdk > 0 && <span className="text-[11px] text-muted-foreground">MDK: {formatCurrencyFull(feeMdk)}</span>}
                    {feeAurelia > 0 && <span className="text-[11px] text-muted-foreground">Aurelia: {formatCurrencyFull(feeAurelia)}</span>}
                    {feeConsultoria > 0 && <span className="text-[11px] text-muted-foreground">Consultoría: {formatCurrencyFull(feeConsultoria)}</span>}
                  </div>
                  {(feeMesCarga || feeAnioCarga) && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Actualizado: {feeMesCarga ? MESES_CARGA.find(m => m.value === feeMesCarga)?.label : ''}{feeMesCarga && feeAnioCarga ? ' ' : ''}{feeAnioCarga ?? ''}
                    </p>
                  )}
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground font-medium">Mora</span>
                      {savingMora && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </div>
                    <Select value={mora || 'Al día'} onValueChange={handleSaveMora}>
                      <SelectTrigger className={cn('h-7 mt-1.5 w-full min-w-0 text-xs font-medium truncate', moraColor.color)}>
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
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── NPS Score (arriba de Horas del Equipo) ── */}
        <ClientNPS 
          clientId={client.id} 
          currentUserId={currentProfile?.id}
          projectManagerId={client.project_manager_id}
          accountManagerId={client.account_manager_id}
        />

        {/* ── Horas del Equipo ── */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Horas del equipo</h2>
            <div className="flex items-center gap-2 shrink-0">
              <Select value={teamMonth} onValueChange={setTeamMonth}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => fetchTeamHours(teamMonth)}
                disabled={loadingHours}
              >
                <RefreshCw className={cn('h-4 w-4', loadingHours && 'animate-spin')} />
              </Button>
            </div>
          </div>
          <Card>
            <CardContent className="pt-5 pb-5">
              {/* Resumen general */}
              <div className="flex flex-wrap items-center gap-6 mb-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {totalHorasAcumuladas.toFixed(1)}h
                    </p>
                    <p className="text-xs text-muted-foreground">Horas acumuladas</p>
                  </div>
                </div>
                <div className="h-8 w-px bg-border hidden sm:block" />
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {totalHorasObjetivo.toFixed(1)}h
                  </p>
                  <p className="text-xs text-muted-foreground">Objetivo mensual</p>
                </div>
                <div className="h-8 w-px bg-border hidden sm:block" />
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {totalMinimo.toFixed(1)}h
                  </p>
                  <p className="text-xs text-muted-foreground">Minimo requerido</p>
                </div>
                <div className="h-8 w-px bg-border hidden sm:block" />
                <div>
                  <p className="text-lg font-semibold text-foreground">{teamMembers.length}</p>
                  <p className="text-xs text-muted-foreground">Colaboradores</p>
                </div>
              </div>
              
              {/* Lista de colaboradores */}
              {teamMembers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {teamMembers.map((miembro) => {
                    const nombre = `${miembro.nombre || ''} ${miembro.apellido || ''}`.trim() || 'Sin nombre'
                    const iniciales = nombre.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                    const progreso = miembro.horasObjetivo > 0 
                      ? Math.min((miembro.horas / miembro.horasObjetivo) * 100, 100) 
                      : 0
                    const colorProgreso = progreso >= 100 
                      ? 'bg-status-verde' 
                      : progreso >= 70 
                        ? 'bg-status-amarillo' 
                        : 'bg-status-naranja'
                    
                    return (
                      <div key={miembro.id} className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 shrink-0">
                            {miembro.avatar_url && <AvatarImage src={miembro.avatar_url} alt={nombre} />}
                            <AvatarFallback className="bg-primary/20 text-primary text-xs">
                              {iniciales}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{nombre}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {miembro.porcentaje > 0 ? `${miembro.porcentaje}% dedicacion` : 'Horas registradas'}
                            </p>
                          </div>
                        </div>
                        
                        {/* Barra de progreso (solo si hay objetivo asignado) */}
                        {miembro.horasObjetivo > 0 ? (
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">
                                {formatHours(miembro.horas)} / {formatHours(miembro.horasObjetivo)}
                              </span>
                              <span className={cn(
                                'font-semibold',
                                progreso >= 100 ? 'text-status-verde' : progreso >= 70 ? 'text-status-amarillo' : 'text-status-naranja'
                              )}>
                                {progreso.toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={cn('h-full rounded-full transition-all', colorProgreso)}
                                style={{ width: `${progreso}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Horas destinadas</span>
                            <span className="font-semibold text-foreground">{formatHours(miembro.horas)}</span>
                          </div>
                        )}
                        
                        {/* Detalle: destinado / minimo / maximo (objetivo) */}
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Destinado</p>
                            <p className="text-xs font-semibold text-foreground">{formatHours(miembro.horas)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Minimo</p>
                            <p className={cn(
                              'text-xs font-semibold',
                              miembro.minimo > 0 && miembro.horas < miembro.minimo ? 'text-status-naranja' : 'text-foreground'
                            )}>
                              {miembro.minimo > 0 ? formatHours(miembro.minimo) : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Maximo</p>
                            <p className="text-xs font-semibold text-foreground">
                              {miembro.horasObjetivo > 0 ? formatHours(miembro.horasObjetivo) : '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Sin horas registradas en el periodo</p>
                  <p className="text-xs text-muted-foreground mt-1">Nadie ha marcado tiempo sobre este cliente en el mes seleccionado</p>
                </div>
              )}
              
              {/* Mis horas */}
              {assignment && (
                <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      {currentProfile?.avatar_url && <AvatarImage src={currentProfile.avatar_url} />}
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {currentProfile?.nombre?.[0]}{currentProfile?.apellido?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-foreground">Mis horas este mes</p>
                      <p className="text-xs text-muted-foreground">{currentProfile?.nombre} {currentProfile?.apellido}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-foreground">{formatHours(misHoras)}</p>
                    <p className="text-xs text-muted-foreground">de {assignment.max_hours}h asignadas</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Info del Cliente: Servicios, Contacto, Fechas, Etapa, Semaforos ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Informacion del cliente</h2>
          <ClientInfoCard 
            client={client} 
            unidadesDeNegocio={unidadesDeNegocio} 
            userRole={currentProfile?.role}
            isActivo={isActivo}
            onActivoChange={handleActivoChange}
            updatingActivo={updatingActivo}
          />
        </div>

        {/* ��─ KPIs del periodo ── */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">KPIs del periodo</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as 'all' | 'meta' | 'google')}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue placeholder="Plataforma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las plataformas</SelectItem>
                  <SelectItem value="meta">Meta Ads</SelectItem>
                  <SelectItem value="google">Google Ads</SelectItem>
                </SelectContent>
              </Select>
              <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                <SelectTrigger className="h-8 w-[170px] text-xs">
                  <SelectValue placeholder="Campaña" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las campañas</SelectItem>
                  {campaignOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id} className="text-xs">{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive mb-3">{error}</p>
          )}
          {showPerformanceSection ? (
            <>
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
            </>
          ) : null}
        </div>

        {/* ── Estado de presupuesto publicitario ── */}
        {showPerformanceSection && (client.meta_ads_account_id || client.google_ads_customer_id) ? (
          <div>
            <ClientBudgetAlertCard
              loading={loading}
              alert={filteredRows.length > 0
                ? computeClientBudgetAlerts(
                    client.id,
                    client.business_name,
                    filteredRows.map(r => ({
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
        ) : null}

        {/* ── Top 5 campanas ── */}
        {showPerformanceSection && (
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
        )}

        {/* ── Landings y CRMs ── */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <ClientLandings clientId={client.id} />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <ClientCRMs clientId={client.id} />
          </div>
        </div>

        {/* ── Tareas, Cotizaciones, Adjuntos ── */}
        <div className="grid md:grid-cols-2 gap-4">
          <ClientTareas clientId={client.id} />
          <ClientCotizaciones clientId={client.id} currentUserId={currentProfile?.id} />
        </div>

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

        {/* ── Danger Zone ── */}
        <div className="mt-12 pt-8 border-t border-destructive/20">
          <div className="space-y-4 p-4 border border-destructive/50 rounded-lg bg-destructive/5">
            <h2 className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Zona de Peligro
            </h2>
            <p className="text-xs text-muted-foreground">
              Esta acción no se puede deshacer. El cliente y todos sus datos asociados serán eliminados permanentemente.
            </p>
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar cliente
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Eliminar cliente</DialogTitle>
                  <DialogDescription>
                    ¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-sm text-foreground">
                    Cliente: <span className="font-semibold">{client.business_name}</span>
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={handleDeleteClient}
                    disabled={deletingClient}
                  >
                    {deletingClient ? 'Eliminando...' : 'Eliminar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

      </div>
        </div>

      {/* ── Sliding activity panel (right) — full viewport height ── */}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] lg:w-[640px] border-l border-border bg-card shadow-xl flex flex-col transition-transform duration-300 ease-in-out',
          showActivity ? 'translate-x-0' : 'translate-x-full',
          activityPinned && 'sticky-activity'
        )}
        aria-hidden={!showActivity}
      >
        <div className="w-full h-full flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Actividad
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 text-muted-foreground hover:text-foreground',
                  activityPinned && 'text-amber-600 hover:text-amber-700'
                )}
                onClick={() => setActivityPinned(!activityPinned)}
                aria-label={activityPinned ? 'Desfijar actividad' : 'Fijar actividad'}
              >
                {activityPinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setShowActivity(false)}
                aria-label="Cerrar actividad"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ClientActivityTabs
              clientId={client.id}
              clientPlan={(client.unidades_negocio || []).includes('MDK') || client.unidad_negocio === 'MDK' ? client.plan : null}
              unidadNegocio={client.unidades_negocio?.[0] || client.unidad_negocio}
              currentUser={currentProfile ? {
                id: currentProfile.id,
                nombre: currentProfile.nombre,
                apellido: currentProfile.apellido,
                avatar_url: currentProfile.avatar_url,
              } : null}
            >
              <ClientComments 
                clientId={client.id} 
                currentUser={currentProfile ? {
                  id: currentProfile.id,
                  nombre: currentProfile.nombre,
                  apellido: currentProfile.apellido,
                  avatar_url: currentProfile.avatar_url,
                } : null}
              />
            </ClientActivityTabs>
          </div>
        </div>
      </aside>
    </div>
  )
}
