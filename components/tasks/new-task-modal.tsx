'use client'

import { useState, useEffect, useRef } from 'react'
import type { TaskStatus, TaskPriority, TaskType } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  useTaskStore,
  PRIORITY_CONFIG,
  ASSIGNEES,
  CLIENTS,
} from '@/lib/tasks/task-store'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Palette,
  Globe,
  TrendingUp,
  Link,
  Search,
  AlertTriangle,
  Mail,
  FileText,
  BarChart3,
  HelpCircle,
  Calculator,
  Sparkles,
  ArrowLeft,
  Check,
  Loader2,
} from 'lucide-react'

interface NewTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Quick Task Templates ──────────────────────────────────────────────────────

interface TaskTemplate {
  id: string
  label: string
  icon: React.ReactNode
  type: TaskType
  defaultAssignee?: string // assignee id
  flow: FlowStep[]
}

type FlowStep = 
  | { type: 'select_client' }
  | { type: 'input'; key: string; question: string; placeholder?: string }
  | { type: 'number'; key: string; question: string; warningThreshold?: number; warningMessage?: string }
  | { type: 'options'; key: string; question: string; options: { label: string; value: string }[] }
  | { type: 'priority' }
  | { type: 'confirm' }

const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'cotizar',
    label: 'Cotizar una tarea',
    icon: <Calculator className="h-4 w-4" />,
    type: 'soporte',
    flow: [
      { type: 'select_client' },
      { type: 'input', key: 'title', question: 'Contame, que necesitas cotizar?', placeholder: 'Ej: Desarrollo de landing con formulario...' },
      { type: 'number', key: 'hours', question: 'Tenes una estimacion de horas en mente?', warningThreshold: 40, warningMessage: 'Uh, es un proyecto grande! Seguro que no conviene dividirlo en etapas?' },
      { type: 'priority' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'placas',
    label: 'Pedir placas a diseno',
    icon: <Palette className="h-4 w-4" />,
    type: 'meta_ads',
    defaultAssignee: 'flor',
    flow: [
      { type: 'select_client' },
      { type: 'number', key: 'quantity', question: 'Cuantas placas necesitas?', warningThreshold: 15, warningMessage: 'Ehhh no te parece mucho? jaja Mira, la agenda de Flor viene ajustada. Te parece que carguemos la mitad para esta semana y el resto para la siguiente?' },
      { type: 'input', key: 'title', question: 'Dale! Como titulamos este pedido?', placeholder: 'Ej: Placas promo Black Friday...' },
      { type: 'options', key: 'format', question: 'Que formatos necesitas?', options: [
        { label: 'Stories + Feed', value: 'stories_feed' },
        { label: 'Solo Stories', value: 'stories' },
        { label: 'Solo Feed', value: 'feed' },
        { label: 'Carrusel', value: 'carousel' },
        { label: 'Todos los formatos', value: 'all' },
      ]},
      { type: 'priority' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'landing',
    label: 'Crear una landing',
    icon: <Globe className="h-4 w-4" />,
    type: 'desarrollo',
    flow: [
      { type: 'select_client' },
      { type: 'input', key: 'title', question: 'Genial! Como se va a llamar esta landing?', placeholder: 'Ej: Landing promo verano 2024...' },
      { type: 'options', key: 'hasDesign', question: 'Ya tienen el diseno armado?', options: [
        { label: 'Si, esta listo', value: 'yes' },
        { label: 'No, hay que disenarlo', value: 'no' },
        { label: 'Tienen referencias', value: 'references' },
      ]},
      { type: 'priority' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'optimizar',
    label: 'Optimizar campana',
    icon: <TrendingUp className="h-4 w-4" />,
    type: 'meta_ads',
    flow: [
      { type: 'select_client' },
      { type: 'options', key: 'platform', question: 'En que plataforma?', options: [
        { label: 'Meta Ads', value: 'meta' },
        { label: 'Google Ads', value: 'google' },
        { label: 'Ambas', value: 'both' },
      ]},
      { type: 'options', key: 'issue', question: 'Que esta pasando?', options: [
        { label: 'Bajo rendimiento', value: 'low_performance' },
        { label: 'CPA muy alto', value: 'high_cpa' },
        { label: 'Pocas conversiones', value: 'low_conversions' },
        { label: 'Revision general', value: 'general' },
      ]},
      { type: 'priority' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'integrar',
    label: 'Integrar formularios',
    icon: <Link className="h-4 w-4" />,
    type: 'integracion',
    flow: [
      { type: 'select_client' },
      { type: 'options', key: 'source', question: 'De donde vienen los leads?', options: [
        { label: 'Landing web', value: 'landing' },
        { label: 'Meta Lead Ads', value: 'meta_leads' },
        { label: 'Google Lead Forms', value: 'google_leads' },
        { label: 'WhatsApp', value: 'whatsapp' },
        { label: 'Otro', value: 'other' },
      ]},
      { type: 'options', key: 'destination', question: 'A donde tienen que llegar?', options: [
        { label: 'CRM Aurelia', value: 'aurelia' },
        { label: 'CRM del cliente', value: 'client_crm' },
        { label: 'Google Sheets', value: 'sheets' },
        { label: 'WhatsApp', value: 'whatsapp' },
      ]},
      { type: 'priority' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'revisar_integraciones',
    label: 'Revisar integraciones',
    icon: <Search className="h-4 w-4" />,
    type: 'integracion',
    flow: [
      { type: 'select_client' },
      { type: 'options', key: 'problem', question: 'Que esta fallando?', options: [
        { label: 'No llegan los leads', value: 'no_leads' },
        { label: 'Llegan duplicados', value: 'duplicates' },
        { label: 'Faltan datos', value: 'missing_data' },
        { label: 'Error en la conexion', value: 'connection_error' },
        { label: 'Revision preventiva', value: 'preventive' },
      ]},
      { type: 'priority' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'falta_datos',
    label: 'Peligro! Falta de datos',
    icon: <AlertTriangle className="h-4 w-4" />,
    type: 'integracion',
    flow: [
      { type: 'select_client' },
      { type: 'options', key: 'area', question: 'Que no cunda el panico! Que pensas que puede ser?', options: [
        { label: 'Problema de integraciones', value: 'integrations' },
        { label: 'Problema de campana', value: 'campaign' },
        { label: 'Problema de tracking', value: 'tracking' },
        { label: 'Todo... estamos en problemas', value: 'everything' },
        { label: 'No tengo idea', value: 'unknown' },
      ]},
      { type: 'input', key: 'title', question: 'Describime el problema brevemente', placeholder: 'Ej: No llegaron leads desde el viernes...' },
      { type: 'confirm' }, // Auto-alta prioridad
    ],
  },
  {
    id: 'seguimiento',
    label: 'Enviar seguimiento al cliente',
    icon: <Mail className="h-4 w-4" />,
    type: 'crm',
    flow: [
      { type: 'select_client' },
      { type: 'options', key: 'reason', question: 'Cual es el motivo del seguimiento?', options: [
        { label: 'Revisar performance', value: 'performance' },
        { label: 'Renovacion de contrato', value: 'renewal' },
        { label: 'Propuesta comercial', value: 'proposal' },
        { label: 'Reclamo del cliente', value: 'complaint' },
        { label: 'Check-in mensual', value: 'monthly' },
      ]},
      { type: 'priority' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'informe',
    label: 'Crear informe',
    icon: <FileText className="h-4 w-4" />,
    type: 'reportes',
    flow: [
      { type: 'select_client' },
      { type: 'options', key: 'reportType', question: 'Que tipo de informe?', options: [
        { label: 'Mensual de resultados', value: 'monthly' },
        { label: 'Analisis de campana', value: 'campaign' },
        { label: 'Comparativo periodos', value: 'comparative' },
        { label: 'Informe especial', value: 'special' },
      ]},
      { type: 'priority' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'tracking',
    label: 'Tracking de campanas',
    icon: <BarChart3 className="h-4 w-4" />,
    type: 'integracion',
    flow: [
      { type: 'select_client' },
      { type: 'options', key: 'trackingType', question: 'Que necesitas trackear?', options: [
        { label: 'Configurar pixel Meta', value: 'meta_pixel' },
        { label: 'Configurar Google Tag', value: 'google_tag' },
        { label: 'Eventos de conversion', value: 'conversions' },
        { label: 'Revisar tracking actual', value: 'review' },
      ]},
      { type: 'priority' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'datos_no_coinciden',
    label: 'No me coinciden los datos',
    icon: <HelpCircle className="h-4 w-4" />,
    type: 'reportes',
    flow: [
      { type: 'select_client' },
      { type: 'options', key: 'dataSource', question: 'Entre que fuentes no coinciden?', options: [
        { label: 'Meta vs CRM', value: 'meta_crm' },
        { label: 'Google vs CRM', value: 'google_crm' },
        { label: 'Landing vs CRM', value: 'landing_crm' },
        { label: 'Meta vs Google', value: 'meta_google' },
        { label: 'Otro', value: 'other' },
      ]},
      { type: 'input', key: 'title', question: 'Contame mas, que datos no coinciden?', placeholder: 'Ej: Meta dice 50 leads pero el CRM tiene 35...' },
      { type: 'priority' },
      { type: 'confirm' },
    ],
  },
]

// ── Chat Message Component ────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  options?: { label: string; value: string; icon?: React.ReactNode }[]
  isInput?: boolean
  inputPlaceholder?: string
  isNumber?: boolean
  isPriority?: boolean
  isConfirm?: boolean
  taskSummary?: {
    title: string
    client: string
    type: string
    priority: string
    assignee: string
  }
}

function ChatBubble({ message, onSelect, onInputSubmit, inputValue, setInputValue, isLast }: {
  message: ChatMessage
  onSelect?: (value: string) => void
  onInputSubmit?: () => void
  inputValue: string
  setInputValue: (v: string) => void
  isLast: boolean
}) {
  const isAssistant = message.role === 'assistant'

  return (
    <div className={cn('flex gap-3', !isAssistant && 'flex-row-reverse')}>
      {isAssistant && (
        <Avatar className="h-8 w-8 shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-500">
          <AvatarFallback className="bg-transparent text-white text-xs">
            <Sparkles className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
      
      <div className={cn(
        'max-w-[85%] space-y-3',
        !isAssistant && 'flex flex-col items-end'
      )}>
        <div className={cn(
          'rounded-2xl px-4 py-2.5 text-sm',
          isAssistant 
            ? 'bg-muted/50 rounded-tl-md' 
            : 'bg-primary text-primary-foreground rounded-tr-md'
        )}>
          {message.content}
        </div>

        {/* Options buttons */}
        {isAssistant && message.options && isLast && (
          <div className="flex flex-wrap gap-2">
            {message.options.map((opt) => (
              <Button
                key={opt.value}
                variant="outline"
                size="sm"
                className="h-auto py-2 px-3 text-xs gap-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={() => onSelect?.(opt.value)}
              >
                {opt.icon}
                {opt.label}
              </Button>
            ))}
          </div>
        )}

        {/* Text input */}
        {isAssistant && message.isInput && isLast && (
          <div className="flex gap-2 w-full max-w-sm">
            <Input
              placeholder={message.inputPlaceholder || 'Escribi aca...'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && inputValue.trim() && onInputSubmit?.()}
              className="text-sm"
              autoFocus
            />
            <Button size="sm" onClick={onInputSubmit} disabled={!inputValue.trim()}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Number input */}
        {isAssistant && message.isNumber && isLast && (
          <div className="flex gap-2 w-full max-w-[200px]">
            <Input
              type="number"
              min="1"
              placeholder="Cantidad"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && inputValue.trim() && onInputSubmit?.()}
              className="text-sm"
              autoFocus
            />
            <Button size="sm" onClick={onInputSubmit} disabled={!inputValue.trim()}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Priority selection */}
        {isAssistant && message.isPriority && isLast && (
          <div className="flex gap-2">
            {(['alta', 'media', 'baja'] as TaskPriority[]).map((p) => (
              <Button
                key={p}
                variant="outline"
                size="sm"
                className={cn(
                  'h-auto py-2 px-3 text-xs gap-1.5 hover:opacity-80 transition-colors',
                  p === 'alta' && 'hover:bg-red-500/20 hover:border-red-500/50',
                  p === 'media' && 'hover:bg-yellow-500/20 hover:border-yellow-500/50',
                  p === 'baja' && 'hover:bg-green-500/20 hover:border-green-500/50',
                )}
                onClick={() => onSelect?.(p)}
              >
                <Badge variant="outline" className={cn(
                  'text-[10px] px-1.5 py-0 border-0',
                  PRIORITY_CONFIG[p].bgColor,
                  PRIORITY_CONFIG[p].color
                )}>
                  {PRIORITY_CONFIG[p].label}
                </Badge>
              </Button>
            ))}
          </div>
        )}

        {/* Confirm with summary */}
        {isAssistant && message.isConfirm && message.taskSummary && isLast && (
          <div className="space-y-3">
            <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tarea:</span>
                <span className="font-medium text-right max-w-[200px] truncate">{message.taskSummary.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente:</span>
                <span>{message.taskSummary.client}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipo:</span>
                <span>{message.taskSummary.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prioridad:</span>
                <span>{message.taskSummary.priority}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Asignado:</span>
                <span>{message.taskSummary.assignee}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1.5 bg-green-600 hover:bg-green-700"
                onClick={() => onSelect?.('confirm')}
              >
                <Check className="h-4 w-4" />
                Crear tarea
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelect?.('cancel')}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function NewTaskModal({ open, onOpenChange }: NewTaskModalProps) {
  const addTask = useTaskStore((s) => s.addTask)
  const scrollRef = useRef<HTMLDivElement>(null)

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  
  // Task data being built
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [taskData, setTaskData] = useState<Record<string, string>>({})

  // Reset on open
  useEffect(() => {
    if (open) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: 'Hola! Que necesitas hacer hoy?',
        options: TASK_TEMPLATES.map((t) => ({
          label: t.label,
          value: t.id,
          icon: t.icon,
        })),
      }])
      setSelectedTemplate(null)
      setCurrentStepIndex(0)
      setTaskData({})
      setInputValue('')
    }
  }, [open])

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Get greeting based on quantity for "placas" flow
  const getQuantityResponse = (template: TaskTemplate, quantity: number): string => {
    if (template.id === 'placas') {
      if (quantity >= 15) {
        return `Ehhh ${quantity} placas! No te parece mucho? jaja Mira, la agenda de Flor viene ajustada. Te las cargo igual pero avisale con tiempo!`
      } else if (quantity >= 8) {
        return `${quantity} placas, perfecto! Buen volumen para una campana.`
      } else {
        return `${quantity} placas, genial! Es un pedido tranqui.`
      }
    }
    
    if (template.id === 'cotizar' && quantity >= 40) {
      return `Uh, ${quantity} horas es un proyecto grande! Seguro que no conviene dividirlo en etapas? Bueno, vos sabras...`
    }

    return `Perfecto, ${quantity}!`
  }

  // Process the current flow step
  const processStep = (template: TaskTemplate, stepIndex: number, previousData: Record<string, string>) => {
    const step = template.flow[stepIndex]
    if (!step) return

    let newMessage: ChatMessage

    switch (step.type) {
      case 'select_client':
        newMessage = {
          id: `step-${stepIndex}`,
          role: 'assistant',
          content: 'Para que cliente es?',
          options: CLIENTS.map((c) => ({
            label: c.name,
            value: c.id,
          })),
        }
        break

      case 'input':
        newMessage = {
          id: `step-${stepIndex}`,
          role: 'assistant',
          content: step.question,
          isInput: true,
          inputPlaceholder: step.placeholder,
        }
        break

      case 'number':
        newMessage = {
          id: `step-${stepIndex}`,
          role: 'assistant',
          content: step.question,
          isNumber: true,
        }
        break

      case 'options':
        newMessage = {
          id: `step-${stepIndex}`,
          role: 'assistant',
          content: step.question,
          options: step.options,
        }
        break

      case 'priority':
        // Skip priority for "falta_datos" - auto alta
        if (template.id === 'falta_datos') {
          setTaskData((prev) => ({ ...prev, priority: 'alta' }))
          processStep(template, stepIndex + 1, { ...previousData, priority: 'alta' })
          return
        }
        newMessage = {
          id: `step-${stepIndex}`,
          role: 'assistant',
          content: 'Que prioridad le damos?',
          isPriority: true,
        }
        break

      case 'confirm':
        const client = CLIENTS.find((c) => c.id === previousData.clientId)
        const assignee = template.defaultAssignee 
          ? ASSIGNEES.find((a) => a.id === template.defaultAssignee)
          : ASSIGNEES[0] // Default to first assignee
        
        // Build title from data
        let title = previousData.title || template.label
        if (template.id === 'placas' && previousData.quantity) {
          title = `${previousData.quantity} placas - ${previousData.title || client?.name}`
        }
        if (template.id === 'falta_datos') {
          title = `URGENTE: ${previousData.title || 'Falta de datos'} - ${client?.name}`
        }

        newMessage = {
          id: `step-${stepIndex}`,
          role: 'assistant',
          content: 'Listo! Te armo el resumen:',
          isConfirm: true,
          taskSummary: {
            title,
            client: client?.name || 'Sin cliente',
            type: template.type,
            priority: previousData.priority || (template.id === 'falta_datos' ? 'Alta' : 'Media'),
            assignee: assignee?.name || 'Sin asignar',
          },
        }
        break

      default:
        return
    }

    setMessages((prev) => [...prev, newMessage])
    setCurrentStepIndex(stepIndex)
  }

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    const template = TASK_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return

    setSelectedTemplate(template)
    
    // Add user message
    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: template.label,
    }])

    // Small delay for natural feel
    setTimeout(() => {
      processStep(template, 0, {})
    }, 300)
  }

  // Handle option selection in flow
  const handleOptionSelect = (value: string) => {
    if (!selectedTemplate) return

    const currentStep = selectedTemplate.flow[currentStepIndex]
    if (!currentStep) return

    // Handle confirm step
    if (currentStep.type === 'confirm') {
      if (value === 'confirm') {
        handleCreateTask()
      } else {
        onOpenChange(false)
      }
      return
    }

    // Add user message
    let userMessage = value
    if (currentStep.type === 'select_client') {
      const client = CLIENTS.find((c) => c.id === value)
      userMessage = client?.name || value
    }
    if (currentStep.type === 'options') {
      const opt = (currentStep as { options: { label: string; value: string }[] }).options.find((o) => o.value === value)
      userMessage = opt?.label || value
    }
    if (currentStep.type === 'priority') {
      userMessage = PRIORITY_CONFIG[value as TaskPriority]?.label || value
    }

    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
    }])

    // Save data
    const stepKey = (currentStep as { key?: string }).key || currentStep.type
    const newData = { ...taskData, [stepKey]: value }
    
    if (currentStep.type === 'select_client') {
      newData.clientId = value
    }

    setTaskData(newData)

    // Process next step
    setTimeout(() => {
      processStep(selectedTemplate, currentStepIndex + 1, newData)
    }, 300)
  }

  // Handle text/number input submit
  const handleInputSubmit = () => {
    if (!selectedTemplate || !inputValue.trim()) return

    const currentStep = selectedTemplate.flow[currentStepIndex]
    if (!currentStep) return

    const value = inputValue.trim()

    // Add user message
    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: value,
    }])

    // For number inputs, add a response based on the value
    if (currentStep.type === 'number') {
      const numValue = parseInt(value)
      const response = getQuantityResponse(selectedTemplate, numValue)
      
      setTimeout(() => {
        setMessages((prev) => [...prev, {
          id: `response-${Date.now()}`,
          role: 'assistant',
          content: response,
        }])
      }, 300)
    }

    // Save data
    const stepKey = (currentStep as { key?: string }).key || currentStep.type
    const newData = { ...taskData, [stepKey]: value }
    setTaskData(newData)
    setInputValue('')

    // Process next step (with extra delay after number response)
    setTimeout(() => {
      processStep(selectedTemplate, currentStepIndex + 1, newData)
    }, currentStep.type === 'number' ? 800 : 300)
  }

  // Create the task
  const handleCreateTask = async () => {
    if (!selectedTemplate) return
    
    setIsCreating(true)

    const client = CLIENTS.find((c) => c.id === taskData.clientId)
    const assignee = selectedTemplate.defaultAssignee 
      ? ASSIGNEES.find((a) => a.id === selectedTemplate.defaultAssignee)
      : ASSIGNEES[0]

    // Build title
    let title = taskData.title || selectedTemplate.label
    if (selectedTemplate.id === 'placas' && taskData.quantity) {
      title = `${taskData.quantity} placas - ${taskData.title || client?.name}`
    }
    if (selectedTemplate.id === 'falta_datos') {
      title = `URGENTE: ${taskData.title || 'Falta de datos'} - ${client?.name}`
    }

    // Build description from collected data
    const descriptionParts: string[] = []
    if (taskData.format) descriptionParts.push(`Formato: ${taskData.format}`)
    if (taskData.platform) descriptionParts.push(`Plataforma: ${taskData.platform}`)
    if (taskData.issue) descriptionParts.push(`Problema: ${taskData.issue}`)
    if (taskData.source) descriptionParts.push(`Origen: ${taskData.source}`)
    if (taskData.destination) descriptionParts.push(`Destino: ${taskData.destination}`)
    if (taskData.hours) descriptionParts.push(`Horas estimadas: ${taskData.hours}`)
    if (taskData.quantity) descriptionParts.push(`Cantidad: ${taskData.quantity}`)

    addTask({
      title,
      description: descriptionParts.length > 0 ? descriptionParts.join('\n') : null,
      clientId: taskData.clientId || '',
      clientName: client?.name || '',
      assigneeId: assignee?.id || '',
      assigneeName: assignee?.name || '',
      status: 'pendiente' as TaskStatus,
      priority: (taskData.priority || (selectedTemplate.id === 'falta_datos' ? 'alta' : 'media')) as TaskPriority,
      type: selectedTemplate.type,
      dueDate: null,
      customFields: {},
      comments: [],
    })

    // Success message
    setMessages((prev) => [...prev, {
      id: `success-${Date.now()}`,
      role: 'assistant',
      content: selectedTemplate.id === 'falta_datos' 
        ? 'Tarea creada con prioridad ALTA! Ya le aviso al equipo. Tranqui que lo resolvemos!'
        : 'Listo! Tarea creada. Cualquier cosa me avisas!',
    }])

    setIsCreating(false)

    // Close after a moment
    setTimeout(() => {
      onOpenChange(false)
    }, 1500)
  }

  // Go back to start
  const handleBack = () => {
    setSelectedTemplate(null)
    setCurrentStepIndex(0)
    setTaskData({})
    setInputValue('')
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: 'Hola! Que necesitas hacer hoy?',
      options: TASK_TEMPLATES.map((t) => ({
        label: t.label,
        value: t.id,
        icon: t.icon,
      })),
    }])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b">
          {selectedTemplate && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Nueva tarea</h3>
              <p className="text-xs text-muted-foreground">Asistente de MDK</p>
            </div>
          </div>
        </div>

        {/* Chat area */}
        <ScrollArea className="h-[400px] p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                onSelect={selectedTemplate ? handleOptionSelect : handleTemplateSelect}
                onInputSubmit={handleInputSubmit}
                inputValue={inputValue}
                setInputValue={setInputValue}
                isLast={idx === messages.length - 1}
              />
            ))}
            {isCreating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creando tarea...
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
