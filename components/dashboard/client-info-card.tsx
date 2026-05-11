'use client'

import { useState, useEffect } from 'react'
import type { Client, ClientEtapa, ServicioContratado } from '@/lib/types'
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
  Briefcase, User, Mail, Phone, Calendar as CalendarIcon,
  Plus, X, CheckCircle2, Circle, Edit2, Save, Loader2,
  Megaphone, Search, TrendingUp, Users, Palette, Code,
  MessageCircle, Database, FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

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
}

const ETAPA_OPTIONS: { value: ClientEtapa; label: string; description: string }[] = [
  { value: 'activacion', label: 'Activacion', description: 'Cliente nuevo en proceso de activacion' },
  { value: '1_3_meses', label: '1 a 3 meses', description: 'Cliente activo de 1 a 3 meses' },
  { value: '4_6_meses', label: '4 a 6 meses', description: 'Cliente activo de 4 a 6 meses' },
  { value: '7_mas', label: '7+ meses', description: 'Cliente consolidado de mas de 7 meses' },
]

const SEMAFORO_OPTIONS = [
  { value: 'verde', label: 'Optimo', color: '#22c55e' },
  { value: 'amarillo', label: 'Atencion', color: '#eab308' },
  { value: 'naranja', label: 'En riesgo', color: '#f97316' },
  { value: 'rojo', label: 'Critico', color: '#ef4444' },
] as const

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

