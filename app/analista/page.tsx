'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/lib/types'
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
  File,
  Plus,
  MessageSquare,
  Trash2,
  ListTodo,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { MessageContent, type Artifact } from '@/components/chat/message-content'
import { CopyButton } from '@/components/chat/copy-button'
import { ArtifactPanel } from '@/components/chat/artifact-panel'
import {
  listConversaciones,
  createConversacion,
  loadMensajes,
  saveMensaje,
  renameConversacion,
  deleteConversacion,
  type AnalistaConversacion,
} from '@/lib/analista/conversaciones'


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

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: Array<{ name: string; url: string; type: string }>
}

export default function AnalistaPage() {
  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // State
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientOpen, setClientOpen] = useState(false)
  const [cuentasDisponibles, setCuentasDisponibles] = useState<
    Array<{ id: string; plataforma: string; id_cuenta: string; nombre_cuenta: string | null }>
  >([])
  const [selectedCuentaIds, setSelectedCuentaIds] = useState<string[]>([])
  const [loadingCuentas, setLoadingCuentas] = useState(false)
  const [dateStart, setDateStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateEnd, setDateEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1))
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [isActive, setIsActive] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [attachments, setAttachments] = useState<Array<{ file: File; preview?: string }>>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)

  // Conversations (persisted, reopenable, auto-renamed)
  const [conversaciones, setConversaciones] = useState<AnalistaConversacion[]>([])
  const [currentConvId, setCurrentConvId] = useState<string | null>(null)
  const [titleGenerated, setTitleGenerated] = useState(false)

  // Artifact preview panel
  const [artifact, setArtifact] = useState<Artifact | null>(null)

  // Sidebar collapse
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Fetch clients
  useEffect(() => {
    async function fetchClients() {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre_del_negocio, plan, crm_type, ghl_location_id')
        .eq('activo', true)
        .order('nombre_del_negocio')
      if (data) setClients(data as Client[])
    }
    fetchClients()
  }, [supabase])

  // Fetch saved conversations
  const refreshConversaciones = useCallback(async () => {
    const data = await listConversaciones()
    setConversaciones(data)
  }, [])

  useEffect(() => {
    refreshConversaciones()
  }, [refreshConversaciones])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const clientNameById = useCallback(
    (id: string | null) => clients.find((c) => c.id === id)?.nombre_del_negocio,
    [clients],
  )

  const fetchCuentasCliente = async (clientId: string) => {
    setLoadingCuentas(true)
    setCuentasDisponibles([])
    setSelectedCuentaIds([])
    try {
      const res = await fetch(`/api/agentes/analista/cuentas?clientId=${clientId}`)
      if (!res.ok) throw new Error('Error al obtener cuentas')
      const data = await res.json()
      const cuentas = data.cuentas || []
      setCuentasDisponibles(cuentas)
      // Por defecto, todas seleccionadas (mismo comportamiento que antes de tener el selector)
      setSelectedCuentaIds(cuentas.map((c: { id_cuenta: string }) => c.id_cuenta))
    } catch (error) {
      console.error('[v0] Error fetching cuentas publicitarias:', error)
      toast.error('No se pudieron cargar las cuentas publicitarias del cliente')
    } finally {
      setLoadingCuentas(false)
    }
  }

  const toggleCuenta = (idCuenta: string) => {
    setSelectedCuentaIds((prev) =>
      prev.includes(idCuenta) ? prev.filter((id) => id !== idCuenta) : [...prev, idCuenta]
    )
  }

  const handleStartAnalysis = async () => {
    if (!selectedClient) {
      toast.error('Selecciona un cliente primero')
      return
    }

    // Extract month/year from dateStart for backward compatibility
    const startDate = new Date(dateStart)
    const calcMonth = startDate.getMonth() + 1
    const calcYear = startDate.getFullYear()

    const dateRangeLabel = `${format(new Date(dateStart), 'd MMM', { locale: es })} - ${format(new Date(dateEnd), 'd MMM yyyy', { locale: es })}`

    const conv = await createConversacion({
      clienteId: selectedClient.id,
      titulo: `${selectedClient.nombre_del_negocio} - ${dateRangeLabel}`,
      mes: calcMonth,
      anio: calcYear,
    })

    setCurrentConvId(conv?.id ?? null)
    setTitleGenerated(false)
    setIsActive(true)
    setArtifact(null)
    setAttachments([])

    // Pedido inicial real: el account manager necesita ver TODA la info del
    // período de entrada (no un saludo genérico) para poder confirmarla,
    // corregirla o completarla antes de generar el PDF.
    const kickoffPrompt = `Traé el informe completo de performance del período (${dateRangeLabel}). Antes de redactarlo, revisá qué información te falta según la plantilla del plan y preguntámela primero.`

    const kickoffMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: kickoffPrompt,
    }
    setChatMessages([kickoffMessage])
    if (conv?.id) {
      saveMensaje({ conversacionId: conv.id, rol: 'user', contenido: kickoffPrompt })
      refreshConversaciones()
    }

    await streamAssistantReply([kickoffMessage], conv?.id ?? null)
  }

  // New empty conversation (keeps client/period selection)
  const handleNewChat = () => {
    setIsActive(false)
    setChatMessages([])
    setCurrentConvId(null)
    setArtifact(null)
    setInputValue('')
    setAttachments([])
  }

  // Open an existing conversation
  const handleOpenConversacion = async (conv: AnalistaConversacion) => {
    const client = clients.find((c) => c.id === conv.cliente_id) || null
    setSelectedClient(client)
    if (conv.periodo_mes) setSelectedMonth(String(conv.periodo_mes))
    if (conv.periodo_anio) setSelectedYear(String(conv.periodo_anio))

    const mensajes = await loadMensajes(conv.id)
    setChatMessages(
      mensajes.map((m) => ({ id: m.id, role: m.rol, content: m.contenido })),
    )
    setCurrentConvId(conv.id)
    setTitleGenerated(true)
    setArtifact(null)
    setIsActive(true)
  }

  const handleDeleteConversacion = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation()
    await deleteConversacion(convId)
    if (convId === currentConvId) handleNewChat()
    refreshConversaciones()
    toast.success('Conversación eliminada')
  }

  // Auto-generate a title from the first exchange (Claude-style)
  const maybeGenerateTitle = async (convId: string, userMsg: string, assistantMsg: string) => {
    if (titleGenerated) return
    setTitleGenerated(true)
    try {
      const res = await fetch('/api/agentes/analista/titulo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: userMsg, assistantMessage: assistantMsg }),
      })
      if (res.ok) {
        const { titulo } = await res.json()
        if (titulo) {
          await renameConversacion(convId, titulo)
          refreshConversaciones()
        }
      }
    } catch (e) {
      console.error('[v0] title generation failed:', e)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const newAttachments = files.map((file) => {
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      return { file, preview }
    })

    setAttachments((prev) => [...prev, ...newAttachments])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => {
      const newAttachments = [...prev]
      if (newAttachments[index].preview) {
        URL.revokeObjectURL(newAttachments[index].preview!)
      }
      newAttachments.splice(index, 1)
      return newAttachments
    })
  }

  const uploadAttachments = async (
    explicitFiles?: Array<{ file: File }>
  ): Promise<Array<{ name: string; url: string; type: string }>> => {
    const source = explicitFiles ?? attachments
    if (source.length === 0) return []

    setUploadingFiles(true)
    const uploadedFiles: Array<{ name: string; url: string; type: string }> = []

    try {
      for (const attachment of source) {
        const formData = new FormData()
        formData.append('file', attachment.file)

        const response = await fetch('/api/upload', { method: 'POST', body: formData })

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

  // Lógica de streaming compartida: la usan tanto el kickoff automático
  // (handleStartAnalysis) como el envío manual de mensajes (handleSendMessage).
  const streamAssistantReply = async (apiMessages: ChatMessage[], convId: string | null) => {
    setIsLoading(true)
    try {
      const startDate = new Date(dateStart)
      const apiMonth = startDate.getMonth() + 1
      const apiYear = startDate.getFullYear()

      const response = await fetch('/api/agentes/analista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages.map((m) => ({
            role: m.role,
            content: m.attachments
              ? `${m.content}\n\n${m.attachments.map((a) => `[Archivo: ${a.name}]`).join('\n')}`
              : m.content,
          })),
          clientId: selectedClient?.id,
          month: apiMonth,
          year: apiYear,
          periodo: {
            start: dateStart,
            end: dateEnd,
          },
          cuentas: selectedCuentaIds,
          attachments: apiMessages[apiMessages.length - 1]?.attachments ?? [],
        }),
      })

      if (!response.ok) throw new Error('Error en la respuesta')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let assistantContent = ''
      let buffer = ''
      let streamError = ''
      const assistantId = crypto.randomUUID()

      setChatMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue

          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') continue

          try {
            const json = JSON.parse(data)
            if (json.type === 'text-delta' && typeof json.delta === 'string') {
              assistantContent += json.delta
              setChatMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: assistantContent } : m)),
              )
            } else if (json.type === 'error') {
              console.error('[v0] Stream error:', json.errorText || json.error)
              streamError = json.errorText || 'El modelo no pudo procesar la solicitud.'
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      // If the model returned nothing (e.g. it failed to read an image), show a clear message
      if (!assistantContent) {
        const fallback = streamError
          ? `No pude completar el análisis: ${streamError}`
          : 'No pude procesar la solicitud. Si adjuntaste una imagen, verifica que sea un formato válido (PNG/JPG) e inténtalo de nuevo.'
        assistantContent = fallback
        setChatMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: fallback } : m)),
        )
      }

      // Persist assistant message + auto-title
      if (convId && assistantContent) {
        saveMensaje({ conversacionId: convId, rol: 'assistant', contenido: assistantContent })
        const lastUserMsg = apiMessages[apiMessages.length - 1]?.content ?? ''
        maybeGenerateTitle(convId, lastUserMsg, assistantContent)
      }

      return assistantContent
    } catch (error) {
      console.error('[v0] Error sending message:', error)
      toast.error('Error al enviar mensaje')
      return ''
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = async (content: string, extraFiles?: File[]) => {
    const hasExtraFiles = !!extraFiles && extraFiles.length > 0
    if ((!content?.trim() && attachments.length === 0 && !hasExtraFiles) || isLoading || uploadingFiles || !selectedClient) return

    // Set loading immediately so a second Enter during the upload can't trigger a duplicate send
    setIsLoading(true)

    const hadAttachments = attachments.length > 0 || hasExtraFiles
    const uploadedFiles = hasExtraFiles
      ? await uploadAttachments(extraFiles!.map((file) => ({ file })))
      : await uploadAttachments()

    // If the user attached files but none uploaded successfully, abort instead of sending an empty request
    if (hadAttachments && uploadedFiles.length === 0) {
      toast.error('No se pudieron subir los archivos. Intenta de nuevo.')
      setIsLoading(false)
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
    }
    const newMessages = [...chatMessages, userMessage]
    setChatMessages(newMessages)
    setInputValue('')
    setAttachments([])

    const convId = currentConvId
    if (convId) {
      saveMensaje({ conversacionId: convId, rol: 'user', contenido: content })
    }

    setIsLoading(false) // reset before streamAssistantReply takes over the loading lifecycle
    return await streamAssistantReply(newMessages, convId)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't submit while an IME composition is in progress (CJK input) or while sending/uploading
    if (e.nativeEvent.isComposing || (e as unknown as { keyCode: number }).keyCode === 229) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isLoading || uploadingFiles) return
      handleSendMessage(inputValue)
    }
  }

  const handleSaveAsReport = async (overrideContent?: string) => {
    if ((chatMessages.length === 0 && !overrideContent) || !selectedClient) return

    const messageText = overrideContent ?? chatMessages.filter((m) => m.role === 'assistant').pop()?.content
    if (!messageText) return

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: tipoTarea } = await supabase
        .from('tipo_de_tareas')
        .select('id')
        .ilike('nombre', '%informe%')
        .limit(1)
        .single()

      const dateRangeLabel = `${format(new Date(dateStart), 'd MMM', { locale: es })} - ${format(new Date(dateEnd), 'd MMM yyyy', { locale: es })}`

      await supabase.from('tareas').insert({
        titulo: `Informe ${selectedClient.nombre_del_negocio} - ${dateRangeLabel}`,
        descripcion: messageText,
        tipo_id: tipoTarea?.id,
        cliente_ids: [selectedClient.id],
        creado_por: user?.id,
        estado: 'resuelto',
      })

      toast.success('Informe guardado como tarea')

      // Generar PDF usando el endpoint unificado
      const periodLabel = dateRangeLabel
      try {
        const pdfResponse = await fetch('/api/agentes/analista/download-pdf/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientName: selectedClient.nombre_del_negocio,
            plan: selectedClient.plan,
            periodLabel,
            markdown: messageText,
            fileName: `Informe_${selectedClient.nombre_del_negocio.replace(/\s+/g, '_')}_${periodLabel.replace(/\s+/g, '_')}.pdf`,
          }),
        })

        if (pdfResponse.ok) {
          const blob = await pdfResponse.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `Informe_${selectedClient.nombre_del_negocio.replace(/\s+/g, '_')}_${periodLabel.replace(/\s+/g, '_')}.pdf`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        } else {
          console.error('[v0] PDF generation failed:', pdfResponse.status)
          toast.error('La tarea se guardó, pero no se pudo generar el PDF')
        }
      } catch (pdfError) {
        console.error('[v0] Error exporting report PDF:', pdfError)
        toast.error('La tarea se guardó, pero no se pudo generar el PDF')
      }
    } catch (error) {
      console.error('Error saving report:', error)
      toast.error('Error al guardar el informe')
    }
  }

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Collapsed rail */}
      {sidebarCollapsed && (
        <aside className="w-14 border-r bg-card flex flex-col items-center py-4 gap-3 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Expandir barra lateral"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </Button>
          <div className="p-2 rounded-lg bg-[#EEEDFE]">
            <FileText className="h-5 w-5 text-[#7F77DD]" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewChat}
            aria-label="Nueva consulta"
          >
            <Sparkles className="h-5 w-5" />
          </Button>
        </aside>
      )}

      {/* Sidebar */}
      {!sidebarCollapsed && (
      <aside className="w-[280px] border-r bg-card flex flex-col shrink-0 min-h-0">
        {/* Header */}
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#EEEDFE] shrink-0">
              <FileText className="h-5 w-5 text-[#7F77DD]" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold leading-tight">Analista</h2>
              <p className="text-xs text-muted-foreground truncate">Informes de cierre</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Contraer barra lateral"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>

          {/* Navegación */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1 justify-center" asChild>
              <a href="/dashboard/agentes">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Agentes
              </a>
            </Button>
            <Button variant="outline" size="sm" className="flex-1 justify-center" asChild>
              <a href="/dashboard/tasks">
                <ListTodo className="h-4 w-4 mr-1.5" />
                Tareas
              </a>
            </Button>
          </div>
        </div>

        {/* New Query Section */}
        <div className="p-4 space-y-3 border-b overflow-y-auto max-h-[55vh]">
          <h3 className="text-sm font-medium text-muted-foreground">Nueva consulta</h3>

          {/* Client Combobox */}
          <Popover open={clientOpen} onOpenChange={setClientOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between">
                <span className="truncate">{selectedClient?.nombre_del_negocio || 'Seleccionar cliente...'}</span>
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
                          fetchCuentasCliente(client.id)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedClient?.id === client.id ? 'opacity-100' : 'opacity-0',
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

          {/* Ad Account Multi-select */}
          {selectedClient && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Cuentas publicitarias</label>
              {loadingCuentas ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cargando cuentas...
                </div>
              ) : cuentasDisponibles.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1 py-2">
                  Este cliente no tiene cuentas publicitarias configuradas.
                </p>
              ) : (
                <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                  {cuentasDisponibles.map((cuenta) => (
                    <label
                      key={cuenta.id}
                      className="flex items-start gap-2 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCuentaIds.includes(cuenta.id_cuenta)}
                        onChange={() => toggleCuenta(cuenta.id_cuenta)}
                        className="h-3.5 w-3.5 accent-[#7F77DD] mt-0.5 shrink-0"
                      />
                      <span className="flex-1 leading-snug break-words">
                        {cuenta.nombre_cuenta || 'Sin nombre'}{' '}
                        <span className="text-muted-foreground text-xs">
                          ({cuenta.id_cuenta}) ({cuenta.plataforma})
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {cuentasDisponibles.length > 0 && selectedCuentaIds.length === 0 && (
                <p className="text-[11px] text-amber-500 px-1">
                  Sin cuentas seleccionadas: el informe no va a traer datos de plataforma.
                </p>
              )}
            </div>
          )}

          {/* CRM configurado */}
          {selectedClient && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">CRM configurado</label>
              {selectedClient.crm_type === 'ghl' && selectedClient.ghl_location_id ? (
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-md border bg-muted/30 text-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="flex-1">GoHighLevel</span>
                  <span className="text-muted-foreground text-xs font-mono">
                    {selectedClient.ghl_location_id.slice(0, 6)}…
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 px-2.5 py-2 rounded-md border border-amber-500/30 bg-amber-500/10 text-sm">
                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                  <span className="text-amber-600 dark:text-amber-400">
                    Sin CRM conectado: Ventas y Funnel Comercial van a tener que pedirse manualmente.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Date Range Inputs */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Rango de fechas</label>
            <div className="flex flex-col gap-2">
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              />
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              />
            </div>
          </div>

          <Button
            className="w-full bg-[#7F77DD] hover:bg-[#6B63C7]"
            onClick={handleStartAnalysis}
            disabled={!selectedClient}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Iniciar analisis
          </Button>

          {isActive && (
            <Button variant="outline" className="w-full" onClick={handleNewChat}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva conversación
            </Button>
          )}
        </div>

        {/* Conversations history */}
        <div className="flex-1 min-h-0 p-4 overflow-y-auto">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Conversaciones</h3>
          <div className="space-y-1">
            {conversaciones.map((conv) => (
              <button
                key={conv.id}
                className={cn(
                  'group w-full text-left p-2 rounded-lg transition-colors flex items-start gap-2',
                  conv.id === currentConvId ? 'bg-[#EEEDFE]' : 'hover:bg-muted/50',
                )}
                onClick={() => handleOpenConversacion(conv)}
              >
                <MessageSquare
                  className={cn(
                    'h-4 w-4 mt-0.5 shrink-0',
                    conv.id === currentConvId ? 'text-[#7F77DD]' : 'text-muted-foreground',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{conv.titulo}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {clientNameById(conv.cliente_id) || 'General'} ·{' '}
                    {format(new Date(conv.updated_at), 'd MMM', { locale: es })}
                  </p>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleDeleteConversacion(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Eliminar conversación"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
            {conversaciones.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin conversaciones</p>
            )}
          </div>
        </div>
      </aside>
      )}

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
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
            <div className="px-5 py-3 border-b flex items-center gap-3 bg-card">
              <div className="p-1.5 rounded-md bg-[#EEEDFE] shrink-0">
                <FileText className="h-4 w-4 text-[#7F77DD]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold leading-tight truncate">{selectedClient?.nombre_del_negocio}</h2>
                <p className="text-xs text-muted-foreground">
                  {MONTHS[parseInt(selectedMonth) - 1]?.label} {selectedYear}
                </p>
              </div>
              {isLoading && (
                <Badge variant="secondary" className="animate-pulse">
                  En curso
                </Badge>
              )}
            </div>

            {/* Messages + optional artifact panel */}
            <div className="flex-1 flex min-h-0">
              <ScrollArea className="flex-1 p-4">
                <div className="max-w-3xl mx-auto space-y-4">
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
                    >
                      {message.role === 'assistant' ? (
                        <div className="group max-w-[90%]">
                          <div className="rounded-2xl px-4 py-3 bg-muted">
                            {message.content ? (
                              <MessageContent
                                content={message.content}
                                onOpenArtifact={setArtifact}
                                onSubmitFaltantes={(text, files) => handleSendMessage(text, files)}
                              />
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#7F77DD]" />
                                Escribiendo...
                              </div>
                            )}
                          </div>
                          {message.content && (
                            <div className="mt-2">
                              <CopyButton content={message.content} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-[#7F77DD] text-white">
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {message.attachments.map((att, i) => (
                                <div key={i} className="flex items-center gap-1 px-2 py-1 rounded bg-white/20 text-xs">
                                  {att.type.startsWith('image/') ? (
                                    <ImageIcon className="h-3 w-3" />
                                  ) : (
                                    <File className="h-3 w-3" />
                                  )}
                                  <span className="max-w-[100px] truncate">{att.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
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

              {artifact && (
                <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} />
              )}
            </div>

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
                          <img src={att.preview || "/placeholder.svg"} alt={att.file.name} className="h-8 w-8 object-cover rounded" />
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
                  <div className="mt-3 flex justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleSaveAsReport()}>
                      <FileText className="h-4 w-4" />
                      Guardar y exportar informe
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