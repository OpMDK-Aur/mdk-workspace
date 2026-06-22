'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
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
import { Input } from '@/components/ui/input'
import { 
  Check, 
  ChevronsUpDown, 
  Sun, 
  Moon, 
  Copy,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ArrowRight,
  PartyPopper
} from 'lucide-react'
import { toast } from 'sonner'

interface RedactorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type MessageType = 'inicio' | 'cierre'

interface AdAccount {
  id: string
  platform: 'meta' | 'google'
  label: string
}

interface ClientOption {
  id: string
  nombre_del_negocio: string
  meta_ads_account_id: string | null
  google_ads_customer_id: string | null
  meta_ads_account_ids: string[] | null
  google_ads_customer_ids: string[] | null
}

// Helper to get last week's Monday and Sunday
function getLastWeekDates() {
  const today = new Date()
  const dayOfWeek = today.getDay()
  
  // Calculate last Monday (if today is Monday, go back 7 days)
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const lastMonday = new Date(today)
  lastMonday.setDate(today.getDate() - daysToLastMonday - 7)
  
  // Last Sunday is 6 days after last Monday
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  
  return {
    start: lastMonday.toISOString().split('T')[0],
    end: lastSunday.toISOString().split('T')[0]
  }
}

// Helper to format date for display
function formatDateDisplay(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export function RedactorModal({ open, onOpenChange }: RedactorModalProps) {
  const supabase = createClient()
  const router = useRouter()
  
  const [step, setStep] = useState(1)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null)
  const [clientOpen, setClientOpen] = useState(false)
  const [messageType, setMessageType] = useState<MessageType | null>(null)
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Period selection state
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  
  // Task selection state for marking as sent
  const [showTaskSelector, setShowTaskSelector] = useState(false)
  const [clientTasks, setClientTasks] = useState<Array<{ id: string; titulo: string }>>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [loadingTasks, setLoadingTasks] = useState(false)

  // Success state after marking as sent
  const [success, setSuccess] = useState<{ taskId: string; taskTitle: string } | null>(null)

  // Fetch clients
  useEffect(() => {
    async function fetchClients() {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre_del_negocio, meta_ads_account_id, google_ads_customer_id, meta_ads_account_ids, google_ads_customer_ids')
        .eq('activo', true)
        .order('nombre_del_negocio')
      if (data) setClients(data as ClientOption[])
    }
    if (open) {
      fetchClients()
      // Reset state when opening
      setStep(1)
      setSelectedClient(null)
      setMessageType(null)
      setSelectedAccounts([])
      setDraft('')
      setSuccess(null)
      setShowTaskSelector(false)
      // Set default period to last week
      const lastWeek = getLastWeekDates()
      setPeriodStart(lastWeek.start)
      setPeriodEnd(lastWeek.end)
    }
  }, [open, supabase])

  // Update ad accounts when client changes
  useEffect(() => {
    if (!selectedClient) {
      setAdAccounts([])
      return
    }

    const accounts: AdAccount[] = []
    
    // Check plural fields first, then singular as fallback
    const metaIds = selectedClient.meta_ads_account_ids?.length 
      ? selectedClient.meta_ads_account_ids 
      : selectedClient.meta_ads_account_id 
        ? [selectedClient.meta_ads_account_id]
        : []
    
    const googleIds = selectedClient.google_ads_customer_ids?.length
      ? selectedClient.google_ads_customer_ids
      : selectedClient.google_ads_customer_id
        ? [selectedClient.google_ads_customer_id]
        : []
    
    metaIds.forEach((id: string) => {
      accounts.push({ id, platform: 'meta', label: `Meta Ads · ${id}` })
    })
    
    googleIds.forEach((id: string) => {
      accounts.push({ id, platform: 'google', label: `Google Ads · ${id}` })
    })

    setAdAccounts(accounts)
    setSelectedAccounts(accounts.map(a => a.id)) // Select all by default
  }, [selectedClient])

  const canProceed = () => {
    switch (step) {
      case 1: return !!selectedClient
      case 2: return !!messageType
      case 3: return !!periodStart && !!periodEnd
      case 4: return true // Can proceed even without accounts
      case 5: return !!draft
      default: return false
    }
  }

  const handleGenerateDraft = async () => {
    if (!selectedClient || !messageType) return
    
    setLoading(true)
    try {
      const response = await fetch('/api/agentes/redactor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient.id,
          tipo: messageType,
          cuentas: selectedAccounts,
          periodo: {
            start: periodStart,
            end: periodEnd
          }
        }),
      })

      if (response.status === 401) {
        toast.error('Tu sesión expiró. Recargá la página e iniciá sesión de nuevo.')
        throw new Error('Unauthorized')
      }
      
      if (!response.ok) {
        try {
          const errorData = await response.json()
          console.error('[redactor-modal] Server error:', errorData)
          throw new Error(errorData.error || `Server error: ${response.status}`)
        } catch (e) {
          console.error('[redactor-modal] Response not ok:', response.status)
          throw new Error(`Server error: ${response.status}`)
        }
      }

      // Read the stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let result = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          result += decoder.decode(value)
        }
      }

      // Parse SSE format: data: {"type":"text-delta","delta":"..."}
      const lines = result.split('\n')
      let fullText = ''
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6))
            if (json.type === 'text-delta' && json.delta) {
              fullText += json.delta
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
      
      if (fullText) {
        setDraft(fullText)
      } else {
        // Fallback: try old format or use raw result
        const textMatch = result.match(/0:"([^"]*)"/g)
        if (textMatch) {
          const cleanText = textMatch
            .map(m => m.slice(3, -1))
            .join('')
            .replace(/\\n/g, '\n')
          setDraft(cleanText)
        } else {
          setDraft(result)
        }
      }
      
      setStep(5)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[redactor-modal] Error generating draft:', errorMsg, error)
      toast.error(`Error: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyToClipboard = async () => {
    await navigator.clipboard.writeText(draft)
    toast.success('Copiado al portapapeles')
  }

  // Register the sent message as a comment on the task so it stays on record
  const logMessageToTask = async (taskId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let autorNombre = 'Redactor'
      if (user?.id) {
        const { data: colaborador } = await supabase
          .from('colaboradores')
          .select('nombre')
          .eq('id', user.id)
          .single()
        if (colaborador?.nombre) autorNombre = colaborador.nombre
      }
      const tipoLabel = messageType === 'inicio' ? 'inicio de semana' : 'cierre de semana'
      await supabase.from('comentarios_tareas').insert({
        id: crypto.randomUUID(),
        tarea_id: taskId,
        contenido: `Mensaje de ${tipoLabel} enviado por WhatsApp:\n\n${draft}`,
        autor_id: user?.id ?? null,
        autor_nombre: autorNombre,
        es_sistema: false,
      })
    } catch (error) {
      console.error('[v0] Error logging message to task:', error)
    }
  }

  // Complete a task: mark resolved, log the message, and show success screen
  const completeTask = async (taskId: string, taskTitle: string) => {
    await supabase
      .from('tareas')
      .update({ estado: 'resuelto', fecha_completada: new Date().toISOString() })
      .eq('id', taskId)
    await logMessageToTask(taskId)
    setSuccess({ taskId, taskTitle })
  }

  const handleMarkAsSent = async () => {
    if (!selectedClient) return
    
    setLoadingTasks(true)
    try {
      // Get today's date
      const today = new Date().toISOString().split('T')[0]
      
      // First, try to find a [Hito] task for this client today
      const { data: hitoTasks } = await supabase
        .from('tareas')
        .select('id, titulo')
        .or(`cliente_id.eq.${selectedClient.id},cliente_ids.cs.{${selectedClient.id}}`)
        .ilike('titulo', '%[Hito]%Seguimiento%')
        .in('estado', ['pendiente', 'en_progreso', 'todo'])
        .gte('created_at', today)
        .limit(5)

      if (hitoTasks && hitoTasks.length === 1) {
        // Found exactly one matching Hito task - mark it as completed
        await completeTask(hitoTasks[0].id, hitoTasks[0].titulo)
        return
      }

      // If no Hito task found or multiple found, get all pending tasks for this client
      const { data: allTasks } = await supabase
        .from('tareas')
        .select('id, titulo')
        .or(`cliente_id.eq.${selectedClient.id},cliente_ids.cs.{${selectedClient.id}}`)
        .in('estado', ['pendiente', 'en_progreso', 'todo'])
        .order('created_at', { ascending: false })
        .limit(20)

      if (allTasks && allTasks.length > 0) {
        // Show task selector
        setClientTasks(allTasks)
        setShowTaskSelector(true)
      } else {
        // No pending tasks found - create a new one
        const { data: { user } } = await supabase.auth.getUser()
        const nuevoTitulo = `[Hito] Mensaje ${messageType === 'inicio' ? 'inicio' : 'cierre'} semana - ${selectedClient.nombre_del_negocio}`
        const { data: nuevaTarea } = await supabase.from('tareas').insert({
          titulo: nuevoTitulo,
          descripcion: draft,
          cliente_ids: [selectedClient.id],
          creado_por: user?.id,
          estado: 'resuelto',
          fecha_completada: new Date().toISOString(),
        }).select('id').single()

        if (nuevaTarea?.id) {
          await logMessageToTask(nuevaTarea.id)
          setSuccess({ taskId: nuevaTarea.id, taskTitle: nuevoTitulo })
        } else {
          toast.success('Mensaje marcado como enviado (nueva tarea creada)')
          onOpenChange(false)
        }
      }
    } catch (error) {
      console.error('Error marking as sent:', error)
      toast.error('Error al buscar tareas')
    } finally {
      setLoadingTasks(false)
    }
  }

  const handleSelectTask = async (taskId: string) => {
    try {
      const task = clientTasks.find(t => t.id === taskId)
      await completeTask(taskId, task?.titulo || 'Tarea')
      setShowTaskSelector(false)
    } catch (error) {
      console.error('Error updating task:', error)
      toast.error('Error al marcar la tarea')
    }
  }

  const goToTask = () => {
    if (!success) return
    onOpenChange(false)
    router.push(`/dashboard/tasks?task=${success.taskId}`)
  }

  const handleNext = () => {
    if (step === 4) {
      handleGenerateDraft()
    } else {
      setStep(step + 1)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Redactor de mensajes</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center text-center py-8 px-4">
            {/* Animated success check */}
            <div className="relative mb-6">
              <span className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
              <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-green-500/15 animate-in zoom-in-50 duration-500">
                <CheckCircle2 className="w-11 h-11 text-green-600 animate-in zoom-in-75 duration-700" />
              </div>
            </div>
            <h3 className="text-lg font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <PartyPopper className="w-5 h-5 text-[#7F77DD]" />
              Tarea realizada
            </h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-700">
              El mensaje fue registrado en la tarea{' '}
              <span className="font-medium text-foreground">{success.taskTitle}</span> y quedó marcada como realizada.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 w-full mt-8 animate-in fade-in slide-in-from-bottom-2 duration-1000">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cerrar
              </Button>
              <Button
                className="flex-1 gap-2 bg-[#7F77DD] hover:bg-[#6B63C7]"
                onClick={goToTask}
              >
                Ir a la tarea
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
        <>
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-4">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  step >= s
                    ? 'bg-[#7F77DD] text-white'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {s}
              </div>
              {s < 5 && (
                <div
                  className={cn(
                    'w-8 h-0.5 mx-1',
                    step > s ? 'bg-[#7F77DD]' : 'bg-muted'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[200px]">
          {/* Step 1: Client Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium">Selecciona el cliente</h3>
              <Popover open={clientOpen} onOpenChange={setClientOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                  >
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
          )}

          {/* Step 2: Message Type */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium">Tipo de mensaje</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setMessageType('inicio')}
                  className={cn(
                    'p-4 rounded-xl border-2 transition-all text-center',
                    messageType === 'inicio'
                      ? 'border-[#7F77DD] bg-[#7F77DD]/10'
                      : 'border-border hover:border-[#7F77DD]/50'
                  )}
                >
                  <Sun className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                  <p className="font-medium">Inicio de semana</p>
                </button>
                <button
                  onClick={() => setMessageType('cierre')}
                  className={cn(
                    'p-4 rounded-xl border-2 transition-all text-center',
                    messageType === 'cierre'
                      ? 'border-[#7F77DD] bg-[#7F77DD]/10'
                      : 'border-border hover:border-[#7F77DD]/50'
                  )}
                >
                  <Moon className="h-8 w-8 mx-auto mb-2 text-indigo-400" />
                  <p className="font-medium">Cierre de semana</p>
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Period Selection */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium">Periodo de metricas</h3>
              <p className="text-sm text-muted-foreground">
                Selecciona el rango de fechas para obtener las metricas publicitarias.
              </p>
              
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Desde</Label>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Hasta</Label>
                    <Input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Por defecto: ultima semana ({formatDateDisplay(periodStart)} - {formatDateDisplay(periodEnd)})
              </p>
            </div>
          )}

          {/* Step 4: Ad Accounts */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-medium">Cuentas publicitarias</h3>
              {adAccounts.length === 0 ? (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Este cliente no tiene cuentas publicitarias configuradas.
                    Puedes continuar de todas formas.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {adAccounts.map((account) => (
                    <label
                      key={account.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedAccounts.includes(account.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAccounts([...selectedAccounts, account.id])
                          } else {
                            setSelectedAccounts(selectedAccounts.filter(id => id !== account.id))
                          }
                        }}
                      />
                      <span className="text-sm">{account.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Draft */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-medium">Borrador generado</h3>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#7F77DD] mb-4" />
                  <p className="text-muted-foreground">Generando mensaje...</p>
                </div>
              ) : showTaskSelector ? (
                // Task selector view
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-sm text-amber-200">
                      No se encontro una tarea de Hito especifica. Selecciona la tarea que deseas marcar como realizada:
                    </p>
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {clientTasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => handleSelectTask(task.id)}
                        className={cn(
                          'w-full p-3 rounded-lg border text-left transition-all hover:border-[#7F77DD]/50',
                          selectedTaskId === task.id
                            ? 'border-[#7F77DD] bg-[#7F77DD]/10'
                            : 'border-border'
                        )}
                      >
                        <p className="text-sm font-medium truncate">{task.titulo}</p>
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowTaskSelector(false)}
                  >
                    Volver al borrador
                  </Button>
                </div>
              ) : (
                <>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-h-[200px]"
                    placeholder="Borrador del mensaje..."
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={handleCopyToClipboard}
                    >
                      <Copy className="h-4 w-4" />
                      Copiar para WhatsApp
                    </Button>
                    <Button
                      className="flex-1 gap-2 bg-[#7F77DD] hover:bg-[#6B63C7]"
                      onClick={handleMarkAsSent}
                      disabled={loadingTasks}
                    >
                      {loadingTasks ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Marcar como enviado
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {step < 5 && (
          <div className="flex justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="bg-[#7F77DD] hover:bg-[#6B63C7]"
            >
              {step === 3 ? (
                loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Generando...
                  </>
                ) : (
                  'Generar borrador'
                )
              ) : (
                <>
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        )}
        </>
        )}
      </DialogContent>
    </Dialog>
  )
}
