'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, DeviceFloppy, AlertCircle } from '@tabler/icons-react'
import {
  IconSpeakerphone,
  IconPalette,
  IconCode,
  IconBriefcase,
  IconPlus,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

export interface ServicioContratado {
  id: string
  cliente_id: string
  categoria: string
  nombre: string
  activo: boolean
  precio_sin_iva: number | null
  crm_tipo?: 'Odoo' | 'Aurelia' | 'GHL' | null
  plan_nombre?: string | null
  cantidad?: number | null
  precio_unitario?: number | null
  api_tipo?: 'API OFICIAL' | 'API NO OFICIAL' | null
  horas_estimadas?: number | null
}

export interface CategoriaContratada {
  fecha_inicio: string | null
  fecha_fin: string | null
}

interface ServiciosClienteProps {
  clienteId: string
  serviciosContratados: ServicioContratado[]
  categoriasConfig: {
    mdk: CategoriaContratada
    tecnologia: CategoriaContratada
    consultoria: CategoriaContratada
    adicionales: CategoriaContratada
  }
  onSave: (data: {
    servicios: ServicioContratado[]
    categorias: ServiciosClienteProps['categoriasConfig']
  }) => Promise<void>
}

const CATEGORIAS_CONFIG = {
  mdk: {
    nombre: 'SERVICIO MDK',
    icon: IconSpeakerphone,
    tienesFechas: true,
    servicios: [
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
  },
  diseño: {
    nombre: 'SERVICIOS DISEÑO',
    icon: IconPalette,
    tienesFechas: false,
    servicios: [
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
  },
  tecnologia: {
    nombre: 'SERVICIOS TECNOLOGÍA (AURELIA)',
    icon: IconCode,
    tienesFechas: true,
    servicios: [
      'CRM',
      'Conversaciones Asistente IA',
      'Licenciamiento de Usuarios CRM',
      'Plantilla de mensajes de WhatsApp enviadas',
      'Implementación de integraciones',
      'Mantenimiento de integraciones',
      'Api de WhatsApp',
      'Módulo de automatización de Marketing',
      'Desarrollo de chatbot',
      'Tracking de campañas - Implementación',
      'Tracking de campañas - Mantenimiento',
    ],
  },
  consultoria: {
    nombre: 'SERVICIOS CONSULTORÍA',
    icon: IconBriefcase,
    tienesFechas: true,
    servicios: [
      'Revenue Operation Management 1 de 3',
      'Revenue Operation Management 3 de 6',
    ],
  },
  adicionales: {
    nombre: 'ADICIONALES',
    icon: IconPlus,
    tienesFechas: true,
    servicios: [
      'Desarrollo a medida (por hora)',
      'Integraciones',
    ],
  },
}

export function ServiciosCliente({
  clienteId,
  serviciosContratados,
  categoriasConfig,
  onSave,
}: ServiciosClienteProps) {
  const [servicios, setServicios] = useState<ServicioContratado[]>(serviciosContratados)
  const [categorias, setCategorias] = useState(categoriasConfig)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(
      Object.entries(CATEGORIAS_CONFIG).filter(([key]) => {
        const activos = servicios.filter(
          (s) => s.categoria === key && s.activo
        ).length
        return activos > 0
      }).map(([key]) => key)
    )
  )
  const [saving, setSaving] = useState(false)

  const toggleCategory = (categoria: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoria)) {
      newExpanded.delete(categoria)
    } else {
      newExpanded.add(categoria)
    }
    setExpandedCategories(newExpanded)
  }

  const getOrCreateServicio = useCallback(
    (categoria: string, nombre: string): ServicioContratado => {
      let servicio = servicios.find(
        (s) => s.categoria === categoria && s.nombre === nombre
      )
      if (!servicio) {
        servicio = {
          id: `${categoria}-${nombre}-${Date.now()}`,
          cliente_id: clienteId,
          categoria,
          nombre,
          activo: false,
          precio_sin_iva: null,
        }
        setServicios((prev) => [...prev, servicio!])
      }
      return servicio
    },
    [servicios, clienteId]
  )

  const updateServicio = useCallback((id: string, updates: Partial<ServicioContratado>) => {
    setServicios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    )
  }, [])

  const toggleServicio = useCallback(
    (categoria: string, nombre: string) => {
      const servicio = getOrCreateServicio(categoria, nombre)
      updateServicio(servicio.id, { activo: !servicio.activo })
    },
    [getOrCreateServicio, updateServicio]
  )

  const updateCategoria = useCallback((categoria: string, updates: Partial<CategoriaContratada>) => {
    setCategorias((prev) => ({
      ...prev,
      [categoria]: { ...prev[categoria as keyof typeof prev], ...updates },
    }))
  }, [])

  // Lógica para obtener tipo CRM activo en TECNOLOGÍA
  const crmActivo = useMemo(() => {
    const crm = servicios.find(
      (s) => s.categoria === 'tecnologia' && s.nombre === 'CRM' && s.activo
    )
    return crm?.crm_tipo || null
  }, [servicios])

  // Calcular totales
  const totales = useMemo(() => {
    let subtotalSinIva = 0
    const porCategoria: Record<string, number> = {}

    servicios.forEach((s) => {
      if (!s.activo) return

      let monto = 0

      // Servicios simples con solo precio
      if (['mdk', 'diseño', 'consultoria'].includes(s.categoria)) {
        monto = s.precio_sin_iva || 0
      }
      // TECNOLOGÍA - casos especiales
      else if (s.categoria === 'tecnologia') {
        if (s.nombre === 'CRM') {
          monto = s.precio_sin_iva || 0
        } else if (s.nombre === 'Conversaciones Asistente IA') {
          monto = s.precio_sin_iva || 0
        } else if (s.nombre === 'Licenciamiento de Usuarios CRM') {
          const cant = s.cantidad || 0
          const precio = s.precio_unitario || 0
          monto = cant * precio
        } else if (s.nombre === 'Plantilla de mensajes de WhatsApp enviadas') {
          const cant = s.cantidad || 0
          const precio = s.precio_unitario || 0
          monto = cant * precio
        } else if (s.nombre === 'Implementación de integraciones') {
          const cant = s.cantidad || 0
          const precio = s.precio_unitario || 0
          monto = cant * precio
        } else if (s.nombre === 'Mantenimiento de integraciones') {
          const cant = s.cantidad || 0
          const precio = s.precio_unitario || 0
          monto = cant * precio
        } else if (s.nombre === 'Api de WhatsApp') {
          monto = s.precio_sin_iva || 0
        } else if (s.nombre === 'Módulo de automatización de Marketing') {
          monto = s.precio_sin_iva || 0
        } else if (s.nombre === 'Desarrollo de chatbot') {
          monto = s.precio_sin_iva || 0
        } else if (s.nombre === 'Tracking de campañas - Implementación') {
          monto = s.precio_sin_iva || 0
        } else if (s.nombre === 'Tracking de campañas - Mantenimiento') {
          monto = s.precio_sin_iva || 0
        }
      }
      // ADICIONALES
      else if (s.categoria === 'adicionales') {
        if (s.nombre === 'Desarrollo a medida (por hora)') {
          const horas = s.horas_estimadas || 0
          const precio = s.precio_unitario || 0
          monto = horas * precio
        } else {
          monto = s.precio_sin_iva || 0
        }
      }

      subtotalSinIva += monto
      porCategoria[s.categoria] = (porCategoria[s.categoria] || 0) + monto
    })

    const iva = subtotalSinIva * 0.21
    const totalConIva = subtotalSinIva + iva

    return { subtotalSinIva, iva, totalConIva, porCategoria }
  }, [servicios])

  const hasChanges = useMemo(() => {
    const serviciosChanged = JSON.stringify(servicios) !== JSON.stringify(serviciosContratados)
    const categoriasChanged = JSON.stringify(categorias) !== JSON.stringify(categoriasConfig)
    return serviciosChanged || categoriasChanged
  }, [servicios, categorias, serviciosContratados, categoriasConfig])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ servicios, categorias })
      toast.success('Servicios actualizados correctamente')
    } catch (error) {
      toast.error('Error al guardar los servicios')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 pb-32">
      {/* Categorías */}
      {Object.entries(CATEGORIAS_CONFIG).map(([key, config]) => {
        const categoriasServicios = config.servicios
        const serviciosActivos = servicios.filter(
          (s) => s.categoria === key && s.activo
        ).length
        const isExpanded = expandedCategories.has(key)
        const Icon = config.icon

        return (
          <div key={key} className="bg-[#141414] border border-white/5 rounded-xl overflow-hidden">
            {/* Header de categoría */}
            <button
              onClick={() => toggleCategory(key)}
              className="w-full px-5 py-4 flex items-center justify-between border-b border-white/5 hover:bg-white/2 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Icon size={20} className="text-white/60" />
                <span className="font-semibold text-white">{config.nombre}</span>
                <span
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium',
                    serviciosActivos > 0
                      ? 'bg-[#7F77DD]/20 text-[#7F77DD]'
                      : 'bg-white/10 text-white/40'
                  )}
                >
                  {serviciosActivos} activos
                </span>
              </div>

              <div className="flex items-center gap-3">
                {config.tienesFechas && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={categorias[key as keyof typeof categorias]?.fecha_inicio || ''}
                      onChange={(e) =>
                        updateCategoria(key, { fecha_inicio: e.target.value || null })
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="bg-[#111111] border border-white/10 rounded px-3 py-1 text-xs text-white focus:outline-none focus:border-[#7F77DD]"
                    />
                    <span className="text-white/40 text-xs">–</span>
                    <input
                      type="date"
                      value={categorias[key as keyof typeof categorias]?.fecha_fin || ''}
                      onChange={(e) =>
                        updateCategoria(key, { fecha_fin: e.target.value || null })
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="bg-[#111111] border border-white/10 rounded px-3 py-1 text-xs text-white focus:outline-none focus:border-[#7F77DD]"
                    />
                  </div>
                )}

                <ChevronDown
                  size={20}
                  className={cn(
                    'text-white/40 transition-transform',
                    isExpanded && 'rotate-180'
                  )}
                />
              </div>
            </button>

            {/* Contenido expandible */}
            {isExpanded && (
              <div className="divide-y divide-white/[0.03]">
                {categoriasServicios.map((nombreServicio) => {
                  const servicio = servicios.find(
                    (s) => s.categoria === key && s.nombre === nombreServicio
                  )
                  const isActivo = servicio?.activo || false

                  // Lógica de deshabilitado para GHL
                  const isGhlOnlyServicio = [
                    'Conversaciones Asistente IA',
                    'Plantilla de mensajes de WhatsApp enviadas',
                  ].includes(nombreServicio)
                  const isDisabledGhl = isGhlOnlyServicio && crmActivo !== 'GHL'

                  return (
                    <div key={nombreServicio} className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={isActivo && !isDisabledGhl}
                          onCheckedChange={() => {
                            if (!isDisabledGhl) {
                              toggleServicio(key, nombreServicio)
                            }
                          }}
                          disabled={isDisabledGhl}
                          className={cn(isDisabledGhl && 'opacity-50 cursor-not-allowed')}
                        />
                        <div className="flex-1">
                          <label
                            className={cn(
                              'text-sm cursor-pointer',
                              isActivo && !isDisabledGhl
                                ? 'text-white'
                                : 'text-white/40'
                            )}
                          >
                            {nombreServicio}
                          </label>
                          {isGhlOnlyServicio && crmActivo !== 'GHL' && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-white/40">
                              <AlertCircle size={14} />
                              <span>Solo disponible con CRM GHL</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Campos específicos cuando está activo */}
                      {isActivo && !isDisabledGhl && (
                        <div className="bg-[#1c1c1c] rounded mt-3 p-4 space-y-3 ml-8">
                          {/* CRM - selector de tipo */}
                          {key === 'tecnologia' && nombreServicio === 'CRM' && (
                            <div className="space-y-2">
                              <label className="text-xs text-white/60 block">Tipo de CRM</label>
                              <div className="flex gap-2">
                                {(['Odoo', 'Aurelia', 'GHL'] as const).map((tipo) => (
                                  <label key={tipo} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="crm_tipo"
                                      value={tipo}
                                      checked={servicio?.crm_tipo === tipo}
                                      onChange={() =>
                                        updateServicio(servicio!.id, { crm_tipo: tipo })
                                      }
                                      className="w-4 h-4"
                                    />
                                    <span className="text-sm text-white">{tipo}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* CRM - Plan */}
                          {key === 'tecnologia' && nombreServicio === 'CRM' && (
                            <div>
                              <label className="text-xs text-white/60 block mb-2">Plan</label>
                              <Input
                                placeholder="ej: Plan Growth 299 USD"
                                value={servicio?.plan_nombre || ''}
                                onChange={(e) =>
                                  updateServicio(servicio!.id, { plan_nombre: e.target.value })
                                }
                                className="bg-[#111111] border-white/10 text-white text-sm"
                              />
                            </div>
                          )}

                          {/* Servicios con cantidad y precio unitario */}
                          {[
                            'Licenciamiento de Usuarios CRM',
                            'Plantilla de mensajes de WhatsApp enviadas',
                            'Implementación de integraciones',
                            'Mantenimiento de integraciones',
                          ].includes(nombreServicio) && (
                            <>
                              <div>
                                <label className="text-xs text-white/60 block mb-2">
                                  {nombreServicio === 'Licenciamiento de Usuarios CRM'
                                    ? 'Cantidad de usuarios'
                                    : nombreServicio === 'Plantilla de mensajes de WhatsApp enviadas'
                                      ? 'Cantidad de mensajes'
                                      : 'Cantidad'}
                                </label>
                                <Input
                                  type="number"
                                  value={servicio?.cantidad || ''}
                                  onChange={(e) =>
                                    updateServicio(servicio!.id, {
                                      cantidad: e.target.value ? parseFloat(e.target.value) : null,
                                    })
                                  }
                                  className="bg-[#111111] border-white/10 text-white text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-white/60 block mb-2">
                                  {nombreServicio === 'Licenciamiento de Usuarios CRM'
                                    ? 'Precio por usuario'
                                    : nombreServicio === 'Plantilla de mensajes de WhatsApp enviadas'
                                      ? 'Precio unitario'
                                      : 'Precio por integración'}
                                </label>
                                <Input
                                  type="number"
                                  value={servicio?.precio_unitario || ''}
                                  onChange={(e) =>
                                    updateServicio(servicio!.id, {
                                      precio_unitario: e.target.value ? parseFloat(e.target.value) : null,
                                    })
                                  }
                                  className="bg-[#111111] border-white/10 text-white text-sm"
                                />
                              </div>
                              <div className="flex justify-between items-center pt-2 border-t border-white/10">
                                <span className="text-xs text-white/60">Total:</span>
                                <span className="text-[#7F77DD] text-sm font-medium">
                                  ${((servicio?.cantidad || 0) * (servicio?.precio_unitario || 0)).toFixed(2)}
                                </span>
                              </div>
                            </>
                          )}

                          {/* API de WhatsApp - selector tipo */}
                          {key === 'tecnologia' && nombreServicio === 'Api de WhatsApp' && (
                            <div className="space-y-2">
                              <label className="text-xs text-white/60 block">Tipo de API</label>
                              <div className="flex gap-2">
                                {(['API OFICIAL', 'API NO OFICIAL'] as const).map((tipo) => (
                                  <label key={tipo} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="api_tipo"
                                      value={tipo}
                                      checked={servicio?.api_tipo === tipo}
                                      onChange={() =>
                                        updateServicio(servicio!.id, { api_tipo: tipo })
                                      }
                                      className="w-4 h-4"
                                    />
                                    <span className="text-sm text-white">{tipo}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Desarrollo a medida - horas y precio */}
                          {key === 'adicionales' && nombreServicio === 'Desarrollo a medida (por hora)' && (
                            <>
                              <div>
                                <label className="text-xs text-white/60 block mb-2">Horas estimadas</label>
                                <Input
                                  type="number"
                                  value={servicio?.horas_estimadas || ''}
                                  onChange={(e) =>
                                    updateServicio(servicio!.id, {
                                      horas_estimadas: e.target.value ? parseFloat(e.target.value) : null,
                                    })
                                  }
                                  className="bg-[#111111] border-white/10 text-white text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-white/60 block mb-2">Precio por hora</label>
                                <Input
                                  type="number"
                                  value={servicio?.precio_unitario || ''}
                                  onChange={(e) =>
                                    updateServicio(servicio!.id, {
                                      precio_unitario: e.target.value ? parseFloat(e.target.value) : null,
                                    })
                                  }
                                  className="bg-[#111111] border-white/10 text-white text-sm"
                                />
                              </div>
                              <div className="flex justify-between items-center pt-2 border-t border-white/10">
                                <span className="text-xs text-white/60">Total:</span>
                                <span className="text-[#7F77DD] text-sm font-medium">
                                  ${((servicio?.horas_estimadas || 0) * (servicio?.precio_unitario || 0)).toFixed(2)}
                                </span>
                              </div>
                            </>
                          )}

                          {/* Precio sin IVA (mostrado en todos los servicios activos excepto los que tienen campos especiales arriba) */}
                          {![
                            'CRM',
                            'Licenciamiento de Usuarios CRM',
                            'Plantilla de mensajes de WhatsApp enviadas',
                            'Implementación de integraciones',
                            'Mantenimiento de integraciones',
                            'Api de WhatsApp',
                            'Desarrollo a medida (por hora)',
                          ].includes(nombreServicio) && (
                            <div>
                              <label className="text-xs text-white/60 block mb-2">Precio sin IVA</label>
                              <Input
                                type="number"
                                value={servicio?.precio_sin_iva || ''}
                                onChange={(e) =>
                                  updateServicio(servicio!.id, {
                                    precio_sin_iva: e.target.value ? parseFloat(e.target.value) : null,
                                  })
                                }
                                className="bg-[#111111] border-white/10 text-white text-sm"
                              />
                            </div>
                          )}

                          {/* Precio con IVA calculado (para servicios simples) */}
                          {![
                            'CRM',
                            'Licenciamiento de Usuarios CRM',
                            'Plantilla de mensajes de WhatsApp enviadas',
                            'Implementación de integraciones',
                            'Mantenimiento de integraciones',
                            'Api de WhatsApp',
                            'Desarrollo a medida (por hora)',
                          ].includes(nombreServicio) && (
                            <div className="flex justify-between items-center pt-2 border-t border-white/10">
                              <span className="text-xs text-white/60">Precio con IVA (21%):</span>
                              <span className="text-emerald-400 text-sm">
                                ${((servicio?.precio_sin_iva || 0) * 1.21).toFixed(2)}
                              </span>
                            </div>
                          )}

                          {/* Precio sin IVA input para servicios con cantidad */}
                          {[
                            'Licenciamiento de Usuarios CRM',
                            'Plantilla de mensajes de WhatsApp enviadas',
                            'Implementación de integraciones',
                            'Mantenimiento de integraciones',
                          ].includes(nombreServicio) && (
                            <div>
                              <label className="text-xs text-white/60 block mb-2">Precio sin IVA (total)</label>
                              <Input
                                type="number"
                                value={servicio?.precio_sin_iva || ''}
                                onChange={(e) =>
                                  updateServicio(servicio!.id, {
                                    precio_sin_iva: e.target.value ? parseFloat(e.target.value) : null,
                                  })
                                }
                                className="bg-[#111111] border-white/10 text-white text-sm"
                              />
                            </div>
                          )}

                          {/* Precio sin IVA para CRM, API WhatsApp, etc. */}
                          {['CRM', 'Api de WhatsApp'].includes(nombreServicio) && (
                            <div>
                              <label className="text-xs text-white/60 block mb-2">Precio sin IVA</label>
                              <Input
                                type="number"
                                value={servicio?.precio_sin_iva || ''}
                                onChange={(e) =>
                                  updateServicio(servicio!.id, {
                                    precio_sin_iva: e.target.value ? parseFloat(e.target.value) : null,
                                  })
                                }
                                className="bg-[#111111] border-white/10 text-white text-sm"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Resumen financiero fijo */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-white/5 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div>
              <div className="text-xs text-white/50 mb-1">Subtotal sin IVA</div>
              <div className="text-xl font-semibold text-white">
                ${totales.subtotalSinIva.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-white/50 mb-1">IVA 21%</div>
              <div className="text-xl font-semibold text-white">
                ${totales.iva.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-white/50 mb-1">Total con IVA</div>
              <div className="text-2xl font-bold text-[#7F77DD]">
                ${totales.totalConIva.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="bg-[#7F77DD] hover:bg-[#7F77DD]/90 text-white"
            >
              <DeviceFloppy size={18} className="mr-2" />
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
