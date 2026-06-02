'use client'

import { useState, useEffect, useRef } from 'react'
import type { TaskStatus, TaskPriority, TaskType, TaskComment, TaskFile } from '@/lib/types'
import { cn } from '@/lib/utils'
import { createClient, getAuthUser } from '@/lib/supabase/client'
import {
  useTaskStore,
  PRIORITY_CONFIG,
  TYPE_CONFIG,
  ASSIGNEES,
  CLIENTS,
  STATUS_CONFIG,
  STATUS_ORDER,
} from '@/lib/tasks/task-store'

// Database types
interface DbCliente {
  id: string
  nombre_del_negocio: string
  plan?: string | null
}

interface DbColaborador {
  id: string
  nombre: string
  apellido?: string | null
  avatar_url: string | null
}

interface DbTipoTarea {
  id: string
  nombre: string
  activo: boolean
}
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { X, Plus, MessageSquare, User, Users, CalendarDays, Building2, MoreHorizontal, Paperclip, Bell, Clock, ChevronDown, FileText, Palette, Globe, TrendingUp, Link, Search, AlertTriangle, Mail, BarChart3, HelpCircle, Calculator, Sparkles, ArrowLeft, Check, Loader2, Zap, Coffee, PartyPopper, Flame, Calendar, Video, PenLine, Flag, Tag, Link2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

interface NewTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDueDate?: Date | null
  initialMode?: 'manual' | 'ai'
}

// ── Assistant Personality ─────────────────────────────────────────────────────

const GREETINGS = [
  'Hola! Que necesitas hacer hoy?',
  'Buenas! En que te puedo ayudar?',
  'Ey! Contame, que hacemos?',
  'Hola! Listo para trabajar?',
]

const ASSISTANT_NAME = 'Madky'

const getRandomGreeting = () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]

// Responses with personality based on context
const PERSONALITY_RESPONSES = {
  // Placas responses
  placas_low: (qty: number) => [
    `${qty} placas, pan comido! Flor las saca en un toque.`,
    `Solo ${qty}? Joya, es un pedido tranqui.`,
    `${qty} placas, perfecto! Pedido express.`,
  ],
  placas_medium: (qty: number) => [
    `${qty} placas, buen volumen! Flor se va a divertir con esto.`,
    `Uh ${qty}! Viene con todo. Me gusta el entusiasmo.`,
    `${qty} placas, excelente! Campana seria esto.`,
  ],
  placas_high: (qty: number) => [
    `Ehhh ${qty} placas! No te parece mucho? jaja La agenda de Flor viene ajustada esta semana...`,
    `Wow ${qty}! Te fuiste al pasto jaja. Mira, Flor tiene la agenda complicada...`,
    `${qty}?! Tranqui che, no es Black Friday jaja. Flor va a necesitar cafe extra...`,
  ],
  placas_high_followup: [
    'Te las cargo igual pero avisale con tiempo! Capaz conviene dividirlas en dos semanas.',
    'Las anotamos pero organizemos bien las fechas de entrega.',
    'Dale para adelante, pero coordinemos bien los tiempos con ella.',
  ],
  
  // Cotizar responses
  cotizar_high_hours: (hours: number) => [
    `Uh, ${hours} horas es un proyecto grande! No conviene dividirlo en etapas?`,
    `${hours} horas... eso es como una pelicula de Marvel. Seguro que no lo partimos?`,
    `Che, ${hours} horas es bastante! Capaz lo dividimos en fases?`,
  ],
  
  // Falta de datos
  falta_datos_calm: [
    'Que no cunda el panico! Respira profundo... Ahora si, contame que pasa.',
    'Tranqui que lo resolvemos! A ver, que esta pasando?',
    'Uh oh, modo detective activado! Vamos a encontrar el problema.',
  ],
  falta_datos_everything: [
    'Ay ay ay... ok, respira. Lo vamos a resolver paso a paso.',
    'Bueno, si es TODO... cafe y a laburar. Primero lo primero.',
    'Ok ok, no entremos en panico. Vamos de a uno.',
  ],
  
  // Integraciones
  integraciones_intro: [
    'Integraciones! Mi especialidad. Contame mas...',
    'Ah, el mundo de las integraciones. Que necesitas conectar?',
    'Vamos a conectar todo! Que tenemos?',
  ],
  
  // Otro
  otro_intro: [
    'Dale! Soy todo oidos (o todo texto, mejor dicho).',
    'Perfecto, contame que necesitas y vemos como lo resolvemos.',
    'A ver, sorprendeme! Que tenes en mente?',
  ],
  
  // Reunion
  reunion_intro: [
    'Una reunion! Vamos a coordinarla.',
    'Reunion, perfecto. Dejame los datos y la agendo.',
    'Coordinemos esa reunion. Contame...',
  ],
  reunion_calendar_success: [
    'Listo! La reunion ya esta en el calendario con el link de Meet.',
    'Agendado! Les va a llegar la invitacion a todos.',
    'Perfecto, ya quedo en Google Calendar.',
  ],
  
  // Optimizar
  optimizar_cpa: [
    'CPA alto? Uf, el dolor de todo marketer. Veamos que podemos hacer.',
    'El CPA duele eh? Vamos a ver como lo bajamos.',
  ],
  optimizar_low: [
    'Bajo rendimiento? Hora de meter mano y optimizar.',
    'Necesita un poco de amor esa campana. Vamos a darle.',
  ],
  
  // General responses
  client_selected: (clientName: string) => [
    `${clientName}, excelente! Que necesitan?`,
    `Ah, ${clientName}! Que hacemos para ellos?`,
    `${clientName}, dale! Sigo...`,
  ],
  
  // Priority responses
  priority_alta: [
    'Prioridad alta! Le meto pata entonces.',
    'Alta prioridad, entendido. Esto va primero.',
    'Urgente! Ya lo pongo arriba de todo.',
  ],
  priority_media: [
    'Prioridad media, perfecto. Lo agendamos bien.',
    'Media, gotcha. Lo metemos en el flujo normal.',
  ],
  priority_baja: [
    'Baja prioridad, cuando se pueda. Lo tenemos en cuenta.',
    'Sin apuro entonces. Lo hacemos cuando podamos.',
  ],
  
  // Success messages
  success_urgent: [
    'Tarea creada con prioridad ALTA! Ya le aviso al equipo. Vamos a resolverlo!',
    'Listo! Esta en el tope de la lista. El equipo ya esta avisado.',
    'Creada y marcada como urgente! Nos ponemos en eso ya.',
  ],
  success_normal: [
    'Listo! Tarea creada. Cualquier cosa chiflame!',
    'Hecho! Ya quedo cargada. Necesitas algo mas?',
    'Perfecto! Tarea en el sistema. Estamos en contacto!',
  ],
  success_placas: [
    'Listo! Le aviso a Flor. Va a quedar espectacular!',
    'Cargado! Flor ya tiene el pedido. Te va a encantar!',
  ],
}

const getRandomResponse = (responses: string[]) => responses[Math.floor(Math.random() * responses.length)]

// ── Client Context (for future AI recommendations) ───────────────────────────

interface ClientContext {
  id: string
  name: string
  plan?: string
}

// Get client context from loaded dbClientes
const getClientContextFromDb = (clientId: string, clientes: DbCliente[]): ClientContext | null => {
  const client = clientes.find(c => c.id === clientId)
  if (!client) return null
  
  return {
    id: client.id,
    name: client.nombre_del_negocio,
    plan: client.plan || undefined,
  }
}

// ── Seguimiento Templates by Plan ──���������������────────────────────────────���──�����───────���──

