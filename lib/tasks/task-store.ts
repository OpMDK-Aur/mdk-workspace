'use client'

import { create } from 'zustand'
import type { Task, TaskStatus, TaskPriority, TaskType, TaskCustomField, TaskComment, TaskFile, TaskQuotation } from '@/lib/types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const HOURLY_RATE = 150000 // $150,000 CLP
export const IVA_RATE = 0.21 // 21%

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_TASKS: Task[] = [
  {
    id: '1',
    title: 'Desarrollo — Integracion Alambrados Patagonia',
    description: '<p>Implementar integracion con sistema de inventario</p><ul><li>Conexion API REST</li><li>Sincronizacion de productos</li><li>Mapeo de campos</li></ul>',
    clientId: 'alambrados',
    clientName: 'Alambrados Patagonia',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
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

export const TYPE_CONFIG: Record<TaskType, { label: string; color: string }> = {
  crm: { label: 'CRM', color: 'bg-cyan-500/20 text-cyan-400' },
  meta_ads: { label: 'Meta Ads', color: 'bg-blue-500/20 text-blue-400' },
  soporte: { label: 'Soporte', color: 'bg-emerald-500/20 text-emerald-400' },
  integracion: { label: 'Integracion', color: 'bg-violet-500/20 text-violet-400' },
  reportes: { label: 'Reportes', color: 'bg-pink-500/20 text-pink-400' },
  desarrollo: { label: 'Desarrollo', color: 'bg-indigo-500/20 text-indigo-400' },
}

export const ASSIGNEES = [
  { id: 'erika', name: 'Erika Gordillo' },
  { id: 'ayelen', name: 'Ayelen Suarez' },
  { id: 'paula', name: 'Paula Aguirre' },
]

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
  field: 'status' | 'priority' | 'assignee' | 'type' | 'client' | 'title' | 'dueDate' | 'createdAt' | 'isActive'
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
  selectedTaskId: string | null
  view: 'kanban' | 'list'
  
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
  setView: (view: 'kanban' | 'list') => void
  setSelectedTask: (id: string | null) => void
  setFilter: (key: keyof TaskStore['filters'], value: unknown) => void
  clearFilters: () => void
  
  // Advanced filter actions
  setAdvancedFilters: (filters: FilterGroup[]) => void
  saveFilter: (name: string, groups: FilterGroup[]) => void
  loadSavedFilter: (filter: SavedFilter) => void
  deleteSavedFilter: (id: string) => void

  // Task mutations
  updateTaskStatus: (taskId: string, status: TaskStatus) => void
  updateTask: (taskId: string, updates: Partial<Task>) => void
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'activities' | 'timeSessions' | 'totalTimeSec' | 'isTimerRunning' | 'timerStartedAt' | 'comments' | 'files' | 'quotation'>) => void
  deleteTask: (taskId: string) => void
  toggleTaskActive: (taskId: string) => void

  // Timer
  startTimer: (taskId: string) => void
  stopTimer: (taskId: string) => void

  // Custom fields
  addCustomField: (taskId: string, key: string, field: TaskCustomField) => void
  removeCustomField: (taskId: string, key: string) => void

  // Comments
  addComment: (taskId: string, content: string, userId: string, userName: string) => void
  deleteComment: (taskId: string, commentId: string) => void

  // Files
  addFile: (taskId: string, file: Omit<TaskFile, 'id' | 'createdAt'>) => void
  deleteFile: (taskId: string, fileId: string) => void

  // Quotation
  updateQuotation: (taskId: string, quotation: TaskQuotation | null) => void
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: MOCK_TASKS,
  selectedTaskId: null,
  view: 'kanban',
  filters: {
    priority: null,
    assigneeId: null,
    type: null,
    dueThisWeek: false,
  },
  advancedFilters: [],
  savedFilters: [],

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

  updateTaskStatus: (taskId, status) => set((state) => ({
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
  })),

  updateTask: (taskId, updates) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId ? { ...t, ...updates, updatedAt: new Date() } : t
    ),
  })),

  addTask: (taskData) => set((state) => ({
    tasks: [
      {
        ...taskData,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        activities: [
          { id: crypto.randomUUID(), action: 'Tarea creada', timestamp: new Date(), userId: 'current', userName: 'Usuario' },
        ],
        timeSessions: [],
        totalTimeSec: 0,
        isTimerRunning: false,
        timerStartedAt: null,
        comments: [],
        files: [],
        quotation: null,
      },
      ...state.tasks,
    ],
  })),

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

  addComment: (taskId, content, userId, userName) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            comments: [
              ...t.comments,
              {
                id: crypto.randomUUID(),
                content,
                userId,
                userName,
                userAvatar: null,
                createdAt: new Date(),
              },
            ],
            updatedAt: new Date(),
            activities: [
              { id: crypto.randomUUID(), action: 'Agrego comentario', timestamp: new Date(), userId, userName },
              ...t.activities,
            ].slice(0, 10),
          }
        : t
    ),
  })),

  deleteComment: (taskId, commentId) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? { ...t, comments: t.comments.filter((c) => c.id !== commentId), updatedAt: new Date() }
        : t
    ),
  })),

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
