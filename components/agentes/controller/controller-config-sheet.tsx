'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ControllerConfiguracion, ControllerAlerta } from '@/lib/types'
import { IconTrash, IconPlus, IconAlertTriangle, IconCoin, IconCheck, IconAlertCircle, IconBrandMeta, IconBrandGoogle, IconChevronDown, IconInfoCircle, IconSparkles, IconMaximize, IconMinimize } from '@tabler/icons-react'
import { toast } from 'sonner'

interface CuentaPublicitaria {
  id: string
  plataforma: 'meta' | 'google'
  id_cuenta: string
  nombre_cuenta: string | null
  activo: boolean
}

interface ControllerConfigSheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  clienteId: string
  clienteNombre: string
  configuracion: ControllerConfiguracion | null
}

const ALERTAS_RENDIMIENTO = [
  {
    grupo: 'CPA Elevado',
    alertas: [
      { subtipo: 'cpl_aumento_porcentual', label: 'CPL aumenta más de X% respecto a los últimos N días', campos: ['porcentaje', 'dias'] },
      { subtipo: 'cpl_supera_objetivo', label: 'CPL supera el objetivo establecido', campos: ['cpl_objetivo'] },
      { subtipo: 'cpl_supera_ticket', label: 'CPL superior al ticket promedio permitido', campos: ['ticket_promedio'] },
    ],
  },
  {
    grupo: 'Caída de Conversiones',
    alertas: [
      { subtipo: 'caida_conversiones_porcentual', label: 'Las conversiones caen más del X%', campos: ['porcentaje', 'leads_referencia'] },
      { subtipo: 'sin_conversiones_horas', label: 'Sin conversiones durante X horas', campos: ['horas'] },
      { subtipo: 'tasa_conversion_baja', label: 'Tasa de conversión baja respecto al promedio', campos: [] },
    ],
  },
  {
    grupo: 'CTR Bajo',
    alertas: [
      { subtipo: 'ctr_bajo_benchmark', label: 'CTR inferior al benchmark de la cuenta', campos: ['ctr_benchmark'] },
      { subtipo: 'ctr_caida_semanal', label: 'CTR cae más del X% vs semana anterior', campos: ['porcentaje'] },
    ],
  },
]

const ALERTAS_PRESUPUESTO = [
  {
    grupo: 'Presupuesto Agotado',
    alertas: [
      { subtipo: 'presupuesto_hora_limite', label: 'Presupuesto agotado antes de determinada hora', campos: ['hora_limite'] },
      { subtipo: 'presupuesto_agotado_diario', label: 'Presupuesto agotado todos los días de la semana', campos: [] },
    ],
  },
  {
    grupo: 'Limitada por Presupuesto',
    alertas: [
      { subtipo: 'limitada_google', label: 'Google informa "Limitada por presupuesto"', campos: [] },
      { subtipo: 'limitada_meta_demanda', label: 'Meta detecta alta demanda con presupuesto insuficiente', campos: [] },
    ],
  },
  {
    grupo: 'Gasto Anormal',
    alertas: [
      { subtipo: 'gasto_anormal_alto', label: 'Gastó mucho más de lo habitual', campos: ['desvio_maximo'] },
      { subtipo: 'gasto_anormal_bajo', label: 'Gastó mucho menos de lo habitual', campos: ['desvio_minimo'] },
      { subtipo: 'sin_gasto_horas', label: 'Sin gasto durante las últimas X horas', campos: ['horas'] },
    ],
  },
]

