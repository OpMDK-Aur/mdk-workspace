'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Briefcase, Plus, X, Loader2 } from 'lucide-react'
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
import { createClient } from '@/lib/supabase/client'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type CategoriaKey = 'mdk' | 'diseño' | 'tecnologia' | 'consultoria' | 'adicionales'

interface Servicio {
  id: string
  cliente_id: string
  nombre: string
  categoria: CategoriaKey
  activo: boolean
  fecha_inicio?: string | null
  fecha_fin?: string | null
  crm_tipo?: 'Odoo' | 'Aurelia' | 'GHL' | null
  plan_nombre?: string | null
  cantidad?: number | null
  precio_sin_iva?: number | null
  notas?: string | null
}

interface CategoriaFechas {
  [key: string]: {
    fecha_inicio?: string
    fecha_fin?: string
  }
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const SERVICIOS_POR_CATEGORIA: Record<CategoriaKey, string[]> = {
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

const CATEGORIAS_TITULOS: Record<CategoriaKey, string> = {
  mdk: 'Servicios MDK',
  diseño: 'Servicios Diseño',
  tecnologia: 'Servicios Tecnología (Aurelia)',
  consultoria: 'Servicios Consultoría',
  adicionales: 'Adicionales',
}

const CATEGORIAS_ORDEN: CategoriaKey[] = ['mdk', 'diseño', 'tecnologia', 'consultoria', 'adicionales']

const CRM_OPTIONS = ['Odoo', 'Aurelia', 'GHL'] as const

// Mapeo de categoria DB → CategoriaKey local
function mapCategoria(cat: string | null | undefined): CategoriaKey {
  if (!cat) return 'mdk'
  const c = cat.toUpperCase()
  if (c.includes('DISEÑO') || c === 'SERVICIOS DISEÑO') return 'diseño'
  if (c.includes('TECNOLOG') || c.includes('AURELIA')) return 'tecnologia'
  if (c.includes('CONSULTOR')) return 'consultoria'
  if (c.includes('ADICIONAL')) return 'adicionales'
  return 'mdk'
}

// ─── Componente ──────────────────────────────────────────────────────────────

interface ServiciosClienteProps {
  clientId: string
}

export function ServiciosCliente({ clientId }: ServiciosClienteProps) {
  const supabase = createClient()

  const [servicios, setServicios] = useState<Servicio[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categoriasFechas, setCategoriasFechas] = useState<CategoriaFechas>({})

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nuevoServicio, setNuevoServicio] = useState<Partial<Servicio>>({
    categoria: 'mdk',
    activo: true,
  })

  const [editCategoriaDialogOpen, setEditCategoriaDialogOpen] = useState(false)
  const [editingCategoria, setEditingCategoria] = useState<CategoriaKey | null>(null)

  // ── Fetch inicial ────────────────────────────────────────────────────────

  const fetchServicios = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('servicios_contratados')
      .select('*')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error('Error al cargar servicios')
      console.error(error)
    } else if (data) {
      const mapped: Servicio[] = data.map((row) => ({
        id: row.id,
        cliente_id: row.cliente_id,
        nombre: row.nombre,
        categoria: mapCategoria(row.categoria),
        activo: row.activo ?? true,
        fecha_inicio: row.fecha_inicio ?? null,
        fecha_fin: row.fecha_fin ?? null,
        crm_tipo: row.crm_tipo ?? null,
        plan_nombre: row.plan_nombre ?? null,
        cantidad: row.cantidad ?? null,
        precio_sin_iva: row.precio_sin_iva ?? null,
        notas: row.notas ?? null,
      }))
      setServicios(mapped)

      // Reconstruir categoriasFechas: tomar la primera fecha_inicio/fin de cada categoría
      const fechas: CategoriaFechas = {}
      for (const s of mapped) {
        if (!fechas[s.categoria]) {
          fechas[s.categoria] = {
            fecha_inicio: s.fecha_inicio ?? undefined,
            fecha_fin: s.fecha_fin ?? undefined,
          }
        }
      }
      setCategoriasFechas(fechas)
    }
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    fetchServicios()
  }, [fetchServicios])

  // ── Helpers ─────────────────────────────────────────────────────────────

  const serviciosDisponibles = SERVICIOS_POR_CATEGORIA[nuevoServicio.categoria as CategoriaKey] || []
  const mostrarCRM = nuevoServicio.categoria === 'tecnologia' && nuevoServicio.nombre === 'CRM'
  const mostrarCantidad = [
    'Licenciamiento Usuarios CRM',
    'Plantilla de mensajes de WhatsApp enviadas',
    'Implementación de integraciones',
    'Mantenimiento de integraciones',
  ].includes(nuevoServicio.nombre || '')

  // ── Agregar / Editar servicio ────────────────────────────────────────────

  const handleAgregarServicio = async () => {
    if (!nuevoServicio.nombre?.trim()) {
      toast.error('Selecciona un servicio')
      return
    }
    if (mostrarCRM && !nuevoServicio.crm_tipo) {
      toast.error('Selecciona un CRM')
      return
    }

    setSaving(true)

    if (editingId) {
      // UPDATE
      const { error } = await supabase
        .from('servicios_contratados')
        .update({
          nombre: nuevoServicio.nombre,
          categoria: nuevoServicio.categoria === 'mdk' ? 'SERVICIO MDK'
            : nuevoServicio.categoria === 'diseño' ? 'SERVICIOS DISEÑO'
            : nuevoServicio.categoria === 'tecnologia' ? 'SERVICIOS TECNOLOGÍA'
            : nuevoServicio.categoria === 'consultoria' ? 'SERVICIOS CONSULTORÍA'
            : 'ADICIONALES',
          fecha_inicio: nuevoServicio.fecha_inicio || null,
          fecha_fin: nuevoServicio.fecha_fin || null,
          crm_tipo: nuevoServicio.crm_tipo || null,
          cantidad: nuevoServicio.cantidad || null,
          plan_nombre: nuevoServicio.plan_nombre || null,
        })
        .eq('id', editingId)

      if (error) {
        toast.error('Error al actualizar el servicio')
        console.error(error)
      } else {
        toast.success('Servicio actualizado')
        setEditingId(null)
        setDialogOpen(false)
        setNuevoServicio({ categoria: 'mdk', activo: true })
        await fetchServicios()
      }
    } else {
      // INSERT
      const catDB =
        nuevoServicio.categoria === 'mdk' ? 'SERVICIO MDK'
        : nuevoServicio.categoria === 'diseño' ? 'SERVICIOS DISEÑO'
        : nuevoServicio.categoria === 'tecnologia' ? 'SERVICIOS TECNOLOGÍA'
        : nuevoServicio.categoria === 'consultoria' ? 'SERVICIOS CONSULTORÍA'
        : 'ADICIONALES'

      const { error } = await supabase
        .from('servicios_contratados')
        .insert({
          cliente_id: clientId,
          nombre: nuevoServicio.nombre,
          categoria: catDB,
          activo: true,
          fecha_inicio: nuevoServicio.fecha_inicio || null,
          fecha_fin: nuevoServicio.fecha_fin || null,
          crm_tipo: nuevoServicio.crm_tipo || null,
          cantidad: nuevoServicio.cantidad || null,
          plan_nombre: nuevoServicio.plan_nombre || null,
        })

      if (error) {
        toast.error('Error al agregar el servicio')
        console.error(error)
      } else {
        toast.success('Servicio agregado')
        setDialogOpen(false)
        setNuevoServicio({ categoria: 'mdk', activo: true })
        await fetchServicios()
      }
    }

    setSaving(false)
  }

  // ── Toggle activo / inactivo ─────────────────────────────────────────────

  const toggleServicio = async (id: string, current: boolean) => {
    // Optimistic update
    setServicios(prev => prev.map(s => s.id === id ? { ...s, activo: !current } : s))

    const { error } = await supabase
      .from('servicios_contratados')
      .update({ activo: !current })
      .eq('id', id)

    if (error) {
      // Revert
      setServicios(prev => prev.map(s => s.id === id ? { ...s, activo: current } : s))
      toast.error('Error al actualizar el estado')
    }
  }

  // ── Eliminar ─────────────────────────────────────────────────────────────

  const handleRemoveServicio = async (id: string) => {
    const { error } = await supabase
      .from('servicios_contratados')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Error al eliminar el servicio')
    } else {
      setServicios(prev => prev.filter(s => s.id !== id))
      toast.success('Servicio eliminado')
    }
  }

  // ── Editar fechas de categoría ───────────────────────────────────────────

  const handleGuardarFechasCategoria = async () => {
    if (!editingCategoria) return
    setSaving(true)

    const fechas = categoriasFechas[editingCategoria]
    const catDB =
      editingCategoria === 'mdk' ? 'SERVICIO MDK'
      : editingCategoria === 'diseño' ? 'SERVICIOS DISEÑO'
      : editingCategoria === 'tecnologia' ? 'SERVICIOS TECNOLOGÍA'
      : editingCategoria === 'consultoria' ? 'SERVICIOS CONSULTORÍA'
      : 'ADICIONALES'

    // Actualizar todas las filas de esa categoría para este cliente
    const { error } = await supabase
      .from('servicios_contratados')
      .update({
        fecha_inicio: fechas?.fecha_inicio || null,
        fecha_fin: fechas?.fecha_fin || null,
      })
      .eq('cliente_id', clientId)
      .eq('categoria', catDB)

    if (error) {
      toast.error('Error al guardar las fechas')
    } else {
      toast.success('Fechas actualizadas')
      setEditCategoriaDialogOpen(false)
      await fetchServicios()
    }

    setSaving(false)
  }

  // ── Editar servicio ──────────────────────────────────────────────────────

  const handleEditServicio = (servicio: Servicio) => {
    setEditingId(servicio.id)
    setNuevoServicio(servicio)
    setDialogOpen(true)
  }

  // ── Agrupación ───────────────────────────────────────────────────────────

  const serviciosAgrupados = CATEGORIAS_ORDEN.reduce((acc, cat) => {
    acc[cat] = servicios.filter(s => s.categoria === cat)
    return acc
  }, {} as Record<CategoriaKey, Servicio[]>)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Servicios contratados
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) {
              setEditingId(null)
              setNuevoServicio({ categoria: 'mdk', activo: true })
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1">
                <Plus className="h-3 w-3" />
                Agregar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? 'Editar servicio' : 'Agregar nuevo servicio'}
                </DialogTitle>
                <DialogDescription>
                  {editingId
                    ? 'Actualiza los detalles del servicio'
                    : 'Selecciona el servicio a contratar y completa los detalles'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Categoría */}
                <div className="space-y-2">
                  <Label className="text-sm">Categoría *</Label>
                  <Select
                    value={nuevoServicio.categoria || 'mdk'}
                    onValueChange={(v) =>
                      setNuevoServicio({ ...nuevoServicio, categoria: v as CategoriaKey, nombre: '' })
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
                  {editingId ? (
                    <Input
                      value={nuevoServicio.nombre || ''}
                      onChange={(e) => setNuevoServicio({ ...nuevoServicio, nombre: e.target.value })}
                      placeholder="Nombre del servicio"
                      className="h-9"
                    />
                  ) : (
                    <Select
                      value={nuevoServicio.nombre || ''}
                      onValueChange={(v) => setNuevoServicio({ ...nuevoServicio, nombre: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un servicio" />
                      </SelectTrigger>
                      <SelectContent>
                        {serviciosDisponibles.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* CRM - Solo para Tecnología > CRM */}
                {mostrarCRM && (
                  <div className="space-y-2">
                    <Label className="text-sm">CRM *</Label>
                    <Select
                      value={nuevoServicio.crm_tipo || ''}
                      onValueChange={(v) => setNuevoServicio({ ...nuevoServicio, crm_tipo: v as 'Odoo' | 'Aurelia' | 'GHL' })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un CRM" />
                      </SelectTrigger>
                      <SelectContent>
                        {CRM_OPTIONS.map((crm) => (
                          <SelectItem key={crm} value={crm}>{crm}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Plan - Solo si hay CRM */}
                {mostrarCRM && nuevoServicio.crm_tipo && (
                  <div className="space-y-2">
                    <Label className="text-sm">Plan</Label>
                    <Input
                      value={nuevoServicio.plan_nombre || ''}
                      onChange={(e) => setNuevoServicio({ ...nuevoServicio, plan_nombre: e.target.value })}
                      placeholder="ej: Plan Growth 299 USD"
                      className="h-9"
                    />
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
                        setNuevoServicio({ ...nuevoServicio, cantidad: parseInt(e.target.value) || null })
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
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleAgregarServicio} className="flex-1" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? 'Guardar' : 'Agregar'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Cargando servicios...
          </div>
        ) : servicios.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay servicios contratados</p>
        ) : (
          CATEGORIAS_ORDEN.map((categoria) => {
            const items = serviciosAgrupados[categoria]
            if (items.length === 0) return null

            const activosCount = items.filter(s => s.activo).length

            return (
              <div key={categoria} className="space-y-3 border-l-2 border-primary/20 pl-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                        {CATEGORIAS_TITULOS[categoria]}
                      </h4>
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        {activosCount} activo{activosCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {categoriasFechas[categoria] && (
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        {categoriasFechas[categoria].fecha_inicio && (
                          <span>Inicio: {new Date(categoriasFechas[categoria].fecha_inicio!).toLocaleDateString('es-AR')}</span>
                        )}
                        {categoriasFechas[categoria].fecha_fin && (
                          <span>Vence: {new Date(categoriasFechas[categoria].fecha_fin!).toLocaleDateString('es-AR')}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      setEditingCategoria(categoria)
                      setEditCategoriaDialogOpen(true)
                    }}
                  >
                    Editar fechas
                  </Button>
                </div>

                <div className="space-y-2">
                  {items.map((servicio) => (
                    <div
                      key={servicio.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleEditServicio(servicio)}
                    >
                      <Switch
                        checked={servicio.activo}
                        onCheckedChange={() => toggleServicio(servicio.id, servicio.activo)}
                        className="mt-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${!servicio.activo && 'line-through text-muted-foreground'}`}>
                          {servicio.nombre}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                          {servicio.crm_tipo && <span>CRM: {servicio.crm_tipo}</span>}
                          {servicio.plan_nombre && <span>{servicio.plan_nombre}</span>}
                          {servicio.cantidad && <span>x{servicio.cantidad}</span>}
                          {servicio.fecha_inicio && (
                            <span>Desde: {new Date(servicio.fecha_inicio).toLocaleDateString('es-AR')}</span>
                          )}
                          {servicio.fecha_fin && (
                            <span>Hasta: {new Date(servicio.fecha_fin).toLocaleDateString('es-AR')}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveServicio(servicio.id)
                        }}
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

      {/* Dialog fechas de categoría */}
      <Dialog open={editCategoriaDialogOpen} onOpenChange={setEditCategoriaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar fechas — {editingCategoria && CATEGORIAS_TITULOS[editingCategoria]}
            </DialogTitle>
            <DialogDescription>
              Actualiza las fechas de inicio y fin para todos los servicios de esta categoría
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm">Fecha de inicio</Label>
              <Input
                type="date"
                value={editingCategoria ? (categoriasFechas[editingCategoria]?.fecha_inicio || '') : ''}
                onChange={(e) => {
                  if (editingCategoria) {
                    setCategoriasFechas(prev => ({
                      ...prev,
                      [editingCategoria]: { ...prev[editingCategoria], fecha_inicio: e.target.value }
                    }))
                  }
                }}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Fecha de fin</Label>
              <Input
                type="date"
                value={editingCategoria ? (categoriasFechas[editingCategoria]?.fecha_fin || '') : ''}
                onChange={(e) => {
                  if (editingCategoria) {
                    setCategoriasFechas(prev => ({
                      ...prev,
                      [editingCategoria]: { ...prev[editingCategoria], fecha_fin: e.target.value }
                    }))
                  }
                }}
                className="h-9"
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditCategoriaDialogOpen(false)}
                className="flex-1"
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleGuardarFechasCategoria}
                className="flex-1"
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