const SEGUIMIENTO_TEMPLATES = {
  estrategico: (clientName: string) => `¡Hola ${clientName}! 👋 Buen lunes.

Desde el equipo de Operaciones de **MDK** te compartimos los hitos clave en los que vamos a estar trabajando en tu cuenta esta semana:

🎯 **Foco principal:** [Ej: Optimización de campañas post-informe de cierre / Lanzamiento de la nueva segmentación]

✅ **Checklist de la semana:**
— [Item 1: acción concreta]
— [Item 2: seguimiento o ajuste técnico]
— [Item 3: preparación de reporte o análisis]

🚀 **Objetivo:** [Resultado esperado. Ej: Recuperar el CPL a los niveles de la semana 2 del mes anterior.]`,

  esencial: (clientName: string) => `¡Hola ${clientName}! 👋 Buen lunes.

Esta semana en tu cuenta vamos a estar trabajando en:

🎯 [Una sola línea con el foco de la semana. Ej: Optimización de campañas y revisión de trackeo.]

🚀 Objetivo: [Una sola línea. Ej: Mantener el CPL dentro del rango acordado.]

Cualquier consulta, acá estamos. 💪`,

  default: (clientName: string) => `¡Hola ${clientName}! 👋 Buen lunes.

Te escribimos desde el equipo de MDK para darte el seguimiento semanal de tu cuenta.

Cualquier consulta, estamos a disposición.`,
}

const getSeguimientoTemplate = (plan: string | null | undefined, clientName: string): string => {
  const planLower = (plan || '').toLowerCase()
  if (planLower.includes('estrat')) {
    return SEGUIMIENTO_TEMPLATES.estrategico(clientName)
  } else if (planLower.includes('esencial')) {
    return SEGUIMIENTO_TEMPLATES.esencial(clientName)
  }
  return SEGUIMIENTO_TEMPLATES.default(clientName)
}

// ── Task Templates ────────────────────────────────────────────────────────────

interface TaskTemplate {
  id: string
  label: string
  icon: React.ReactNode
  type: TaskType
  defaultAssignee?: string
  defaultPriority?: TaskPriority
  flow: FlowStep[]
}

type FlowStep = 
  | { type: 'select_client' }
  | { type: 'select_assignee' }
  | { type: 'input'; key: string; question: string; placeholder?: string; followUp?: string }
  | { type: 'number'; key: string; question: string; min?: number; max?: number }
  | { type: 'options'; key: string; question: string; options: { label: string; value: string; emoji?: string }[] }
| { type: 'multi_input'; key: string; question: string; placeholder?: string }
    | { type: 'date_time'; key: string; question: string }
  | { type: 'priority' }
  | { type: 'select_due_date' }
  | { type: 'confirm' }
  | { type: 'confirm_meeting' }

