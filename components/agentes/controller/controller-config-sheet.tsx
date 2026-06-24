'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ControllerConfiguracion, ControllerAlerta } from '@/lib/types'
import { IconEye, IconEyeOff, IconTrash, IconPlus, IconAlertTriangle, IconCoin, IconCheck, IconAlertCircle } from '@tabler/icons-react'
import { toast } from 'sonner'

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
  const [metaActive, setMetaActive] = useState(!!configuracion?.meta_ad_account_id)
  const [googleActive, setGoogleActive] = useState(!!configuracion?.google_customer_id)
  const [metaAccountId, setMetaAccountId] = useState(configuracion?.meta_ad_account_id || '')
  const [metaToken, setMetaToken] = useState(configuracion?.meta_access_token || '')
  const [googleCustomerId, setGoogleCustomerId] = useState(configuracion?.google_customer_id || '')
  const [googleRefreshToken, setGoogleRefreshToken] = useState(configuracion?.google_refresh_token || '')
  const [showMetaToken, setShowMetaToken] = useState(false)
  const [showGoogleToken, setShowGoogleToken] = useState(false)
  const [alertas, setAlertas] = useState<ControllerAlerta[]>([])
  const [loading, setLoading] = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)

  const handleSaveConexion = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/controller/config', {
        method: configuracion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          metaActive,
          metaAccountId: metaActive ? metaAccountId : null,
          metaToken: metaActive ? metaToken : null,
          googleActive,
          googleCustomerId: googleActive ? googleCustomerId : null,
          googleRefreshToken: googleActive ? googleRefreshToken : null,
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
            {/* Meta Ads */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Meta Ads</label>
                <Toggle pressed={metaActive} onPressedChange={setMetaActive} className="data-[state=on]:bg-[#7F77DD]">
                  {metaActive ? 'Activo' : 'Inactivo'}
                </Toggle>
              </div>
              {metaActive && (
                <div className="space-y-3 pl-4 border-l border-[#7F77DD]/30">
                  <div>
                    <Label className="text-xs">Ad Account ID</Label>
                    <Input
                      placeholder="act_XXXXXXXXX"
                      value={metaAccountId}
                      onChange={(e) => setMetaAccountId(e.target.value)}
                      className="bg-[#0f0f0f] border-white/10 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Access Token</Label>
                    <div className="flex gap-2 mt-1">
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
                        {showMetaToken ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Usá un Page Access Token long-lived</p>
                  </div>
                </div>
              )}
            </div>

            {/* Google Ads */}
            <div className="space-y-4 border-t border-white/10 pt-6">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Google Ads</label>
                <Toggle pressed={googleActive} onPressedChange={setGoogleActive} className="data-[state=on]:bg-[#7F77DD]">
                  {googleActive ? 'Activo' : 'Inactivo'}
                </Toggle>
              </div>
              {googleActive && (
                <div className="space-y-3 pl-4 border-l border-[#7F77DD]/30">
                  <div>
                    <Label className="text-xs">Customer ID</Label>
                    <Input
                      placeholder="XXX-XXX-XXXX"
                      value={googleCustomerId}
                      onChange={(e) => setGoogleCustomerId(e.target.value)}
                      className="bg-[#0f0f0f] border-white/10 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Refresh Token</Label>
                    <div className="flex gap-2 mt-1">
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
                        {showGoogleToken ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={handleSaveConexion}
              disabled={loading}
              className="w-full bg-[#7F77DD] hover:bg-[#7F77DD]/90 mt-6"
            >
              Guardar conexión
            </Button>
          </TabsContent>

          {/* TAB 2: Alertas */}
          <TabsContent value="alertas" className="space-y-6 mt-6">
            {/* Rendimiento */}
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <IconAlertTriangle className="w-4 h-4 text-red-400" />
                Rendimiento
              </h3>
              {ALERTAS_RENDIMIENTO.map((grupo) => (
                <Collapsible key={grupo.grupo} defaultOpen className="mb-4">
                  <CollapsibleTrigger className="text-sm font-medium text-[#7F77DD] hover:text-[#7F77DD]/80">
                    {grupo.grupo}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 mt-2">
                    {grupo.alertas.map((alerta) => (
                      <AlertCard key={alerta.subtipo} alerta={alerta} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>

            {/* Presupuesto */}
            <div className="border-t border-white/10 pt-6">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <IconCoin className="w-4 h-4 text-yellow-400" />
                Presupuesto
              </h3>
              {ALERTAS_PRESUPUESTO.map((grupo) => (
                <Collapsible key={grupo.grupo} defaultOpen className="mb-4">
                  <CollapsibleTrigger className="text-sm font-medium text-[#7F77DD] hover:text-[#7F77DD]/80">
                    {grupo.grupo}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 mt-2">
                    {grupo.alertas.map((alerta) => (
                      <AlertCard key={alerta.subtipo} alerta={alerta} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
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

  return (
    <div className="border border-white/10 rounded-lg p-3 bg-[#0f0f0f]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Toggle pressed={active} onPressedChange={setActive} size="sm" className="data-[state=on]:bg-[#7F77DD]">
              {active ? '✓' : 'O'}
            </Toggle>
            <label className="text-sm font-medium cursor-pointer flex-1">{alerta.label}</label>
          </div>
          {active && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <Select value={plataforma} onValueChange={setPlataforma}>
                <SelectTrigger className="h-8 text-xs bg-[#161616] border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta">Meta</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="ambas">Ambas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={accion} onValueChange={setAccion}>
                <SelectTrigger className="h-8 text-xs bg-[#161616] border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tarea">Tarea</SelectItem>
                  <SelectItem value="notificacion">Notificación</SelectItem>
                  <SelectItem value="ambas">Ambas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
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
