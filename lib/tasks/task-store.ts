'use client'

import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { Task, TaskStatus, TaskPriority, TaskType, TaskCustomField, TaskComment, TaskFile, TaskQuotation } from '@/lib/types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const HOURLY_RATE = 150000 // $150,000 CLP
export const IVA_RATE = 0.21 // 21%

// ── Database Types ────────────────────────────────────────────────────────────

interface TareaDB {
  id: string
  titulo: string
  descripcion: string | null
  tipo_tarea_id: string | null
  cliente_id: string | null
  servicio_id: string | null
  asignado_a: string | null
  creado_por: string | null
  estado: string
  prioridad: string
  fecha_vencimiento: string | null
  fecha_completada: string | null
  hito_poe: string | null
  agente_id: string | null
  created_at: string
  updated_at: string
  contexto_chat: string | null
  // Joined relations
  clientes?: { id: string; nombre_del_negocio: string } | null
  colaboradores?: { id: string; nombre: string; apellido?: string | null; avatar_url?: string | null } | null
  tipo_de_tareas?: { id: string; nombre: string } | null
  creador?: { id: string; nombre: string; apellido?: string | null } | null
}

interface ComentarioDB {
  id: string
  tarea_id: string
  contenido: string
  autor_id: string | null
  autor_nombre: string
  es_sistema: boolean
  created_at: string
  updated_at: string
}

function mapComentarioToComment(comentario: ComentarioDB): TaskComment {
  return {
    id: comentario.id,
    content: comentario.contenido,
    userId: comentario.autor_id || 'system',
    userName: comentario.autor_nombre,
    userAvatar: null,
    createdAt: new Date(comentario.created_at),
  }
}

// Map DB estado to TaskStatus
function mapEstadoToStatus(estado: string): TaskStatus {
  const map: Record<string, TaskStatus> = {
    'pendiente': 'pendiente',
    'en_progreso': 'resolviendo',
    'resolviendo': 'resolviendo',
    'demorada': 'demorada',
    'pausada': 'pausada',
    'pendiente_aprobacion': 'pendiente_aprobacion',
    'completada': 'resuelto',
    'resuelto': 'resuelto',
  }
  return map[estado] || 'pendiente'
}

// Map DB prioridad to TaskPriority
function mapPrioridadToPriority(prioridad: string): TaskPriority {
  const map: Record<string, TaskPriority> = {
    'alta': 'alta',
    'media': 'media',
    'baja': 'baja',
  }
  return map[prioridad] || 'media'
}

// Convert DB tarea to Task
function mapTareaToTask(
  tarea: TareaDB, 
  colaboradoresMap?: Map<string, { id: string; nombre: string; apellido?: string | null; avatar_url?: string | null }>
): Task {
  // Build assignees array from asignados_a
  const assignees: Array<{ id: string; nombre: string; avatar_url: string | null }> = []
  if (tarea.asignados_a && tarea.asignados_a.length > 0 && colaboradoresMap) {
    for (const assigneeId of tarea.asignados_a) {
      const colab = colaboradoresMap.get(assigneeId)
      if (colab) {
        assignees.push({
          id: colab.id,
          nombre: [colab.nombre, colab.apellido].filter(Boolean).join(' '),
          avatar_url: colab.avatar_url || null,
        })
      }
    }
  } else if (tarea.colaboradores) {
    // Fallback to single colaborador for backwards compatibility
    assignees.push({
      id: tarea.colaboradores.id,
      nombre: [tarea.colaboradores.nombre, tarea.colaboradores.apellido].filter(Boolean).join(' '),
      avatar_url: tarea.colaboradores.avatar_url || null,
    })
  }

  return {
    id: tarea.id,
    title: tarea.titulo,
    description: tarea.descripcion,
    clientId: tarea.cliente_id || '',
    clientName: tarea.clientes?.nombre_del_negocio || 'Sin cliente',
    // Legacy single assignee (first in array or fallback)
    assigneeId: assignees[0]?.id || tarea.asignado_a || '',
    assigneeName: assignees[0]?.nombre || 'Sin asignar',
    assigneeAvatar: assignees[0]?.avatar_url || null,
    // Multi-assignee
    assignees,
    status: mapEstadoToStatus(tarea.estado),
    priority: mapPrioridadToPriority(tarea.prioridad),
    type: tarea.tipo_tarea_id || '', // UUID from tipo_de_tareas
    typeName: tarea.tipo_de_tareas?.nombre || '', // Display name
    dueDate: tarea.fecha_vencimiento ? new Date(tarea.fecha_vencimiento) : null,
    isActive: tarea.estado !== 'completada' && tarea.estado !== 'resuelto',
    customFields: {},
    timeSessions: [],
    totalTimeSec: 0,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [],
    files: [],
    quotation: null,
    createdById: tarea.creado_por || null,
    createdByName: tarea.creador 
      ? [tarea.creador.nombre, tarea.creador.apellido].filter(Boolean).join(' ')
      : 'Sistema',
    createdAt: new Date(tarea.created_at),
    updatedAt: new Date(tarea.updated_at),
  }
}

// ── Mock Data (fallback) ──────────────────────────────────────────────────────