const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'cotizar',
    label: 'Cotizar una tarea',
    icon: <Calculator className="h-4 w-4" />,
    type: 'soporte',
    flow: [
      { type: 'select_client' },
      { type: 'input', key: 'title', question: 'Contame, que necesitas cotizar?', placeholder: 'Ej: Desarrollo de landing con formulario...' },
      { type: 'number', key: 'hours', question: 'Tenes una estimacion de horas en mente? (pone 0 si no sabes)' },
      { type: 'select_assignee' },
      { type: 'priority' },
      { type: 'select_due_date' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'pedido_diseno',
    label: 'Pedido a Diseno',
    icon: <Palette className="h-4 w-4" />,
    type: 'diseno',
    defaultAssignee: 'flor',
    flow: [
      { type: 'select_client' },
      { type: 'options', key: 'designCategory', question: 'Que tipo de pedido es?', options: [
        { label: 'Placas / Imagenes', value: 'placas', emoji: '🖼' },
        { label: 'Videos', value: 'videos', emoji: '🎬' },
        { label: 'Landing / Web', value: 'landing', emoji: '🌐' },
        { label: 'Tareas operativas web', value: 'operativo', emoji: '🔧' },
      ]},
      // Dynamic steps based on designCategory - handled in processStep
  
    ],
  },
  {
    id: 'landing',
    label: 'Crear una landing',
    icon: <Globe className="h-4 w-4" />,
    type: 'desarrollo',
    flow: [
      { type: 'select_client' },
      { type: 'input', key: 'title', question: 'Genial! Como se va a llamar esta landing?', placeholder: 'Ej: Landing promo verano 2024' },
      { type: 'input', key: 'url', question: 'Tienen algun dominio/URL en mente?', placeholder: 'Ej: promo.cliente.com o lo dejamos nosotros' },
      { type: 'options', key: 'hasDesign', question: 'Ya tienen el diseno armado?', options: [
        { label: 'Si, esta listo', value: 'yes', emoji: '✅' },
        { label: 'No, hay que disenarlo', value: 'no', emoji: '🎨' },
        { label: 'Tienen referencias', value: 'references', emoji: '🔗' },
      ]},
      { type: 'options', key: 'hasForm', question: 'Va a tener formulario?', options: [
        { label: 'Si, formulario de contacto', value: 'contact', emoji: '📝' },
        { label: 'Si, con integracion a CRM', value: 'crm', emoji: '🔄' },
        { label: 'No, solo informativa', value: 'no', emoji: '📖' },
      ]},
      { type: 'select_assignee' },
      { type: 'priority' },
      { type: 'select_due_date' },
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
        { label: 'Meta Ads', value: 'meta', emoji: '📘' },
        { label: 'Google Ads', value: 'google', emoji: '🔍' },
        { label: 'Ambas', value: 'both', emoji: '🎯' },
      ]},
      { type: 'options', key: 'issue', question: 'Que esta pasando?', options: [
        { label: 'Bajo rendimiento general', value: 'low_performance', emoji: '📉' },
        { label: 'CPA muy alto', value: 'high_cpa', emoji: '💸' },
        { label: 'Pocas conversiones', value: 'low_conversions', emoji: '😕' },
        { label: 'Revision general', value: 'general', emoji: '🔎' },
      ]},
      { type: 'input', key: 'details', question: 'Algun dato mas que me sirva? (metricas, fechas, etc)', placeholder: 'Ej: El CPA subio de $500 a $1200 esta semana' },
      { type: 'select_assignee' },
      { type: 'priority' },
      { type: 'select_due_date' },
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
        { label: 'Landing web', value: 'landing', emoji: '🌐' },
        { label: 'Meta Lead Ads', value: 'meta_leads', emoji: '📘' },
        { label: 'Google Lead Forms', value: 'google_leads', emoji: '🔍' },
        { label: 'WhatsApp', value: 'whatsapp', emoji: '💬' },
        { label: 'Otro', value: 'other', emoji: '🔗' },
      ]},
      { type: 'input', key: 'formName', question: 'Como se llama el formulario o la landing?', placeholder: 'Ej: Formulario de contacto principal' },
      { type: 'input', key: 'webUrl', question: 'Cual es la URL? (si aplica)', placeholder: 'Ej: www.cliente.com/contacto' },
      { type: 'options', key: 'destination', question: 'A donde tienen que llegar los leads?', options: [
        { label: 'CRM Aurelia', value: 'aurelia', emoji: '💜' },
        { label: 'CRM del cliente', value: 'client_crm', emoji: '🏢' },
        { label: 'Google Sheets', value: 'sheets', emoji: '📊' },
        { label: 'WhatsApp', value: 'whatsapp', emoji: '💬' },
        { label: 'Email', value: 'email', emoji: '📧' },
      ]},
      { type: 'select_assignee' },
      { type: 'priority' },
      { type: 'select_due_date' },
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
        { label: 'No llegan los leads', value: 'no_leads', emoji: '🚫' },
        { label: 'Llegan duplicados', value: 'duplicates', emoji: '👯' },
        { label: 'Faltan campos/datos', value: 'missing_data', emoji: '❓' },
        { label: 'Error en la conexion', value: 'connection_error', emoji: '��' },
        { label: 'Revision preventiva', value: 'preventive', emoji: '🔍' },
      ]},
      { type: 'input', key: 'formName', question: 'Que formulario o integracion hay que revisar?', placeholder: 'Ej: Formulario de Meta Leads' },
      { type: 'input', key: 'details', question: 'Algun detalle mas?', placeholder: 'Ej: El ultimo lead que llego bien fue el viernes...' },
      { type: 'select_assignee' },
      { type: 'priority' },
      { type: 'select_due_date' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'falta_datos',
    label: 'Peligro! Falta de datos',
    icon: <AlertTriangle className="h-4 w-4" />,
    type: 'integracion',
    defaultPriority: 'alta',
    flow: [
      { type: 'select_client' },
      { type: 'options', key: 'area', question: 'Que no cunda el panico! Que pensas que puede ser?', options: [
        { label: 'Integraciones', value: 'integrations', emoji: '🔌' },
        { label: 'Campanas', value: 'campaign', emoji: '📢' },
        { label: 'Tracking/Pixel', value: 'tracking', emoji: '📍' },
        { label: 'Todo... estamos en problemas', value: 'everything', emoji: '🔥' },
        { label: 'Ni idea, hay que investigar', value: 'unknown', emoji: '🕵️' },
      ]},
      { type: 'input', key: 'title', question: 'Describime el problema', placeholder: 'Ej: No llegaron leads desde el viernes a la noche...' },
      { type: 'input', key: 'lastData', question: 'Cuando fue el ultimo dato que llego bien?', placeholder: 'Ej: El viernes 15:30 llego el ultimo lead' },
      { type: 'select_assignee' },
      { type: 'select_due_date' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'seguimiento',
    label: 'Enviar seguimiento al cliente',
    icon: <Mail className="h-4 w-4" />,
    type: 'crm',
    flow: [
      { type: 'select_client' },
      { type: 'options', key: 'reason', question: 'Cual es el motivo?', options: [
        { label: 'Revisar performance', value: 'performance', emoji: '📊' },
        { label: 'Renovacion contrato', value: 'renewal', emoji: '📝' },
        { label: 'Propuesta comercial', value: 'proposal', emoji: '💼' },
        { label: 'Reclamo del cliente', value: 'complaint', emoji: '😤' },
        { label: 'Check-in mensual', value: 'monthly', emoji: '📅' },
        { label: 'Buenas noticias!', value: 'good_news', emoji: '🎉' },
      ]},
      { type: 'input', key: 'notes', question: 'Algun punto importante para el seguimiento?', placeholder: 'Ej: Comentarle los resultados del ultimo mes...' },
      { type: 'priority' },
      { type: 'select_due_date' },
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
        { label: 'Mensual de resultados', value: 'monthly', emoji: '📅' },
        { label: 'Analisis de campana', value: 'campaign', emoji: '📈' },
        { label: 'Comparativo periodos', value: 'comparative', emoji: '⚖️' },
        { label: 'Informe especial', value: 'special', emoji: '⭐' },
      ]},
      { type: 'input', key: 'period', question: 'Que periodo abarca?', placeholder: 'Ej: Marzo 2024 o Q1 2024' },
      { type: 'priority' },
      { type: 'select_due_date' },
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
      { type: 'options', key: 'trackingType', question: 'Que necesitas?', options: [
        { label: 'Configurar pixel Meta', value: 'meta_pixel', emoji: '📘' },
        { label: 'Configurar Google Tag', value: 'google_tag', emoji: '🏷️' },
        { label: 'Eventos de conversion', value: 'conversions', emoji: '🎯' },
        { label: 'Revisar tracking actual', value: 'review', emoji: '🔎' },
        { label: 'Configurar todo desde cero', value: 'full_setup', emoji: '🚀' },
      ]},
      { type: 'input', key: 'webUrl', question: 'En que sitio web?', placeholder: 'Ej: www.cliente.com' },
      { type: 'priority' },
      { type: 'select_due_date' },
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
        { label: 'Meta vs CRM', value: 'meta_crm', emoji: '📘↔️💜' },
        { label: 'Google vs CRM', value: 'google_crm', emoji: '🔍↔️💜' },
        { label: 'Landing vs CRM', value: 'landing_crm', emoji: '🌐↔️💜' },
        { label: 'Meta vs Google', value: 'meta_google', emoji: '📘↔️🔍' },
        { label: 'Otro', value: 'other', emoji: '🤔' },
      ]},
      { type: 'input', key: 'title', question: 'Contame mas, que numeros no cierran?', placeholder: 'Ej: Meta dice 50 leads pero el CRM tiene 35...' },
      { type: 'input', key: 'period', question: 'De que periodo estamos hablando?', placeholder: 'Ej: Esta semana o Marzo 2024' },
      { type: 'priority' },
      { type: 'select_due_date' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'otro',
    label: 'Otro',
    icon: <Sparkles className="h-4 w-4" />,
    type: 'soporte',
    flow: [
      { type: 'select_client' },
      { type: 'input', key: 'title', question: 'Dale, contame que necesitas!', placeholder: 'Describime la tarea...' },
      { type: 'multi_input', key: 'details', question: 'Algun detalle extra que me quieras contar?', placeholder: 'Links, contexto, urgencia...' },
      { type: 'priority' },
      { type: 'select_due_date' },
      { type: 'confirm' },
    ],
  },
  {
    id: 'reunion',
    label: 'Reunion',
    icon: <Calendar className="h-4 w-4" />,
    type: 'soporte',
    flow: [
      { type: 'select_client' },
      { type: 'input', key: 'title', question: 'Cual es el tema de la reunion?', placeholder: 'Ej: Revision mensual, Kick-off campana, etc.' },
      { type: 'options', key: 'meetingType', question: 'Que tipo de reunion es?', options: [
        { label: 'Revision de resultados', value: 'review', emoji: '📊' },
        { label: 'Planificacion', value: 'planning', emoji: '📝' },
        { label: 'Kick-off', value: 'kickoff', emoji: '🚀' },
        { label: 'Seguimiento', value: 'followup', emoji: '🔄' },
        { label: 'Reclamo/Urgente', value: 'urgent', emoji: '🚨' },
        { label: 'Otro', value: 'other', emoji: '📅' },
      ]},
      { type: 'date_time', key: 'meetingDateTime', question: 'Cuando seria la reunion?' },
      { type: 'options', key: 'meetingDuration', question: 'Cuanto tiempo duraria?', options: [
        { label: '15 minutos', value: '15', emoji: '⚡' },
        { label: '30 minutos', value: '30', emoji: '⏱️' },
        { label: '45 minutos', value: '45', emoji: '⏰' },
        { label: '1 hora', value: '60', emoji: '🕐' },
        { label: '1.5 horas', value: '90', emoji: '🕑' },
        { label: '2 horas', value: '120', emoji: '🕒' },
      ]},
      { type: 'options', key: 'addMeet', question: 'Agrego link de Google Meet?', options: [
        { label: 'Si, agregar Meet', value: 'yes', emoji: '📹' },
        { label: 'No, es presencial', value: 'no', emoji: '���' },
      ]},
      { type: 'input', key: 'attendees', question: 'Emails de los participantes (separados por coma)', placeholder: 'cliente@email.com, otro@email.com' },
      { type: 'priority' },
      { type: 'confirm_meeting' },
    ],
  },
]

// ── Chat Message Types ────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  options?: { label: string; value: string; icon?: React.ReactNode; emoji?: string }[]
  isInput?: boolean
  inputPlaceholder?: string
  isNumber?: boolean
  isPriority?: boolean
  isConfirm?: boolean
  isDateTime?: boolean
  isMeetingConfirm?: boolean
  taskSummary?: {
  title: string
  client: string
  type: string
  priority: string
  assignee: string
  dueDate?: string
  }
  meetingSummary?: {
    title: string
    client: string
    dateTime: string
    duration: number
    addMeet: boolean
    attendees: string[]
  }
  typing?: boolean
}

// ── Chat Bubble Component ─────────────────────────────────────────────────────

