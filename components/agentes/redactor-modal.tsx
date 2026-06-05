'use client'

import { useState, useEffect } from 'react'
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
import { 
  Check, 
  ChevronsUpDown, 
  Sun, 
  Moon, 
  Copy,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight
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

export function RedactorModal({ open, onOpenChange }: RedactorModalProps) {
  const supabase = createClient()
  
  const [step, setStep] = useState(1)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null)
  const [clientOpen, setClientOpen] = useState(false)
  const [messageType, setMessageType] = useState<MessageType | null>(null)
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)

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
      case 3: return true // Can proceed even without accounts
      case 4: return !!draft
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
        }),
      })

      if (!response.ok) throw new Error('Failed to generate')

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

      // Extract text from stream format (0:"text" format)
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
      
      setStep(4)
    } catch (error) {
      console.error('Error generating draft:', error)
      toast.error('Error al generar el borrador')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyToClipboard = async () => {
    await navigator.clipboard.writeText(draft)
    toast.success('Copiado al portapapeles')
  }

  const handleMarkAsSent = async () => {
    if (!selectedClient) return
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      await supabase.from('tareas').insert({
        titulo: `Mensaje ${messageType === 'inicio' ? 'inicio' : 'cierre'} semana - ${selectedClient.nombre_del_negocio}`,
        descripcion: draft,
        cliente_ids: [selectedClient.id],
        creado_por: user?.id,
        estado: 'resuelto',
      })

      toast.success('Mensaje marcado como enviado')
      onOpenChange(false)
    } catch (error) {
      console.error('Error marking as sent:', error)
      toast.error('Error al guardar')
    }
  }

  const handleNext = () => {
    if (step === 3) {
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

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-4">
          {[1, 2, 3, 4].map((s) => (
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
              {s < 4 && (
                <div
                  className={cn(
                    'w-12 h-0.5 mx-1',
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

          {/* Step 3: Ad Accounts */}
          {step === 3 && (
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

          {/* Step 4: Draft */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-medium">Borrador generado</h3>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#7F77DD] mb-4" />
                  <p className="text-muted-foreground">Generando mensaje...</p>
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
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Marcar como enviado
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {step < 4 && (
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
      </DialogContent>
    </Dialog>
  )
}