export function ControllerConfigSheet({
  isOpen,
  onOpenChange,
  clienteId,
  clienteNombre,
  configuracion,
}: ControllerConfigSheetProps) {
  const [cuentas, setCuentas] = useState<CuentaPublicitaria[]>([])
  const [activo, setActivo] = useState(configuracion?.activo ?? true)
  const [alertas, setAlertas] = useState<ControllerAlerta[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingCuentas, setLoadingCuentas] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [alertasData, setAlertasData] = useState<Record<string, AlertCardData>>({})

  // Cargar configuración y cuentas al abrir el sheet
  useEffect(() => {
    if (isOpen) {
      loadConfigAndCuentas()
    }
  }, [isOpen])

  const loadConfigAndCuentas = async () => {
    setLoadingCuentas(true)
    try {
      const response = await fetch(`/api/controller/config?clienteId=${clienteId}`)
      if (response.ok) {
        const data = await response.json()
        setCuentas(data.cuentas || [])
        if (data.configuracion) {
          setActivo(data.configuracion.activo ?? true)
        }
      }
    } catch (error) {
      console.error('Error cargando configuración:', error)
    } finally {
      setLoadingCuentas(false)
    }
  }

  const handleSaveConexion = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/controller/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          activo,
        }),
      })

      if (response.ok) {
        toast.success('Configuración guardada')
        onOpenChange(false)
      } else {
        toast.error('Error al guardar')
      }
    } catch (error) {
      toast.error('Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAlertas = async () => {
    setLoading(true)
    try {
      // Transformar alertasData al formato esperado por el endpoint
      const alertasArray = Object.entries(alertasData).map(([subtipo, data]) => ({
        subtipo,
        activa: data.activa,
        plataforma: data.plataforma,
        accion: data.accion,
        configuracion: {
          campos: data.campos,
          variantes: data.variantes,
        },
      }))

      const response = await fetch('/api/controller/alertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          alertas: alertasArray,
        }),
      })

      if (response.ok) {
        toast.success('Alertas guardadas correctamente')
      } else {
        toast.error('Error al guardar alertas')
      }
    } catch (error) {
      console.error('Error guardando alertas:', error)
      toast.error('Error al guardar alertas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className={`${fullscreen ? '!max-w-none w-full' : 'max-w-2xl'} bg-[#161616] border-white/10 text-white overflow-y-auto transition-all duration-300 p-0`}>
        <div className="px-6 py-4 border-b border-white/10 sticky top-0 bg-[#161616]">
          <div className="flex items-center justify-between">
            <SheetHeader className="space-y-1">
              <SheetTitle>{clienteNombre}</SheetTitle>
              <SheetDescription>Configura conexiones, alertas e historial</SheetDescription>
            </SheetHeader>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFullscreen(!fullscreen)}
              className="text-white/60 hover:text-white"
              title={fullscreen ? 'Reducir' : 'Expandir a pantalla completa'}
            >
              {fullscreen ? <IconMinimize className="w-4 h-4" /> : <IconMaximize className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="px-6 py-4">
          <Tabs defaultValue="conexion" className="mt-2">
          <TabsList className="grid w-full grid-cols-3 bg-[#0f0f0f] border-white/10">
            <TabsTrigger value="conexion">Conexión</TabsTrigger>
            <TabsTrigger value="alertas">Alertas</TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
          </TabsList>

          {/* TAB 1: Conexión */}
          <TabsContent value="conexion" className="space-y-6 mt-6">
            {loadingCuentas ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">Cargando...</p>
              </div>
            ) : cuentas.length === 0 ? (
              // Empty state
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <IconAlertCircle className="h-8 w-8 text-yellow-500" />
                <div className="text-center">
                  <p className="font-medium text-white">Sin cuentas publicitarias</p>
                  <p className="text-xs text-muted-foreground mt-1">Configurá las cuentas del cliente en Plataformas → Cuentas publicitarias antes de activar el Controller</p>
                </div>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <a href="/dashboard/plataformas/cuentas">Ir a Plataformas</a>
                </Button>
              </div>
            ) : (
              <>
                {/* Meta Ads Section */}
                {cuentas.some(c => c.plataforma === 'meta') && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <IconBrandMeta className="h-4 w-4" />
                      Meta Ads
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {cuentas.filter(c => c.plataforma === 'meta').map(cuenta => (
                        <div
                          key={cuenta.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1877F2]/15 border border-[#1877F2]/30 text-white/80 text-xs"
                        >
                          <IconCheck className="h-3 w-3 text-[#1877F2]" />
                          {cuenta.nombre_cuenta || cuenta.id_cuenta}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {cuentas.some(c => c.plataforma === 'meta') && cuentas.some(c => c.plataforma === 'google') && (
                  <div className="border-t border-white/10" />
                )}

                {/* Google Ads Section */}
                {cuentas.some(c => c.plataforma === 'google') && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <IconBrandGoogle className="h-4 w-4" />
                      Google Ads
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {cuentas.filter(c => c.plataforma === 'google').map(cuenta => (
                        <div
                          key={cuenta.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#EA4335]/15 border border-[#EA4335]/30 text-white/80 text-xs"
                        >
                          <IconCheck className="h-3 w-3 text-[#EA4335]" />
                          {cuenta.nombre_cuenta || cuenta.id_cuenta}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agente Activo Toggle */}
                <div className="border-t border-white/10 pt-4 flex items-center justify-between">
                  <Label className="text-sm">Agente activo</Label>
                  <Toggle pressed={activo} onPressedChange={setActivo} className="data-[state=on]:bg-[#7F77DD]">
                    {activo ? 'Sí' : 'No'}
                  </Toggle>
                </div>

                {/* Save Button */}
                <Button
                  onClick={handleSaveConexion}
                  disabled={loading}
                  className="w-full bg-[#7F77DD] hover:bg-[#7F77DD]/90 mt-6"
                >
                  {loading ? 'Guardando...' : 'Guardar configuración'}
                </Button>
              </>
            )}
          </TabsContent>

          {/* TAB 2: Alertas */}
          <TabsContent value="alertas" className={`mt-6 overflow-y-auto ${fullscreen ? 'max-h-[calc(100vh-200px)]' : 'max-h-[600px]'}`}>
            {/* RENDIMIENTO */}
            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-widest text-white/30 font-semibold flex items-center gap-2 mb-4">
                <IconAlertTriangle className="w-4 h-4 text-red-400" />
                Rendimiento
                <div className="flex-1 h-px bg-white/8" />
              </div>

              {ALERTAS_RENDIMIENTO.map((grupo) => (
                <div key={grupo.grupo} className="space-y-3">
                  <div className="text-[11px] uppercase tracking-widest text-white/30">
                    {grupo.grupo}
                  </div>
                  <div className="space-y-2">
                    {grupo.alertas.map((alerta) => {
                      const alertaData = alertasData[alerta.subtipo] || {
                        subtipo: alerta.subtipo,
                        activa: false,
                        plataforma: 'ambas',
                        accion: 'ambas',
                        campos: alerta.campos?.reduce((acc: Record<string, string | number>, campo: string) => {
                          acc[campo] = ''
                          return acc
                        }, {}) || {},
                        variantes: alerta.subtipo === 'cpl_aumento_porcentual' ? [{ porcentaje: '', dias: '' }] : [],
                      }
                      return (
                        <AlertCard 
                          key={alerta.subtipo} 
                          alerta={alerta}
                          alertaData={alertaData}
                          onDataChange={(data) => setAlertasData({ ...alertasData, [alerta.subtipo]: data })}
                          clienteId={clienteId}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Separador */}
            <div className="h-px bg-white/8 my-6" />

            {/* PRESUPUESTO */}
            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-widest text-white/30 font-semibold flex items-center gap-2 mb-4">
                <IconCoin className="w-4 h-4 text-yellow-400" />
                Presupuesto
                <div className="flex-1 h-px bg-white/8" />
              </div>

              {ALERTAS_PRESUPUESTO.map((grupo) => (
                <div key={grupo.grupo} className="space-y-3">
                  <div className="text-[11px] uppercase tracking-widest text-white/30">
                    {grupo.grupo}
                  </div>
                  <div className="space-y-2">
                    {grupo.alertas.map((alerta) => {
                      const alertaData = alertasData[alerta.subtipo] || {
                        subtipo: alerta.subtipo,
                        activa: false,
                        plataforma: 'ambas',
                        accion: 'ambas',
                        campos: alerta.campos?.reduce((acc: Record<string, string | number>, campo: string) => {
                          acc[campo] = ''
                          return acc
                        }, {}) || {},
                        variantes: alerta.subtipo === 'cpl_aumento_porcentual' ? [{ porcentaje: '', dias: '' }] : [],
                      }
                      return (
                        <AlertCard 
                          key={alerta.subtipo} 
                          alerta={alerta}
                          alertaData={alertaData}
                          onDataChange={(data) => setAlertasData({ ...alertasData, [alerta.subtipo]: data })}
                          clienteId={clienteId}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <Button 
              onClick={handleSaveAlertas}
              disabled={loading}
              className="w-full bg-[#7F77DD] hover:bg-[#7F77DD]/90 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Guardando...' : 'Guardar alertas'}
            </Button>
          </TabsContent>

          {/* TAB 3: Historial */}
          <TabsContent value="historial" className="space-y-4 mt-6">
            <HistorialTable clienteId={clienteId} />
          </TabsContent>
        </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface AlertCardData {
  subtipo: string
  activa: boolean
  plataforma: string
  accion: string
  campos: Record<string, string | number>
  variantes: Array<Record<string, string | number>>
}

function AlertCard({ 
  alerta, 
  alertaData, 
  onDataChange,
  clienteId,
}: { 
  alerta: any
  alertaData: AlertCardData
  onDataChange: (data: AlertCardData) => void
  clienteId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [ejecutando, setEjecutando] = useState(false)
  const [resultadoEjecucion, setResultadoEjecucion] = useState<any>(null)

  const sinCamposConfig = ['tasa_conversion_baja', 'presupuesto_agotado_diario', 'limitada_google', 'limitada_meta_demanda']

  const tooltipPlataforma = '¿En qué plataforma aplica esta alerta? Elegí Meta, Google, o Ambas para monitorear las dos.'
  const tooltipAccion = '¿Qué hace el sistema cuando se dispara esta alerta? Tarea: crea una tarea asignada al AM. Notificación: envía una alerta interna. Ambas: hace las dos cosas.'

  const handleSwitchChange = (newActive: boolean) => {
    onDataChange({ ...alertaData, activa: newActive })
    if (newActive) {
      setExpanded(true)
    } else {
      setExpanded(false)
    }
  }

  const handleHeaderClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(!expanded)
  }

  const handleEjecutarAlerta = async () => {
    setEjecutando(true)
    setResultadoEjecucion(null)
    try {
      const response = await fetch('/api/controller/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          alertaSubtipo: alerta.subtipo,
          accion: alertaData.accion,
          plataforma: alertaData.plataforma,
        }),
      })

      if (response.ok) {
        const resultado = await response.json()
        setResultadoEjecucion(resultado)
        toast.success(`Alerta "${alerta.label}" ejecutada correctamente`)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Error ejecutando alerta')
      }
    } catch (error) {
      console.error('Error ejecutando alerta:', error)
      toast.error('Error ejecutando alerta')
    } finally {
      setEjecutando(false)
    }
  }

  const handleAddVariante = () => {
    const nuevasVariantes = [...alertaData.variantes, { porcentaje: '', dias: '' }]
    onDataChange({ ...alertaData, variantes: nuevasVariantes })
  }

  const handleRemoveVariante = (index: number) => {
    const nuevasVariantes = alertaData.variantes.filter((_, i) => i !== index)
    onDataChange({ ...alertaData, variantes: nuevasVariantes })
  }

  const handleCampoChange = (campo: string, valor: string | number) => {
    const nuevosCampos = { ...alertaData.campos, [campo]: valor }
    onDataChange({ ...alertaData, campos: nuevosCampos })
  }

  const handleVarianteChange = (index: number, campo: string, valor: string | number) => {
    const nuevasVariantes = [...alertaData.variantes]
    nuevasVariantes[index] = { ...nuevasVariantes[index], [campo]: valor }
    onDataChange({ ...alertaData, variantes: nuevasVariantes })
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className={`rounded-lg border transition-all duration-200 ${alertaData.activa ? 'bg-[#1a1a1a] border-[#7F77DD]/40 shadow-[0_0_0_1px_rgba(127,119,221,0.15)]' : 'bg-[#1a1a1a] border-white/8'}`}>
        {/* Header - Clickeable para expandir/colapsar */}
        <CollapsibleTrigger asChild>
          <div 
            className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
            onClick={handleHeaderClick}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleSwitchChange(!alertaData.activa)
              }}
              className={`relative h-5 w-10 rounded-full transition-all duration-300 flex-shrink-0 ${
                alertaData.activa ? 'bg-[#10B981]' : 'bg-[#4B5563]'
              }`}
              title={alertaData.activa ? 'Desactivar alerta' : 'Activar alerta'}
            >
              <div
                className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${
                  alertaData.activa ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>

            <div className="flex-1">
              <span className={`text-[13px] font-normal ${alertaData.activa ? 'text-white' : 'text-white/40'}`}>
                {alerta.label}
              </span>
            </div>

            {alertaData.activa && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#7F77DD]/15 text-[#7F77DD]">
                  Activa
                </span>
              </div>
            )}

            <IconChevronDown 
              className={`w-3.5 h-3.5 text-white/20 transition-transform duration-200 ml-auto ${expanded ? 'rotate-180' : ''}`}
            />
          </div>
        </CollapsibleTrigger>

        {/* Body - Expandible */}
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3 border-t border-white/8 pt-3">
            {/* Selectores con Tooltips */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
                  Plataforma
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <IconInfoCircle className="w-3 h-3 text-white/20 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-[12px] bg-[#2a2a2a] border border-white/10">
                        {tooltipPlataforma}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </label>
                <Select value={alertaData.plataforma} onValueChange={(val) => onDataChange({ ...alertaData, plataforma: val })}>
                  <SelectTrigger className="h-9 text-sm bg-[#0f0f0f] border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meta">Meta</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="ambas">Ambas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
                  Acción
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <IconInfoCircle className="w-3 h-3 text-white/20 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-[12px] bg-[#2a2a2a] border border-white/10">
                        {tooltipAccion}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </label>
                <Select value={alertaData.accion} onValueChange={(val) => onDataChange({ ...alertaData, accion: val })}>
                  <SelectTrigger className="h-9 text-sm bg-[#0f0f0f] border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tarea">Crear tarea</SelectItem>
                    <SelectItem value="notificacion">Notificación</SelectItem>
                    <SelectItem value="ambas">Ambas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Configuración según subtipo */}
            {sinCamposConfig.includes(alerta.subtipo) ? (
              <div className="bg-[#7F77DD]/8 border border-[#7F77DD]/15 rounded-lg p-3 mt-3 flex items-start gap-2">
                <IconSparkles className="w-3.5 h-3.5 text-[#7F77DD]/60 flex-shrink-0 mt-0.5" />
                <span className="text-[12px] text-[#7F77DD]/70">
                  Se detecta automáticamente al ejecutar el agente
                </span>
              </div>
            ) : alerta.subtipo === 'cpl_aumento_porcentual' ? (
              <div className="bg-[#111111] rounded-lg p-4 mt-3 border border-white/5">
                <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">
                  Variantes
                </p>

                {alertaData.variantes.map((variante, idx) => (
                  <div 
                    key={idx} 
                    className="bg-[#1a1a1a] border border-white/8 rounded-md p-3 mb-2 relative"
                  >
                    {alertaData.variantes.length > 1 && (
                      <button
                        onClick={() => handleRemoveVariante(idx)}
                        className="absolute top-2 right-2 text-red-400/40 hover:text-red-400 transition-colors"
                      >
                        <IconTrash className="w-[13px] h-[13px]" />
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[12px] text-white/40 mb-1 block">Aumento</label>
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            value={variante.porcentaje}
                            onChange={(e) => handleVarianteChange(idx, 'porcentaje', e.target.value)}
                            className="bg-[#1a1a1a] border border-white/10 rounded-md h-9 px-3 text-[14px] text-white focus:border-[#7F77DD]/60 focus:outline-none focus:ring-1 focus:ring-[#7F77DD]/20 pr-7"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-white/30 pointer-events-none">
                            %
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[12px] text-white/40 mb-1 block">Comparar últimos</label>
                        <div className="relative">
                          <Input
                            type="number"
                            min="1"
                            value={variante.dias}
                            onChange={(e) => handleVarianteChange(idx, 'dias', e.target.value)}
                            className="bg-[#1a1a1a] border border-white/10 rounded-md h-9 px-3 text-[14px] text-white focus:border-[#7F77DD]/60 focus:outline-none focus:ring-1 focus:ring-[#7F77DD]/20 pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-white/30 pointer-events-none">
                            días
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={handleAddVariante}
                  className="w-full border border-dashed border-white/15 rounded-md py-2 text-[12px] text-white/30 hover:text-white/50 hover:border-white/25 transition-all flex items-center justify-center gap-1 mt-1"
                >
                  <IconPlus className="w-[13px] h-[13px]" />
                  Agregar otra condición
                </button>
              </div>
            ) : (
              <div className="bg-[#111111] rounded-lg p-4 mt-3 border border-white/5">
                <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">
                  Configuración
                </p>

                <div className={`grid gap-3 ${alerta.campos?.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {alerta.campos?.map((campo: string) => (
                    <div key={campo}>
                      <label className="text-[12px] text-white/50 mb-1 block capitalize">
                        {campo.replace(/_/g, ' ')}
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          value={alertaData.campos[campo] || ''}
                          onChange={(e) => handleCampoChange(campo, e.target.value)}
                          className="bg-[#1a1a1a] border border-white/10 rounded-md h-9 px-3 text-[14px] text-white focus:border-[#7F77DD]/60 focus:outline-none focus:ring-1 focus:ring-[#7F77DD]/20"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botón Ejecutar */}
            {alertaData.activa && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <button
                  onClick={handleEjecutarAlerta}
                  disabled={ejecutando}
                  className="w-full px-3 py-2 bg-[#7F77DD]/15 border border-[#7F77DD]/30 hover:bg-[#7F77DD]/25 hover:border-[#7F77DD]/50 rounded-md text-sm text-[#7F77DD] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ejecutando ? 'Ejecutando...' : 'Ejecutar alerta'}
                </button>

                {resultadoEjecucion && (
                  <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-md">
                    <p className="text-[12px] text-green-400 font-medium mb-2">Ejecutada correctamente</p>
                    <div className="space-y-1">
                      {resultadoEjecucion.acciones.map((accion: string, idx: number) => (
                        <p key={idx} className="text-[11px] text-green-400/70 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          {accion}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function HistorialTable({ clienteId }: { clienteId: string }) {
  const [historial, setHistorial] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useState(() => {
    async function fetchHistorial() {
      try {
        const res = await fetch(`/api/controller/historial?clienteId=${clienteId}`)
        const data = await res.json()
        setHistorial(data)
      } catch (error) {
        toast.error('Error al cargar historial')
      } finally {
        setLoading(false)
      }
    }
    fetchHistorial()
  }, [clienteId])

  if (loading) return <div className="text-center text-gray-400">Cargando...</div>
  if (historial.length === 0) return <div className="text-center text-gray-400 py-8">Aún no hay ejecuciones para este cliente</div>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-white/10">
          <th className="text-left py-2 px-2 text-xs text-gray-400">Fecha</th>
          <th className="text-left py-2 px-2 text-xs text-gray-400">Plataforma</th>
          <th className="text-left py-2 px-2 text-xs text-gray-400">Mensaje</th>
          <th className="text-right py-2 px-2 text-xs text-gray-400">Estado</th>
        </tr>
      </thead>
      <tbody>
        {historial.map((ejecucion) => (
          <tr key={ejecucion.id} className="border-b border-white/10">
            <td className="py-2 px-2 text-gray-300 text-xs">{new Date(ejecucion.ejecutado_at).toLocaleDateString()}</td>
            <td className="py-2 px-2">{ejecucion.plataforma}</td>
            <td className="py-2 px-2 text-gray-400 text-xs max-w-xs truncate">{ejecucion.mensaje}</td>
            <td className="py-2 px-2 text-right">
              {ejecucion.disparada ? (
                <IconAlertCircle className="w-4 h-4 text-yellow-400" />
              ) : (
                <IconCheck className="w-4 h-4 text-green-400" />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
