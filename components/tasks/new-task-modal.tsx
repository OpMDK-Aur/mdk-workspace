'use client'

import { useState, useEffect, useRef } from 'react'
import type { TaskStatus, TaskPriority, TaskType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  useTaskStore,
  PRIORITY_CONFIG,
  TYPE_CONFIG,
  ASSIGNEES,
  CLIENTS,
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Zap,
  Coffee,
  PartyPopper,
  Flame,
  Calendar,
  Video,
  PenLine,
} from 'lucide-react'

interface NewTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
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
  // Future: these will come from the database
  activeCampaigns?: string[]
  pendingIntegrations?: string[]
  lastIssues?: string[]
  budget?: number
  platforms?: ('meta' | 'google')[]
  crmType?: string
  websites?: string[]
  formNames?: string[]
}

// Simulated client context - in the future this will come from Supabase
const getClientContext = (clientId: string): ClientContext | null => {
  const client = CLIENTS.find(c => c.id === clientId)
  if (!client) return null
  
  // TODO: In the future, fetch this from Supabase based on client history
  return {
    id: client.id,
    name: client.name,
    activeCampaigns: ['Campana Verano 2024', 'Remarketing'],
    platforms: ['meta', 'google'],
    crmType: 'aurelia',
    websites: ['www.ejemplo.com'],
    formNames: ['Formulario Contacto', 'Newsletter'],
  }
}

