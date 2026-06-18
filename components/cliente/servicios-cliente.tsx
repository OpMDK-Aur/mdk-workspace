'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Briefcase, Plus, X, ChevronDown } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

interface Servicio {
  id: string
  nombre: string
  categoria: 'mdk' | 'diseño' | 'tecnologia' | 'consultoria' | 'adicionales'
  activo: boolean
  fecha_inicio?: string
  fecha_fin?: string
  crm?: 'odoo' | 'aurelia' | 'ghl'
  cantidad?: number
}

const SERVICIOS_POR_CATEGORIA = {
  mdk: [
    'Servicios de publicidad y soporte técnico mensual',
    'Servicios de Publicidad - Gestión de Facebook',
    'Servicios de Publicidad - Gestión de Google Ads',
    'Servicios de Publicidad - Gestión de Facebook y Google Ads',
    'Mantenimiento de landing',
    'Honorarios profesionales gestión y optimización de pauta',
    'Intermediación',
    'Inversión - 20% - Neta',
    'Inversión Impuestos (4%)',
    'SEO',
    'Google My Business',
    'Community Manager y Contenido Orgánico',
  ],
  diseño: [
    'Implementación de Landing',
    'Mantenimiento de Landing',
    'Alojamiento y mantenimiento de Landing',
    'Modificaciones en la Web',
    'Sin Placas Gráficas',
    'Videos Mensuales',
    '5 Placas Mensuales',
    'Diseño Gráfico',
    '2 videos mensuales / 10 contenidos para Generación de Demanda',
  ],
  tecnologia: [
    'CRM',
    'Conversaciones Asistente IA',
    'Licenciamiento Usuarios CRM',
    'Plantilla de mensajes de WhatsApp enviadas',
    'Implementación de integraciones',
    'Mantenimiento de integraciones',
    'Api de Whatsapp',
    'Módulo de automatización de Marketing',
    'Desarrollo de chatbot',
    'Tracking de campañas - Implementación',
    'Tracking de campañas - Mantenimiento',
  ],
  consultoria: [
    'Revenue Operation Management 1 de 3',
    'Revenue Operation Management 3 de 6',
  ],
  adicionales: [
    'Desarrollo a medida (por hora)',
    'Integraciones',
  ],
}

const CRM_OPTIONS = ['Odoo', 'Aurelia', 'GHL']

interface ServiciosClienteProps {
  clientId: string
}