const MOCK_TASKS: Task[] = [
  {
    id: '1',
    title: 'Desarrollo — Integracion Alambrados Patagonia',
    description: '<p>Implementar integracion con sistema de inventario</p><ul><li>Conexion API REST</li><li>Sincronizacion de productos</li><li>Mapeo de campos</li></ul>',
    clientId: 'alambrados',
    clientName: 'Alambrados Patagonia',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    assignees: [{ id: 'erika', nombre: 'Erika Gordillo', avatar_url: null }],
    status: 'pendiente',
    priority: 'alta',
    type: 'integracion',
    dueDate: new Date('2026-05-01'),
    isActive: true,
    customFields: {},
    timeSessions: [],
    totalTimeSec: 0,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [
      {
        id: 'c1',
        content: 'Inicio del proyecto confirmado con el cliente',
        userId: 'erika',
        userName: 'Erika Gordillo',
        userAvatar: null,
        createdAt: new Date('2026-04-20T10:30:00'),
      },
    ],
    files: [],
    quotation: {
      hours: 8,
      hourlyRate: HOURLY_RATE,
      subtotal: 8 * HOURLY_RATE,
      iva: 8 * HOURLY_RATE * IVA_RATE,
      total: 8 * HOURLY_RATE * (1 + IVA_RATE),
      notes: 'Incluye desarrollo y testing',
    },
    createdById: 'erika',
    createdByName: 'Erika Gordillo',
    createdAt: new Date('2026-04-20'),
    updatedAt: new Date('2026-04-20'),
  },
  {
    id: '2',
    title: 'NPS — Crear campos personalizados',
    description: '<p>Agregar campos de NPS al CRM</p>',
    clientId: 'mdk',
    clientName: 'MDK',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    assignees: [{ id: 'erika', nombre: 'Erika Gordillo', avatar_url: null }],
    status: 'pendiente',
    priority: 'alta',
    type: 'desarrollo',
    dueDate: new Date('2026-04-28'),
    isActive: true,
    customFields: {},
    timeSessions: [],
    totalTimeSec: 0,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [],
    files: [],
    quotation: null,
    createdById: 'erika',
    createdByName: 'Erika Gordillo',
    createdAt: new Date('2026-04-18'),
    updatedAt: new Date('2026-04-18'),
  },
  {
    id: '3',
    title: 'Icaro — Revisar conexion email',
    description: '<p>El cliente reporta problemas con envio de emails</p><p><strong>Error reportado:</strong> Los emails no llegan a los destinatarios</p>',
    clientId: 'icaro',
    clientName: 'Icaro',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'resolviendo',
    priority: 'alta',
    type: 'soporte',
    dueDate: new Date('2026-04-25'),
    isActive: true,
    customFields: {},
    timeSessions: [
      { id: 's1', startedAt: new Date('2026-04-23T10:00:00'), endedAt: new Date('2026-04-23T11:30:00'), durationSec: 5400 },
    ],
    totalTimeSec: 5400,
    isTimerRunning: true,
    timerStartedAt: new Date(),
    activities: [
      { id: 'a1', action: 'Inicio timer', timestamp: new Date(), userId: 'erika', userName: 'Erika Gordillo' },
    ],
    comments: [
      {
        id: 'c2',
        content: 'Revisando configuracion SMTP del servidor',
        userId: 'erika',
        userName: 'Erika Gordillo',
        userAvatar: null,
        createdAt: new Date('2026-04-24T09:15:00'),
      },
    ],
    files: [],
    quotation: null,
    createdById: 'ayelen',
    createdByName: 'Ayelen Suarez',
    createdAt: new Date('2026-04-22'),
    updatedAt: new Date('2026-04-24'),
  },
  {
    id: '4',
    title: 'Migracion de API',
    description: '<p>Migrar endpoints legacy a nueva version</p><pre><code>GET /api/v1/users → GET /api/v2/users\nPOST /api/v1/orders → POST /api/v2/orders</code></pre>',
    clientId: 'ics',
    clientName: 'ICS Prepaqa',
    assigneeId: 'ayelen',
    assigneeName: 'Ayelen Suarez',
    status: 'resolviendo',
    priority: 'alta',
    type: 'crm',
    dueDate: new Date('2026-04-30'),
    isActive: true,
    customFields: {
      sprint: { label: 'Sprint', type: 'text', value: 'Sprint 4' },
    },
    timeSessions: [
      { id: 's2', startedAt: new Date('2026-04-22T14:00:00'), endedAt: new Date('2026-04-22T18:00:00'), durationSec: 14400 },
    ],
    totalTimeSec: 14400,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [],
    files: [],
    quotation: {
      hours: 16,
      hourlyRate: HOURLY_RATE,
      subtotal: 16 * HOURLY_RATE,
      iva: 16 * HOURLY_RATE * IVA_RATE,
      total: 16 * HOURLY_RATE * (1 + IVA_RATE),
      notes: 'Migracion completa con documentacion',
    },
    createdById: 'ayelen',
    createdByName: 'Ayelen Suarez',
    createdAt: new Date('2026-04-15'),
    updatedAt: new Date('2026-04-22'),
  },
  {
    id: '5',
    title: 'Modificar estadio de funnel ventas',
    description: '<p>Ajustar etapas del pipeline de ventas</p>',
    clientId: 'mdk',
    clientName: 'MDK',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'demorada',
    priority: 'media',
    type: 'crm',
    dueDate: new Date('2026-04-20'),
    isActive: false,
    customFields: {},
    timeSessions: [],
    totalTimeSec: 3600,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [
      { id: 'a2', action: 'Marcada como demorada', timestamp: new Date('2026-04-21'), userId: 'erika', userName: 'Erika Gordillo' },
    ],
    comments: [
      {
        id: 'c3',
        content: 'Esperando feedback del equipo de ventas',
        userId: 'erika',
        userName: 'Erika Gordillo',
        userAvatar: null,
        createdAt: new Date('2026-04-21T14:00:00'),
      },
    ],
    files: [],
    quotation: null,
    createdById: 'erika',
    createdByName: 'Erika Gordillo',
    createdAt: new Date('2026-04-10'),
    updatedAt: new Date('2026-04-21'),
  },
  {
    id: '6',
    title: 'ADT: tablero automatico de control',
    description: '<p>Crear dashboard automatizado para Meta Ads</p>',
    clientId: 'adt',
    clientName: 'ADT',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'demorada',
    priority: 'media',
    type: 'meta_ads',
    dueDate: new Date('2026-04-26'),
    isActive: true,
    customFields: {
      cuenta_publicitaria: { label: 'Cuenta publicitaria', type: 'text', value: 'ADT Argentina' },
    },
    timeSessions: [],
    totalTimeSec: 7200,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [],
    files: [],
    quotation: null,
    createdById: 'erika',
    createdByName: 'Erika Gordillo',
    createdAt: new Date('2026-04-12'),
    updatedAt: new Date('2026-04-20'),
  },
  {
    id: '7',
    title: 'Del Sur: Modificacion del Looker Studio',
    description: '<p>Actualizar reportes en Looker Studio</p>',
    clientId: 'delsur',
    clientName: 'Del Sur Autos',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'pausada',
    priority: 'alta',
    type: 'reportes',
    dueDate: null,
    isActive: false,
    customFields: {},
    timeSessions: [],
    totalTimeSec: 1800,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [
      { id: 'a3', action: 'Pausada por cliente', timestamp: new Date('2026-04-19'), userId: 'erika', userName: 'Erika Gordillo' },
    ],
    comments: [],
    files: [],
    quotation: null,
    createdById: 'erika',
    createdByName: 'Erika Gordillo',
    createdAt: new Date('2026-04-08'),
    updatedAt: new Date('2026-04-19'),
  },
  {
    id: '8',
    title: 'Roller Pro — Mensajes de recontacto (24 y 48 hs)',
    description: '<p>Configurar automatizaciones de seguimiento</p>',
    clientId: 'rollerpro',
    clientName: 'Roller Pro',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'pendiente_aprobacion',
    priority: 'alta',
    type: 'crm',
    dueDate: new Date('2026-04-27'),
    isActive: true,
    customFields: {},
    timeSessions: [],
    totalTimeSec: 10800,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [
      {
        id: 'c4',
        content: 'Enviado para revision del cliente',
        userId: 'erika',
        userName: 'Erika Gordillo',
        userAvatar: null,
        createdAt: new Date('2026-04-23T16:30:00'),
      },
    ],
    files: [],
    quotation: {
      hours: 4,
      hourlyRate: HOURLY_RATE,
      subtotal: 4 * HOURLY_RATE,
      iva: 4 * HOURLY_RATE * IVA_RATE,
      total: 4 * HOURLY_RATE * (1 + IVA_RATE),
      notes: 'Configuracion de automatizaciones',
    },
    createdById: 'erika',
    createdByName: 'Erika Gordillo',
    createdAt: new Date('2026-04-14'),
    updatedAt: new Date('2026-04-23'),
  },
  {
    id: '9',
    title: 'Rame Travel | Pixel de Meta',
    description: '<p>Instalar y configurar pixel de Meta Ads</p>',
    clientId: 'rame',
    clientName: 'Rame Travel',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'pendiente_aprobacion',
    priority: 'alta',
    type: 'meta_ads',
    dueDate: new Date('2026-04-25'),
    isActive: true,
    customFields: {
      url_campana: { label: 'URL de campana', type: 'text', value: 'https://rametravel.com' },
    },
    timeSessions: [],
    totalTimeSec: 5400,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [],
    files: [],
    quotation: null,
    createdById: 'erika',
    createdByName: 'Erika Gordillo',
    createdAt: new Date('2026-04-16'),
    updatedAt: new Date('2026-04-24'),
  },
]

