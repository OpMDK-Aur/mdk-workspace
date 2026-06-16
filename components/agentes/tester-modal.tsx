'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client, TesterResultado, MetaForm, TesterItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { 
  Check, 
  ChevronsUpDown, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  Plus,
  Trash2,
  Link2,
  RefreshCw,
  Tag
} from 'lucide-react'
import { toast } from 'sonner'

interface TesterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface TesterFormItem extends MetaForm {
  checked: boolean
}

interface TesterLandingItem {
  nombre: string
  url: string
  checked: boolean
  integracion?: string | null
  webhook_url?: string | null
  whatsapp_numero?: string | null
  webhook_format?: string | null
}

type ItemStatus = 'pendiente' | 'testeando' | 'ok' | 'fallo'

interface ItemWithStatus extends TesterItem {
  status: ItemStatus
}

export function TesterModal({ open, onOpenChange }: TesterModalProps) {
  const supabase = createClient()
  
  const [tab, setTab] = useState<'manual' | 'historial' | 'cron'>('manual')
  const [step, setStep] = useState(1)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientOpen, setClientOpen] = useState(false)
  
  // Manual tab state
  const [metaForms, setMetaForms] = useState<TesterFormItem[]>([])
  const [landings, setLandings] = useState<TesterLandingItem[]>([])
  const [formsLoading, setFormsLoading] = useState(false)
  const [selectedItems, setSelectedItems] = useState<ItemWithStatus[]>([])
  const [testResults, setTestResults] = useState<TesterResultado[]>([])
  const [testing, setTesting] = useState(false)
  
  // Historial state
  const [historialResults, setHistorialResults] = useState<TesterResultado[]>([])
  const [historialLoading, setHistorialLoading] = useState(false)
  const [historialPage, setHistorialPage] = useState(1)
  
  // CRON state
  const [cronEnabled, setCronEnabled] = useState(false)
  const [cronDay, setCronDay] = useState<string>('1')
  const [cronHour, setCronHour] = useState<string>('09')
  const [cronClients, setCronClients] = useState<string[]>([])
  const [cronLoading, setCronLoading] = useState(false)

  // Fetch clients on open
  useEffect(() => {
    async function fetchClients() {
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .eq('activo', true)
        .order('nombre_del_negocio')
      if (data) setClients(data)
    }
    if (open) {
      fetchClients()
      setStep(1)
      setSelectedClient(null)
      setTab('manual')
      loadHistorial()
    }
  }, [open, supabase])

  // Load meta forms when client selected
  useEffect(() => {
    if (selectedClient && tab === 'manual' && step === 1) {
      loadMetaFormsAndLandings()
    }
  }, [selectedClient, tab, step, supabase])

  const loadMetaFormsAndLandings = async () => {
    if (!selectedClient?.id) return
    
    setFormsLoading(true)
    try {
      // Fetch meta forms
      const formsRes = await fetch(`/api/tester/meta-forms?cliente_id=${selectedClient.id}`)
      const formsData = await formsRes.json()
      
      const forms: TesterFormItem[] = (formsData.forms || []).map((f: MetaForm) => ({
        ...f,
        checked: false
      }))
      setMetaForms(forms)

      // Set landings from client data
      const landingItems: TesterLandingItem[] = (selectedClient.landings || []).map((l: any) => ({
        nombre: l.nombre,
        url: l.url,
        checked: false,
        integracion: l.integracion || null,
        webhook_url: l.webhook_url || null,
        whatsapp_numero: l.whatsapp_numero || null,
        webhook_format: l.webhook_format || null,
      }))
      setLandings(landingItems)
    } catch (error) {
      console.error('Error loading meta forms:', error)
      toast.error('Error al cargar formularios Meta')
    } finally {
      setFormsLoading(false)
    }
  }

  const loadHistorial = async () => {
    setHistorialLoading(true)
    try {
      const query = selectedClient?.id 
        ? supabase.from('tester_resultados').select('*').eq('cliente_id', selectedClient.id)
        : supabase.from('tester_resultados').select('*')
      
      const { data } = await query
        .order('ejecutado_en', { ascending: false })
        .range((historialPage - 1) * 10, historialPage * 10 - 1)
      
      setHistorialResults(data || [])
    } catch (error) {
      console.error('Error loading historial:', error)
    } finally {
      setHistorialLoading(false)
    }
  }

  const handleFormToggle = (formId: string) => {
    setMetaForms(metaForms.map(f =>
      f.form_id === formId ? { ...f, checked: !f.checked } : f
    ))
  }

  const handleLandingToggle = (url: string) => {
    setLandings(landings.map(l =>
      l.url === url ? { ...l, checked: !l.checked } : l
    ))
  }

  const handleContinueStep1 = () => {
    const selectedForms = metaForms.filter(f => f.checked).map(f => ({
      tipo: 'meta_form' as const,
      id: f.form_id,
      nombre: f.nombre,
      form_id: f.form_id
    }))

    const selectedLandings = landings.filter(l => l.checked).map(l => ({
      tipo: 'landing' as const,
      id: l.url,
      nombre: l.nombre,
      url: l.url,
      integracion: l.integracion || null,
      webhook_url: l.webhook_url || null,
      whatsapp_numero: l.whatsapp_numero || null,
      webhook_format: l.webhook_format || null,
    }))

    setSelectedItems([
      ...selectedForms.map(item => ({ ...item, status: 'pendiente' as ItemStatus })),
      ...selectedLandings.map(item => ({ ...item, status: 'pendiente' as ItemStatus }))
    ])

    setStep(2)
  }

  const handleExecuteTest = async () => {
    if (!selectedClient?.id || selectedItems.length === 0) return

    console.log('[Tester] Ejecutando test para:', selectedClient.nombre_del_negocio)
    console.log('[Tester] Items:', JSON.stringify(selectedItems))

    setTesting(true)
    try {
      console.log('[Tester] Llamando a /api/tester/run...')
      const response = await fetch('/api/tester/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: selectedClient.id,
          items: selectedItems.map(({ status, ...item }) => item)
        })
      })

      console.log('[Tester] Response status:', response.status)

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[Tester] Error response:', errorData)
        throw new Error(`Test execution failed: ${response.status}`)
      }

      const data = await response.json()
      console.log('[Tester] Response data:', data)
      
      setTestResults(data.resultados || [])
      
      // Update selected items status based on results
      setSelectedItems(prev => 
        prev.map(item => {
          const result = data.resultados.find((r: TesterResultado) => 
            (item.tipo === 'meta_form' && r.form_id === item.id) ||
            (item.tipo === 'landing' && r.landing_url === item.id)
          )
          return {
            ...item,
            status: result?.estado === 'ok' ? 'ok' : result?.estado === 'pendiente' ? 'pendiente' : 'fallo'
          }
        })
      )

      // Si hay resultados pendientes, iniciar polling
      const pendientes = data.resultados.filter((r: TesterResultado) => r.estado === 'pendiente')
      if (pendientes.length > 0) {
        const pollInterval = setInterval(async () => {
          try {
            const { data: updated, error } = await supabase
              .from('tester_resultados')
              .select('*')
              .in('id', pendientes.map((r: TesterResultado) => r.id))

            if (error) {
              console.error('[Tester] polling error:', error)
              return
            }

            if (updated && updated.length > 0) {
              // Actualizar testResults con los nuevos estados
              setTestResults(prev => prev.map(r => {
                const u = updated.find((u: TesterResultado) => u.id === r.id)
                return u ? u : r
              }))

              // Actualizar selectedItems también
              setSelectedItems(prev => prev.map(item => {
                const u = updated.find((u: TesterResultado) => 
                  (item.tipo === 'meta_form' && u.form_id === item.id) ||
                  (item.tipo === 'landing' && u.landing_url === item.id)
                )
                if (u) {
                  return { ...item, status: u.estado === 'ok' ? 'ok' : u.estado === 'fallo' ? 'fallo' : u.estado === 'pendiente' ? 'pendiente' : 'fallo' }
                }
                return item
              }))

              // Detener polling si todos resolvieron
              const allResolved = updated.every((r: TesterResultado) => r.estado !== 'pendiente')
              if (allResolved) {
                console.log('[Tester] todos resueltos, deteniendo polling')
                clearInterval(pollInterval)
              }
            }
          } catch (err) {
            console.error('[Tester] polling exception:', err)
          }
        }, 5000)

        // Limpiar después de 2 minutos máximo
        setTimeout(() => clearInterval(pollInterval), 120000)
      }

      toast.success('Test completado')
    } catch (error) {
      console.error('[Tester] Error ejecutando test:', error)
      toast.error('Error al ejecutar el test')
    } finally {
      setTesting(false)
    }
  }

  const handleGenerateTask = async () => {
    if (!selectedClient?.id) return

    const failedResults = testResults.filter(r => r.estado === 'fallo')
    if (failedResults.length === 0) {
      toast.info('No hay fallos para reportar')
      return
    }

    try {
      const response = await fetch('/api/tester/generar-tarea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: selectedClient.id,
          resultados_fallidos: failedResults.map(r => ({
            nombre: r.nombre,
            tipo: r.tipo,
            detalle: r.detalle
          }))
        })
      })

      if (!response.ok) throw new Error('Failed to generate task')
      
      toast.success('Tarea generada exitosamente')
    } catch (error) {
      console.error('Error generating task:', error)
      toast.error('Error al generar tarea')
    }
  }

  const canSelectItems = () => {
    return (metaForms.some(f => f.checked) || landings.some(l => l.checked))
  }

  const getStatusIcon = (status: ItemStatus) => {
    switch (status) {
      case 'pendiente': return <Clock className="h-4 w-4 text-gray-500" />
      case 'testeando': return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
      case 'ok': return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'fallo': return <AlertCircle className="h-4 w-4 text-red-500" />
      default: return null
    }
  }

  const getStatusBadge = (estado: string) => {
    const statusConfig: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
      ok: { bg: 'bg-green-500/10', text: 'text-green-700', icon: <CheckCircle2 className="h-4 w-4" /> },
      fallo: { bg: 'bg-red-500/10', text: 'text-red-700', icon: <AlertCircle className="h-4 w-4" /> },
      pendiente: { bg: 'bg-gray-500/10', text: 'text-gray-700', icon: <Clock className="h-4 w-4" /> },
      verificacion_manual: { bg: 'bg-yellow-500/10', text: 'text-yellow-700', icon: <Zap className="h-4 w-4" /> }
    }
    const config = statusConfig[estado] || statusConfig.pendiente
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded ${config.bg} ${config.text} text-xs font-medium`}>
        {config.icon}
        {estado.charAt(0).toUpperCase() + estado.slice(1).replace(/_/g, ' ')}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tester - Auditar formularios y landings</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'manual' | 'historial' | 'cron')} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
            <TabsTrigger value="cron">CRON</TabsTrigger>
          </TabsList>

          {/* Manual Tab */}
          <TabsContent value="manual" className="space-y-4 pt-4">
            {step === 1 ? (
              <div className="space-y-4">
                <h3 className="font-medium">Seleccionar cliente y elementos a testear</h3>
                
                {/* Client selector */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Cliente</label>
                  <Popover open={clientOpen} onOpenChange={setClientOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between">
                        {selectedClient?.nombre_del_negocio || 'Seleccionar cliente...'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput placeholder="Buscar cliente..." />
                        <CommandList>
                          <CommandEmpty>No se encontraron clientes</CommandEmpty>
                          <CommandGroup>
                            {clients.map((client) => (
                              <CommandItem
                                key={client.id}
                                onSelect={() => {
                                  setSelectedClient(client)
                                  setClientOpen(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selectedClient?.id === client.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {client.nombre_del_negocio}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Forms and Landings */}
                {selectedClient && (
                  <div className="space-y-4">
                    {formsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-[#7F77DD]" />
                      </div>
                    ) : (
                      <>
                        {/* Meta Forms */}
                        {metaForms.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              <Tag className="h-4 w-4" />
                              Formularios Meta ({metaForms.length})
                            </h4>
                            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-3">
                              {metaForms.map((form) => (
                                <div key={form.form_id} className="flex items-center gap-3">
                                  <Checkbox
                                    checked={form.checked}
                                    onCheckedChange={() => handleFormToggle(form.form_id)}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{form.nombre}</p>
                                    <p className="text-xs text-muted-foreground truncate">{form.campana}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Landings */}
                        {landings.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              <Link2 className="h-4 w-4" />
                              Landings ({landings.length})
                            </h4>
                            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-3">
                              {landings.map((landing) => (
                                <div key={landing.url} className="flex items-center gap-3">
                                  <Checkbox
                                    checked={landing.checked}
                                    onCheckedChange={() => handleLandingToggle(landing.url)}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{landing.nombre}</p>
                                    <p className="text-xs text-muted-foreground truncate">{landing.url}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {metaForms.length === 0 && landings.length === 0 && (
                          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <p className="text-sm text-amber-700">No se encontraron formularios activos ni landings cargadas</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="font-medium">Estado de los tests</h3>
                
                {selectedItems.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-3">
                    {selectedItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.tipo === 'meta_form' ? 'Formulario Meta' : 'Landing'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {testResults.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Resultados:</h4>
                    {testResults.map((result, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded border">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{result.nombre}</p>
                          <p className="text-xs text-muted-foreground">{result.detalle}</p>
                        </div>
                        {getStatusBadge(result.estado)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-between pt-4 border-t">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Volver
                </Button>
              )}
              {step === 1 ? (
                <Button
                  onClick={handleContinueStep1}
                  disabled={!canSelectItems()}
                  className="bg-[#7F77DD] hover:bg-[#6B63C7] ml-auto"
                >
                  Continuar
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <div className="flex gap-2 ml-auto">
                  {testResults.length > 0 && testResults.some(r => r.estado === 'fallo') && (
                    <Button
                      onClick={handleGenerateTask}
                      variant="outline"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Generar tarea
                    </Button>
                  )}
                  <Button
                    onClick={handleExecuteTest}
                    disabled={testing || selectedItems.length === 0}
                    className="bg-[#7F77DD] hover:bg-[#6B63C7]"
                  >
                    {testing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Ejecutando...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-1" />
                        Ejecutar test
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Historial Tab */}
          <TabsContent value="historial" className="space-y-4 pt-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Resultados de tests anteriores</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadHistorial}
                  disabled={historialLoading}
                >
                  <RefreshCw className={cn("h-4 w-4", historialLoading && "animate-spin")} />
                </Button>
              </div>

              {historialLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#7F77DD]" />
                </div>
              ) : (
                <>
                  {historialResults.length > 0 ? (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {historialResults.map((result) => (
                        <div key={result.id} className="p-3 rounded border space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{result.nombre}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(result.ejecutado_en).toLocaleString('es-AR')}
                              </p>
                            </div>
                            {getStatusBadge(result.estado)}
                          </div>
                          {result.detalle && (
                            <p className="text-xs text-muted-foreground">{result.detalle}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No hay resultados disponibles
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* CRON Tab */}
          <TabsContent value="cron" className="space-y-4 pt-4">
            <div className="space-y-4">
              <h3 className="font-medium">Configurar ejecución automática</h3>
              
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={cronEnabled}
                  onCheckedChange={setCronEnabled}
                />
                <label className="text-sm font-medium">Activar pruebas automáticas</label>
              </div>

              {cronEnabled && (
                <div className="space-y-4 p-4 rounded border bg-muted/30">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Día de semana</label>
                      <select
                        value={cronDay}
                        onChange={(e) => setCronDay(e.target.value)}
                        className="w-full px-3 py-2 rounded border text-sm"
                      >
                        {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((day, idx) => (
                          <option key={idx} value={String(idx + 1)}>{day}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">Hora</label>
                      <select
                        value={cronHour}
                        onChange={(e) => setCronHour(e.target.value)}
                        className="w-full px-3 py-2 rounded border text-sm"
                      >
                        {Array.from({ length: 24 }).map((_, i) => (
                          <option key={i} value={String(i).padStart(2, '0')}>
                            {String(i).padStart(2, '0')}:00
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Clientes a incluir</label>
                    <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2 bg-white">
                      {clients
                        .filter(c => c.meta_ads_account_id)
                        .map((client) => (
                          <div key={client.id} className="flex items-center gap-2">
                            <Checkbox
                              checked={cronClients.includes(client.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setCronClients([...cronClients, client.id])
                                } else {
                                  setCronClients(cronClients.filter(id => id !== client.id))
                                }
                              }}
                            />
                            <label className="text-sm cursor-pointer">{client.nombre_del_negocio}</label>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cerrar
              </Button>
              <Button
                className="bg-[#7F77DD] hover:bg-[#6B63C7]"
                disabled={cronLoading}
              >
                {cronLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar configuración'
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
