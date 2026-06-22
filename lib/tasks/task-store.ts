'use client'

import { useState, useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createClient, getAuthUser } from '@/lib/supabase/client'
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
  cliente_ids?: string[] | null // Multi-client support
  servicio_id: string | null
  asignado_a: string | null
  asignados_a?: string[] | null
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
  colaboradores?: {
    avatar_url: string | null
  } | null
}

function mapComentarioToComment(comentario: ComentarioDB): TaskComment {
  // Deserialize attachments from content if present
  let content = comentario.contenido
  let attachments: any[] = []
  
  if (content && content.includes('|||ATTACHMENTS|||')) {
    const [mainContent, attachmentJson] = content.split('|||ATTACHMENTS|||')
    content = mainContent
    try {
      attachments = JSON.parse(attachmentJson)
    } catch (e) {
      console.error('[v0] Error parsing attachments:', e)
    }
  }
  
  return {
    id: comentario.id,
    content,
    userId: comentario.autor_id || 'system',
    userName: comentario.autor_nombre,
    userAvatar: comentario.colaboradores?.avatar_url || null,
    createdAt: new Date(comentario.created_at),
    attachments,
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
  colaboradoresMap?: Map<string, { id: string; nombre: string; apellido?: string | null; avatar_url?: string | null }>,
  clientesMap?: Map<string, { id: string; nombre_del_negocio: string }>
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

  // Build clients array from cliente_ids
  const clients: Array<{ id: string; nombre_del_negocio: string }> = []
  const clientIds = tarea.cliente_ids || (tarea.cliente_id ? [tarea.cliente_id] : [])
  
  if (clientIds.length > 0 && clientesMap) {
    for (const clientId of clientIds) {
      const cliente = clientesMap.get(clientId)
      if (cliente) {
        clients.push({ id: cliente.id, nombre_del_negocio: cliente.nombre_del_negocio })
      }
    }
  } else if (tarea.clientes) {
    // Fallback to single client for backwards compatibility
    clients.push({ id: tarea.clientes.id, nombre_del_negocio: tarea.clientes.nombre_del_negocio })
  }

  return {
    id: tarea.id,
    title: tarea.titulo,
    description: tarea.descripcion,
    // Legacy single client (first in array or fallback)
    clientId: clients[0]?.id || tarea.cliente_id || '',
    clientName: clients[0]?.nombre_del_negocio || tarea.clientes?.nombre_del_negocio || 'Sin cliente',
    // Multi-client
    clientIds,
    clients,
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
      isActive: tarea.estado !== 'completada' && tarea.estado !== 'resuelto' && tarea.estado !== 'no_realizado',
    customFields: {},
    timeSessions: [],
    totalTimeSec: 0,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [],
    files: [],
    quotation: null,
    hitoPoe: tarea.hito_poe || null,
    createdById: tarea.creado_por || null,
    createdByName: (() => {
      if (tarea.creado_por && colaboradoresMap) {
        const creador = colaboradoresMap.get(tarea.creado_por)
        if (creador) {
          return [creador.nombre, creador.apellido].filter(Boolean).join(' ')
        }
      }
      return 'Sistema'
    })(),
    createdByAvatar: (() => {
      if (tarea.creado_por && colaboradoresMap) {
        const creador = colaboradoresMap.get(tarea.creado_por)
        if (creador) {
          return creador.avatar_url || undefined
        }
      }
      return undefined
    })(),
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
    clientIds: ['alambrados'],
    clients: [{ id: 'alambrados', nombre_del_negocio: 'Alambrados Patagonia' }],
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
  pendiente:            { label: 'Pendiente',           color: 'text-gray-600 dark:text-gray-400',     bgColor: 'bg-gray-200/60 dark:bg-gray-500/10',     borderColor: 'border-gray-400/40 dark:border-gray-500/30' },
  resolviendo:          { label: 'Resolviendo',         color: 'text-blue-700 dark:text-blue-400',     bgColor: 'bg-blue-100 dark:bg-blue-500/10',         borderColor: 'border-blue-400/40 dark:border-blue-500/30' },
  demorada:             { label: 'Demorada',            color: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-500/10',     borderColor: 'border-orange-400/40 dark:border-orange-500/30' },
  pausada:              { label: 'Pausada',             color: 'text-amber-700 dark:text-amber-400',   bgColor: 'bg-amber-100 dark:bg-amber-500/10',       borderColor: 'border-amber-400/40 dark:border-amber-500/30' },
  pendiente_aprobacion: { label: 'Pendiente aprobacion',color: 'text-purple-700 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-500/10',     borderColor: 'border-purple-400/40 dark:border-purple-500/30' },
  resuelto:             { label: 'Resuelto',            color: 'text-green-700 dark:text-green-400',   bgColor: 'bg-green-100 dark:bg-green-500/10',       borderColor: 'border-green-400/40 dark:border-green-500/30' },
  no_realizado:         { label: 'No realizado',        color: 'text-red-700 dark:text-red-400',       bgColor: 'bg-red-100 dark:bg-red-500/10',           borderColor: 'border-red-400/40 dark:border-red-500/30' },
}

export const STATUS_ORDER: TaskStatus[] = ['pendiente_aprobacion', 'pendiente', 'resolviendo', 'demorada', 'pausada', 'resuelto', 'no_realizado']

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bgColor: string }> = {
  alta:  { label: 'Alta',  color: 'text-red-800 dark:text-red-300',    bgColor: 'bg-red-100 dark:bg-red-900/50' },
  media: { label: 'Media', color: 'text-amber-900 dark:text-amber-300', bgColor: 'bg-amber-100 dark:bg-amber-900/50' },
  baja:  { label: 'Baja',  color: 'text-green-900 dark:text-green-300', bgColor: 'bg-green-100 dark:bg-green-900/50' },
}

export const TYPE_CONFIG: Record<string, { label: string; color: string; icon?: string }> = {
  crm:              { label: 'CRM',              color: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400',           icon: 'users' },
  meta_ads:         { label: 'Meta Ads',         color: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',           icon: 'megaphone' },
  soporte:          { label: 'Soporte',          color: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400', icon: 'headphones' },
  integracion:      { label: 'Integracion',      color: 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400',   icon: 'link' },
  reportes:         { label: 'Reportes',         color: 'bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-400',           icon: 'file-text' },
  desarrollo:       { label: 'Desarrollo',       color: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400',   icon: 'code' },
  reunion:          { label: 'Reunion',          color: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',   icon: 'video' },
  seguimiento:      { label: 'Seguimiento',      color: 'bg-amber-100 dark:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-400/50 dark:border-amber-500/50', icon: 'send' },
  'mapa de servicio': { label: 'Mapa de Servicio', color: 'bg-amber-100 dark:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-400/50 dark:border-amber-500/50', icon: 'map' },
  mapa_de_servicio: { label: 'Mapa de Servicio', color: 'bg-amber-100 dark:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-400/50 dark:border-amber-500/50', icon: 'map' },
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

// ���─ Store ──────────────────────────────────────────────────────────────────�����������──

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
  statusIds: TaskStatus[]
  assigneeIds: string[]
  showUnassigned: boolean
  type: TaskType | null
  dueThisWeek: boolean
  searchQuery: string
  clientIds: string[]
  }
  
  // Advanced filters
  advancedFilters: FilterGroup[]
  savedFilters: SavedFilter[]

  // Actions
  loadTasks: () => Promise<void>
  setView: (view: 'kanban' | 'list' | 'calendar') => void
  setSelectedTask: (id: string | null) => Promise<void>
  setFilter: (key: keyof TaskStore['filters'], value: unknown) => void
  clearFilters: () => void
  
  // Advanced filter actions
  setAdvancedFilters: (filters: FilterGroup[]) => void
  saveFilter: (name: string, groups: FilterGroup[]) => Promise<void>
  loadSavedFilter: (filter: SavedFilter) => void
  deleteSavedFilter: (id: string) => Promise<void>
  loadSavedFilters: () => Promise<void>

  // Task mutations
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'activities' | 'timeSessions' | 'totalTimeSec' | 'isTimerRunning' | 'timerStartedAt' | 'quotation'> & { comments?: TaskComment[]; files?: TaskFile[] }) => Promise<string>
  deleteTask: (taskId: string) => Promise<void>
  toggleTaskActive: (taskId: string) => void

  // Timer
  startTimer: (taskId: string) => void
  stopTimer: (taskId: string) => void

  // Custom fields
  addCustomField: (taskId: string, key: string, field: TaskCustomField) => void
  removeCustomField: (taskId: string, key: string) => void

  // Comments
  addComment: (taskId: string, content: string, userId: string, userName: string, userAvatar?: string | null, mentionedUserIds?: string[], attachments?: { url: string; name: string; mimeType: string }[]) => Promise<void>
  updateComment: (taskId: string, commentId: string, content: string) => Promise<void>
  deleteComment: (taskId: string, commentId: string) => Promise<void>

  // Files
  addFile: (taskId: string, file: Omit<TaskFile, 'id' | 'createdAt'>) => void
  deleteFile: (taskId: string, fileId: string) => void

  // Quotation
  updateQuotation: (taskId: string, quotation: TaskQuotation | null) => void
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
  tasks: [],
  isLoading: false,
  selectedTaskId: null,
  view: 'calendar',
  filters: {
  priority: null,
  statusIds: [],
  assigneeIds: [],
  showUnassigned: false,
  type: null,
  dueThisWeek: false,
  searchQuery: '',
  clientIds: [],
  },
  advancedFilters: [],
  savedFilters: [],

  loadTasks: async () => {
    set({ isLoading: true })
    try {
      const supabase = createClient()
      
      // Load clientes and colaboradores first
      const [clientesResult, colaboradoresResult] = await Promise.all([
        supabase
          .from('clientes')
          .select('id, nombre_del_negocio')
          .order('nombre_del_negocio'),
        supabase
          .from('colaboradores')
          .select('id, nombre, apellido, avatar_url'),
      ])
      
      const { data: clientesData } = clientesResult
      const { data: colaboradoresData } = colaboradoresResult
      
      // Build colaboradores map for assignees lookup
      const colaboradoresMap = new Map<string, { id: string; nombre: string; apellido?: string | null; avatar_url?: string | null }>()
      if (colaboradoresData) {
        colaboradoresData.forEach(c => colaboradoresMap.set(c.id, c))
      }
      
      // Build clientes map for multi-client lookup
      const clientesMap = new Map<string, { id: string; nombre_del_negocio: string }>()
      if (clientesData) {
        clientesData.forEach(c => clientesMap.set(c.id, c))
      }

      // Load ALL tasks with pagination (Supabase limits to 1000 per request)
      const PAGE_SIZE = 1000
      let allTasks: TareaDB[] = []
      let from = 0
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('tareas')
          .select(`
            *,
            hito_poe,
            es_tarea_sistema,
            clientes:cliente_id(id, nombre_del_negocio),
            colaboradores:asignado_a(id, nombre, apellido, avatar_url),
            tipo_de_tareas:tipo_tarea_id(id, nombre)
          `)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1)

        if (error) {
          console.error('Error loading tasks page:', error)
          break
        }

        if (data && data.length > 0) {
          allTasks = [...allTasks, ...(data as TareaDB[])]
          from += PAGE_SIZE
          hasMore = data.length === PAGE_SIZE
        } else {
          hasMore = false
        }
      }
      
      // Also update ASSIGNEES global
      loadAssignees()
      
      if (allTasks.length > 0) {
        // Map tasks without comments - comments will be loaded on demand when task is selected
        const dbTasks = allTasks.map((tarea) => {
          const task = mapTareaToTask(tarea, colaboradoresMap, clientesMap)
          task.comments = [] // Loaded on demand
          return task
        })
        set({ tasks: dbTasks, isLoading: false })
      } else {
        set({ tasks: [], isLoading: false })
      }
    } catch (error) {
      console.error('Error loading tasks:', error)
      set({ tasks: MOCK_TASKS, isLoading: false })
    }
  },

  setView: (view) => set({ view }),
  setSelectedTask: async (id) => {
    set({ selectedTaskId: id })
    
    // Load comments on demand when task is selected
    if (id) {
      // Wait for task to be available (may not be loaded yet if navigating via URL)
      let task = get().tasks.find(t => t.id === id)
      
      // If task not found, wait a bit for loadTasks to finish and retry
      if (!task) {
        await new Promise(resolve => setTimeout(resolve, 500))
        task = get().tasks.find(t => t.id === id)
      }
      
      // Only load if comments haven't been loaded yet
      if (task && task.comments.length === 0) {
        const supabase = createClient()
        const { data: comentarios, error: commError } = await supabase
          .from('comentarios_tareas')
          .select('*')
          .eq('tarea_id', id)
          .order('created_at', { ascending: true })
        
        if (commError) {
          console.error('[v0] Error loading comments:', commError)
          return
        }
        
        if (comentarios && comentarios.length > 0) {
          // Enrich comments with user avatars from colaboradores table
          const userIds = [...new Set(comentarios.map(c => c.autor_id).filter(Boolean))] as string[]
          
          let avatarMap: Record<string, string | null> = {}
          if (userIds.length > 0) {
            const { data: colaboradores, error: colabError } = await supabase
              .from('colaboradores')
              .select('id, avatar_url')
              .in('id', userIds)
            
            if (colabError) {
              console.error('[v0] Error loading colaboradores:', colabError)
            } else if (colaboradores) {
              colaboradores.forEach(c => {
                avatarMap[c.id] = c.avatar_url
              })
            }
          }
          
          const enrichedComments = comentarios.map(c => ({
            ...c,
            colaboradores: c.autor_id ? { avatar_url: avatarMap[c.autor_id] || null } : null
          } as ComentarioDB))
          
          set((state) => ({
            tasks: state.tasks.map(t => 
              t.id === id 
                ? { ...t, comments: enrichedComments.map(mapComentarioToComment) }
                : t
            )
          }))
        }
      }
    }
  },
  setFilter: (key, value) => set((state) => ({
    filters: { ...state.filters, [key]: value },
  })),
  clearFilters: () => set({
  filters: { priority: null, statusIds: [], assigneeIds: [], showUnassigned: false, type: null, dueThisWeek: false, searchQuery: '', clientIds: [] },
  advancedFilters: [],
  }),
  
  // Advanced filters
  setAdvancedFilters: (filters) => set({ advancedFilters: filters }),
  
  saveFilter: async (name, groups) => {
    const supabase = createClient()
    const { data: { user } } = await getAuthUser()
    
    const { data, error } = await supabase
      .from('filtros_tareas_guardados')
      .insert({
        nombre: name,
        filtros: groups,
        colaborador_id: user?.id || null,
      })
      .select()
      .single()
    
    if (!error && data) {
      set((state) => ({
        savedFilters: [...state.savedFilters, { id: data.id, name: data.nombre, groups: data.filtros as FilterGroup[] }],
      }))
    } else {
      console.error('Error saving filter:', error)
    }
  },
  
  loadSavedFilter: (filter) => set({ advancedFilters: filter.groups }),
  
  deleteSavedFilter: async (id) => {
    const supabase = createClient()
    
    const { error } = await supabase
      .from('filtros_tareas_guardados')
      .delete()
      .eq('id', id)
    
    if (!error) {
      set((state) => ({
        savedFilters: state.savedFilters.filter(f => f.id !== id),
      }))
    } else {
      console.error('Error deleting saved filter:', error)
    }
  },
  
  loadSavedFilters: async () => {
    const supabase = createClient()
    const { data: { user } } = await getAuthUser()
    
    if (!user) return
    
    const { data, error } = await supabase
      .from('filtros_tareas_guardados')
      .select('*')
      .or(`colaborador_id.eq.${user.id},es_global.eq.true`)
      .order('created_at', { ascending: false })
    
    if (!error && data) {
      set({
        savedFilters: data.map(f => ({
          id: f.id,
          name: f.nombre,
          groups: f.filtros as FilterGroup[],
        }))
      })
    }
  },

  // Bulk delete tasks
  deleteTasks: async (taskIds: string[]) => {
    if (taskIds.length === 0) return
    
    const supabase = createClient()
    
    const { error } = await supabase
      .from('tareas')
      .delete()
      .in('id', taskIds)
    
    if (error) {
      console.error('Error deleting tasks:', error)
      return
    }
    
    // Update local state
    set((state) => ({
      tasks: state.tasks.filter((t) => !taskIds.includes(t.id)),
    }))
  },

updateTaskStatus: async (taskId, status) => {
  const supabase = createClient()

  // Fetch user first (avoid concurrent auth lock issues)
  const { data: { user } } = await getAuthUser()
  
  // Then fetch task data
  const { data: tareaActual } = await supabase
    .from('tareas')
    .select('titulo, asignado_a, asignados_a, cliente_id')
    .eq('id', taskId)
    .single()

  let actorName = 'Alguien'
  let actorId: string | null = null
  if (user?.email) {
    const { data: colab } = await supabase
      .from('colaboradores')
      .select('id, nombre, apellido')
      .eq('email', user.email)
      .single()
    if (colab) {
      actorName = [colab.nombre, colab.apellido].filter(Boolean).join(' ')
      actorId = colab.id
    }
  }

  // Update in DB
  const { error } = await supabase
    .from('tareas')
    .update({ estado: status, updated_at: new Date().toISOString() })
    .eq('id', taskId)
  
  if (error) {
    console.error('Error updating task status:', error)
  }

  // If task is marked as resolved, notify all collaborators assigned to the task
  if (status === 'resuelto' && tareaActual) {
    const assignedIds: string[] = [
      ...(tareaActual.asignados_a || []),
      ...(tareaActual.asignado_a ? [tareaActual.asignado_a] : []),
    ]
    // Notify everyone except the actor
    const toNotify = [...new Set(assignedIds)].filter(id => id !== actorId)
    if (toNotify.length > 0) {
      console.log('[v0] Notifying about resolved task:', { taskId, toNotify, actorName })
      try {
        const response = await fetch('/api/notifications/task-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'tarea_resuelta',
            taskId,
            taskTitle: tareaActual.titulo,
            actorName,
            colaboradorIds: toNotify,
            clienteId: tareaActual.cliente_id || null,
          }),
        })
        const result = await response.json()
        console.log('[v0] Task resolved notification sent:', result)
      } catch (err) {
        console.error('[v0] Error sending task-event notification:', err)
      }
    }
  }

  // If task is marked as a completed status, delete reminder notifications for this task
  const completedForDelete = ['resuelto', 'no_realizado', 'realizada', 'completada', 'completado', 'cerrada', 'cerrado']
  if (completedForDelete.includes(status as string)) {
    await supabase
      .from('notificaciones')
      .delete()
      .eq('tipo', 'recordatorio')
      .eq('referencia_id', taskId)
  }

  // Sync mapa_servicio_instancias estado for hito tasks
  // Map task status to instance estado: resuelto -> listo, no_realizado -> no_realizado
  const statusToInstanceEstado: Record<string, string> = {
    'resuelto': 'listo',
    'no_realizado': 'no_realizado',
  }
  if (statusToInstanceEstado[status]) {
    const { error: instanceError } = await supabase
      .from('mapa_servicio_instancias')
      .update({ estado: statusToInstanceEstado[status] })
      .eq('tarea_id', taskId)
    
    if (instanceError) {
      console.error('Error syncing instance estado:', instanceError)
    }
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
              ...(t.activities || []),
            ].slice(0, 10),
          }
        : t
    ),
  }))
},