export function ClientInfoCard({ client, unidadesDeNegocio = [] }: ClientInfoCardProps) {
  const supabase = createClient()
  
  // Services state
  const [servicios, setServicios] = useState<ServicioContratado[]>(client.servicios_contratados || [])
  const [serviciosDisponibles, setServiciosDisponibles] = useState<ServicioDisponible[]>([])
  const [showServiceSelect, setShowServiceSelect] = useState(false)
  const [savingServices, setSavingServices] = useState(false)
  
  // Contact state
  const [contactoNombre, setContactoNombre] = useState(client.contacto_nombre || '')
  const [contactoEmail, setContactoEmail] = useState(client.contacto_email || '')
  const [contactoTelefono, setContactoTelefono] = useState(client.contacto_telefono || '')
  const [contactoCargo, setContactoCargo] = useState(client.contacto_cargo || '')
  const [editingContact, setEditingContact] = useState(false)
  const [savingContact, setSavingContact] = useState(false)
  
  // Dates state
  const [fechaVenta, setFechaVenta] = useState<Date | undefined>(client.fecha_venta ? new Date(client.fecha_venta) : undefined)
  const [fechaActivacion, setFechaActivacion] = useState<Date | undefined>(client.fecha_activacion ? new Date(client.fecha_activacion) : undefined)
  const [fechaInicioTrabajo, setFechaInicioTrabajo] = useState<Date | undefined>(client.fecha_inicio_trabajo ? new Date(client.fecha_inicio_trabajo) : undefined)
  const [fechaBaja, setFechaBaja] = useState<Date | undefined>(client.fecha_baja ? new Date(client.fecha_baja) : undefined)
  const [savingDates, setSavingDates] = useState(false)
  
  // Etapa state
  const [etapa, setEtapa] = useState<ClientEtapa | null>(client.etapa || null)
  const [savingEtapa, setSavingEtapa] = useState(false)
  
  // Semaforo por unidad state
  const [semaforoUnidades, setSemaforoUnidades] = useState<Record<string, 'verde' | 'amarillo' | 'naranja' | 'rojo'>>(
    client.semaforo_unidades || {}
  )
  const [savingSemaforo, setSavingSemaforo] = useState(false)
  
  // Load available services
  useEffect(() => {
    async function loadServices() {
      const { data } = await supabase
        .from('servicios_disponibles')
        .select('*')
        .order('nombre')
      if (data) setServiciosDisponibles(data)
    }
    loadServices()
  }, [supabase])
  
  // Add service
  const addService = async (service: ServicioDisponible) => {
    const newServicio: ServicioContratado = {
      id: service.id,
      nombre: service.nombre,
      categoria: service.categoria || undefined,
      icono: service.icono || undefined,
      color: service.color || undefined,
    }
    const newServicios = [...servicios, newServicio]
    setServicios(newServicios)
    setShowServiceSelect(false)
    await saveServices(newServicios)
  }
  
  // Remove service
  const removeService = async (serviceId: string) => {
    const newServicios = servicios.filter(s => s.id !== serviceId)
    setServicios(newServicios)
    await saveServices(newServicios)
  }
  
  // Save services
  const saveServices = async (servs: ServicioContratado[]) => {
    setSavingServices(true)
    await supabase
      .from('clientes')
      .update({ servicios_contratados: servs })
      .eq('id', client.id)
    setSavingServices(false)
  }
  
  // Save contact
  const saveContact = async () => {
    setSavingContact(true)
    await supabase
      .from('clientes')
      .update({
        contacto_nombre: contactoNombre || null,
        contacto_email: contactoEmail || null,
        contacto_telefono: contactoTelefono || null,
        contacto_cargo: contactoCargo || null,
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
  const saveSemaforoUnidad = async (unidadId: string, semaforo: 'verde' | 'amarillo' | 'naranja' | 'rojo') => {
    setSavingSemaforo(true)
    const newSemaforo = { ...semaforoUnidades, [unidadId]: semaforo }
    setSemaforoUnidades(newSemaforo)
    await supabase
      .from('clientes')
      .update({ semaforo_unidades: newSemaforo })
      .eq('id', client.id)
    setSavingSemaforo(false)
  }
  
  const availableServicesFiltered = serviciosDisponibles.filter(
    s => !servicios.some(cs => cs.id === s.id)
  )

  const unidades = unidadesDeNegocio
    .map(u => u.unidad_de_negocio)
    .filter((u): u is { id: string; nombre: string } => u !== null)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Servicios Contratados */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              Servicios contratados
            </CardTitle>
            {savingServices && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {servicios.map(servicio => (
              <Badge
                key={servicio.id}
                variant="outline"
                className={cn(
                  'gap-1.5 pr-1.5 group',
                  SERVICE_COLORS[servicio.color || 'gray']
                )}
              >
                {servicio.icono && SERVICE_ICONS[servicio.icono]}
                {servicio.nombre}
                <button
                  onClick={() => removeService(servicio.id)}
                  className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-foreground/10 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Popover open={showServiceSelect} onOpenChange={setShowServiceSelect}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 gap-1 text-xs">
                  <Plus className="h-3 w-3" />
                  Agregar
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar servicio..." className="h-9" />
                  <CommandList>
                    <CommandEmpty>No hay mas servicios</CommandEmpty>
                    <CommandGroup>
                      {availableServicesFiltered.map(service => (
                        <CommandItem
                          key={service.id}
                          value={service.nombre}
                          onSelect={() => addService(service)}
                          className="gap-2 cursor-pointer"
                        >
                          {service.icono && SERVICE_ICONS[service.icono]}
                          <span>{service.nombre}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          {servicios.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">Sin servicios asignados</p>
          )}
        </CardContent>
      </Card>

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
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input value={contactoNombre} onChange={e => setContactoNombre(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Cargo</Label>
                <Input value={contactoCargo} onChange={e => setContactoCargo(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={contactoEmail} onChange={e => setContactoEmail(e.target.value)} className="h-8 text-sm" type="email" />
              </div>
              <div>
                <Label className="text-xs">Telefono</Label>
                <Input value={contactoTelefono} onChange={e => setContactoTelefono(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {contactoNombre ? (
                <>
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{contactoNombre}</span>
                    {contactoCargo && <span className="text-xs text-muted-foreground">({contactoCargo})</span>}
                  </div>
                  {contactoEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <a href={`mailto:${contactoEmail}`} className="text-sm text-primary hover:underline">{contactoEmail}</a>
                    </div>
                  )}
                  {contactoTelefono && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <a href={`tel:${contactoTelefono}`} className="text-sm text-primary hover:underline">{contactoTelefono}</a>
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

      {/* Etapa y Semaforo por Unidad */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Circle className="h-4 w-4 text-primary" />
            Etapa y estado por unidad
            {(savingEtapa || savingSemaforo) && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Etapa */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Etapa del cliente</Label>
            <Select value={etapa || ''} onValueChange={(v) => saveEtapa(v as ClientEtapa)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Seleccionar etapa" />
              </SelectTrigger>
              <SelectContent>
                {ETAPA_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Semaforo por unidad */}
          {unidades.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Semaforo por unidad de negocio</Label>
              <div className="space-y-2">
                {unidades.map(unidad => (
                  <div key={unidad.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">{unidad.nombre}</span>
                    <div className="flex gap-1">
                      {SEMAFORO_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => saveSemaforoUnidad(unidad.id, opt.value)}
                          className={cn(
                            'h-6 w-6 rounded-full border-2 transition-all',
                            semaforoUnidades[unidad.id] === opt.value
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
        </CardContent>
      </Card>
    </div>
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