// ── Status Configuration ──────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string; borderColor: string }> = {
  pendiente: { label: 'Pendiente', color: 'text-gray-400', bgColor: 'bg-gray-500/10', borderColor: 'border-gray-500/30' },
  resolviendo: { label: 'Resolviendo', color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30' },
  demorada: { label: 'Demorada', color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30' },
  pausada: { label: 'Pausada', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30' },
  pendiente_aprobacion: { label: 'Pendiente aprobacion', color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30' },
  resuelto: { label: 'Resuelto', color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30' },
}

export const STATUS_ORDER: TaskStatus[] = ['pendiente_aprobacion', 'pendiente', 'resolviendo', 'demorada', 'pausada', 'resuelto']

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bgColor: string }> = {
  alta: { label: 'Alta', color: 'text-red-400', bgColor: 'bg-red-500/15' },
  media: { label: 'Media', color: 'text-amber-400', bgColor: 'bg-amber-500/15' },
  baja: { label: 'Baja', color: 'text-green-400', bgColor: 'bg-green-500/15' },
}

export const TYPE_CONFIG: Record<string, { label: string; color: string; icon?: string }> = {
  crm: { label: 'CRM', color: 'bg-cyan-500/20 text-cyan-400', icon: 'users' },
  meta_ads: { label: 'Meta Ads', color: 'bg-blue-500/20 text-blue-400', icon: 'megaphone' },
  soporte: { label: 'Soporte', color: 'bg-emerald-500/20 text-emerald-400', icon: 'headphones' },
  integracion: { label: 'Integracion', color: 'bg-violet-500/20 text-violet-400', icon: 'link' },
  reportes: { label: 'Reportes', color: 'bg-pink-500/20 text-pink-400', icon: 'file-text' },
  desarrollo: { label: 'Desarrollo', color: 'bg-indigo-500/20 text-indigo-400', icon: 'code' },
  reunion: { label: 'Reunion', color: 'bg-orange-500/20 text-orange-400', icon: 'video' },
  // Hitos del Mapa de Servicio - color dorado distintivo
  seguimiento: { label: 'Seguimiento', color: 'bg-amber-500/30 text-amber-300 border border-amber-500/50', icon: 'send' },
  'mapa de servicio': { label: 'Mapa de Servicio', color: 'bg-amber-500/30 text-amber-300 border border-amber-500/50', icon: 'map' },
  mapa_de_servicio: { label: 'Mapa de Servicio', color: 'bg-amber-500/30 text-amber-300 border border-amber-500/50', icon: 'map' },
}

// Will be populated dynamically from colaboradores table
export let ASSIGNEES: Array<{ id: string; name: string; avatar_url?: string | null }> = []

// Function to load assignees from database
export async function loadAssignees() {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('colaboradores')
      .select('id, nombre, apellido, avatar_url')
      .order('nombre')
    
    if (data) {
      ASSIGNEES = data.map(c => ({
        id: c.id,
        name: [c.nombre, c.apellido].filter(Boolean).join(' ') || 'Sin nombre',
        avatar_url: c.avatar_url,
      }))
    }
  } catch (error) {
    console.error('Error loading assignees:', error)
  }
  return ASSIGNEES
}

export const CLIENTS = [
  { id: 'ics', name: 'ICS Prepaqa' },
  { id: 'icaro', name: 'Icaro' },
  { id: 'delsur', name: 'Del Sur Autos' },
  { id: 'vn', name: 'VN Global' },
  { id: 'rollerpro', name: 'Roller Pro' },
  { id: 'rame', name: 'Rame Travel' },
  { id: 'adt', name: 'ADT' },
  { id: 'mdk', name: 'MDK' },
  { id: 'alambrados', name: 'Alambrados Patagonia' },
]

// ── System Tasks (Recurring) ──────────────────────────────────────────────────

function generateSystemTasks(clientes: Array<{ id: string; nombre_del_negocio: string }>): Task[] {
  const today = new Date()
  const systemTasks: Task[] = []
  
  // Find next Friday for weekly follow-up
  const getNextFriday = (from: Date) => {
    const d = new Date(from)
    const day = d.getDay()
    const diff = (5 - day + 7) % 7 || 7 // Days until Friday
    d.setDate(d.getDate() + diff)
    d.setHours(10, 0, 0, 0) // 10 AM
    return d
  }
  
  // Get this week's Friday and next 3 Fridays
  const fridays = []
  let nextFriday = getNextFriday(today)
  // If today is Friday and before 6pm, include today
  if (today.getDay() === 5 && today.getHours() < 18) {
    nextFriday = new Date(today)
    nextFriday.setHours(10, 0, 0, 0)
  }
  for (let i = 0; i < 4; i++) {
    fridays.push(new Date(nextFriday))
    nextFriday.setDate(nextFriday.getDate() + 7)
  }
  
  // Create weekly follow-up tasks for each client for each Friday
  clientes.forEach((cliente) => {
    fridays.forEach((friday) => {
      const message = encodeURIComponent(
        `Hola! Te comparto el reporte semanal de tu cuenta:\n\n` +
        `*Metricas principales:*\n` +
        `- Clics: [completar]\n` +
        `- Impresiones: [completar]\n` +
        `- Conversiones: [completar]\n` +
        `- Costo: [completar]\n\n` +
        `Cualquier duda me avisas!`
      )
      const whatsappLink = `https://wa.me/?text=${message}`
      
      systemTasks.push({
        id: `system-seguimiento-${cliente.id}-${friday.toISOString().split('T')[0]}`,
        title: `Seguimiento semanal - ${cliente.nombre_del_negocio}`,
        description: `<p><strong>Enviar reporte de metricas al cliente:</strong></p>
<ul>
<li>Clics de la semana</li>
<li>Impresiones totales</li>
<li>Conversiones logradas</li>
<li>Costo publicitario</li>
</ul>`,
        clientId: cliente.id,
        clientName: cliente.nombre_del_negocio,
        assigneeId: '',
        assigneeName: 'Sin asignar',
        assigneeAvatar: null,
        assignees: [],
        status: 'pendiente',
        priority: 'media',
        type: 'seguimiento',
        typeName: 'Seguimiento',
        dueDate: friday,
        isActive: true,
        isSystemTask: true,
        systemTaskMeta: {
          recurrence: 'weekly',
          whatsappLink,
        },
        customFields: {},
        timeSessions: [],
        totalTimeSec: 0,
        isTimerRunning: false,
        timerStartedAt: null,
        activities: [],
        comments: [],
        files: [],
        quotation: null,
        createdById: null,
        createdByName: 'Sistema',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    })
  })
  
  return systemTasks
}

// ── Filter Utility ────────────────────────────────────────────────────────────

export function applyAdvancedFilters(tasks: Task[], filterGroups: FilterGroup[]): Task[] {
  if (filterGroups.length === 0) return tasks
  
  return tasks.filter(task => {
    // Each group is connected by OR at the top level
    return filterGroups.some(group => {
      // Rules within a group use the group's connector (AND/OR)
      if (group.connector === 'and') {
        return group.rules.every(rule => evaluateRule(task, rule))
      } else {
        return group.rules.some(rule => evaluateRule(task, rule))
      }
    })
  })
}

function evaluateRule(task: Task, rule: FilterRule): boolean {
  const { field, operator, value } = rule
  
  // Get the actual value from the task
  let taskValue: string | string[] | boolean | Date | null | undefined
  
  switch (field) {
    case 'status':
      taskValue = task.status
      break
    case 'priority':
      taskValue = task.priority
      break
    case 'assignee':
      taskValue = task.assigneeId
      break
    case 'type':
      taskValue = task.type
      break
    case 'client':
      taskValue = task.clientName
      break
    case 'title':
      taskValue = task.title
      break
    case 'dueDate':
      taskValue = task.dueDate
      break
    case 'createdAt':
      taskValue = task.createdAt
      break
    case 'isActive':
      taskValue = task.isActive
      break
    case 'createdBy':
      taskValue = task.createdById
      break
    default:
      return true
  }
  
  // Evaluate based on operator
  switch (operator) {
    case 'equals':
      if (Array.isArray(value)) {
        return value.includes(taskValue as string)
      }
      if (typeof value === 'boolean' || field === 'isActive') {
        return String(taskValue) === String(value)
      }
      if (taskValue instanceof Date && typeof value === 'string') {
        return taskValue.toISOString().split('T')[0] === value
      }
      return taskValue === value
      
    case 'not_equals':
      if (Array.isArray(value)) {
        return !value.includes(taskValue as string)
      }
      if (taskValue instanceof Date && typeof value === 'string') {
        return taskValue.toISOString().split('T')[0] !== value
      }
      return taskValue !== value
      
    case 'contains':
      if (typeof taskValue === 'string' && typeof value === 'string') {
        return taskValue.toLowerCase().includes(value.toLowerCase())
      }
      if (Array.isArray(value)) {
        return value.includes(taskValue as string)
      }
      return false
      
    case 'not_contains':
      if (typeof taskValue === 'string' && typeof value === 'string') {
        return !taskValue.toLowerCase().includes(value.toLowerCase())
      }
      if (Array.isArray(value)) {
        return !value.includes(taskValue as string)
      }
      return true
      
    case 'is_empty':
      return taskValue === null || taskValue === undefined || taskValue === ''
      
    case 'is_not_empty':
      return taskValue !== null && taskValue !== undefined && taskValue !== ''
      
    case 'greater_than':
      if (taskValue instanceof Date && typeof value === 'string') {
        return taskValue > new Date(value)
      }
      return false
      
    case 'less_than':
      if (taskValue instanceof Date && typeof value === 'string') {
        return taskValue < new Date(value)
      }
      return false
      
    default:
      return true
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

// Advanced filter types
export interface FilterRule {
  id: string
  field: 'status' | 'priority' | 'assignee' | 'type' | 'client' | 'title' | 'dueDate' | 'createdAt' | 'isActive' | 'createdBy'
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty' | 'greater_than' | 'less_than'
  value: string | string[] | boolean | null
}

export interface FilterGroup {
  id: string
  connector: 'and' | 'or'
  rules: FilterRule[]
}

export interface SavedFilter {
  id: string
  name: string
  groups: FilterGroup[]
}

interface TaskStore {
  tasks: Task[]
  isLoading: boolean
  selectedTaskId: string | null
  view: 'kanban' | 'list' | 'calendar'
  
  // Legacy simple filters (for quick access)
  filters: {
    priority: TaskPriority | null
    assigneeId: string | null
    type: TaskType | null
    dueThisWeek: boolean
  }
  
  // Advanced filters
  advancedFilters: FilterGroup[]
  savedFilters: SavedFilter[]

  // Actions
  loadTasks: () => Promise<void>
  setView: (view: 'kanban' | 'list' | 'calendar') => void
  setSelectedTask: (id: string | null) => void
  setFilter: (key: keyof TaskStore['filters'], value: unknown) => void
  clearFilters: () => void
  
  // Advanced filter actions
  setAdvancedFilters: (filters: FilterGroup[]) => void
  saveFilter: (name: string, groups: FilterGroup[]) => void
  loadSavedFilter: (filter: SavedFilter) => void
  deleteSavedFilter: (id: string) => void

  // Task mutations
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'activities' | 'timeSessions' | 'totalTimeSec' | 'isTimerRunning' | 'timerStartedAt' | 'files' | 'quotation'> & { comments?: TaskComment[] }) => Promise<void>
  deleteTask: (taskId: string) => void
  toggleTaskActive: (taskId: string) => void

  // Timer
  startTimer: (taskId: string) => void
  stopTimer: (taskId: string) => void

  // Custom fields
  addCustomField: (taskId: string, key: string, field: TaskCustomField) => void
  removeCustomField: (taskId: string, key: string) => void

  // Comments
  addComment: (taskId: string, content: string, userId: string, userName: string, userAvatar?: string | null) => Promise<void>
  updateComment: (taskId: string, commentId: string, content: string) => Promise<void>
  deleteComment: (taskId: string, commentId: string) => Promise<void>

  // Files
  addFile: (taskId: string, file: Omit<TaskFile, 'id' | 'createdAt'>) => void
  deleteFile: (taskId: string, fileId: string) => void

  // Quotation
  updateQuotation: (taskId: string, quotation: TaskQuotation | null) => void
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  isLoading: false,
  selectedTaskId: null,
  view: 'calendar',
  filters: {
    priority: null,
    assigneeId: null,
    type: null,
    dueThisWeek: false,
  },
  advancedFilters: [],
  savedFilters: [],

  loadTasks: async () => {
    set({ isLoading: true })
    try {
      const supabase = createClient()
      
      // Load tasks, clients and colaboradores in parallel
      const [tasksResult, clientesResult, colaboradoresResult] = await Promise.all([
        supabase
          .from('tareas')
          .select(`
            *,
            clientes:cliente_id(id, nombre_del_negocio),
            colaboradores:asignado_a(id, nombre, apellido, avatar_url),
            tipo_de_tareas:tipo_tarea_id(id, nombre),
            creador:colaboradores!creado_por(id, nombre, apellido)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('clientes')
          .select('id, nombre_del_negocio')
          .order('nombre_del_negocio'),
        supabase
          .from('colaboradores')
          .select('id, nombre, apellido, avatar_url'),
      ])
      
      // Also update ASSIGNEES global
      loadAssignees()

      const { data, error } = tasksResult
      const { data: clientesData } = clientesResult
      const { data: colaboradoresData } = colaboradoresResult
      
      // Build colaboradores map for assignees lookup
      const colaboradoresMap = new Map<string, { id: string; nombre: string; apellido?: string | null; avatar_url?: string | null }>()
      if (colaboradoresData) {
        colaboradoresData.forEach(c => colaboradoresMap.set(c.id, c))
      }

      if (error) {
        console.error('Error loading tasks:', error)
        set({ tasks: [], isLoading: false })
        return
      }
      
      // Generate system tasks (weekly follow-ups)
      const systemTasks = clientesData ? generateSystemTasks(clientesData) : []

      if (data && data.length > 0) {
        // Load comments for all tasks
        const taskIds = data.map((t) => t.id)
        const { data: comentarios } = await supabase
          .from('comentarios_tareas')
          .select('*')
          .in('tarea_id', taskIds)
          .order('created_at', { ascending: true })

        // Group comments by task
        const commentsByTask = new Map<string, TaskComment[]>()
        if (comentarios) {
          comentarios.forEach((c) => {
            const taskComments = commentsByTask.get(c.tarea_id) || []
            taskComments.push(mapComentarioToComment(c as ComentarioDB))
            commentsByTask.set(c.tarea_id, taskComments)
          })
        }

        const dbTasks = data.map((tarea) => {
          const task = mapTareaToTask(tarea as TareaDB, colaboradoresMap)
          task.comments = commentsByTask.get(tarea.id) || []
          return task
        })
        // Combine DB tasks with system tasks
        set({ tasks: [...dbTasks, ...systemTasks], isLoading: false })
      } else {
        // No tasks in DB, just system tasks
        set({ tasks: systemTasks, isLoading: false })
      }
    } catch (error) {
      console.error('Error loading tasks:', error)
      set({ tasks: MOCK_TASKS, isLoading: false })
    }
  },

  setView: (view) => set({ view }),
  setSelectedTask: (id) => set({ selectedTaskId: id }),
  setFilter: (key, value) => set((state) => ({
    filters: { ...state.filters, [key]: value },
  })),
  clearFilters: () => set({
    filters: { priority: null, assigneeId: null, type: null, dueThisWeek: false },
    advancedFilters: [],
  }),
  
  // Advanced filters
  setAdvancedFilters: (filters) => set({ advancedFilters: filters }),
  saveFilter: (name, groups) => set((state) => ({
    savedFilters: [...state.savedFilters, { id: crypto.randomUUID(), name, groups }],
  })),
  loadSavedFilter: (filter) => set({ advancedFilters: filter.groups }),
  deleteSavedFilter: (id) => set((state) => ({
    savedFilters: state.savedFilters.filter(f => f.id !== id),
  })),

updateTaskStatus: async (taskId, status) => {
  const supabase = createClient()
  
  // Update in DB
  const { error } = await supabase
    .from('tareas')
    .update({ estado: status, updated_at: new Date().toISOString() })
    .eq('id', taskId)
  
  if (error) {
    console.error('Error updating task status:', error)
  }
  
  // Update local state
  set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            status,
            updatedAt: new Date(),
            activities: [
              { id: crypto.randomUUID(), action: `Cambio a ${STATUS_CONFIG[status].label}`, timestamp: new Date(), userId: 'current', userName: 'Usuario' },
              ...t.activities,
            ].slice(0, 10),
          }
        : t
    ),
  }))
},

updateTask: async (taskId, updates) => {
  const supabase = createClient()
  
  // Map Task fields to DB fields
  const dbUpdates: Record<string, unknown> = {}
  if (updates.title !== undefined) dbUpdates.titulo = updates.title
  if (updates.description !== undefined) dbUpdates.descripcion = updates.description
  if (updates.clientId !== undefined) dbUpdates.cliente_id = updates.clientId || null
  if (updates.assigneeId !== undefined) dbUpdates.asignado_a = updates.assigneeId || null
  if (updates.status !== undefined) dbUpdates.estado = updates.status
  if (updates.priority !== undefined) dbUpdates.prioridad = updates.priority
  if (updates.type !== undefined) dbUpdates.tipo_tarea_id = updates.type || null
  if (updates.dueDate !== undefined) dbUpdates.fecha_vencimiento = updates.dueDate
  if (updates.isActive !== undefined) {
    // Map isActive to estado if needed
    if (!updates.isActive) dbUpdates.estado = 'pausada'
  }
  
  // Update in DB if we have changes
  if (Object.keys(dbUpdates).length > 0) {
    dbUpdates.updated_at = new Date().toISOString()
    const { error } = await supabase
      .from('tareas')
      .update(dbUpdates)
      .eq('id', taskId)
    
    if (error) {
      console.error('Error updating task:', error)
    }
  }
  
  // Update local state
  set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId ? { ...t, ...updates, updatedAt: new Date() } : t
    ),
  }))
},

addTask: async (taskData) => {
  const supabase = createClient()
  const id = crypto.randomUUID()
  
  // Insert into tareas table
  const { error } = await supabase
    .from('tareas')
    .insert({
      id,
      titulo: taskData.title,
      descripcion: taskData.description,
      tipo_tarea_id: taskData.type || null,
      cliente_id: taskData.clientId || null,
      asignado_a: taskData.assigneeId || null,
      estado: taskData.status || 'pendiente',
      prioridad: taskData.priority || 'media',
      fecha_vencimiento: taskData.dueDate || null,
    })
  
  if (error) {
    console.error('Error creating task:', error)
    return
  }
  
  // Also insert initial comment if there are comments
  if (taskData.comments && taskData.comments.length > 0) {
    for (const comment of taskData.comments) {
      await supabase
        .from('tarea_comentarios')
        .insert({
          tarea_id: id,
          contenido: comment.content,
          autor_id: comment.userId === 'madky' ? null : comment.userId,
          autor_nombre: comment.userName,
          es_sistema: comment.userId === 'madky',
        })
    }
  }
  
  // Update local state
  set((state) => ({
    tasks: [
      {
        ...taskData,
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
        activities: [
          { id: crypto.randomUUID(), action: 'Tarea creada', timestamp: new Date(), userId: 'current', userName: 'Usuario' },
        ],
        timeSessions: [],
        totalTimeSec: 0,
        isTimerRunning: false,
        timerStartedAt: null,
        comments: taskData.comments || [],
        files: [],
        quotation: null,
      },
      ...state.tasks,
    ],
  }))
},

  deleteTask: (taskId) => set((state) => ({
    tasks: state.tasks.filter((t) => t.id !== taskId),
    selectedTaskId: state.selectedTaskId === taskId ? null : state.selectedTaskId,
  })),

  toggleTaskActive: (taskId) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            isActive: !t.isActive,
            updatedAt: new Date(),
            activities: [
              { id: crypto.randomUUID(), action: t.isActive ? 'Tarea desactivada' : 'Tarea reactivada', timestamp: new Date(), userId: 'current', userName: 'Usuario' },
              ...t.activities,
            ].slice(0, 10),
          }
        : t
    ),
  })),

  startTimer: (taskId) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? { ...t, isTimerRunning: true, timerStartedAt: new Date(), updatedAt: new Date() }
        : { ...t, isTimerRunning: false }
    ),
  })),

  stopTimer: (taskId) => set((state) => {
    const task = state.tasks.find((t) => t.id === taskId)
    if (!task || !task.timerStartedAt) return state

    const durationSec = Math.floor((Date.now() - task.timerStartedAt.getTime()) / 1000)
    const newSession = {
      id: crypto.randomUUID(),
      startedAt: task.timerStartedAt,
      endedAt: new Date(),
      durationSec,
    }

    return {
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              isTimerRunning: false,
              timerStartedAt: null,
              timeSessions: [...t.timeSessions, newSession],
              totalTimeSec: t.totalTimeSec + durationSec,
              updatedAt: new Date(),
            }
          : t
      ),
    }
  }),

  addCustomField: (taskId, key, field) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? { ...t, customFields: { ...t.customFields, [key]: field }, updatedAt: new Date() }
        : t
    ),
  })),

  removeCustomField: (taskId, key) => set((state) => ({
    tasks: state.tasks.map((t) => {
      if (t.id !== taskId) return t
      const { [key]: _, ...rest } = t.customFields
      return { ...t, customFields: rest, updatedAt: new Date() }
    }),
  })),

addComment: async (taskId, content, userId, userName, userAvatar = null) => {
  const supabase = createClient()
  const commentId = crypto.randomUUID()
  const now = new Date()

    // Insert comment into Supabase
    const { error } = await supabase
      .from('comentarios_tareas')
      .insert({
        id: commentId,
        tarea_id: taskId,
        contenido: content,
        autor_id: userId === 'system' ? null : userId,
        autor_nombre: userName,
        es_sistema: userName === 'Madky',
      })

    if (error) {
      console.error('Error adding comment:', error)
      throw error
    }

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              comments: [
                ...t.comments,
                {
                  id: commentId,
                  content,
                  userId,
                  userName,
                  userAvatar,
                  createdAt: now,
                },
              ],
              updatedAt: now,
              activities: [
                { id: crypto.randomUUID(), action: 'Agregó comentario', timestamp: now, userId, userName },
                ...t.activities,
              ].slice(0, 10),
            }
          : t
      ),
    }))
  },

  updateComment: async (taskId, commentId, content) => {
    const supabase = createClient()
    
    const { error } = await supabase
      .from('comentarios_tareas')
      .update({ contenido: content })
      .eq('id', commentId)

    if (error) {
      console.error('Error updating comment:', error)
      return
    }

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { 
              ...t, 
              comments: t.comments.map((c) => 
                c.id === commentId ? { ...c, content } : c
              ),
              updatedAt: new Date() 
            }
          : t
      ),
    }))
  },

  deleteComment: async (taskId, commentId) => {
    const supabase = createClient()
    
    // Delete from Supabase
    const { error } = await supabase
      .from('comentarios_tareas')
      .delete()
      .eq('id', commentId)

    if (error) {
      console.error('Error deleting comment:', error)
      return
    }

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, comments: t.comments.filter((c) => c.id !== commentId), updatedAt: new Date() }
          : t
      ),
    }))
  },

  addFile: (taskId, file) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            files: [
              ...t.files,
              { ...file, id: crypto.randomUUID(), createdAt: new Date() },
            ],
            updatedAt: new Date(),
            activities: [
              { id: crypto.randomUUID(), action: `Subio archivo: ${file.name}`, timestamp: new Date(), userId: file.uploadedBy, userName: file.uploadedByName },
              ...t.activities,
            ].slice(0, 10),
          }
        : t
    ),
  })),

  deleteFile: (taskId, fileId) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? { ...t, files: t.files.filter((f) => f.id !== fileId), updatedAt: new Date() }
        : t
    ),
  })),

  updateQuotation: (taskId, quotation) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            quotation,
            updatedAt: new Date(),
            activities: quotation
              ? [
                  { id: crypto.randomUUID(), action: `Actualizo cotizacion: ${quotation.hours}h`, timestamp: new Date(), userId: 'current', userName: 'Usuario' },
                  ...t.activities,
                ].slice(0, 10)
              : t.activities,
          }
        : t
    ),
  })),
}))

// ── Selectors ─────────────────────────────────────────────────────────────────

export function useFilteredTasks() {
  const tasks = useTaskStore((s) => s.tasks)
  const filters = useTaskStore((s) => s.filters)
  const advancedFilters = useTaskStore((s) => s.advancedFilters)

  // Apply simple filters first
  let filteredTasks = tasks.filter((task) => {
    if (filters.priority && task.priority !== filters.priority) return false
    if (filters.assigneeId && task.assigneeId !== filters.assigneeId) return false
    if (filters.type && task.type !== filters.type) return false
    if (filters.dueThisWeek && task.dueDate) {
      const now = new Date()
      const endOfWeek = new Date(now)
      endOfWeek.setDate(now.getDate() + (7 - now.getDay()))
      if (task.dueDate > endOfWeek) return false
    }
    return true
  })

  // Apply advanced filters if any
  if (advancedFilters.length > 0) {
    filteredTasks = applyAdvancedFilters(filteredTasks, advancedFilters)
  }

  return filteredTasks
}

export function useTasksByStatus() {
  const tasks = useFilteredTasks()
  const grouped: Record<TaskStatus, Task[]> = {
    pendiente: [],
    resolviendo: [],
    demorada: [],
    pausada: [],
    pendiente_aprobacion: [],
    resuelto: [],
  }
  tasks.forEach((task) => {
    if (grouped[task.status]) {
      grouped[task.status].push(task)
    }
  })
  return grouped
}

// ── Quotation Helpers ─────────────────────────────────────────────────────────

export function calculateQuotation(hours: number, notes: string = ''): TaskQuotation {
  const subtotal = hours * HOURLY_RATE
  const iva = subtotal * IVA_RATE
  return {
    hours,
    hourlyRate: HOURLY_RATE,
    subtotal,
    iva,
    total: subtotal + iva,
    notes,
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
