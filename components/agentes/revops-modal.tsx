'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  Save,
  Database
} from 'lucide-react'
import { toast } from 'sonner'

interface RevOpsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ChecklistItem {
  tarea: string
  realiza: boolean
  nota: string
}

export function RevOpsModal({ open, onOpenChange }: RevOpsModalProps) {
  const supabase = createClient()
  
  const [step, setStep] = useState(1)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientOpen, setClientOpen] = useState(false)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch clients
  useEffect(() => {
    async function fetchClients() {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre_del_negocio, crm_tipo, crm_url')
        .eq('activo', true)
        .order('nombre_del_negocio')
      if (data) setClients(data as Client[])
    }
    if (open) {
      fetchClients()
      // Reset state when opening
      setStep(1)
      setSelectedClient(null)
      setChecklist([])
    }
  }, [open, supabase])

  const canProceed = () => {
    switch (step) {
      case 1: return !!selectedClient
      case 2: return true // Can proceed even without CRM
      case 3: return checklist.length > 0
      default: return false
    }
  }

  const handleAnalyze = async () => {
    if (!selectedClient) return
    
    setLoading(true)
    setStep(3)
    
    try {
      const response = await fetch('/api/agentes/revops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient.id,
        }),
      })

      if (!response.ok) throw new Error('Failed to analyze')

      const data = await response.json()
      setChecklist(data.items || [])
    } catch (error) {
      console.error('Error analyzing CRM:', error)
      toast.error('Error al analizar el CRM')
      // Set default checklist on error
      setChecklist([
        { tarea: 'Registro de leads en el CRM', realiza: false, nota: 'No se pudo determinar' },
        { tarea: 'Seguimiento de oportunidades', realiza: false, nota: 'No se pudo determinar' },
        { tarea: 'Actualizacion de estados', realiza: false, nota: 'No se pudo determinar' },
        { tarea: 'Documentacion de interacciones', realiza: false, nota: 'No se pudo determinar' },
        { tarea: 'Uso de automatizaciones', realiza: false, nota: 'No se pudo determinar' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = (index: number) => {
    const newChecklist = [...checklist]
    newChecklist[index].realiza = !newChecklist[index].realiza
    setChecklist(newChecklist)
  }

  const handleSaveChecklist = async () => {
    if (!selectedClient) return
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      // Format checklist as text
      const checklistText = checklist
        .map(item => `${item.realiza ? '[x]' : '[ ]'} ${item.tarea}${item.nota ? ` - ${item.nota}` : ''}`)
        .join('\n')

      const currentMonth = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

      await supabase.from('tareas').insert({
        titulo: `RevOps - ${selectedClient.nombre_del_negocio} - ${currentMonth}`,
        descripcion: `## Checklist de uso del CRM\n\n${checklistText}`,
        cliente_ids: [selectedClient.id],
        creado_por: user?.id,
        estado: 'resuelto',
      })

      toast.success('Checklist guardado como tarea')
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving checklist:', error)
      toast.error('Error al guardar')
    }
  }

  const handleNext = () => {
    if (step === 2) {
      handleAnalyze()
    } else {
      setStep(step + 1)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Revision de uso del CRM</DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-4">
          {[1, 2, 3].map((s) => (
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
              {s < 3 && (
                <div
                  className={cn(
                    'w-16 h-0.5 mx-1',
                    step > s ? 'bg-[#7F77DD]' : 'bg-muted'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[250px]">
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

          {/* Step 2: CRM Info */}
          {step === 2 && selectedClient && (
            <div className="space-y-4">
              <h3 className="font-medium">Informacion del CRM</h3>
              
              <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Tipo de CRM</p>
                    <p className="font-medium">
                      {selectedClient.crm_tipo || 'No configurado'}
                    </p>
                  </div>
                </div>
                
                {selectedClient.crm_url && (
                  <div>
                    <p className="text-sm text-muted-foreground">URL</p>
                    <a 
                      href={selectedClient.crm_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[#7F77DD] hover:underline text-sm"
                    >
                      {selectedClient.crm_url}
                    </a>
                  </div>
                )}
              </div>

              {!selectedClient.crm_tipo && !selectedClient.crm_url && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Este cliente no tiene un CRM configurado. 
                    El analisis se basara en el historial del cliente.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Checklist */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium">Checklist de uso del CRM</h3>
              
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#7F77DD] mb-4" />
                  <p className="text-muted-foreground">Analizando proceso comercial...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {checklist.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggleItem(index)}
                      >
                        <Checkbox
                          checked={item.realiza}
                          onCheckedChange={() => toggleItem(index)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.tarea}</p>
                          {item.nota && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {item.nota}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    className="w-full gap-2 bg-[#7F77DD] hover:bg-[#6B63C7]"
                    onClick={handleSaveChecklist}
                  >
                    <Save className="h-4 w-4" />
                    Guardar checklist como tarea
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {step < 3 && (
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
              {step === 2 ? (
                loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Analizando...
                  </>
                ) : (
                  'Analizar uso del CRM'
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
      </DialogContent>
    </Dialog>
  )
}
