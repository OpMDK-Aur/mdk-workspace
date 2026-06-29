'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Client, ClientEtapa, ServicioContratado, ClientPlan, UnidadNegocio, SemaforoStatus } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
  Briefcase, User, Mail, Phone, Calendar as CalendarIcon,
  Plus, X, CheckCircle2, Circle, Edit2, Save, Loader2,
  Megaphone, Search, TrendingUp, Users, Palette, Code,
  MessageCircle, Database, FileText, Settings, Trash2, Star,
  Power, ArrowLeft, AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ServiciosCliente } from '@/components/cliente/servicios-cliente'

interface UnidadDeNegocio {
  id: string
  nombre: string
}

interface ServicioDisponible {
  id: string
  nombre: string
  categoria: string | null
  icono: string | null
  color: string | null
}

interface ClientInfoCardProps {
  client: Client
  unidadesDeNegocio?: { unidad_de_negocio_id: string; unidad_de_negocio: { id: string; nombre: string } | null }[]
  userRole?: string
  isActivo?: boolean
  onActivoChange?: (newActivo: boolean) => Promise<void>
  updatingActivo?: boolean
}

const ETAPA_OPTIONS: { value: ClientEtapa; label: string; description: string; isAlert?: boolean }[] = [
  { value: 'activacion', label: 'Activacion', description: 'Cliente nuevo en proceso de activacion' },
  { value: '1_3_meses', label: '1 a 3 meses', description: 'Cliente activo de 1 a 3 meses' },
  { value: '4_6_meses', label: '4 a 6 meses', description: 'Cliente activo de 4 a 6 meses' },
  { value: '7_mas', label: '7+ meses', description: 'Cliente consolidado de mas de 7 meses' },
  { value: 'solicito_baja', label: 'Solicito la Baja', description: 'El cliente solicito dar de baja el servicio', isAlert: true },
  { value: 'inhabilitado_mora', label: 'Inhabilitado por mora', description: 'Cliente inhabilitado por falta de pago', isAlert: true },
]

const SEMAFORO_OPTIONS = [
  { value: 'verde', label: 'Optimo', color: '#22c55e' },
  { value: 'amarillo', label: 'Atencion', color: '#eab308' },
  { value: 'naranja', label: 'En riesgo', color: '#f97316' },
  { value: 'rojo', label: 'Critico', color: '#ef4444' },
] as const

const PLAN_OPTIONS: { value: ClientPlan; label: string }[] = [
  { value: 'Esencial', label: 'Esencial' },
  { value: 'Estratégico', label: 'Estratégico' },
]

const UNIDAD_NEGOCIO_OPTIONS: { value: UnidadNegocio; label: string }[] = [
  { value: 'MDK', label: 'MDK' },
  { value: 'Aurelia', label: 'Aurelia' },
  { value: 'Consultoría', label: 'Consultoría' },
  { value: 'Tecnología', label: 'Tecnología' },
]

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  'megaphone': <Megaphone className="h-3 w-3" />,
  'search': <Search className="h-3 w-3" />,
  'trending-up': <TrendingUp className="h-3 w-3" />,
  'users': <Users className="h-3 w-3" />,
  'palette': <Palette className="h-3 w-3" />,
  'code': <Code className="h-3 w-3" />,
  'mail': <Mail className="h-3 w-3" />,
  'message-circle': <MessageCircle className="h-3 w-3" />,
  'database': <Database className="h-3 w-3" />,
  'briefcase': <Briefcase className="h-3 w-3" />,
}

const SERVICE_COLORS: Record<string, string> = {
  'blue': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'green': 'bg-green-500/10 text-green-500 border-green-500/20',
  'purple': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  'pink': 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  'orange': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  'cyan': 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  'yellow': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  'indigo': 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  'gray': 'bg-gray-500/10 text-gray-500 border-gray-500/20',
}