updateTask: async (taskId, updates) => {
  const supabase = createClient()

  // Fetch user first (avoid concurrent auth lock issues)
  const { data: { user } } = await getAuthUser()
  
  // Then fetch task data
  const { data: tareaAnterior } = await supabase
    .from('tareas')
    .select('titulo, estado, creado_por, asignado_a, asignados_a, fecha_vencimiento, cliente_id, cliente_ids')
    .eq('id', taskId)
    .single()

  let actorName = 'Alguien'
  let actorId: string | null = null
  if (user?.email) {
    const { data: colab } = await supabase
      .from('colaboradores')
      .select('id, nombre, apellido')
      .eq('email', user.email)
      .single()
    if (colab) {
      actorName = [colab.nombre, colab.apellido].filter(Boolean).join(' ')
      actorId = colab.id
    }
  }

  // Map Task fields to DB fields
  const dbUpdates: Record<string, unknown> = {}
  if (updates.title !== undefined) dbUpdates.titulo = updates.title
  if (updates.description !== undefined) dbUpdates.descripcion = updates.description
  if (updates.clientId !== undefined) dbUpdates.cliente_id = updates.clientId || null
  if (updates.assigneeId !== undefined) dbUpdates.asignado_a = updates.assigneeId || null
  if (updates.assignees !== undefined) {
    const ids = updates.assignees.map(a => a.id)
    dbUpdates.asignados_a = ids.length > 0 ? ids : null
    // Keep legacy single-assignee field in sync
    if (updates.assigneeId === undefined) dbUpdates.asignado_a = ids[0] || null
  }
  if (updates.status !== undefined) dbUpdates.estado = updates.status
  if (updates.priority !== undefined) dbUpdates.prioridad = updates.priority
  if (updates.type !== undefined) dbUpdates.tipo_tarea_id = updates.type || null
  if (updates.dueDate !== undefined) dbUpdates.fecha_vencimiento = updates.dueDate
  if (updates.clientIds !== undefined) {
    dbUpdates.cliente_ids = updates.clientIds.length > 0 ? updates.clientIds : null
    dbUpdates.cliente_id = updates.clientIds[0] || null // First client for backwards compatibility
  }
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
    
    // Sync mapa_servicio_instancias estado when task status changes
    if (updates.status) {
      const statusToInstanceEstado: Record<string, string> = {
        'resuelto': 'listo',
        'no_realizado': 'no_realizado',
      }
      if (statusToInstanceEstado[updates.status]) {
        const { error: instanceError } = await supabase
          .from('mapa_servicio_instancias')
          .update({ estado: statusToInstanceEstado[updates.status] })
          .eq('tarea_id', taskId)
        
        if (instanceError) {
          console.error('Error syncing instance estado:', instanceError)
        }
      }
    }
  }

  // --- Notify about relevant changes ---
  if (tareaAnterior) {
    const taskTitle = tareaAnterior.titulo || 'Sin título'
    const previousAssignedIds: string[] = [
      ...(tareaAnterior.asignados_a || []),
      ...(tareaAnterior.asignado_a ? [tareaAnterior.asignado_a] : []),
    ]

    // 1. Detect newly added assignees — notify them AND all current assignees + creator
    if (updates.assignees !== undefined) {
      const newAssignedIds = updates.assignees.map(a => a.id)
      const addedIds = newAssignedIds.filter(id => !previousAssignedIds.includes(id))
      if (addedIds.length > 0) {
        // Notify the new assignees that they were added
        try {
          await fetch('/api/notifications/task-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: 'asignado_a_tarea',
              taskId,
              taskTitle,
              actorName,
              colaboradorIds: addedIds,
              clienteId: tareaAnterior.cliente_id || null,
            }),
          })
        } catch (err) {
          console.error('[v0] Error sending assignee notification:', err)
        }
        
        // Also notify all existing assignees + creator that someone new was added
        const creatorId = tareaAnterior.creado_por
        const existingToNotify = [...new Set([...previousAssignedIds, ...(creatorId ? [creatorId] : [])])]
          .filter(id => !addedIds.includes(id)) // Don't double-notify the new assignees
        if (existingToNotify.length > 0) {
          try {
            await fetch('/api/notifications/task-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventType: 'persona_agregada',
                taskId,
                taskTitle,
                actorName,
                colaboradorIds: existingToNotify,
                clienteId: tareaAnterior.cliente_id || null,
              }),
            })
          } catch (err) {
            console.error('[v0] Error sending persona_agregada notification:', err)
          }
        }
      }
    }

    // 2. Detect due date change — notify all current assignees + creator
    if (updates.dueDate !== undefined) {
      const prevDate = tareaAnterior.fecha_vencimiento
      const newDate = updates.dueDate ? (updates.dueDate instanceof Date ? updates.dueDate.toISOString() : String(updates.dueDate)) : null
      const prevNorm = prevDate ? new Date(prevDate).toDateString() : null
      const newNorm = newDate ? new Date(newDate).toDateString() : null
      if (prevNorm !== newNorm) {
        // Notify all assignees + creator
        const assigneeIds = [...new Set(previousAssignedIds)]
        const creatorId = tareaAnterior.creado_por
        const toNotify = [...new Set([...assigneeIds, ...(creatorId ? [creatorId] : [])])]
        if (toNotify.length > 0) {
          try {
            const response = await fetch('/api/notifications/task-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventType: 'fecha_cambiada',
                taskId,
                taskTitle,
                actorName,
                colaboradorIds: toNotify,
                newDate: newDate || undefined,
                clienteId: tareaAnterior.cliente_id || null,
              }),
            })
          } catch (err) {
            console.error('[v0] Error sending due date notification:', err)
          }
        }
      }
    }

    // 3. Detect newly added clients — notify all current assignees + creator
    if (updates.clientIds !== undefined) {
      const prevClientIds: string[] = tareaAnterior.cliente_ids || (tareaAnterior.cliente_id ? [tareaAnterior.cliente_id] : [])
      const addedClientIds = updates.clientIds.filter(id => !prevClientIds.includes(id))
      if (addedClientIds.length > 0) {
        // Notify all assignees + creator
        const assigneeIds = [...new Set(previousAssignedIds)]
        const creatorId = tareaAnterior.creado_por
        const toNotify = [...new Set([...assigneeIds, ...(creatorId ? [creatorId] : [])])]
        if (toNotify.length > 0) {
          // Fetch client names for the added clients
          const { data: clientesData } = await supabase
            .from('clientes')
            .select('id, nombre_del_negocio')
            .in('id', addedClientIds)
          const clienteNames = (clientesData || []).map(c => c.nombre_del_negocio).filter(Boolean).join(', ')
          try {
            const response = await fetch('/api/notifications/task-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventType: 'cliente_agregado',
                taskId,
                taskTitle,
                actorName,
                colaboradorIds: toNotify,
                clienteName: clienteNames || undefined,
                clienteId: addedClientIds[0] || null,
              }),
            })
          } catch (err) {
            console.error('[v0] Error sending client added notification:', err)
          }
        }
      }
    }

    // 4. Detect status change to "resuelto" or "resolviendo" — notify ALL assignees + creator
    if (updates.status !== undefined) {
      const notifyOnStatuses = ['resuelto', 'resolviendo']
      const prevStatus = tareaAnterior?.estado?.toLowerCase().trim() || ''
      const newStatus = (updates.status as string).toLowerCase().trim()
      const statusChanged = prevStatus !== newStatus
      const shouldNotify = notifyOnStatuses.includes(newStatus)

      if (statusChanged && shouldNotify) {
        // Collect all recipients: assignees + creator
        const assigneeIds = [...new Set(previousAssignedIds)]
        const creatorId = tareaAnterior.creado_por
        const toNotify = [...new Set([...assigneeIds, ...(creatorId ? [creatorId] : [])])]
        
        if (toNotify.length > 0) {
          const eventType = newStatus === 'resuelto' ? 'tarea_resuelta' : 'tarea_resolviendo'
          try {
            const response = await fetch('/api/notifications/task-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventType,
                taskId,
                taskTitle,
                actorName,
                colaboradorIds: toNotify,
                clienteId: tareaAnterior.cliente_id || null,
              }),
            })
            const result = await response.json()
          } catch (err) {
            console.error('[v0] Error sending status change notification:', err)
          }
        }
      }
    }
  }
  // --- End notifications ---

  // Update local state (including activity for status changes)
  set((state) => ({
    tasks: state.tasks.map((t) => {
      if (t.id !== taskId) return t
      
      // Build updated task
      const updatedTask = { ...t, ...updates, updatedAt: new Date() }
      
      // Add activity for status change
      if (updates.status !== undefined && updates.status !== t.status) {
        const statusLabels: Record<string, string> = {
          'pendiente_aprobacion': 'Pendiente aprobación',
          'pendiente': 'Pendiente',
          'resolviendo': 'Resolviendo',
          'demorada': 'Demorada',
          'resuelto': 'Resuelto',
          'pausado': 'Pausado',
        }
        const newStatusLabel = statusLabels[updates.status] || updates.status
        const activity = {
          id: crypto.randomUUID(),
          action: `Cambió el estado a "${newStatusLabel}"`,
          timestamp: new Date(),
          userId: actorId || 'unknown',
          userName: actorName,
        }
        updatedTask.activities = [activity, ...(updatedTask.activities || [])]
      }
      
      // Add activity for due date change
      if (updates.dueDate !== undefined) {
        const prevDate = t.dueDate ? new Date(t.dueDate).toLocaleDateString('es-ES') : null
        const newDate = updates.dueDate ? new Date(updates.dueDate).toLocaleDateString('es-ES') : null
        if (prevDate !== newDate) {
          const activity = {
            id: crypto.randomUUID(),
            action: newDate 
              ? `Cambió la fecha de vencimiento a ${newDate}`
              : 'Eliminó la fecha de vencimiento',
            timestamp: new Date(),
            userId: actorId || 'unknown',
            userName: actorName,
          }
          updatedTask.activities = [activity, ...(updatedTask.activities || [])]
        }
      }
      
      // Add activity for client added
      if (updates.clientIds !== undefined) {
        const prevIds = t.clientIds || []
        const addedIds = updates.clientIds.filter(id => !prevIds.includes(id))
        const removedIds = prevIds.filter(id => !updates.clientIds!.includes(id))
        
        if (addedIds.length > 0) {
          const activity = {
            id: crypto.randomUUID(),
            action: `Agregó ${addedIds.length} cliente(s) a la tarea`,
            timestamp: new Date(),
            userId: actorId || 'unknown',
            userName: actorName,
          }
          updatedTask.activities = [activity, ...(updatedTask.activities || [])]
        }
        
        if (removedIds.length > 0) {
          const activity = {
            id: crypto.randomUUID(),
            action: `Eliminó ${removedIds.length} cliente(s) de la tarea`,
            timestamp: new Date(),
            userId: actorId || 'unknown',
            userName: actorName,
          }
          updatedTask.activities = [activity, ...(updatedTask.activities || [])]
        }
      }
      
      // Add activity for assignee changes
      if (updates.assignees !== undefined) {
        const prevAssigneeIds = t.assignees.map(a => a.id)
        const newAssigneeIds = updates.assignees.map(a => a.id)
        const addedAssignees = updates.assignees.filter(a => !prevAssigneeIds.includes(a.id))
        const removedAssigneeIds = prevAssigneeIds.filter(id => !newAssigneeIds.includes(id))
        
        if (addedAssignees.length > 0) {
          const names = addedAssignees.map(a => a.name).join(', ')
          const activity = {
            id: crypto.randomUUID(),
            action: `Agregó a ${names} a la tarea`,
            timestamp: new Date(),
            userId: actorId || 'unknown',
            userName: actorName,
          }
          updatedTask.activities = [activity, ...(updatedTask.activities || [])]
        }
        
        if (removedAssigneeIds.length > 0) {
          const removedNames = t.assignees.filter(a => removedAssigneeIds.includes(a.id)).map(a => a.name).join(', ')
          const activity = {
            id: crypto.randomUUID(),
            action: `Eliminó a ${removedNames} de la tarea`,
            timestamp: new Date(),
            userId: actorId || 'unknown',
            userName: actorName,
          }
          updatedTask.activities = [activity, ...(updatedTask.activities || [])]
        }
      }
      
      return updatedTask
    }),
  }))
},

