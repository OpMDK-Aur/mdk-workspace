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
import { ControllerConfiguracion, ControllerAlerta } from '@/lib/types'
import { IconEye, IconEyeOff, IconTrash, IconPlus, IconAlertTriangle, IconCoin, IconCheck, IconAlertCircle, IconBrandMeta, IconBrandGoogle } from '@tabler/icons-react'
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
  const [metaToken, setMetaToken] = useState(configuracion?.meta_access_token || '')
  const [googleRefreshToken, setGoogleRefreshToken] = useState(configuracion?.google_refresh_token || '')
  const [showMetaToken, setShowMetaToken] = useState(false)
  const [showGoogleToken, setShowGoogleToken] = useState(false)
  const [activo, setActivo] = useState(configuracion?.activo ?? true)
  const [alertas, setAlertas] = useState<ControllerAlerta[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingCuentas, setLoadingCuentas] = useState(false)

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
          setMetaToken(data.configuracion.meta_access_token || '')
          setGoogleRefreshToken(data.configuracion.google_refresh_token || '')
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
          meta_access_token: metaToken || null,
          google_refresh_token: googleRefreshToken || null,
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

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-2xl bg-[#161616] border-white/10 text-white overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{clienteNombre}</SheetTitle>
          <SheetDescription>Configura conexiones, alertas e historial</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="conexion" className="mt-6">
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
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Access Token</Label>
                        {metaToken && <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">Configurado</span>}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Input
                          placeholder="EAAxxxxx..."
                          type={showMetaToken ? 'text' : 'password'}
                          value={metaToken}
                          onChange={(e) => setMetaToken(e.target.value)}
                          className="bg-[#0f0f0f] border-white/10 text-white"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setShowMetaToken(!showMetaToken)}
                        >
                          {showMetaToken ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Page Access Token long-lived del Business Manager de MDK</p>
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
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Refresh Token</Label>
                        {googleRefreshToken && <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">Configurado</span>}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Input
                          placeholder="..."
                          type={showGoogleToken ? 'text' : 'password'}
                          value={googleRefreshToken}
                          onChange={(e) => setGoogleRefreshToken(e.target.value)}
                          className="bg-[#0f0f0f] border-white/10 text-white"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setShowGoogleToken(!showGoogleToken)}
                        >
                          {showGoogleToken ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">OAuth2 Refresh Token de la cuenta de Google Ads</p>
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
          <TabsContent value="alertas" className="space-y-6 mt-6 max-h-[600px] overflow-y-auto">
            {/* Rendimiento */}
            <div className="space-y-4">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
                <IconAlertTriangle className="w-4 h-4 text-red-400" />
                Rendimiento
                <div className="flex-1 h-px bg-white/10" />
              </h2>
              {ALERTAS_RENDIMIENTO.map((grupo) => (
                <div key={grupo.grupo} className="space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    {grupo.grupo}
                  </div>
                  <div className="space-y-2">
                    {grupo.alertas.map((alerta) => (
                      <AlertCard key={alerta.subtipo} alerta={alerta} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Presupuesto */}
            <div className="space-y-4 border-t border-white/10 pt-6">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
                <IconCoin className="w-4 h-4 text-yellow-400" />
                Presupuesto
                <div className="flex-1 h-px bg-white/10" />
              </h2>
              {ALERTAS_PRESUPUESTO.map((grupo) => (
                <div key={grupo.grupo} className="space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    {grupo.grupo}
                  </div>
                  <div className="space-y-2">
                    {grupo.alertas.map((alerta) => (
                      <AlertCard key={alerta.subtipo} alerta={alerta} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Button className="w-full bg-[#7F77DD] hover:bg-[#7F77DD]/90 mt-6">
              Guardar alertas
            </Button>
          </TabsContent>

          {/* TAB 3: Historial */}
          <TabsContent value="historial" className="space-y-4 mt-6">
            <HistorialTable clienteId={clienteId} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

function AlertCard({ alerta }: { alerta: any }) {
  const [active, setActive] = useState(false)
  const [plataforma, setPlataforma] = useState('ambas')
  const [accion, setAccion] = useState('ambas')
  const [campos, setCampos] = useState<Record<string, string | number>>({})
  const [variantes, setVariantes] = useState<Array<Record<string, string | number>>>([])

  // Inicializar campos según el subtipo
  useEffect(() => {
    const camposIniciales: Record<string, string | number> = {}
    alerta.campos?.forEach((campo: string) => {
      camposIniciales[campo] = ''
    })
    setCampos(camposIniciales)

    // Para cpl_aumento_porcentual, inicializar con una variante
    if (alerta.subtipo === 'cpl_aumento_porcentual') {
      setVariantes([{ porcentaje: '', dias: '' }])
    }
  }, [alerta])

  const handleAddVariante = () => {
    setVariantes([...variantes, { porcentaje: '', dias: '' }])
  }

  const handleRemoveVariante = (index: number) => {
    setVariantes(variantes.filter((_, i) => i !== index))
  }

  const handleCampoChange = (campo: string, valor: string | number) => {
    setCampos({ ...campos, [campo]: valor })
  }

  const handleVarianteChange = (index: number, campo: string, valor: string | number) => {
    const nuevasVariantes = [...variantes]
    nuevasVariantes[index] = { ...nuevasVariantes[index], [campo]: valor }
    setVariantes(nuevasVariantes)
  }

  const sinCamposConfig = ['tasa_conversion_baja', 'presupuesto_agotado_diario', 'limitada_google', 'limitada_meta_demanda']

  return (
    <div className={`rounded-lg border transition-all duration-200 ${active ? 'bg-[#1a1a1a] border-[#7F77DD]/40' : 'bg-[#1a1a1a] border-white/8 opacity-50'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 gap-4">
        <div className="flex items-center gap-3">
          <Toggle pressed={active} onPressedChange={setActive} className="data-[state=on]:bg-[#7F77DD] data-[state=on]:text-white">
            <span className="text-xs">{active ? '✓' : ''}</span>
          </Toggle>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{active ? 'Activa' : 'Activar'}</span>
            <span className={`text-xs font-medium ${active ? 'text-white' : 'text-white/60'}`}>{alerta.label}</span>
          </div>
        </div>
      </div>

      {/* Body (expandido cuando active) */}
      {active && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/8">
          {/* Fila 1: Selectores */}
          <div className="flex items-center gap-2 pt-3">
            <Select value={plataforma} onValueChange={setPlataforma}>
              <SelectTrigger className="h-8 text-xs bg-[#111] border-white/10 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meta">Meta</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="ambas">Ambas</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">→</span>
            <Select value={accion} onValueChange={setAccion}>
              <SelectTrigger className="h-8 text-xs bg-[#111] border-white/10 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tarea">Crear tarea</SelectItem>
                <SelectItem value="notificacion">Notificación</SelectItem>
                <SelectItem value="ambas">Ambas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Fila 2: Configuración */}
          {sinCamposConfig.includes(alerta.subtipo) ? (
            <div className="bg-[#7F77DD]/10 text-[#7F77DD] text-xs rounded px-2 py-1 w-fit">
              Se detecta automáticamente al ejecutar
            </div>
          ) : alerta.subtipo === 'cpl_aumento_porcentual' ? (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Variantes</div>
              {variantes.map((variante, idx) => (
                <div key={idx} className="relative bg-[#111] border border-white/10 rounded p-3 flex gap-3">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Aumento (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={variante.porcentaje}
                      onChange={(e) => handleVarianteChange(idx, 'porcentaje', e.target.value)}
                      className="h-9 mt-1 text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Comparar (días)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={variante.dias}
                      onChange={(e) => handleVarianteChange(idx, 'dias', e.target.value)}
                      className="h-9 mt-1 text-sm"
                      placeholder="0"
                    />
                  </div>
                  {variantes.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-400/60 hover:text-red-400 mt-6"
                      onClick={() => handleRemoveVariante(idx)}
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full border-dashed border-white/20 h-8 text-xs gap-1"
                onClick={handleAddVariante}
              >
                <IconPlus className="h-3 w-3" />
                Agregar variante
              </Button>
            </div>
          ) : (
            <div className="bg-[#111] rounded p-3 space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Configuración</div>
              <div className={`grid gap-3 ${alerta.campos?.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {alerta.campos?.map((campo: string) => (
                  <div key={campo}>
                    <Label className="text-xs text-muted-foreground capitalize">{campo.replace(/_/g, ' ')}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={campos[campo]}
                      onChange={(e) => handleCampoChange(campo, e.target.value)}
                      className="h-9 mt-1 text-sm"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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
