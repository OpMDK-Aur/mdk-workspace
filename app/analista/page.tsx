'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client, AgentLog } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  FileText, 
  ArrowLeft, 
  Send, 
  Check,
  ChevronsUpDown,
  Loader2,
  Sparkles,
  Paperclip,
  X,
  Image as ImageIcon,
  File
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import { MessageContent } from '@/components/chat/message-content'

const MONTHS = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
]

const SUGGESTIONS = [
  'Resumen ejecutivo del mes',
  'Analisis de campanas por plataforma',
  'Recomendaciones de optimizacion',
]

export default function AnalistaPage() {
  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // State
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientOpen, setClientOpen] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1))
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [history, setHistory] = useState<AgentLog[]>([])
  const [isActive, setIsActive] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string; attachments?: Array<{ name: string; url: string; type: string }> }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [attachments, setAttachments] = useState<Array<{ file: File; preview?: string }>>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)

  // Fetch clients
  useEffect(() => {
    async function fetchClients() {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre_del_negocio')
        .eq('activo', true)
        .order('nombre_del_negocio')
      if (data) setClients(data as Client[])
    }
    fetchClients()
  }, [supabase])

  // Fetch history
  useEffect(() => {
    async function fetchHistory() {
      const { data } = await supabase
        .from('agentes_log')
        .select('*')
        .eq('agente', 'analista')
        .order('ejecutado_en', { ascending: false })
        .limit(5)
      if (data) setHistory(data)
    }
    fetchHistory()
  }, [supabase])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleStartAnalysis = () => {
    if (!selectedClient) {
      toast.error('Selecciona un cliente primero')
      return
    }
    setIsActive(true)
    setChatMessages([])
    setAttachments([])
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    const newAttachments = files.map(file => {
      const preview = file.type.startsWith('image/') 
        ? URL.createObjectURL(file) 
        : undefined
      return { file, preview }
    })
    
    setAttachments(prev => [...prev, ...newAttachments])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => {
      const newAttachments = [...prev]
      if (newAttachments[index].preview) {
        URL.revokeObjectURL(newAttachments[index].preview!)
      }
      newAttachments.splice(index, 1)
      return newAttachments
    })
  }

  const uploadAttachments = async (): Promise<Array<{ name: string; url: string; type: string }>> => {
    if (attachments.length === 0) return []
    
    setUploadingFiles(true)
    const uploadedFiles: Array<{ name: string; url: string; type: string }> = []
    
    try {
      for (const attachment of attachments) {
        const formData = new FormData()
        formData.append('file', attachment.file)
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        
        if (response.ok) {
          const data = await response.json()
          uploadedFiles.push({
            name: attachment.file.name,
            url: data.url,
            type: attachment.file.type,
          })
        }
      }
    } catch (error) {
      console.error('Error uploading files:', error)
      toast.error('Error al subir archivos')
    } finally {
      setUploadingFiles(false)
    }
    
    return uploadedFiles
  }

  const handleSendMessage = async (content: string) => {
    if ((!content?.trim() && attachments.length === 0) || isLoading || !selectedClient) return
    
    // Upload attachments first
    const uploadedFiles = await uploadAttachments()
    
    const userMessage = { 
      id: crypto.randomUUID(), 
      role: 'user' as const, 
      content,
      attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined
    }
    const newMessages = [...chatMessages, userMessage]
    setChatMessages(newMessages)
    setInputValue('')
    setAttachments([])
    setIsLoading(true)
    
    // Build content with attachments description for the API
    let messageContent = content
    if (uploadedFiles.length > 0) {
      const attachmentDesc = uploadedFiles.map(f => `[Archivo adjunto: ${f.name} (${f.type})]`).join('\n')
      messageContent = `${content}\n\n${attachmentDesc}`
    }
    
    try {
      const response = await fetch('/api/agentes/analista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ 
            role: m.role, 
            content: m.attachments 
              ? `${m.content}\n\n${m.attachments.map(a => `[Archivo: ${a.name}]`).join('\n')}`
              : m.content 
          })),
          clientId: selectedClient.id,
          month: parseInt(selectedMonth),
          year: parseInt(selectedYear),
          attachments: uploadedFiles,
        }),
      })
      
      if (!response.ok) {
        throw new Error('Error en la respuesta')
      }
      
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')
      
      const decoder = new TextDecoder()
      let assistantContent = ''
      const assistantId = crypto.randomUUID()
      
      // Add empty assistant message
      setChatMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value, { stream: true })
        // Parse SSE format: data: {"type":"text-delta","delta":"..."}
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6))
              if (json.type === 'text-delta' && json.delta) {
                assistantContent += json.delta
                setChatMessages(prev => 
                  prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m)
                )
              }
            } catch {
              // Skip parse errors
            }
          } else if (line.startsWith('0:')) {
            // Fallback: old format
            try {
              const text = JSON.parse(line.slice(2))
              assistantContent += text
              setChatMessages(prev => 
                prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m)
              )
            } catch {
              // Skip parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error('[v0] Error sending message:', error)
      toast.error('Error al enviar mensaje')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(inputValue)
    }
  }

  const handleSaveAsReport = async () => {
    if (chatMessages.length === 0 || !selectedClient) return
    
    const lastAssistantMessage = chatMessages.filter(m => m.role === 'assistant').pop()
    if (!lastAssistantMessage) return
    
    const messageText = lastAssistantMessage.content

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      // Get tipo_de_tareas for 'Informe'
      const { data: tipoTarea } = await supabase
        .from('tipo_de_tareas')
        .select('id')
        .ilike('nombre', '%informe%')
        .limit(1)
        .single()

      await supabase.from('tareas').insert({
        titulo: `Informe ${selectedClient.nombre_del_negocio} - ${MONTHS[parseInt(selectedMonth) - 1]?.label} ${selectedYear}`,
        descripcion: messageText,
        tipo_id: tipoTarea?.id,
        cliente_ids: [selectedClient.id],
        creado_por: user?.id,
        estado: 'resuelto',
      })

      toast.success('Informe guardado como tarea')
    } catch (error) {
      console.error('Error saving report:', error)
      toast.error('Error al guardar el informe')
    }
  }

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-[280px] border-r bg-card flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-[#EEEDFE]">
              <FileText className="h-5 w-5 text-[#7F77DD]" />
            </div>
            <div>
              <h2 className="font-semibold">Analista</h2>
              <p className="text-xs text-muted-foreground">Informes de cierre</p>
            </div>
          </div>
        </div>

        {/* New Query Section */}
        <div className="p-4 space-y-3 border-b">
          <h3 className="text-sm font-medium text-muted-foreground">Nueva consulta</h3>
          
          {/* Client Combobox */}
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
            <PopoverContent className="w-[240px] p-0">
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

          {/* Month/Year Selects */}
          <div className="flex gap-2">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button 
            className="w-full bg-[#7F77DD] hover:bg-[#6B63C7]"
            onClick={handleStartAnalysis}
            disabled={!selectedClient}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Iniciar analisis
          </Button>
        </div>

        {/* History */}
        <div className="flex-1 p-4 overflow-auto">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Historial</h3>
          <div className="space-y-2">
            {history.map((log) => (
              <button
                key={log.id}
                className="w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors"
                onClick={() => {
                  // Could load the log result here
                }}
              >
                <p className="text-sm font-medium truncate">
                  {log.cliente_id ? 'Cliente' : 'General'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(log.ejecutado_en), "d MMM, HH:mm", { locale: es })}
                </p>
              </button>
            ))}
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin historial</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t">
          <Button variant="ghost" className="w-full justify-start" asChild>
            <a href="/dashboard/agentes">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Agentes
            </a>
          </Button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col">
        {!isActive ? (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="p-4 rounded-2xl bg-[#EEEDFE] mb-6">
              <FileText className="h-12 w-12 text-[#7F77DD]" />
            </div>
            <h2 className="text-xl font-semibold mb-2">
              Selecciona un cliente y periodo para comenzar
            </h2>
            <p className="text-muted-foreground mb-8 text-center max-w-md">
              El Analista te ayudara a generar informes de cierre de mes con metricas detalladas y recomendaciones accionables.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <Badge 
                  key={s} 
                  variant="secondary" 
                  className="cursor-pointer hover:bg-[#7F77DD]/20 transition-colors px-3 py-1.5"
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          /* Active Chat */
          <>
            {/* Header */}
            <div className="p-4 border-b flex items-center gap-3">
              <h2 className="font-semibold">{selectedClient?.nombre_del_negocio}</h2>
              <span className="text-muted-foreground">
                {MONTHS[parseInt(selectedMonth) - 1]?.label} {selectedYear}
              </span>
              {isLoading && (
                <Badge variant="secondary" className="animate-pulse">
                  En curso
                </Badge>
              )}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="max-w-3xl mx-auto space-y-4">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex',
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-4 py-3',
                        message.role === 'user'
                          ? 'bg-[#7F77DD] text-white'
                          : 'bg-muted'
                      )}
                    >
                      {message.role === 'assistant' ? (
                        <MessageContent content={message.content} />
                      ) : (
                        <>
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {message.attachments.map((att, i) => (
                                <div key={i} className="relative">
                                  {att.type.startsWith('image/') ? (
                                    <img 
                                      src={att.url} 
                                      alt={att.name}
                                      className="h-20 w-auto rounded-lg border object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                      onClick={() => window.open(att.url, '_blank')}
                                    />
                                  ) : (
                                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-white/20 text-xs">
                                      <File className="h-3 w-3" />
                                      <span className="max-w-[100px] truncate">{att.name}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t">
              <div className="max-w-3xl mx-auto">
                {/* Attachments Preview */}
                {attachments.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {attachments.map((att, index) => (
                      <div 
                        key={index} 
                        className="relative group flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border"
                      >
                        {att.preview ? (
                          <img 
                            src={att.preview} 
                            alt={att.file.name} 
                            className="h-8 w-8 object-cover rounded"
                          />
                        ) : (
                          <File className="h-5 w-5 text-muted-foreground" />
                        )}
                        <span className="text-sm max-w-[150px] truncate">{att.file.name}</span>
                        <button
                          onClick={() => handleRemoveAttachment(index)}
                          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="relative flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || uploadingFiles}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  
                  <div className="relative flex-1">
                    <Textarea
                      ref={textareaRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Escribe tu mensaje..."
                      className="min-h-[48px] max-h-[200px] pr-12 resize-none"
                      rows={1}
                    />
                    <Button
                      size="icon"
                      className="absolute right-2 bottom-2 h-8 w-8 bg-[#7F77DD] hover:bg-[#6B63C7]"
                      onClick={() => handleSendMessage(inputValue)}
                      disabled={(!inputValue?.trim() && attachments.length === 0) || isLoading || uploadingFiles}
                    >
                      {isLoading || uploadingFiles ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                
                {chatMessages.length > 0 && (
                  <div className="mt-3 flex justify-center">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleSaveAsReport}
                    >
                      Guardar como informe
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