addTask: async (taskData) => {
  try {
    const supabase = createClient()
    const id = crypto.randomUUID()

    // Always resolve the logged-in collaborator at insert time
    let resolvedCreatedById = taskData.createdById || null
    let resolvedCreatedByName = taskData.createdByName || 'Sistema'
    let resolvedCreatedByAvatar = taskData.createdByAvatar || undefined

    if (!resolvedCreatedById) {
      const { data: { user } } = await getAuthUser()
      if (user?.email) {
        const { data: colab } = await supabase
          .from('colaboradores')
          .select('id, nombre, apellido, avatar_url')
          .eq('email', user.email)
          .single()
        if (colab) {
          resolvedCreatedById = colab.id
          resolvedCreatedByName = [colab.nombre, colab.apellido].filter(Boolean).join(' ')
          resolvedCreatedByAvatar = colab.avatar_url || undefined
        }
      }
    }
    
    // Insert into tareas table
    // Support both single clientId and multiple clientIds
    const clientIds = taskData.clientIds || (taskData.clientId ? [taskData.clientId] : [])
    
    // Support both single assigneeId and multiple assigneeIds
    const assigneeIds = taskData.assigneeIds || (taskData.assigneeId ? [taskData.assigneeId] : [])
    
    // Calculate due date for hito tasks if not provided
    let dueDate = taskData.dueDate || null
    const isHitoTask = taskData.hitoPoe || taskData.title?.startsWith('[Hito]')
    
    if (isHitoTask && !dueDate) {
      const now = new Date()
      const titleUpper = (taskData.title || '').toUpperCase()
      
      if (titleUpper.includes('INICIO DE SEMANA') || titleUpper.includes('INICIO SEMANA')) {
        // Due on Monday of the current week
        const dayOfWeek = now.getDay()
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
        const monday = new Date(now)
        monday.setDate(now.getDate() + daysToMonday)
        dueDate = monday.toISOString().split('T')[0]
      } else if (titleUpper.includes('FIN DE SEMANA') || titleUpper.includes('FIN SEMANA')) {
        // Due on Friday of the current week
        const dayOfWeek = now.getDay()
        const daysToFriday = dayOfWeek === 0 ? -2 : 5 - dayOfWeek
        const friday = new Date(now)
        friday.setDate(now.getDate() + daysToFriday)
        dueDate = friday.toISOString().split('T')[0]
      } else {
        // Regular hito: due on last day of month
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        dueDate = lastDay.toISOString().split('T')[0]
      }
    }
    
    const { error } = await supabase
    .from('tareas')
    .insert({
    id,
    titulo: taskData.title,
    descripcion: taskData.description,
    tipo_tarea_id: taskData.type || null,
    cliente_id: clientIds[0] || null,
    cliente_ids: clientIds.length > 0 ? clientIds : null,
    asignado_a: assigneeIds[0] || null,
    asignados_a: assigneeIds.length > 0 ? assigneeIds : null,
    estado: taskData.status || 'pendiente',
    prioridad: taskData.priority || 'media',
    fecha_vencimiento: dueDate,
    hito_poe: taskData.hitoPoe || null,
    creado_por: resolvedCreatedById,
    })
    
    if (error) {
      console.error('Error creating task:', error)
      return undefined
    }
    
    // Also insert initial comment if there are comments
    if (taskData.comments && taskData.comments.length > 0) {
      for (const comment of taskData.comments) {
        const isSystem = comment.userId === 'system' || !comment.userId
        const { error: commentError } = await supabase
          .from('comentarios_tareas')
          .insert({
            tarea_id: id,
            contenido: comment.content,
            autor_id: isSystem ? null : comment.userId,
            autor_nombre: comment.userName,
            es_sistema: isSystem,
          })
        if (commentError) {
          console.error('[v0] Error creating comment:', commentError)
        }
      }
    }
    
  // Notify assigned users about the new task via server API (bypasses RLS)
  const assignedColabIds = assigneeIds.filter(uid => uid && uid !== taskData.createdById)
  if (assignedColabIds.length > 0) {
    fetch('/api/notifications/tarea-asignada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: id,
        titulo: taskData.title,
        colaboradorIds: assignedColabIds,
        clienteId: clientIds[0] || null,
        clienteName: taskData.clientName || null,
        createdById: resolvedCreatedById,
        createdByName: resolvedCreatedByName,
      }),
    })
      .then(res => res.json())
      .catch(err => console.error('[v0] Error calling tarea-asignada API:', err))
  }
    
    // Update local state
    set((state) => ({
      tasks: [
        {
          ...taskData,
          id,
          clientIds: taskData.clientIds || (taskData.clientId ? [taskData.clientId] : []),
          clients: taskData.clients || (taskData.clientId ? [{ id: taskData.clientId, nombre_del_negocio: taskData.clientName || '' }] : []),
          createdById: resolvedCreatedById,
          createdByName: resolvedCreatedByName,
          createdByAvatar: resolvedCreatedByAvatar,
          createdAt: new Date(),
          updatedAt: new Date(),
          activities: [
            { id: crypto.randomUUID(), action: 'Tarea creada', timestamp: new Date(), userId: taskData.createdById || 'current', userName: taskData.createdByName || 'Usuario' },
          ],
          timeSessions: [],
          totalTimeSec: 0,
          isTimerRunning: false,
          timerStartedAt: null,
          comments: taskData.comments || [],
          files: taskData.files || [],
          quotation: null,
        },
        ...state.tasks,
      ],
    }))
    
    return id
  } catch (error) {
    console.error('[v0] Unexpected error in addTask:', error)
    return undefined
  }
},

  deleteTask: async (taskId) => {
    const supabase = createClient()
    
    const { error } = await supabase
      .from('tareas')
      .delete()
      .eq('id', taskId)
    
    if (error) {
      console.error('Error deleting task:', error)
      return
    }
    
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
      selectedTaskId: state.selectedTaskId === taskId ? null : state.selectedTaskId,
    }))
  },

  toggleTaskActive: (taskId) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            isActive: !t.isActive,
            updatedAt: new Date(),
            activities: [
              { id: crypto.randomUUID(), action: t.isActive ? 'Tarea desactivada' : 'Tarea reactivada', timestamp: new Date(), userId: 'current', userName: 'Usuario' },
              ...(t.activities || []),
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

addComment: async (taskId, content, userId, userName, userAvatar = null, mentionedUserIds: string[] = [], attachments: { url: string; name: string; mimeType: string }[] = []) => {
  const supabase = createClient()
  const commentId = crypto.randomUUID()
  const now = new Date()

    // Serialize attachments info with content if there are attachments
    let contentWithAttachments = content
    if (attachments.length > 0) {
      const attachmentInfo = JSON.stringify(attachments)
      contentWithAttachments = `${content}|||ATTACHMENTS|||${attachmentInfo}`
    }

    const insertData = {
      id: commentId,
      tarea_id: taskId,
      contenido: contentWithAttachments,
      autor_id: userId === 'system' ? null : userId,
      autor_nombre: userName,
      es_sistema: userName === 'Madky',
    }

    // Insert comment into Supabase
    const { error } = await supabase
      .from('comentarios_tareas')
      .insert(insertData)

    if (error) {
      console.error('[v0] Error adding comment:', error)
      throw error
    }

    // Get task for notification
    const task = get().tasks.find(t => t.id === taskId)
    const taskTitle = task?.title || 'Tarea'
    const clienteId = task?.clientId || null

    // Create notifications for mentioned users
    if (mentionedUserIds.length > 0) {
      const notifications = mentionedUserIds
        .filter(id => id !== userId) // Don't notify the author
        .map(mentionedId => ({
          id: crypto.randomUUID(),
          colaborador_id: mentionedId,
          tipo: 'mencion',
          titulo: `${userName} te mencionó en un comentario`,
          descripcion: `En la tarea "${taskTitle}"`,
          referencia_id: taskId,
          referencia_tipo: 'tarea',
          cliente_id: clienteId,
          leida: false,
        }))

      if (notifications.length > 0) {
        const { error: notifError } = await supabase
          .from('notificaciones')
          .insert(notifications)

        if (notifError) {
          console.error('Error creating notifications:', notifError)
        }
      }
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
                  attachments: attachments.length > 0 ? attachments : undefined,
                },
              ],
              updatedAt: now,
              activities: [
                { id: crypto.randomUUID(), action: 'Agregó comentario', timestamp: now, userId, userName },
                ...(t.activities || []),
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
              ...(t.activities || []),
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
                  ...(t.activities || []),
                ].slice(0, 10)
              : t.activities,
          }
        : t
    ),
  })),
    }),
    {
      name: 'mdk-task-filters',
      partialize: (state) => ({
        view: state.view,
        filters: state.filters,
        advancedFilters: state.advancedFilters,
      }),
    }
  )
)