export function ClientInfoCard({ client, unidadesDeNegocio = [], userRole, isActivo = true, onActivoChange, updatingActivo = false }: ClientInfoCardProps) {
  const supabase = createClient()
  const isMaster = userRole === 'master'
  
  // Contact state - using existing fields from clientes table (nombre, apellido, telefono)
  const [contactNombre, setContactNombre] = useState(client.nombre || '')
  const [contactApellido, setContactApellido] = useState(client.apellido || '')
  const [contactTelefono, setContactTelefono] = useState(client.telefono || '')
  const [editingContact, setEditingContact] = useState(false)
  const [savingContact, setSavingContact] = useState(false)
  
  // Dates state
  // Parse date-only strings (YYYY-MM-DD) as local dates to avoid UTC off-by-one
  // hydration mismatches between server and client timezones.
  const parseLocalDate = (value: string | null | undefined): Date | undefined => {
    if (!value) return undefined
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    }
    return new Date(value)
  }
  const [fechaVenta, setFechaVenta] = useState<Date | undefined>(parseLocalDate(client.fecha_venta))
  const [fechaActivacion, setFechaActivacion] = useState<Date | undefined>(parseLocalDate(client.fecha_activacion))
  const [fechaInicioTrabajo, setFechaInicioTrabajo] = useState<Date | undefined>(parseLocalDate(client.fecha_inicio_trabajo))
  const [fechaBaja, setFechaBaja] = useState<Date | undefined>(parseLocalDate(client.fecha_baja))
  const [savingDates, setSavingDates] = useState(false)
  
  // Etapa state
  const [etapa, setEtapa] = useState<ClientEtapa | null>(client.etapa || null)
  const [savingEtapa, setSavingEtapa] = useState(false)

  // Semaforo por unidad state
  const [semaforoUnidades, setSemaforoUnidades] = useState<Record<string, SemaforoStatus>>(
    client.semaforo_unidades || {}
  )
  const [savingSemaforo, setSavingSemaforo] = useState(false)
  
  // Plan state
  const [plan, setPlan] = useState<ClientPlan>(client.plan || 'Esencial')
  const [savingPlan, setSavingPlan] = useState(false)
  
  // Unidades de negocio state (array)
  const [unidadesNegocio, setUnidadesNegocio] = useState<UnidadNegocio[]>(
    client.unidades_negocio || (client.unidad_negocio ? [client.unidad_negocio] : [])
  )
  const [savingUnidad, setSavingUnidad] = useState(false)
  

  
  // Save contact - using existing fields: nombre, apellido, telefono
  const saveContact = async () => {
    setSavingContact(true)
    await supabase
      .from('clientes')
      .update({
        nombre: contactNombre || null,
        apellido: contactApellido || null,
        telefono: contactTelefono || null,
      })
      .eq('id', client.id)
    setSavingContact(false)
    setEditingContact(false)
  }
  
  // Save date
  const saveDate = async (field: string, date: Date | undefined) => {
    setSavingDates(true)
    await supabase
      .from('clientes')
      .update({ [field]: date ? date.toISOString().split('T')[0] : null })
      .eq('id', client.id)
    setSavingDates(false)
  }
  
  // Save etapa
  const saveEtapa = async (newEtapa: ClientEtapa) => {
    setSavingEtapa(true)
    setEtapa(newEtapa)
    await supabase
      .from('clientes')
      .update({ etapa: newEtapa })
      .eq('id', client.id)
    setSavingEtapa(false)
  }
  
  // Save semaforo unidad
  const saveSemaforoUnidad = async (unidadKey: string, semaforo: SemaforoStatus) => {
    setSavingSemaforo(true)
    const newSemaforo = { ...semaforoUnidades, [unidadKey]: semaforo }
    setSemaforoUnidades(newSemaforo)
    await supabase
      .from('clientes')
      .update({ semaforo_unidades: newSemaforo })
      .eq('id', client.id)
    setSavingSemaforo(false)
  }

  // Save plan
  const savePlan = async (newPlan: ClientPlan) => {
    setSavingPlan(true)
    setPlan(newPlan)
    await supabase
      .from('clientes')
      .update({ plan: newPlan })
      .eq('id', client.id)
    setSavingPlan(false)
  }
  
  // Toggle unidad de negocio
  const toggleUnidadNegocio = async (unidad: UnidadNegocio) => {
    setSavingUnidad(true)
    let newUnidades: UnidadNegocio[]
    if (unidadesNegocio.includes(unidad)) {
      newUnidades = unidadesNegocio.filter(u => u !== unidad)
      // Remove semaforo for this unidad
      const newSemaforo = { ...semaforoUnidades }
      delete newSemaforo[unidad]
      setSemaforoUnidades(newSemaforo)
      await supabase
        .from('clientes')
        .update({ 
          unidades_negocio: newUnidades,
          semaforo_unidades: newSemaforo,
          // Clear plan if MDK is removed
          ...(unidad === 'MDK' ? { plan: null } : {})
        })
        .eq('id', client.id)
      
      // If MDK was removed, cleanup service map instances and tasks
      if (unidad === 'MDK') {
        const { cleanupServiceMapOnMDKRemoval } = await import('@/lib/service-map')
        await cleanupServiceMapOnMDKRemoval(client.id)
      }
    } else {
      newUnidades = [...unidadesNegocio, unidad]
      await supabase
        .from('clientes')
        .update({ unidades_negocio: newUnidades })
        .eq('id', client.id)
  }
  setUnidadesNegocio(newUnidades)
  setSavingUnidad(false)
  }
  
  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Servicios Contratados - Gestión completa de servicios */}
      <ServiciosCliente clientId={client.id} />

      {/* Informacion del Contacto */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Contacto principal
            </CardTitle>
            {!editingContact ? (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingContact(true)}>
                <Edit2 className="h-3 w-3" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveContact} disabled={savingContact}>
                {savingContact ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingContact ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Nombre</Label>
                  <Input value={contactNombre} onChange={e => setContactNombre(e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Apellido</Label>
                  <Input value={contactApellido} onChange={e => setContactApellido(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Telefono</Label>
                <Input value={contactTelefono} onChange={e => setContactTelefono(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {contactNombre || contactApellido ? (
                <>
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {[contactNombre, contactApellido].filter(Boolean).join(' ')}
                    </span>
                  </div>
                  {contactTelefono && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <a href={`tel:${contactTelefono}`} className="text-sm text-primary hover:underline">{contactTelefono}</a>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Sin contacto asignado</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan del Cliente */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" />
            Unidades de negocio
            {(savingPlan || savingUnidad) && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Unidades de Negocio - Multi-select */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Selecciona las unidades del cliente</Label>
            <div className="flex flex-wrap gap-2">
              {UNIDAD_NEGOCIO_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => toggleUnidadNegocio(option.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    unidadesNegocio.includes(option.value)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50'
                  )}
                >
                  {unidadesNegocio.includes(option.value) && (
                    <CheckCircle2 className="h-3 w-3 inline mr-1" />
                  )}
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Semaforo por unidad seleccionada */}
          {unidadesNegocio.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Estado por unidad</Label>
              <div className="space-y-2">
                {unidadesNegocio.map(unidad => (
                  <div key={unidad} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">{unidad}</span>
                    <div className="flex gap-1">
                      {SEMAFORO_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => saveSemaforoUnidad(unidad, opt.value)}
                          className={cn(
                            'h-6 w-6 rounded-full border-2 transition-all',
                            semaforoUnidades[unidad] === opt.value
                              ? 'ring-2 ring-offset-2 ring-offset-background'
                              : 'opacity-40 hover:opacity-70'
                          )}
                          style={{ 
                            backgroundColor: opt.color,
                            borderColor: opt.color,
                            // @ts-expect-error - CSS custom property
                            '--tw-ring-color': opt.color,
                          }}
                          title={opt.label}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Plan de servicio - solo visible si tiene MDK */}
          {unidadesNegocio.includes('MDK') && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Plan de servicio MDK</Label>
              <Select value={plan} onValueChange={(v) => savePlan(v as ClientPlan)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar plan" />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex items-center gap-2">
                        {option.value === 'Estratégico' && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                        {option.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                {plan === 'Estratégico' 
                  ? 'Acceso a todos los hitos del mapa de servicio' 
                  : 'Acceso a hitos esenciales del mapa de servicio'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fechas importantes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            Fechas importantes
            {savingDates && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <DatePickerField
              label="Venta"
              date={fechaVenta}
              onSelect={(d) => { setFechaVenta(d); saveDate('fecha_venta', d) }}
            />
            <DatePickerField
              label="Activacion"
              date={fechaActivacion}
              onSelect={(d) => { setFechaActivacion(d); saveDate('fecha_activacion', d) }}
            />
            <DatePickerField
              label="Inicio trabajo"
              date={fechaInicioTrabajo}
              onSelect={(d) => { setFechaInicioTrabajo(d); saveDate('fecha_inicio_trabajo', d) }}
            />
            <DatePickerField
              label="Baja"
              date={fechaBaja}
              onSelect={(d) => { setFechaBaja(d); saveDate('fecha_baja', d) }}
              variant="destructive"
            />
          </div>
        </CardContent>
      </Card>

      {/* Estado del Cliente (Activo/Inactivo) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Power className="h-4 w-4 text-primary" />
            Estado del cliente
            {updatingActivo && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {isActivo ? 'Activo' : 'Inactivo'}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isActivo
                  ? 'El cliente aparece en listados y puede recibir servicios'
                  : 'El cliente esta oculto por defecto en listados'}
              </p>
            </div>
            <Switch
              checked={isActivo}
              onCheckedChange={(checked) => onActivoChange?.(checked)}
              disabled={updatingActivo}
            />
          </div>
        </CardContent>
      </Card>

      {/* Etapa del Cliente */}
      <Card className={cn(
        (etapa === 'solicito_baja' || etapa === 'inhabilitado_mora') && "border-red-500/50 bg-red-500/10"
      )}>
        <CardHeader className="pb-3">
          <CardTitle className={cn(
            "text-sm font-medium flex items-center gap-2",
            (etapa === 'solicito_baja' || etapa === 'inhabilitado_mora') && "text-red-500"
          )}>
            <Circle className={cn(
              "h-4 w-4",
              (etapa === 'solicito_baja' || etapa === 'inhabilitado_mora') ? "text-red-500" : "text-primary"
            )} />
            Etapa del cliente
            {savingEtapa && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={etapa || ''} onValueChange={(v) => saveEtapa(v as ClientEtapa)}>
            <SelectTrigger className={cn(
              "h-9",
              (etapa === 'solicito_baja' || etapa === 'inhabilitado_mora') && "border-red-500/50 text-red-500"
            )}>
              <SelectValue placeholder="Seleccionar etapa" />
            </SelectTrigger>
            <SelectContent>
              {ETAPA_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className={cn(opt.isAlert && "text-red-500")}>
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>

    {/* Back to clients button */}
    <div className="mt-4">
      <Link href="/dashboard/clients">
        <Button variant="outline" className="w-full" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a clientes
        </Button>
      </Link>
    </div>
    </>
  )
}

// Date Picker Field
function DatePickerField({ 
  label, 
  date, 
  onSelect,
  variant = 'default' 
}: { 
  label: string
  date: Date | undefined
  onSelect: (date: Date | undefined) => void
  variant?: 'default' | 'destructive'
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'w-full justify-start text-left font-normal h-8 text-xs',
              !date && 'text-muted-foreground',
              variant === 'destructive' && date && 'border-destructive/50 text-destructive'
            )}
          >
            <CalendarIcon className="mr-2 h-3 w-3" />
            {date ? format(date, 'dd/MM/yyyy', { locale: es }) : 'Sin fecha'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={onSelect}
            initialFocus
          />
          {date && (
            <div className="p-2 border-t">
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => onSelect(undefined)}>
                Quitar fecha
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