export function ServiciosCliente({ clientId }: ServiciosClienteProps) {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nuevoServicio, setNuevoServicio] = useState<Partial<Servicio>>({
    categoria: 'mdk',
    activo: true,
  })

  const serviciosDisponibles = SERVICIOS_POR_CATEGORIA[nuevoServicio.categoria as keyof typeof SERVICIOS_POR_CATEGORIA] || []
  const mostrarCRM = nuevoServicio.categoria === 'tecnologia' && nuevoServicio.nombre === 'CRM'
  const mostrarConversacionesIA = nuevoServicio.categoria === 'tecnologia' && nuevoServicio.nombre === 'Conversaciones Asistente IA' && nuevoServicio.crm === 'ghl'
  const mostrarWhatsApp = nuevoServicio.categoria === 'tecnologia' && nuevoServicio.nombre === 'Plantilla de mensajes de WhatsApp enviadas' && nuevoServicio.crm === 'ghl'
  const mostrarCantidad = 
    ['Licenciamiento Usuarios CRM', 'Plantilla de mensajes de WhatsApp enviadas', 'Implementación de integraciones', 'Mantenimiento de integraciones'].includes(nuevoServicio.nombre || '')

  const handleAgregarServicio = () => {
    if (!nuevoServicio.nombre?.trim()) {
      toast.error('Selecciona un servicio')
      return
    }

    if (mostrarCRM && !nuevoServicio.crm) {
      toast.error('Selecciona un CRM')
      return
    }

    const servicio: Servicio = {
      id: `servicio-${Date.now()}`,
      nombre: nuevoServicio.nombre,
      categoria: (nuevoServicio.categoria as 'mdk' | 'diseño' | 'tecnologia' | 'consultoria' | 'adicionales') || 'mdk',
      activo: true,
      fecha_inicio: nuevoServicio.fecha_inicio,
      fecha_fin: nuevoServicio.fecha_fin,
      crm: nuevoServicio.crm as 'odoo' | 'aurelia' | 'ghl' | undefined,
      cantidad: nuevoServicio.cantidad,
    }

    setServicios(prev => [...prev, servicio])
    toast.success('Servicio agregado correctamente')
    setNuevoServicio({ categoria: 'mdk', activo: true })
    setDialogOpen(false)
  }

  const handleRemoveServicio = (id: string) => {
    setServicios(prev => prev.filter(s => s.id !== id))
    toast.success('Servicio eliminado')
  }

  const toggleServicio = (id: string) => {
    setServicios(prev =>
      prev.map(s => (s.id === id ? { ...s, activo: !s.activo } : s))
    )
  }

  const agruparPorCategoria = (servicios: Servicio[]) => {
    const grouped = {
      mdk: servicios.filter(s => s.categoria === 'mdk'),
      diseño: servicios.filter(s => s.categoria === 'diseño'),
      tecnologia: servicios.filter(s => s.categoria === 'tecnologia'),
      consultoria: servicios.filter(s => s.categoria === 'consultoria'),
      adicionales: servicios.filter(s => s.categoria === 'adicionales'),
    }
    return grouped
  }

  const serviciosAgrupados = agruparPorCategoria(servicios)
  const categoriasTitulos = {
    mdk: 'Servicios MDK',
    diseño: 'Servicios Diseño',
    tecnologia: 'Servicios Tecnología (Aurelia)',
    consultoria: 'Servicios Consultoría',
    adicionales: 'Adicionales',
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Servicios contratados
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1">
                <Plus className="h-3 w-3" />
                Agregar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Agregar nuevo servicio</DialogTitle>
                <DialogDescription>
                  Selecciona el servicio a contratar y completa los detalles
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Categoría */}
                <div className="space-y-2">
                  <Label className="text-sm">Categoría *</Label>
                  <Select
                    value={nuevoServicio.categoria || 'mdk'}
                    onValueChange={(v) =>
                      setNuevoServicio({ ...nuevoServicio, categoria: v as any, nombre: '' })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mdk">Servicios MDK</SelectItem>
                      <SelectItem value="diseño">Servicios Diseño</SelectItem>
                      <SelectItem value="tecnologia">Servicios Tecnología</SelectItem>
                      <SelectItem value="consultoria">Servicios Consultoría</SelectItem>
                      <SelectItem value="adicionales">Adicionales</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Servicio */}
                <div className="space-y-2">
                  <Label className="text-sm">Servicio *</Label>
                  <Select
                    value={nuevoServicio.nombre || ''}
                    onValueChange={(v) => setNuevoServicio({ ...nuevoServicio, nombre: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un servicio" />
                    </SelectTrigger>
                    <SelectContent>
                      {serviciosDisponibles.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* CRM - Solo para Tecnología */}
                {mostrarCRM && (
                  <div className="space-y-2">
                    <Label className="text-sm">CRM *</Label>
                    <Select
                      value={nuevoServicio.crm || ''}
                      onValueChange={(v) => setNuevoServicio({ ...nuevoServicio, crm: v as any })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un CRM" />
                      </SelectTrigger>
                      <SelectContent>
                        {CRM_OPTIONS.map((crm) => (
                          <SelectItem key={crm} value={crm.toLowerCase()}>
                            {crm}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Cantidad - Condicional */}
                {mostrarCantidad && (
                  <div className="space-y-2">
                    <Label className="text-sm">Cantidad</Label>
                    <Input
                      type="number"
                      min="1"
                      value={nuevoServicio.cantidad || ''}
                      onChange={(e) =>
                        setNuevoServicio({ ...nuevoServicio, cantidad: parseInt(e.target.value) || 0 })
                      }
                      placeholder="Ej: 5"
                      className="h-9"
                    />
                  </div>
                )}

                {/* Fecha Inicio */}
                <div className="space-y-2">
                  <Label className="text-sm">Fecha de inicio</Label>
                  <Input
                    type="date"
                    value={nuevoServicio.fecha_inicio || ''}
                    onChange={(e) =>
                      setNuevoServicio({ ...nuevoServicio, fecha_inicio: e.target.value })
                    }
                    className="h-9"
                  />
                </div>

                {/* Fecha Fin */}
                <div className="space-y-2">
                  <Label className="text-sm">Fecha de fin</Label>
                  <Input
                    type="date"
                    value={nuevoServicio.fecha_fin || ''}
                    onChange={(e) =>
                      setNuevoServicio({ ...nuevoServicio, fecha_fin: e.target.value })
                    }
                    className="h-9"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleAgregarServicio} className="flex-1">
                    Agregar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {servicios.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay servicios contratados</p>
        ) : (
          Object.entries(serviciosAgrupados).map(([categoria, items]) => {
            if (items.length === 0) return null

            return (
              <div key={categoria} className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                  {categoriasTitulos[categoria as keyof typeof categoriasTitulos]}
                </h4>
                <div className="space-y-2">
                  {items.map((servicio) => (
                    <div
                      key={servicio.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/30"
                    >
                      <Switch
                        checked={servicio.activo}
                        onCheckedChange={() => toggleServicio(servicio.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${!servicio.activo && 'line-through text-muted-foreground'}`}>
                          {servicio.nombre}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                          {servicio.fecha_inicio && (
                            <span>Inicio: {new Date(servicio.fecha_inicio).toLocaleDateString('es-ES')}</span>
                          )}
                          {servicio.fecha_fin && (
                            <span>Fin: {new Date(servicio.fecha_fin).toLocaleDateString('es-ES')}</span>
                          )}
                          {servicio.crm && <span>CRM: {servicio.crm.toUpperCase()}</span>}
                          {servicio.cantidad && <span>Cantidad: {servicio.cantidad}</span>}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive flex-shrink-0"
                        onClick={() => handleRemoveServicio(servicio.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