function ChatBubble({ message, onSelect, onInputSubmit, inputValue, setInputValue, isLast }: {
  message: ChatMessage
  onSelect?: (value: string) => void
  onInputSubmit?: () => void
  inputValue: string
  setInputValue: (v: string) => void
  isLast: boolean
}) {
  const isAssistant = message.role === 'assistant'

  if (message.typing) {
    return (
      <div className="flex gap-3">
        <Avatar className="h-8 w-8 shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-500">
          <AvatarFallback className="bg-transparent text-white text-xs">
            <Sparkles className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="rounded-2xl rounded-tl-md bg-muted/50 px-4 py-3">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    )
  }

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
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isAssistant 
            ? 'bg-muted/50 rounded-tl-md' 
            : 'bg-primary text-primary-foreground rounded-tr-md'
        )}>
          {message.content}
        </div>

        {/* Template options - grid layout for initial selection with scroll */}
        {isAssistant && message.options && message.options.length > 6 && isLast && (
          <div className="max-h-[280px] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2 w-full">
              {message.options.map((opt) => (
                <Button
                  key={opt.value}
                  variant="outline"
                  size="sm"
                  className="h-auto py-2.5 px-3 text-xs gap-2 justify-start hover:bg-primary hover:text-primary-foreground transition-all hover:scale-[1.02]"
                  onClick={() => onSelect?.(opt.value)}
                >
                  {opt.icon}
                  <span className="truncate">{opt.label}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Regular options - flex wrap */}
        {isAssistant && message.options && message.options.length <= 6 && isLast && (
          <div className="flex flex-wrap gap-2">
            {message.options.map((opt) => (
              <Button
                key={opt.value}
                variant="outline"
                size="sm"
                className="h-auto py-2 px-3 text-xs gap-1.5 hover:bg-primary hover:text-primary-foreground transition-all hover:scale-[1.02]"
                onClick={() => onSelect?.(opt.value)}
              >
                {opt.emoji && <span>{opt.emoji}</span>}
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
              min="0"
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
                  'h-auto py-2 px-3 text-xs gap-1.5 transition-all hover:scale-105',
                  p === 'alta' && 'hover:bg-red-500/20 hover:border-red-500/50',
                  p === 'media' && 'hover:bg-yellow-500/20 hover:border-yellow-500/50',
                  p === 'baja' && 'hover:bg-green-500/20 hover:border-green-500/50',
                )}
                onClick={() => onSelect?.(p)}
              >
                {p === 'alta' && <Flame className="h-3.5 w-3.5 text-red-500" />}
                {p === 'media' && <Zap className="h-3.5 w-3.5 text-yellow-500" />}
                {p === 'baja' && <Coffee className="h-3.5 w-3.5 text-green-500" />}
                {PRIORITY_CONFIG[p].label}
              </Button>
            ))}
          </div>
        )}

        {/* Confirm with summary */}
        {isAssistant && message.isConfirm && message.taskSummary && isLast && (
          <div className="space-y-3 w-full">
            <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-xs border">
              <div className="flex justify-between items-start gap-2">
                <span className="text-muted-foreground shrink-0">Tarea:</span>
                <span className="font-medium text-right">{message.taskSummary.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente:</span>
                <span>{message.taskSummary.client}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipo:</span>
                <span className="capitalize">{message.taskSummary.type.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Prioridad:</span>
                <Badge variant="outline" className={cn(
                  'text-[10px]',
                  message.taskSummary.priority === 'Alta' && 'border-red-500/50 text-red-500',
                  message.taskSummary.priority === 'Media' && 'border-yellow-500/50 text-yellow-500',
                  message.taskSummary.priority === 'Baja' && 'border-green-500/50 text-green-500',
                )}>
                  {message.taskSummary.priority}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Asignado:</span>
                <span>{message.taskSummary.assignee}</span>
              </div>

            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1.5 bg-green-600 hover:bg-green-700 flex-1"
                onClick={() => onSelect?.('confirm')}
              >
                <PartyPopper className="h-4 w-4" />
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

        {/* DateTime input */}
        {isAssistant && message.isDateTime && isLast && (
          <div className="flex gap-2 w-full max-w-xs">
            <Input
              type="datetime-local"
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

        {/* Meeting confirm with summary */}
        {isAssistant && message.isMeetingConfirm && message.meetingSummary && isLast && (
          <div className="space-y-3 w-full">
            <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-xs border">
              <div className="flex justify-between items-start gap-2">
                <span className="text-muted-foreground shrink-0">Reunion:</span>
                <span className="font-medium text-right">{message.meetingSummary.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente:</span>
                <span>{message.meetingSummary.client}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha y hora:</span>
                <span>{message.meetingSummary.dateTime ? new Date(message.meetingSummary.dateTime).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duracion:</span>
                <span>{message.meetingSummary.duration} minutos</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Google Meet:</span>
                {message.meetingSummary.addMeet ? (
                  <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-500 gap-1">
                    <Video className="h-3 w-3" />
                    Si
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">No (presencial)</span>
                )}
              </div>
              {message.meetingSummary.attendees.length > 0 && (
                <div className="flex justify-between items-start gap-2">
                  <span className="text-muted-foreground shrink-0">Participantes:</span>
                  <span className="text-right text-[10px]">{message.meetingSummary.attendees.join(', ')}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 flex-1"
                onClick={() => onSelect?.('confirm_meeting')}
              >
                <Calendar className="h-4 w-4" />
                Crear en Calendar
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

export function NewTaskModal({ open, onOpenChange, initialDueDate, initialMode = 'ai' }: NewTaskModalProps) {
  const addTask = useTaskStore((s) => s.addTask)
  const supabase = createClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [quickMode, setQuickMode] = useState(initialMode === 'manual')
  
  // Quick mode form state
  const [quickTitle, setQuickTitle] = useState('')
  const [quickClientIds, setQuickClientIds] = useState<string[]>([])
  const [quickType, setQuickType] = useState<string>('')
  const [quickPriority, setQuickPriority] = useState<TaskPriority | ''>('')
  const [quickAssigneeIds, setQuickAssigneeIds] = useState<string[]>([])
  const [quickDueDate, setQuickDueDate] = useState(() => 
    initialDueDate ? initialDueDate.toISOString().split('T')[0] : ''
  )
  const [quickComment, setQuickComment] = useState('')
  const [quickDescription, setQuickDescription] = useState('')
  const [quickStatus, setQuickStatus] = useState<string>('pendiente')
  const [activeTab, setActiveTab] = useState<'tarea' | 'documento'>('tarea')
  const [reminderDate, setReminderDate] = useState<string>('')
  const [reminderTime, setReminderTime] = useState<string>('')
  const [reminderMode, setReminderMode] = useState<'asignados' | 'personalizar'>('asignados')
  const [reminderCustomIds, setReminderCustomIds] = useState<string[]>([])
  const [pendingAttachments, setPendingAttachments] = useState<{ url: string; name: string; mimeType: string }[]>([])
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  
  // Update quickDueDate when initialDueDate changes (e.g., from calendar)
  useEffect(() => {
    if (open && initialDueDate) {
      setQuickDueDate(initialDueDate.toISOString().split('T')[0])
    }
  }, [open, initialDueDate])
  
  // Dynamic data from database
  const [dbClientes, setDbClientes] = useState<DbCliente[]>([])
  const [dbColaboradores, setDbColaboradores] = useState<DbColaborador[]>([])
  const [dbTiposTarea, setDbTiposTarea] = useState<DbTipoTarea[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; nombre: string; apellido?: string; avatar_url?: string | null } | null>(null)
  
  const fullName = (colab: DbColaborador) => 
    [colab.nombre, colab.apellido].filter(Boolean).join(' ')
  
  // Load dynamic data when modal opens
  useEffect(() => {
    if (!open) return
    
    async function loadData() {
      // Get logged-in collaborator by email (colaboradores has no user_id column)
      const { data: { user } } = await getAuthUser()
      if (user?.email) {
        const { data: colab } = await supabase
          .from('colaboradores')
          .select('id, nombre, apellido, avatar_url')
          .eq('email', user.email)
          .single()
        if (colab) setCurrentUser(colab)
      }
      
  const [clientesRes, colabRes, tiposRes] = await Promise.all([
  supabase.from('clientes').select('id, nombre_del_negocio, plan').order('nombre_del_negocio'),
        supabase.from('colaboradores').select('id, nombre, apellido, avatar_url').order('nombre'),
        supabase.from('tipo_de_tareas').select('id, nombre, activo').eq('activo', true).order('nombre'),
      ])
      
      if (clientesRes.data) setDbClientes(clientesRes.data)
      if (colabRes.data) setDbColaboradores(colabRes.data)
      if (tiposRes.data) setDbTiposTarea(tiposRes.data)
    }
    
    loadData()
  }, [open])
  
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [taskData, setTaskData] = useState<Record<string, string>>({})
  const [clientContext, setClientContext] = useState<ClientContext | null>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuickMode(initialMode === 'manual')
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: getRandomGreeting(),
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
      setClientContext(null)
    }
  }, [open, initialMode])

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])

  // Add message with typing effect
  const addAssistantMessage = (message: Omit<ChatMessage, 'id' | 'role'>, delay = 400) => {
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      setMessages((prev) => [...prev, { ...message, id: `msg-${Date.now()}`, role: 'assistant' }])
    }, delay)
  }

  // Get personality response for quantities
  const getQuantityResponse = (template: TaskTemplate, quantity: number): string | null => {
    if (template.id === 'placas') {
      if (quantity >= 15) {
        return getRandomResponse(PERSONALITY_RESPONSES.placas_high(quantity)) + ' ' + 
               getRandomResponse(PERSONALITY_RESPONSES.placas_high_followup)
      } else if (quantity >= 8) {
        return getRandomResponse(PERSONALITY_RESPONSES.placas_medium(quantity))
      } else if (quantity > 0) {
        return getRandomResponse(PERSONALITY_RESPONSES.placas_low(quantity))
      }
    }
    
    if (template.id === 'cotizar' && quantity >= 40) {
      return getRandomResponse(PERSONALITY_RESPONSES.cotizar_high_hours(quantity))
    }

    return null
  }

  // Design subtype configuration with deadlines and requirements
  const DESIGN_SUBTYPES: Record<string, { 
    needsQuantity?: boolean
    needsFiles?: boolean
    daysMin: number
    daysMax: number
    title: string
    needsIntegration?: boolean
  }> = {
    // Placas
    'placas_material_propio': { needsQuantity: true, daysMin: 1, daysMax: 2, title: 'Placas con material propio' },
    'placas_ia': { needsQuantity: true, daysMin: 1, daysMax: 2, title: 'Placas con IA' },
    'placas_modificacion': { needsFiles: true, daysMin: 1, daysMax: 1, title: 'Modificaciones en placas' },
    // Videos
    'video_material_propio': { needsQuantity: true, needsFiles: true, daysMin: 2, daysMax: 3, title: 'Edicion de video' },
    'video_ia': { needsQuantity: true, daysMin: 2, daysMax: 3, title: 'Video con IA' },
    'video_modificacion': { needsFiles: true, daysMin: 1, daysMax: 2, title: 'Modificacion de video' },
    'video_plantilla': { needsQuantity: true, daysMin: 1, daysMax: 2, title: 'Videos plantilla' },
    // Landing
    'landing_wordpress': { daysMin: 2, daysMax: 3, title: 'Landing Wordpress', needsIntegration: true },
    'landing_ghl': { daysMin: 2, daysMax: 3, title: 'Landing GoHighLevel', needsIntegration: true },
    'landing_v0': { daysMin: 2, daysMax: 3, title: 'Landing V0', needsIntegration: true },
    'landing_banners': { daysMin: 1, daysMax: 2, title: 'Banners para landing' },
    'landing_modificaciones': { daysMin: 1, daysMax: 2, title: 'Modificaciones de landing' },
    // Operativo
    'op_formularios': { daysMin: 0, daysMax: 1, title: 'Formularios' },
    'op_accesos': { daysMin: 0, daysMax: 1, title: 'Generacion de accesos' },
    'op_problemas': { daysMin: 2, daysMax: 3, title: 'Revision de problemas' },
    'op_mantenimiento': { daysMin: 1, daysMax: 2, title: 'Mantenimiento de landing' },
  }

  // Calculate recommended date (next business day + days offset)
  const getRecommendedDate = (daysMin: number, daysMax: number): Date => {
    const today = new Date()
    let date = new Date(today)
    date.setDate(date.getDate() + daysMax)
    
    // Skip weekends
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1)
    }
    
    return date
  }

  // Handle design subtype flow
  const handleDesignSubtypeFlow = async (subtype: string, data: Record<string, string>) => {
    const config = DESIGN_SUBTYPES[subtype]
    if (!config) {
      // If category selected, show subtype options
      if (['placas', 'videos', 'landing', 'operativo'].includes(subtype)) {
        // Re-process the step with category set
        processStep(selectedTemplate!, currentStepIndex, { ...data, designCategory: subtype })
        return
      }
      return
    }

    const client = dbClientes.find(c => c.id === data.clientId)
    const florColaborador = dbColaboradores.find(c => c.nombre.toLowerCase().includes('flor'))
    const ayeColaborador = dbColaboradores.find(c => c.nombre.toLowerCase().includes('aye'))
    
    // Store subtype
    const newData = { ...data, designSubtype: subtype, designTitle: config.title }

    // Ask for quantity if needed
    if (config.needsQuantity) {
      addAssistantMessage({
        content: 'Cuantos necesitas?',
        isNumber: true,
      }, 300)
      setTaskData(newData)
      setDesignFlowState({ step: 'quantity', config, subtype })
      return
    }

    // Ask for files if needed
    if (config.needsFiles) {
      addAssistantMessage({
        content: 'Necesito que me pases los archivos. Podes subir los archivos al crear la tarea o indicarme donde estan.',
        isInput: true,
        inputPlaceholder: 'Ej: Te los paso por Drive / Los subo ahora / Estan en el chat de WhatsApp',
      }, 300)
      setTaskData(newData)
      setDesignFlowState({ step: 'files', config, subtype })
      return
    }

    // Go to concept/description
    continueDesignFlow(newData, config, subtype)
  }

  // Continue design flow after quantity/files
  const continueDesignFlow = (data: Record<string, string>, config: typeof DESIGN_SUBTYPES[string], subtype: string) => {
    // Ask for concept/description
    addAssistantMessage({
      content: 'Contame un poco mas sobre lo que necesitas. Algun concepto, idea, o referencia?',
      isInput: true,
      inputPlaceholder: 'Ej: Promo de verano, colores frescos, estilo minimalista...',
    }, 300)
    setTaskData(data)
    setDesignFlowState({ step: 'concept', config, subtype })
  }

  // Finish design flow with assignment and date
  const finishDesignFlow = async (data: Record<string, string>, config: typeof DESIGN_SUBTYPES[string], subtype: string) => {
    const florColaborador = dbColaboradores.find(c => c.nombre.toLowerCase().includes('flor'))
    const ayeColaborador = dbColaboradores.find(c => c.nombre.toLowerCase().includes('aye'))
    const recommendedDate = getRecommendedDate(config.daysMin, config.daysMax)
    
    // If needs integration, ask about Aye
    if (config.needsIntegration && ayeColaborador) {
      addAssistantMessage({
        content: `Este trabajo lo asigno a ${florColaborador?.nombre || 'Flor'} para el diseno. Necesitas que agregue a ${ayeColaborador.nombre} para las integraciones?`,
        options: [
          { label: `Si, agregar a ${ayeColaborador.nombre}`, value: 'add_aye', emoji: '👥' },
          { label: 'No, solo diseno por ahora', value: 'only_flor', emoji: '🎨' },
        ],
      }, 300)
      setTaskData({ ...data, recommendedDate: recommendedDate.toISOString() })
      setDesignFlowState({ step: 'ask_integration', config, subtype })
      return
    }

    // Recommend date and ask for confirmation
    const dateStr = recommendedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
    addAssistantMessage({
      content: `Perfecto! Te recomiendo fecha de entrega para el **${dateStr}** (${config.daysMin}-${config.daysMax} dias habiles). Te parece bien o preferis otra fecha?`,
      options: [
        { label: `Si, para el ${dateStr}`, value: 'accept_date', emoji: '✅' },
        { label: 'Prefiero elegir otra fecha', value: 'choose_date', emoji: '📅' },
        { label: 'Sin fecha limite', value: 'no_date', emoji: '🔓' },
      ],
    }, 300)
    setTaskData({ ...data, recommendedDate: recommendedDate.toISOString(), assigneeId: florColaborador?.id || '' })
    setDesignFlowState({ step: 'confirm_date', config, subtype })
  }

  // Design flow state
  const [designFlowState, setDesignFlowState] = useState<{
    step: string
    config: typeof DESIGN_SUBTYPES[string]
    subtype: string
  } | null>(null)

  // Show design confirmation
  const showDesignConfirmation = (data: Record<string, string>) => {
    const client = dbClientes.find(c => c.id === data.clientId)
    const florColaborador = dbColaboradores.find(c => c.nombre.toLowerCase().includes('flor'))
    const ayeColaborador = dbColaboradores.find(c => c.nombre.toLowerCase().includes('aye'))
    
    // Build title
    const subtype = data.designSubtype
    const config = DESIGN_SUBTYPES[subtype]
    let title = config?.title || data.designTitle || 'Pedido a Diseno'
    if (data.quantity) {
      title = `${data.quantity}x ${title}`
    }
    title = `${title} - ${client?.nombre_del_negocio || 'Cliente'}`
    
    // Build assignee string
    let assigneeStr = florColaborador?.nombre || 'Flor'
    if (data.assigneeIds) {
      const ids = data.assigneeIds.split(',')
      if (ids.length > 1 && ayeColaborador && ids.includes(ayeColaborador.id)) {
        assigneeStr = `${florColaborador?.nombre || 'Flor'} y ${ayeColaborador.nombre}`
      }
    }
    
    addAssistantMessage({
      content: 'Perfecto! Te armo el resumen:',
      isConfirm: true,
      taskSummary: {
        title,
        client: client?.nombre_del_negocio || 'Sin cliente',
        type: 'diseno',
        priority: 'Media',
        assignee: assigneeStr,
        dueDate: data.dueDate ? new Date(data.dueDate).toLocaleDateString('es-AR') : undefined,
      },
    }, 300)
    
    // Update taskData for creation
    setTaskData({
      ...data,
      title,
      assigneeId: florColaborador?.id || '',
    })
    setDesignFlowState({ ...designFlowState!, step: 'confirm' })
  }

  // Process flow step
  const processStep = (template: TaskTemplate, stepIndex: number, data: Record<string, string>) => {
    const step = template.flow[stepIndex]
    if (!step) return

    let messageContent: Omit<ChatMessage, 'id' | 'role'> = { content: '' }

    switch (step.type) {
  case 'select_client':
  messageContent = {
  content: 'Para que cliente es?',
  options: dbClientes.map((c) => ({ label: c.nombre_del_negocio, value: c.id })),
  }
  break
      
      case 'select_assignee':
        messageContent = {
          content: 'A quien se lo asigno?',
          options: dbColaboradores.map((c) => ({ label: c.nombre, value: c.id })),
        }
        break

      case 'input':
        messageContent = {
          content: step.question,
          isInput: true,
          inputPlaceholder: step.placeholder,
        }
        break

      case 'number':
        messageContent = {
          content: step.question,
          isNumber: true,
        }
        break

      case 'options':
        messageContent = {
          content: step.question,
          options: step.options.map(o => ({ ...o, emoji: o.emoji })),
        }
        break

      case 'multi_input':
        messageContent = {
          content: step.question,
          isInput: true,
          inputPlaceholder: step.placeholder,
        }
        break

      case 'date_time':
        messageContent = {
          content: step.question,
          isDateTime: true,
        }
        break

      case 'select_due_date':
        messageContent = {
          content: 'Para cuando necesitas que este listo?',
          isDateTime: true,
        }
        break

      case 'confirm_meeting':
        const meetingClient = dbClientes.find((c) => c.id === data.clientId)
        const meetingTitle = data.title || 'Reunion'
        const duration = parseInt(data.meetingDuration || '30')
        
        messageContent = {
          content: 'Perfecto! Te muestro el resumen de la reunion:',
          isMeetingConfirm: true,
          meetingSummary: {
            title: meetingTitle,
            client: meetingClient?.nombre_del_negocio || 'Sin cliente',
            dateTime: data.meetingDateTime,
            duration: duration,
            addMeet: data.addMeet === 'yes',
            attendees: data.attendees?.split(',').map(e => e.trim()).filter(Boolean) || [],
          },
        }
        break

      case 'priority':
        if (template.defaultPriority) {
          setTaskData((prev) => ({ ...prev, priority: template.defaultPriority! }))
          processStep(template, stepIndex + 1, { ...data, priority: template.defaultPriority! })
          return
        }
        messageContent = {
          content: 'Que prioridad le damos?',
          isPriority: true,
        }
        break

      case 'dynamic_design_flow':
        // Handle dynamic design flow based on designCategory
        const category = data.designCategory
        
        if (category === 'placas') {
          // Ask for subtype of placas
          messageContent = {
            content: 'Que tipo de placas?',
            options: [
              { label: 'Placas con material propio', value: 'placas_material_propio', emoji: '📸' },
              { label: 'Placas con IA', value: 'placas_ia', emoji: '🤖' },
              { label: 'Modificaciones en placas existentes', value: 'placas_modificacion', emoji: '✏️' },
            ],
          }
        } else if (category === 'videos') {
          messageContent = {
            content: 'Que tipo de video?',
            options: [
              { label: 'Edicion con material propio', value: 'video_material_propio', emoji: '🎥' },
              { label: 'Video con IA', value: 'video_ia', emoji: '🤖' },
              { label: 'Modificaciones en videos existentes', value: 'video_modificacion', emoji: '✏️' },
              { label: 'Videos plantilla (ej: Almundo)', value: 'video_plantilla', emoji: '📋' },
            ],
          }
        } else if (category === 'landing') {
          messageContent = {
            content: 'Que necesitas para la landing?',
            options: [
              { label: 'Diseno de landing en Wordpress', value: 'landing_wordpress', emoji: '🔵', hint: '2-3 dias habiles' },
              { label: 'Diseno de landing en GoHighLevel', value: 'landing_ghl', emoji: '����', hint: '2-3 dias habiles' },
              { label: 'Diseno de landing en V0', value: 'landing_v0', emoji: '⚫', hint: '2-3 dias habiles' },
              { label: 'Diseno de banners para landing', value: 'landing_banners', emoji: '🖼', hint: '1-2 dias habiles' },
              { label: 'Modificaciones de estructura', value: 'landing_modificaciones', emoji: '🔧', hint: '1-2 dias habiles' },
            ],
          }
        } else if (category === 'operativo') {
          messageContent = {
            content: 'Que tarea operativa?',
            options: [
              { label: 'Cambios o generacion de formularios', value: 'op_formularios', emoji: '📝', hint: '0-1 dias habiles' },
              { label: 'Generacion de accesos', value: 'op_accesos', emoji: '🔑', hint: '0-1 dias habiles' },
              { label: 'Revision de problemas en landing', value: 'op_problemas', emoji: '🔍', hint: '2-3 dias habiles' },
              { label: 'Mantenimiento general', value: 'op_mantenimiento', emoji: '🛠', hint: '1-2 dias habiles' },
            ],
          }
        }
        break

      case 'confirm':
        const client = CLIENTS.find((c) => c.id === data.clientId)
        const assignee = template.defaultAssignee 
          ? ASSIGNEES.find((a) => a.id === template.defaultAssignee)
          : ASSIGNEES[0]
        
        let title = data.title || template.label
        if (template.id === 'placas' && data.quantity) {
          title = `${data.quantity} placas - ${data.title || data.concept || client?.name}`
        }
        if (template.id === 'falta_datos') {
          title = `URGENTE: ${data.title || 'Falta de datos'}`
        }

        const priority = data.priority || template.defaultPriority || 'media'

        messageContent = {
          content: template.id === 'falta_datos' 
            ? 'Ok, esto va con prioridad ALTA. Mira el resumen:'
            : 'Perfecto! Te armo el resumen:',
          isConfirm: true,
          taskSummary: {
            title,
            client: client?.name || 'Sin cliente',
            type: template.type,
            priority: PRIORITY_CONFIG[priority as TaskPriority]?.label || 'Media',
            assignee: assignee?.name || 'Sin asignar',
          },
        }
        break

      default:
        return
    }

    addAssistantMessage(messageContent)
    setCurrentStepIndex(stepIndex)
  }

  // Handle quick task creation (without Madky)
  const handleQuickCreate = async () => {
    if (!quickTitle.trim() || quickClientIds.length === 0) return
    
    setIsCreating(true)
    
    try {
      // Build clients array
      const clients = quickClientIds
        .map(id => dbClientes.find(c => c.id === id))
        .filter((c): c is DbCliente => c !== undefined)
        .map(c => ({ id: c.id, nombre_del_negocio: c.nombre_del_negocio }))
      
      // Build assignees array
      const assignees = quickAssigneeIds
        .map(id => dbColaboradores.find(a => a.id === id))
        .filter((a): a is DbColaborador => a !== undefined)
        .map(a => ({ id: a.id, nombre: a.nombre, avatar_url: a.avatar_url }))
      
      const firstClient = clients[0]
      const firstAssignee = assignees[0]
      
      // Build initial comment if provided
      const comments: TaskComment[] = []
      if (quickComment.trim()) {
        comments.push({
          id: `comment-${Date.now()}`,
          content: quickComment.trim(),
          userId: currentUser?.id || 'system',
          userName: currentUser ? [currentUser.nombre, currentUser.apellido].filter(Boolean).join(' ') : 'Sistema',
          userAvatar: currentUser?.avatar_url || null,
          createdAt: new Date(),
        })
      }
      
      const newTaskId = await addTask({
        title: quickTitle,
        description: quickDescription || null,
        clientId: firstClient?.id || '',
        clientIds: quickClientIds,
        clientName: firstClient?.nombre_del_negocio || undefined,
        assigneeId: firstAssignee?.id || '',
        assignees,
        status: quickStatus as TaskStatus,
        priority: (quickPriority || 'media') as TaskPriority,
        type: quickType,
        dueDate: quickDueDate ? new Date(quickDueDate + 'T12:00:00') : null,
        customFields: {},
        createdById: currentUser?.id || null,
        comments,
      } as any)

      // Save pending attachments to tarea_adjuntos after task creation
      if (pendingAttachments.length > 0 && newTaskId) {
        try {
          await supabase.from('tarea_adjuntos').insert(
            pendingAttachments.map(att => ({
              tarea_id: newTaskId,
              nombre: att.name,
              url: att.url,
              tipo: att.mimeType,
              subido_por: currentUser?.id || null,
            }))
          )
        } catch (attachmentError) {
          console.error('[v0] Error saving attachments:', attachmentError)
          // Continue even if attachments fail
        }
      }

      // Create reminder if configured (non-blocking)
      if ((reminderDate || reminderTime) && newTaskId) {
        const reminderRecipients = reminderMode === 'asignados' 
          ? quickAssigneeIds 
          : reminderCustomIds
        
        if (reminderRecipients.length > 0) {
          // Fire and forget - don't block on reminder creation
          fetch('/api/notifications/recordatorio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: newTaskId,
              tituloTarea: quickTitle,
              fecha: reminderDate || null,
              hora: reminderTime || null,
              colaboradorIds: reminderRecipients,
            }),
          }).catch(err => console.error('[v0] Error creating reminder:', err))
        }
      }

      // Reset quick mode state
      setQuickTitle('')
      setQuickDescription('')
      setQuickClientIds([])
      setQuickType('')
      setQuickPriority('')
      setQuickStatus('pendiente')
      setQuickAssigneeIds([])
      setQuickDueDate('')
      setQuickComment('')
      setPendingAttachments([])
      setReminderDate('')
      setReminderTime('')
      setReminderMode('asignados')
      setReminderCustomIds([])
      setActiveTab('tarea')
      setQuickMode(false)
      onOpenChange(false)
    } catch (error) {
      console.error('[v0] Error creating task:', error)
    } finally {
      setIsCreating(false)
    }
  }

  // Rest of component code continues below

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] p-0 gap-0 overflow-hidden">
        {/* Header with Tabs */}
        <div className="flex items-center justify-between px-2 border-b pr-10">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1">
            <TabsList className="bg-transparent h-auto p-0 gap-0">
              <TabsTrigger
                value="tarea"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
              >
                Tarea
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Task tab */}
        {activeTab === 'tarea' && (
          <div className="flex flex-col">
            {/* Type selectors row */}
            <div className="flex items-center gap-2 px-5 py-3 border-b">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    {dbTiposTarea.find(t => t.id === quickType)?.nombre || 'Tarea'}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2 max-h-[320px] overflow-y-auto" align="start">
                  <div className="text-xs text-muted-foreground px-2 py-1.5 mb-1 sticky top-0 bg-popover">Tipos de tarea</div>
                  <div className="space-y-0.5">
                    {dbTiposTarea.map((tipo) => (
                      <Button
                        key={tipo.id}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs h-8 font-normal"
                        onClick={() => setQuickType(tipo.id)}
                      >
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 mr-2 shrink-0" />
                        <span className="truncate">{tipo.nombre}</span>
                        {quickType === tipo.id && <Check className="h-3 w-3 ml-auto shrink-0 text-primary" />}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Title input */}
            <div className="px-5 pt-4 pb-1">
              <input
                type="text"
                placeholder="Nombre de Tarea"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                className="w-full text-2xl font-light border-0 outline-none bg-transparent placeholder:text-muted-foreground/40"
                autoFocus
              />
            </div>

            {/* Description area */}
            <div className="px-5 py-2 min-h-[60px]">
              <div
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => {
                  const text = (e.target as HTMLDivElement).textContent || ''
                  setQuickDescription(text)
                }}
                className="min-h-[48px] text-sm outline-none text-muted-foreground empty:before:content-['Añade_una_descripcion...'] empty:before:text-muted-foreground/40 empty:before:pointer-events-none"
              />
            </div>

            {/* Property chips row */}
            <div className="flex items-center gap-2 px-5 py-3 border-t flex-wrap">

              {/* Assignee chip */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                    <User className="h-3.5 w-3.5" />
                    {quickAssigneeIds.length === 0
                      ? 'Persona asignada'
                      : quickAssigneeIds.length === 1
                        ? fullName(dbColaboradores.find(c => c.id === quickAssigneeIds[0]) || { nombre: '', apellido: null, id: '', avatar_url: null })
                        : `${quickAssigneeIds.length} asignados`
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar..." className="h-8 text-xs" />
                    <CommandList className="max-h-48 overflow-y-auto">
                      <CommandEmpty className="text-xs text-muted-foreground py-3 text-center">Sin resultados</CommandEmpty>
                      <CommandGroup>
                        {dbColaboradores.map((colab) => (
                          <CommandItem
                            key={colab.id}
                            value={fullName(colab)}
                            onSelect={() => setQuickAssigneeIds(prev =>
                              prev.includes(colab.id)
                                ? prev.filter(id => id !== colab.id)
                                : [...prev, colab.id]
                            )}
                            className="text-xs flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer aria-selected:bg-muted aria-selected:text-foreground data-[selected=true]:bg-muted"
                          >
                            <Avatar className="h-6 w-6 shrink-0">
                              {colab.avatar_url && <AvatarImage src={colab.avatar_url} />}
                              <AvatarFallback className="text-[9px] bg-muted-foreground/20">{fullName(colab).split(' ').map(n => n[0]).join('')}</AvatarFallback>
                            </Avatar>
                            <span className="flex-1 truncate">{fullName(colab)}</span>
                            {quickAssigneeIds.includes(colab.id) && (
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Due date chip */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {quickDueDate
                      ? new Date(quickDueDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
                      : 'Fecha limite'
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  <input
                    type="date"
                    value={quickDueDate}
                    onChange={(e) => setQuickDueDate(e.target.value)}
                    className="bg-transparent border border-border rounded px-2 py-1 text-sm"
                  />
                </PopoverContent>
              </Popover>

              {/* Client chip */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                    <Building2 className="h-3.5 w-3.5" />
                    {quickClientIds.length === 0
                      ? 'Cliente'
                      : quickClientIds.length === 1
                        ? dbClientes.find(c => c.id === quickClientIds[0])?.nombre_del_negocio || 'Cliente'
                        : `${quickClientIds.length} clientes`
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="mb-2 px-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Clientes</p>
                  </div>
                  <Command>
                    <div className="relative mb-1">
                      <CommandInput placeholder="Buscar cliente..." className="h-8 text-xs pl-8" />
                    </div>
                    <CommandList className="max-h-52 overflow-y-auto">
                      <CommandEmpty className="text-xs text-muted-foreground py-3 text-center">Sin resultados</CommandEmpty>
                      <CommandGroup>
                        {dbClientes.map((cliente) => {
                          const selected = quickClientIds.includes(cliente.id)
                          return (
                            <CommandItem
                              key={cliente.id}
                              value={cliente.nombre_del_negocio}
                              onSelect={() =>
                                setQuickClientIds(prev =>
                                  prev.includes(cliente.id)
                                    ? prev.filter(id => id !== cliente.id)
                                    : [...prev, cliente.id]
                                )
                              }
                              className={`text-xs flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer aria-selected:bg-muted aria-selected:text-foreground ${selected ? 'bg-muted/60' : ''}`}
                            >
                              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-transparent'}`}>
                                {selected && <Check className="h-3 w-3" />}
                              </div>
                              <span className="flex-1 truncate">{cliente.nombre_del_negocio}</span>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  {quickClientIds.length > 0 && (
                    <div className="mt-2 pt-2 border-t flex flex-wrap gap-1">
                      {quickClientIds.map(id => {
                        const c = dbClientes.find(cl => cl.id === id)
                        if (!c) return null
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 text-[11px] bg-muted text-foreground rounded px-1.5 py-0.5"
                          >
                            {c.nombre_del_negocio}
                            <button
                              onClick={() => setQuickClientIds(prev => prev.filter(i => i !== id))}
                              className="text-muted-foreground hover:text-foreground ml-0.5"
                            >
                              ×
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {/* Priority chip */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                    <Flag className="h-3.5 w-3.5" />
                    {quickPriority.charAt(0).toUpperCase() + quickPriority.slice(1)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  {['baja', 'media', 'alta'].map((priority) => (
                    <Button
                      key={priority}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs h-8"
                      onClick={() => setQuickPriority(priority)}
                    >
                      <Flag className={`h-3.5 w-3.5 mr-2 ${
                        priority === 'alta' ? 'text-red-500' :
                        priority === 'media' ? 'text-yellow-500' :
                        'text-green-500'
                      }`} />
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      {quickPriority === priority && <Check className="h-3 w-3 ml-auto" />}
                    </Button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Upload file button */}
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 gap-1.5 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingFile}
              >
                <Paperclip className="h-3.5 w-3.5" />
                {isUploadingFile ? 'Subiendo...' : 'Subir Archivo'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || [])
                  if (!files.length) return
                  setIsUploadingFile(true)
                  for (const file of files) {
                    try {
                      const sanitizedName = file.name
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/\s+/g, '_')
                        .replace(/[^a-zA-Z0-9_.-]/g, '')
                      const path = `${currentUser?.id || 'anon'}/new/${Date.now()}-${sanitizedName}`

                      const { error: uploadError } = await supabase.storage
                        .from('task-files')
                        .upload(path, file)

                      if (uploadError) {
                        console.error('[v0] Storage error:', uploadError)
                        continue
                      }

                      const { data: { publicUrl } } = supabase.storage
                        .from('task-files')
                        .getPublicUrl(path)

                      setPendingAttachments(prev => [...prev, {
                        url: publicUrl,
                        name: file.name,
                        mimeType: file.type,
                      }])
                    } catch (error) {
                      console.error('[v0] Upload error:', error)
                    }
                  }
                  setIsUploadingFile(false)
                  e.target.value = ''
                }}
              />

              {/* Add more property button */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground hover:border-foreground hover:bg-accent">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1" align="start">
                  <div className="text-xs text-muted-foreground px-2 py-1.5 mb-1">Agregar propiedad</div>
                  <p className="text-xs text-muted-foreground px-2 py-2 italic">Próximamente</p>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-8 font-normal gap-2">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Agregar enlace
                  </Button>
                </PopoverContent>
              </Popover>
            </div>

            {/* Pending attachments preview */}
            {pendingAttachments.length > 0 && (
              <div className="px-5 py-2 border-t bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">Archivos adjuntos ({pendingAttachments.length})</p>
                <div className="flex flex-wrap gap-2">
                  {pendingAttachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-background border border-border">
                      {att.mimeType.startsWith('image/') ? (
                        <img src={att.url} alt={att.name} className="h-6 w-6 object-cover rounded" />
                      ) : (
                        <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="max-w-[100px] truncate">{att.name}</span>
                      <button 
                        type="button"
                        onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reminder section */}
            <div className="px-5 py-3 border-t bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Crear recordatorio</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {reminderDate
                        ? new Date(reminderDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
                        : 'Fecha'
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" align="start">
                    <input
                      type="date"
                      value={reminderDate}
                      onChange={(e) => setReminderDate(e.target.value)}
                      className="bg-transparent border border-border rounded px-2 py-1 text-sm"
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                      <Clock className="h-3.5 w-3.5" />
                      {reminderTime || 'Hora'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" align="start">
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className="bg-transparent border border-border rounded px-2 py-1 text-sm"
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                      <Users className="h-3.5 w-3.5" />
                      {reminderMode === 'asignados' 
                        ? 'Asignados' 
                        : reminderCustomIds.length > 0 
                          ? `${reminderCustomIds.length} seleccionado${reminderCustomIds.length > 1 ? 's' : ''}`
                          : 'Para'
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 p-2" align="start">
                    <div className="space-y-1">
                      <button
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${reminderMode === 'asignados' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}
                        onClick={() => {
                          setReminderMode('asignados')
                          setReminderCustomIds([])
                        }}
                      >
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 text-left">Enviar a asignados</span>
                        {reminderMode === 'asignados' && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </button>
                      <div className="h-px bg-border my-1" />
                      <p className="text-[11px] text-muted-foreground px-2 py-1 uppercase tracking-wide">O elige personas</p>
                      <div className="max-h-44 overflow-y-auto space-y-0.5">
                        {dbColaboradores.map((colab) => (
                          <button
                            key={colab.id}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${reminderCustomIds.includes(colab.id) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}
                            onClick={() => {
                              setReminderMode('personalizar')
                              setReminderCustomIds(prev =>
                                prev.includes(colab.id)
                                  ? prev.filter(id => id !== colab.id)
                                  : [...prev, colab.id]
                              )
                            }}
                          >
                            <Avatar className="h-6 w-6 shrink-0">
                              {colab.avatar_url && <AvatarImage src={colab.avatar_url} />}
                              <AvatarFallback className="text-[9px] bg-muted-foreground/20">{colab.nombre.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="flex-1 text-left truncate">{colab.nombre}</span>
                            {reminderCustomIds.includes(colab.id) && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end px-5 py-3 border-t">
              <div className="flex items-center gap-2">
                {(() => {
                  const missing: string[] = []
                  if (!quickTitle.trim()) missing.push('nombre')
                  if (quickAssigneeIds.length === 0) missing.push('persona asignada')
                  if (quickClientIds.length === 0) missing.push('cliente')
                  if (!quickPriority) missing.push('prioridad')
                  const isValid = missing.length === 0
                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              className="h-8 px-4"
                              onClick={handleQuickCreate}
                              disabled={!isValid || isCreating}
                            >
                              {isCreating ? 'Creando...' : 'Crear Tarea'}
                              <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!isValid && (
                          <TooltipContent side="top" className="text-xs">
                            Falta: {missing.join(', ')}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Reminder tab - REMOVED, now integrated into tarea view */}
      </DialogContent>
    </Dialog>
  )
}