// ── Seguimiento Templates by Plan ─────────────────────────────────────────────

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
  | { type: 'multi_input'; key: string; question: string; placeholder?: string; hint?: string }
  | { type: 'date_time'; key: string; question: string; hint?: string }
  | { type: 'priority' }
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
      { type: 'number', key: 'quantity', question: 'Cuantas placas necesitas?' },
      { type: 'options', key: 'format', question: 'Que formatos?', options: [
        { label: 'Stories + Feed', value: 'stories_feed', emoji: '📱' },
        { label: 'Solo Stories', value: 'stories', emoji: '📲' },
        { label: 'Solo Feed', value: 'feed', emoji: '🖼' },
        { label: 'Carrusel', value: 'carousel', emoji: '🎠' },
        { label: 'Todos', value: 'all', emoji: '🎨' },
      ]},
      { type: 'input', key: 'concept', question: 'Algun concepto o idea para las placas?', placeholder: 'Ej: Promo verano, colores frescos, mostrar producto...' },
      { type: 'input', key: 'title', question: 'Como titulamos este pedido?', placeholder: 'Ej: Placas promo Black Friday' },
      { type: 'select_assignee' },
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
        { label: 'Error en la conexion', value: 'connection_error', emoji: '⚡' },
        { label: 'Revision preventiva', value: 'preventive', emoji: '🔍' },
      ]},
      { type: 'input', key: 'formName', question: 'Que formulario o integracion hay que revisar?', placeholder: 'Ej: Formulario de Meta Leads' },
      { type: 'input', key: 'details', question: 'Algun detalle mas?', placeholder: 'Ej: El ultimo lead que llego bien fue el viernes...' },
      { type: 'select_assignee' },
      { type: 'priority' },
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
      { type: 'multi_input', key: 'details', question: 'Algun detalle extra que me quieras contar?', placeholder: 'Links, contexto, urgencia...', hint: 'Podes dejarlo vacio si no hay nada mas' },
      { type: 'priority' },
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
        { label: 'No, es presencial', value: 'no', emoji: '🏢' },
      ]},
      { type: 'input', key: 'attendees', question: 'Emails de los participantes (separados por coma)', placeholder: 'cliente@email.com, otro@email.com', hint: 'Podes dejarlo vacio' },
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

        {/* Template options - grid layout for initial selection */}
        {isAssistant && message.options && message.options.length > 6 && isLast && (
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

export function NewTaskModal({ open, onOpenChange }: NewTaskModalProps) {
  const addTask = useTaskStore((s) => s.addTask)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [quickMode, setQuickMode] = useState(false)
  
  // Quick mode form state
  const [quickTitle, setQuickTitle] = useState('')
  const [quickClientId, setQuickClientId] = useState('')
  const [quickType, setQuickType] = useState<string>('')
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('media')
  const [quickAssigneeId, setQuickAssigneeId] = useState('')
  const [quickDueDate, setQuickDueDate] = useState('')
  
  // Dynamic data from database
  const [dbClientes, setDbClientes] = useState<DbCliente[]>([])
  const [dbColaboradores, setDbColaboradores] = useState<DbColaborador[]>([])
  const [dbTiposTarea, setDbTiposTarea] = useState<DbTipoTarea[]>([])
  
  // Load dynamic data
  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      
      const [clientesRes, colabRes, tiposRes] = await Promise.all([
        supabase.from('clientes').select('id, nombre_del_negocio, plan').order('nombre_del_negocio'),
        supabase.from('colaboradores').select('id, nombre, avatar_url').order('nombre'),
        supabase.from('tipo_de_tareas').select('id, nombre, activo').eq('activo', true).order('nombre'),
      ])
      
      if (clientesRes.data) setDbClientes(clientesRes.data)
      if (colabRes.data) setDbColaboradores(colabRes.data)
      if (tiposRes.data) setDbTiposTarea(tiposRes.data)
    }
    
    loadData()
  }, [])
  
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [taskData, setTaskData] = useState<Record<string, string>>({})
  const [clientContext, setClientContext] = useState<ClientContext | null>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
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
  }, [open])

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
          content: step.question + (step.hint ? ` (${step.hint})` : ''),
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
    if (!quickTitle.trim() || !quickClientId) return
    
    setIsCreating(true)
    const client = dbClientes.find(c => c.id === quickClientId)
    const assignee = dbColaboradores.find(a => a.id === quickAssigneeId)
    const tipoTarea = dbTiposTarea.find(t => t.id === quickType)
    
    await addTask({
      title: quickTitle,
      description: null,
      clientId: quickClientId,
      clientName: client?.nombre_del_negocio || '',
      assigneeId: assignee?.id || '',
      assigneeName: assignee?.nombre || '',
      assigneeAvatar: assignee?.avatar_url || null,
      status: 'pendiente' as TaskStatus,
      priority: quickPriority,
      type: quickType, // UUID from tipo_de_tareas
      dueDate: quickDueDate ? new Date(quickDueDate) : null,
      customFields: {},
    })
    
    setIsCreating(false)
    // Reset quick mode state
    setQuickTitle('')
    setQuickClientId('')
    setQuickType('')
    setQuickPriority('media')
    setQuickAssigneeId('')
    setQuickDueDate('')
    setQuickMode(false)
    onOpenChange(false)
  }

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    const template = TASK_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return

    setSelectedTemplate(template)
    
    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: template.label,
    }])

    // Special intro messages based on template
    let introMessage: string | null = null
    if (template.id === 'falta_datos') {
      introMessage = getRandomResponse(PERSONALITY_RESPONSES.falta_datos_calm)
    } else if (template.id === 'integrar' || template.id === 'revisar_integraciones') {
      introMessage = getRandomResponse(PERSONALITY_RESPONSES.integraciones_intro)
    } else if (template.id === 'otro') {
      introMessage = getRandomResponse(PERSONALITY_RESPONSES.otro_intro)
    } else if (template.id === 'reunion') {
      introMessage = getRandomResponse(PERSONALITY_RESPONSES.reunion_intro)
    }

    if (introMessage) {
      addAssistantMessage({ content: introMessage }, 300)
      setTimeout(() => processStep(template, 0, {}), 800)
    } else {
      setTimeout(() => processStep(template, 0, {}), 300)
    }
  }

  // Handle option selection
  const handleOptionSelect = async (value: string) => {
    if (!selectedTemplate) return

    const currentStep = selectedTemplate.flow[currentStepIndex]
    if (!currentStep) return

    // Handle confirm
    if (currentStep.type === 'confirm') {
      if (value === 'confirm') {
        await handleCreateTask()
      } else {
        onOpenChange(false)
      }
      return
    }

    // Handle meeting confirm
    if (currentStep.type === 'confirm_meeting') {
      if (value === 'confirm_meeting') {
        await handleCreateMeeting()
      } else {
        onOpenChange(false)
      }
      return
    }

    // Get display label
    let userMessage = value
    if (currentStep.type === 'select_client') {
      const client = dbClientes.find((c) => c.id === value)
      userMessage = client?.nombre_del_negocio || value
      // Load client context
      setClientContext(getClientContext(value))
    }
    if (currentStep.type === 'select_assignee') {
      const assignee = dbColaboradores.find((c) => c.id === value)
      userMessage = assignee?.nombre || value
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

    const stepKey = (currentStep as { key?: string }).key || currentStep.type
    const newData = { ...taskData, [stepKey]: value }
    
if (currentStep.type === 'select_client') {
      newData.clientId = value
      // Add personality response for client selection
      const client = dbClientes.find((c) => c.id === value)
      if (client) {
        addAssistantMessage({
          content: getRandomResponse(PERSONALITY_RESPONSES.client_selected(client.nombre_del_negocio))
        }, 300)
      }
    }
    
    if (currentStep.type === 'select_assignee') {
      newData.assigneeId = value
      const assignee = dbColaboradores.find((c) => c.id === value)
      if (assignee) {
        addAssistantMessage({
          content: `Perfecto! Se lo asigno a ${assignee.nombre}`
        }, 300)
      }
    }

    // Special responses for priority
    if (currentStep.type === 'priority') {
      let response: string
      if (value === 'alta') response = getRandomResponse(PERSONALITY_RESPONSES.priority_alta)
      else if (value === 'media') response = getRandomResponse(PERSONALITY_RESPONSES.priority_media)
      else response = getRandomResponse(PERSONALITY_RESPONSES.priority_baja)
      
      addAssistantMessage({ content: response }, 300)
    }

    // Special responses based on selection
    if (selectedTemplate.id === 'falta_datos' && stepKey === 'area' && value === 'everything') {
      addAssistantMessage({ 
        content: getRandomResponse(PERSONALITY_RESPONSES.falta_datos_everything) 
      }, 300)
    }

    if (selectedTemplate.id === 'optimizar' && stepKey === 'issue') {
      if (value === 'high_cpa') {
        addAssistantMessage({ content: getRandomResponse(PERSONALITY_RESPONSES.optimizar_cpa) }, 300)
      } else if (value === 'low_performance') {
        addAssistantMessage({ content: getRandomResponse(PERSONALITY_RESPONSES.optimizar_low) }, 300)
      }
    }

    setTaskData(newData)

    const delay = currentStep.type === 'select_client' || currentStep.type === 'select_assignee' || currentStep.type === 'priority' ? 800 : 400
    setTimeout(() => processStep(selectedTemplate, currentStepIndex + 1, newData), delay)
  }

  // Handle input submit
  const handleInputSubmit = () => {
    if (!selectedTemplate || !inputValue.trim()) return

    const currentStep = selectedTemplate.flow[currentStepIndex]
    if (!currentStep) return

    const value = inputValue.trim()

    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: value,
    }])

    // Quantity response
    if (currentStep.type === 'number') {
      const numValue = parseInt(value)
      const response = getQuantityResponse(selectedTemplate, numValue)
      if (response) {
        addAssistantMessage({ content: response }, 400)
      }
    }

    const stepKey = (currentStep as { key?: string }).key || currentStep.type
    const newData = { ...taskData, [stepKey]: value }
    setTaskData(newData)
    setInputValue('')

    const delay = currentStep.type === 'number' ? 1000 : 400
    setTimeout(() => processStep(selectedTemplate, currentStepIndex + 1, newData), delay)
  }

  // Create task
  // Create meeting in Google Calendar
  const handleCreateMeeting = async () => {
    if (!selectedTemplate) return
    
setIsCreating(true)
    
    const client = dbClientes.find((c) => c.id === taskData.clientId)
    const meetingTitle = `${taskData.title || 'Reunion'} - ${client?.nombre_del_negocio || 'Cliente'}`
    const startDateTime = new Date(taskData.meetingDateTime)
    const duration = parseInt(taskData.meetingDuration || '30')
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000)
    const addMeet = taskData.addMeet === 'yes'
    const attendees = taskData.attendees?.split(',').map(e => e.trim()).filter(Boolean) || []

    // Create the event using the token from database
    try {
      const response = await fetch('/api/google/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            title: meetingTitle,
            description: `Reunion con ${client?.nombre_del_negocio || 'cliente'}.\n\nCreado desde MDK Workspace.`,
            startDateTime: startDateTime.toISOString(),
            endDateTime: endDateTime.toISOString(),
            addMeet,
            attendees,
          },
        }),
      })

      const result = await response.json()

      if (result.success) {
        // Also create a task for the meeting
        const priority = (taskData.priority || 'media') as TaskPriority
        
        const meetingComment = `
          <p><strong>Reunion agendada en Google Calendar</strong></p>
          <p>Fecha: ${startDateTime.toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short' })}</p>
          <p>Duracion: ${duration} minutos</p>
          ${result.event.hangoutLink ? `<p><a href="${result.event.hangoutLink}" target="_blank">Link de Google Meet</a></p>` : ''}
          ${result.event.htmlLink ? `<p><a href="${result.event.htmlLink}" target="_blank">Ver en Calendar</a></p>` : ''}
        `

        const firstAssignee = dbColaboradores[0]
        // Find "Reunión con cliente" type from DB
        const reunionTipo = dbTiposTarea.find(t => t.nombre.toLowerCase().includes('reuni'))
        
        await addTask({
          title: meetingTitle,
          description: null,
          clientId: taskData.clientId || '',
          clientName: client?.nombre_del_negocio || '',
          assigneeId: firstAssignee?.id || '',
          assigneeName: firstAssignee?.nombre || '',
          assigneeAvatar: firstAssignee?.avatar_url || null,
          status: 'pendiente' as TaskStatus,
          priority,
          type: reunionTipo?.id || '', // UUID from tipo_de_tareas
          dueDate: startDateTime,
          customFields: {},
          comments: [{
            id: `comment-${Date.now()}`,
            content: meetingComment,
            userId: 'madky',
            userName: 'Madky (IA)',
            userAvatar: '',
            createdAt: new Date(),
          }],
        })

        addAssistantMessage({ 
          content: getRandomResponse(PERSONALITY_RESPONSES.reunion_calendar_success) + 
            (result.event.hangoutLink ? ` Link de Meet: ${result.event.hangoutLink}` : '')
        }, 300)

        setTimeout(() => {
          onOpenChange(false)
        }, 2000)
      } else if (result.needsReauth) {
        addAssistantMessage({ 
          content: 'Necesitas reconectar Google con permisos de Calendar. Anda a Plataformas y hace click en "Reconectar".' 
        }, 300)
      } else {
        addAssistantMessage({ 
          content: `Error al crear la reunion: ${result.error || 'Error desconocido'}` 
        }, 300)
      }
    } catch (err) {
      addAssistantMessage({ 
        content: `Hubo un error al crear la reunion: ${err instanceof Error ? err.message : 'Error desconocido'}` 
      }, 300)
    }

    setIsCreating(false)
  }

  // Create task
  const handleCreateTask = async () => {
    if (!selectedTemplate) return
    
    setIsCreating(true)

    const client = dbClientes.find((c) => c.id === taskData.clientId)
    const assignee = dbColaboradores.find((a) => a.id === taskData.assigneeId) || dbColaboradores[0]

    let title = taskData.title || selectedTemplate.label
    if (selectedTemplate.id === 'placas' && taskData.quantity) {
      title = `${taskData.quantity} placas - ${taskData.title || taskData.concept || client?.nombre_del_negocio}`
    }
    if (selectedTemplate.id === 'falta_datos') {
      title = `URGENTE: ${taskData.title || 'Falta de datos'}`
    }
    if (selectedTemplate.id === 'seguimiento') {
      const dayName = new Date().toLocaleDateString('es-AR', { weekday: 'long' })
      title = `Seguimiento semanal - ${client?.nombre_del_negocio || 'Cliente'} (${dayName})`
    }

    const priority = (taskData.priority || selectedTemplate.defaultPriority || 'media') as TaskPriority

    // Build initial comment from collected data AND the conversation
    const buildInitialComment = (): string => {
      const lines: string[] = []
      
      // For seguimiento tasks, add the template message first
      if (selectedTemplate.id === 'seguimiento') {
        const clientName = client?.contact_name || client?.nombre_del_negocio || 'equipo'
        const templateMessage = getSeguimientoTemplate(client?.plan, clientName)
        lines.push(`<p><strong>📋 Plantilla de mensaje (Plan ${client?.plan || 'Sin plan'}):</strong></p>`)
        lines.push(`<div style="background:#0f172a; border-radius:8px; padding:16px; margin:8px 0; border-left:3px solid #a855f7; white-space:pre-wrap; font-family:inherit;">${templateMessage}</div>`)
        lines.push('<hr style="border-color:#333; margin:16px 0;" />')
      }
      
      // Then add the full chat conversation
      lines.push(`<p><strong>Conversacion con Madky:</strong></p>`)
      lines.push('<div style="background:#1a1a2e; border-radius:8px; padding:12px; margin:8px 0;">')
      
      messages.forEach((msg) => {
        if (msg.role === 'assistant') {
          lines.push(`<p style="margin:8px 0;"><span style="color:#a855f7; font-weight:500;">Madky:</span> ${msg.content}</p>`)
        } else if (msg.role === 'user') {
          lines.push(`<p style="margin:8px 0;"><span style="color:#22c55e; font-weight:500;">Usuario:</span> ${msg.content}</p>`)
        }
      })
      
      lines.push('</div>')
      
      // Then add structured data summary
      lines.push(`<p style="margin-top:16px;"><strong>Resumen de datos:</strong></p>`)
      
      // Add all collected data as structured info
      const dataEntries: { label: string; value: string }[] = []
      
      if (taskData.format) {
        const formatLabels: Record<string, string> = {
          'stories_feed': 'Stories + Feed',
          'stories': 'Solo Stories',
          'feed': 'Solo Feed',
          'carousel': 'Carrusel',
          'all': 'Todos los formatos',
        }
        dataEntries.push({ label: 'Formato', value: formatLabels[taskData.format] || taskData.format })
      }
      if (taskData.quantity) dataEntries.push({ label: 'Cantidad', value: taskData.quantity })
      if (taskData.concept) dataEntries.push({ label: 'Concepto/Idea', value: taskData.concept })
      if (taskData.platform) {
        const platformLabels: Record<string, string> = {
          'meta': 'Meta Ads',
          'google': 'Google Ads',
          'both': 'Meta + Google',
        }
        dataEntries.push({ label: 'Plataforma', value: platformLabels[taskData.platform] || taskData.platform })
      }
      if (taskData.issue) {
        const issueLabels: Record<string, string> = {
          'low_performance': 'Bajo rendimiento general',
          'high_cpa': 'CPA muy alto',
          'low_conversions': 'Pocas conversiones',
          'general': 'Revision general',
        }
        dataEntries.push({ label: 'Problema', value: issueLabels[taskData.issue] || taskData.issue })
      }
      if (taskData.source) {
        const sourceLabels: Record<string, string> = {
          'landing': 'Landing web',
          'meta_leads': 'Meta Lead Ads',
          'google_leads': 'Google Lead Forms',
          'whatsapp': 'WhatsApp',
          'other': 'Otro',
        }
        dataEntries.push({ label: 'Origen de leads', value: sourceLabels[taskData.source] || taskData.source })
      }
      if (taskData.destination) {
        const destLabels: Record<string, string> = {
          'aurelia': 'CRM Aurelia',
          'client_crm': 'CRM del cliente',
          'sheets': 'Google Sheets',
          'whatsapp': 'WhatsApp',
          'email': 'Email',
        }
        dataEntries.push({ label: 'Destino', value: destLabels[taskData.destination] || taskData.destination })
      }
      if (taskData.problem) {
        const problemLabels: Record<string, string> = {
          'no_leads': 'No llegan los leads',
          'duplicates': 'Llegan duplicados',
          'missing_data': 'Faltan campos/datos',
          'connection_error': 'Error en la conexion',
          'preventive': 'Revision preventiva',
        }
        dataEntries.push({ label: 'Problema', value: problemLabels[taskData.problem] || taskData.problem })
      }
      if (taskData.area) {
        const areaLabels: Record<string, string> = {
          'integrations': 'Integraciones',
          'campaign': 'Campanas',
          'tracking': 'Tracking/Pixel',
          'everything': 'Todo',
          'unknown': 'Por investigar',
        }
        dataEntries.push({ label: 'Area afectada', value: areaLabels[taskData.area] || taskData.area })
      }
      if (taskData.formName) dataEntries.push({ label: 'Formulario', value: taskData.formName })
      if (taskData.webUrl) dataEntries.push({ label: 'URL', value: taskData.webUrl })
      if (taskData.url) dataEntries.push({ label: 'URL/Dominio', value: taskData.url })
      if (taskData.hasDesign) {
        const designLabels: Record<string, string> = {
          'yes': 'Si, esta listo',
          'no': 'No, hay que disenarlo',
          'references': 'Tienen referencias',
        }
        dataEntries.push({ label: 'Diseno', value: designLabels[taskData.hasDesign] || taskData.hasDesign })
      }
      if (taskData.hasForm) {
        const formLabels: Record<string, string> = {
          'contact': 'Formulario de contacto',
          'crm': 'Con integracion a CRM',
          'no': 'Solo informativa',
        }
        dataEntries.push({ label: 'Formulario', value: formLabels[taskData.hasForm] || taskData.hasForm })
      }
      if (taskData.reason) {
        const reasonLabels: Record<string, string> = {
          'performance': 'Revisar performance',
          'renewal': 'Renovacion contrato',
          'proposal': 'Propuesta comercial',
          'complaint': 'Reclamo del cliente',
          'monthly': 'Check-in mensual',
          'good_news': 'Buenas noticias',
        }
        dataEntries.push({ label: 'Motivo', value: reasonLabels[taskData.reason] || taskData.reason })
      }
      if (taskData.reportType) {
        const reportLabels: Record<string, string> = {
          'monthly': 'Mensual de resultados',
          'campaign': 'Analisis de campana',
          'comparative': 'Comparativo periodos',
          'special': 'Informe especial',
        }
        dataEntries.push({ label: 'Tipo de informe', value: reportLabels[taskData.reportType] || taskData.reportType })
      }
      if (taskData.trackingType) {
        const trackingLabels: Record<string, string> = {
          'meta_pixel': 'Configurar pixel Meta',
          'google_tag': 'Configurar Google Tag',
          'conversions': 'Eventos de conversion',
          'review': 'Revisar tracking actual',
          'full_setup': 'Configurar todo desde cero',
        }
        dataEntries.push({ label: 'Tipo de tracking', value: trackingLabels[taskData.trackingType] || taskData.trackingType })
      }
      if (taskData.dataSource) {
        const dataSourceLabels: Record<string, string> = {
          'meta_crm': 'Meta vs CRM',
          'google_crm': 'Google vs CRM',
          'landing_crm': 'Landing vs CRM',
          'meta_google': 'Meta vs Google',
          'other': 'Otro',
        }
        dataEntries.push({ label: 'Fuentes', value: dataSourceLabels[taskData.dataSource] || taskData.dataSource })
      }
      if (taskData.details) dataEntries.push({ label: 'Detalles', value: taskData.details })
      if (taskData.lastData) dataEntries.push({ label: 'Ultimo dato recibido', value: taskData.lastData })
      if (taskData.hours && parseInt(taskData.hours) > 0) dataEntries.push({ label: 'Horas estimadas', value: taskData.hours })
      if (taskData.period) dataEntries.push({ label: 'Periodo', value: taskData.period })
      if (taskData.notes) dataEntries.push({ label: 'Notas', value: taskData.notes })

      if (dataEntries.length > 0) {
        lines.push('<table style="width:100%; border-collapse:collapse; margin:8px 0;">')
        lines.push('<tbody>')
        dataEntries.forEach(entry => {
          lines.push(`<tr><td style="border:1px solid #333; padding:8px; background:#1a1a2e; font-weight:500; width:30%;">${entry.label}</td><td style="border:1px solid #333; padding:8px;">${entry.value}</td></tr>`)
        })
        lines.push('</tbody>')
        lines.push('</table>')
      }

      lines.push(`<p style="margin-top:12px; font-size:12px; color:#888;"><em>Creado via asistente Madky</em></p>`)
      
      return lines.join('')
    }

    const initialComment = {
      id: `comment-${Date.now()}`,
      content: buildInitialComment(),
      userId: 'madky',
      userName: 'Madky (IA)',
      userAvatar: '',
      createdAt: new Date(),
    }

    // Find matching type from DB based on template type
    const tipoTarea = dbTiposTarea.find(t => {
      const nombre = t.nombre.toLowerCase()
      if (selectedTemplate.type === 'integracion') return nombre.includes('integraci')
      if (selectedTemplate.type === 'desarrollo') return nombre.includes('desarrollo')
      if (selectedTemplate.type === 'reportes') return nombre.includes('informe') || nombre.includes('reporte')
      if (selectedTemplate.type === 'meta_ads') return nombre.includes('campana') || nombre.includes('pauta')
      if (selectedTemplate.type === 'soporte') return nombre.includes('soporte')
      return false
    })
    
    try {
      await addTask({
        title,
        description: null, // Description now goes to comments
        clientId: taskData.clientId || '',
        clientName: client?.nombre_del_negocio || '',
        assigneeId: assignee?.id || '',
        assigneeName: assignee?.nombre || '',
        assigneeAvatar: assignee?.avatar_url || null,
        status: 'pendiente' as TaskStatus,
        priority,
        type: tipoTarea?.id || '', // UUID from tipo_de_tareas
        dueDate: null,
        customFields: {},
        comments: [initialComment],
      })
      } catch (err) {
      console.error('Error creating task:', err)
    }

    // Success message
    let successMsg: string
    if (selectedTemplate.id === 'falta_datos') {
      successMsg = getRandomResponse(PERSONALITY_RESPONSES.success_urgent)
    } else if (selectedTemplate.id === 'placas') {
      successMsg = getRandomResponse(PERSONALITY_RESPONSES.success_placas)
    } else {
      successMsg = getRandomResponse(PERSONALITY_RESPONSES.success_normal)
    }

    setMessages((prev) => [...prev, {
      id: `success-${Date.now()}`,
      role: 'assistant',
      content: successMsg,
    }])

    setIsCreating(false)

    setTimeout(() => onOpenChange(false), 1800)
  }

  // Go back
  const handleBack = () => {
    setSelectedTemplate(null)
    setCurrentStepIndex(0)
    setTaskData({})
    setInputValue('')
    setClientContext(null)
    setQuickMode(false)
    setQuickTitle('')
    setQuickClientId('')
    setQuickType('')
    setQuickPriority('media')
    setQuickAssigneeId('')
    setQuickDueDate('')
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
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10">
          <div className="flex items-center gap-3">
            {(selectedTemplate || quickMode) && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                if (quickMode) {
                  setQuickMode(false)
                } else {
                  handleBack()
                }
              }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center shadow-lg",
                quickMode 
                  ? "bg-gradient-to-br from-emerald-500 to-teal-500" 
                  : "bg-gradient-to-br from-violet-500 to-fuchsia-500"
              )}>
                {quickMode ? <PenLine className="h-5 w-5 text-white" /> : <Sparkles className="h-5 w-5 text-white" />}
              </div>
              <div>
                <h3 className="text-sm font-semibold">{quickMode ? 'Tarea rapida' : ASSISTANT_NAME}</h3>
                <p className="text-xs text-muted-foreground">{quickMode ? 'Crear sin asistente' : 'Asistente de tareas MDK'}</p>
              </div>
            </div>
          </div>
          {!quickMode && !selectedTemplate && (
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1.5 text-xs"
              onClick={() => setQuickMode(true)}
            >
              <PenLine className="h-3.5 w-3.5" />
              Crear rapido
            </Button>
          )}
        </div>

        {/* Quick Mode Form */}
        {quickMode ? (
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quick-title">Titulo de la tarea *</Label>
              <Input
                id="quick-title"
                placeholder="Ej: Revisar campana de Meta Ads"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                autoFocus
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="quick-client">Cliente *</Label>
              <Select value={quickClientId} onValueChange={setQuickClientId}>
                <SelectTrigger id="quick-client">
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {dbClientes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre_del_negocio}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quick-type">Tipo de tarea</Label>
                <Select value={quickType} onValueChange={setQuickType}>
                  <SelectTrigger id="quick-type">
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {dbTiposTarea.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="quick-priority">Prioridad</Label>
                <Select value={quickPriority} onValueChange={(v) => setQuickPriority(v as TaskPriority)}>
                  <SelectTrigger id="quick-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quick-assignee">Asignar a</Label>
                <Select value={quickAssigneeId} onValueChange={setQuickAssigneeId}>
                  <SelectTrigger id="quick-assignee">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    {dbColaboradores.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="quick-due-date">Fecha limite</Label>
                <Input
                  id="quick-due-date"
                  type="date"
                  value={quickDueDate}
                  onChange={(e) => setQuickDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            
            <div className="pt-4 space-y-2">
              {/* Show create meeting button if type is "reunion" */}
              {dbTiposTarea.find(t => t.id === quickType)?.nombre?.toLowerCase().includes('reuni') && (
                <Button 
                  variant="outline"
                  className="w-full gap-2 border-orange-500/50 text-orange-400 hover:bg-orange-500/10" 
                  onClick={() => {
                    // Open Google Calendar to create meeting
                    const client = dbClientes.find(c => c.id === quickClientId)
                    const title = encodeURIComponent(quickTitle || `Reunion - ${client?.nombre_del_negocio || 'Cliente'}`)
                    const url = `https://calendar.google.com/calendar/u/0/r/eventedit?text=${title}&details=${encodeURIComponent('Creado desde MDK Workspace')}`
                    window.open(url, '_blank')
                  }}
                  disabled={!quickTitle.trim() || !quickClientId}
                >
                  <Video className="h-4 w-4" />
                  Crear reunion en Calendar
                </Button>
              )}
              <Button 
                className="w-full gap-2" 
                onClick={handleQuickCreate}
                disabled={!quickTitle.trim() || !quickClientId || isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Crear tarea
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* Chat area */
          <ScrollArea className="h-[420px] p-4" ref={scrollRef}>
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
            {isTyping && (
              <ChatBubble
                message={{ id: 'typing', role: 'assistant', content: '', typing: true }}
                onSelect={() => {}}
                onInputSubmit={() => {}}
                inputValue=""
                setInputValue={() => {}}
                isLast={false}
              />
            )}
            {isCreating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pl-11">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creando tarea...
              </div>
            )}
</div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