// ── Hydration Hook ──────────────────���─────────────────────────────────────────
/**
 * Hook to ensure store is hydrated before using persisted state.
 * Use this in components to prevent hydration mismatches.
 */
export function useTaskStoreHydrated() {
  const [hydrated, setHydrated] = useState(false)
  
  useEffect(() => {
    setHydrated(true)
  }, [])
  
  return hydrated
}

// ── Selectors ───────��────────────────────────────────���────────────────────────

export function useFilteredTasks() {
  const tasks = useTaskStore((s) => s.tasks)
  const filters = useTaskStore((s) => s.filters)
  const advancedFilters = useTaskStore((s) => s.advancedFilters)
  
  // Apply simple filters first
  let filteredTasks = tasks.filter((task) => {
  if (filters.priority && task.priority !== filters.priority) return false
  if ((filters.statusIds?.length ?? 0) > 0 && !filters.statusIds.includes(task.status)) return false
  // Show unassigned filter - only show tasks without assignee
  if (filters.showUnassigned) {
    const hasNoAssignee = !task.assigneeId || task.assigneeId === ''
    const hasNoAdditionalAssignees = !task.assignees || task.assignees.length === 0
    if (!hasNoAssignee || !hasNoAdditionalAssignees) return false
  }
  // Multi-assignee filter - check if task's assignee is in the selected list
  if (filters.assigneeIds.length > 0) {
  // Check primary assignee
  const hasMatchingAssignee = task.assigneeId && filters.assigneeIds.includes(task.assigneeId)
  // Check assignees array (multi-assignee support)
  const hasMatchingInAssigneesArray = task.assignees?.some(a => filters.assigneeIds.includes(a.id)) ?? false
  if (!hasMatchingAssignee && !hasMatchingInAssigneesArray) return false
  }
  if (filters.type && task.type !== filters.type) return false
  if (filters.dueThisWeek && task.dueDate) {
  const now = new Date()
  const endOfWeek = new Date(now)
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()))
  if (task.dueDate > endOfWeek) return false
  }
  // Search query filter - search in title, client name, and description
  if (filters.searchQuery) {
  const query = filters.searchQuery.toLowerCase()
  const matchesTitle = task.title.toLowerCase().includes(query)
  const matchesClient = task.clientName?.toLowerCase().includes(query) ?? false
  const matchesDescription = task.description?.toLowerCase().includes(query) ?? false
  const matchesAssignee = task.assigneeName?.toLowerCase().includes(query) ?? false
  if (!matchesTitle && !matchesClient && !matchesDescription && !matchesAssignee) return false
  }
  // Client filter
  if (filters.clientIds && filters.clientIds.length > 0) {
    const taskClientIds = task.clients?.map(c => c.id) || (task.clientId ? [task.clientId] : [])
    const matches = filters.clientIds.some(id => taskClientIds.includes(id))
    if (!matches) return false
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
    no_realizado: [],
  }
  tasks.forEach((task) => {
    if (grouped[task.status]) {
      grouped[task.status].push(task)
    }
  })
  return grouped
}

// ── Quotation Helpers ─────���─────────────────────────────��─────────────────────

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
