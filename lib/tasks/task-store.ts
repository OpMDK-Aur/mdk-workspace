'use client'

import { create } from 'zustand'
import type { Task, TaskStatus, TaskPriority, TaskType, TaskCustomField } from '@/lib/types'

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_TASKS: Task[] = [
  {
    id: '1',
    title: 'Desarrollo — Integracion Alambrados Patagonia',
    description: 'Implementar integracion con sistema de inventario',
    clientId: 'alambrados',
    clientName: 'Alambrados Patagonia',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'pendiente',
    priority: 'alta',
    type: 'integracion',
    dueDate: new Date('2026-05-01'),
    customFields: {},
    timeSessions: [],
    totalTimeSec: 0,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [],
    createdAt: new Date('2026-04-20'),
    updatedAt: new Date('2026-04-20'),
  },
  {
    id: '2',
    title: 'NPS — Crear campos personalizados',
    description: 'Agregar campos de NPS al CRM',
    clientId: 'mdk',
    clientName: 'MDK',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'pendiente',
    priority: 'alta',
    type: 'desarrollo',
    dueDate: new Date('2026-04-28'),
    customFields: {},
    timeSessions: [],
    totalTimeSec: 0,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [],
    createdAt: new Date('2026-04-18'),
    updatedAt: new Date('2026-04-18'),
  },
  {
    id: '3',
    title: 'Icaro — Revisar conexion email',
    description: 'El cliente reporta problemas con envio de emails',
    clientId: 'icaro',
    clientName: 'Icaro',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'resolviendo',
    priority: 'alta',
    type: 'soporte',
    dueDate: new Date('2026-04-25'),
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
    comments: [],
    createdAt: new Date('2026-04-22'),
    updatedAt: new Date('2026-04-24'),
  },
  {
    id: '4',
    title: 'Migracion de API',
    description: 'Migrar endpoints legacy a nueva version',
    clientId: 'ics',
    clientName: 'ICS Prepaqa',
    assigneeId: 'ayelen',
    assigneeName: 'Ayelen Suarez',
    status: 'resolviendo',
    priority: 'alta',
    type: 'crm',
    dueDate: new Date('2026-04-30'),
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
    createdAt: new Date('2026-04-15'),
    updatedAt: new Date('2026-04-22'),
  },
  {
    id: '5',
    title: 'Modificar estadio de funnel ventas',
    description: 'Ajustar etapas del pipeline de ventas',
    clientId: 'mdk',
    clientName: 'MDK',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'demorada',
    priority: 'media',
    type: 'crm',
    dueDate: new Date('2026-04-20'),
    customFields: {},
    timeSessions: [],
    totalTimeSec: 3600,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [
      { id: 'a2', action: 'Marcada como demorada', timestamp: new Date('2026-04-21'), userId: 'erika', userName: 'Erika Gordillo' },
    ],
    comments: ['Esperando feedback del equipo de ventas'],
    createdAt: new Date('2026-04-10'),
    updatedAt: new Date('2026-04-21'),
  },
  {
    id: '6',
    title: 'ADT: tablero automatico de control',
    description: 'Crear dashboard automatizado para Meta Ads',
    clientId: 'adt',
    clientName: 'ADT',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'demorada',
    priority: 'media',
    type: 'meta_ads',
    dueDate: new Date('2026-04-26'),
    customFields: {
      cuenta_publicitaria: { label: 'Cuenta publicitaria', type: 'text', value: 'ADT Argentina' },
    },
    timeSessions: [],
    totalTimeSec: 7200,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [],
    createdAt: new Date('2026-04-12'),
    updatedAt: new Date('2026-04-20'),
  },
  {
    id: '7',
    title: 'Del Sur: Modificacion del Looker Studio',
    description: 'Actualizar reportes en Looker Studio',
    clientId: 'delsur',
    clientName: 'Del Sur Autos',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'pausada',
    priority: 'alta',
    type: 'reportes',
    dueDate: null,
    customFields: {},
    timeSessions: [],
    totalTimeSec: 1800,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [
      { id: 'a3', action: 'Pausada por cliente', timestamp: new Date('2026-04-19'), userId: 'erika', userName: 'Erika Gordillo' },
    ],
    comments: [],
    createdAt: new Date('2026-04-08'),
    updatedAt: new Date('2026-04-19'),
  },
  {
    id: '8',
    title: 'Roller Pro — Mensajes de recontacto (24 y 48 hs)',
    description: 'Configurar automatizaciones de seguimiento',
    clientId: 'rollerpro',
    clientName: 'Roller Pro',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'pendiente_aprobacion',
    priority: 'alta',
    type: 'crm',
    dueDate: new Date('2026-04-27'),
    customFields: {},
    timeSessions: [],
    totalTimeSec: 10800,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: ['Enviado para revision del cliente'],
    createdAt: new Date('2026-04-14'),
    updatedAt: new Date('2026-04-23'),
  },
  {
    id: '9',
    title: 'Rame Travel | Pixel de Meta',
    description: 'Instalar y configurar pixel de Meta Ads',
    clientId: 'rame',
    clientName: 'Rame Travel',
    assigneeId: 'erika',
    assigneeName: 'Erika Gordillo',
    status: 'pendiente_aprobacion',
    priority: 'alta',
    type: 'meta_ads',
    dueDate: new Date('2026-04-25'),
    customFields: {
      url_campana: { label: 'URL de campana', type: 'text', value: 'https://rametravel.com' },
    },
    timeSessions: [],
    totalTimeSec: 5400,
    isTimerRunning: false,
    timerStartedAt: null,
    activities: [],
    comments: [],
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
}

export const STATUS_ORDER: TaskStatus[] = ['pendiente', 'resolviendo', 'demorada', 'pausada', 'pendiente_aprobacion']

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

// ── Store ─────────────────────────────────────────────────────────────────────

interface TaskStore {
  tasks: Task[]
  selectedTaskId: string | null
  view: 'kanban' | 'list'
  filters: {
    priority: TaskPriority | null
    assigneeId: string | null
    type: TaskType | null
    dueThisWeek: boolean
  }

  // Actions
  setView: (view: 'kanban' | 'list') => void
  setSelectedTask: (id: string | null) => void
  setFilter: (key: keyof TaskStore['filters'], value: unknown) => void
  clearFilters: () => void

  // Task mutations
  updateTaskStatus: (taskId: string, status: TaskStatus) => void
  updateTask: (taskId: string, updates: Partial<Task>) => void
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'activities' | 'timeSessions' | 'totalTimeSec' | 'isTimerRunning' | 'timerStartedAt'>) => void
  deleteTask: (taskId: string) => void

  // Timer
  startTimer: (taskId: string) => void
  stopTimer: (taskId: string) => void

  // Custom fields
  addCustomField: (taskId: string, key: string, field: TaskCustomField) => void
  removeCustomField: (taskId: string, key: string) => void

  // Comments
  addComment: (taskId: string, comment: string) => void
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

  setView: (view) => set({ view }),
  setSelectedTask: (id) => set({ selectedTaskId: id }),
  setFilter: (key, value) => set((state) => ({
    filters: { ...state.filters, [key]: value },
  })),
  clearFilters: () => set({
    filters: { priority: null, assigneeId: null, type: null, dueThisWeek: false },
  }),

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
      },
      ...state.tasks,
    ],
  })),

  deleteTask: (taskId) => set((state) => ({
    tasks: state.tasks.filter((t) => t.id !== taskId),
    selectedTaskId: state.selectedTaskId === taskId ? null : state.selectedTaskId,
  })),

  startTimer: (taskId) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? { ...t, isTimerRunning: true, timerStartedAt: new Date(), updatedAt: new Date() }
        : { ...t, isTimerRunning: false } // Stop other timers
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

  addComment: (taskId, comment) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            comments: [...t.comments, comment],
            updatedAt: new Date(),
            activities: [
              { id: crypto.randomUUID(), action: 'Agrego comentario', timestamp: new Date(), userId: 'current', userName: 'Usuario' },
              ...t.activities,
            ].slice(0, 10),
          }
        : t
    ),
  })),
}))

// ── Selectors ─────────────────────────────────────────────────────────────────

export function useFilteredTasks() {
  const tasks = useTaskStore((s) => s.tasks)
  const filters = useTaskStore((s) => s.filters)

  return tasks.filter((task) => {
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
}

export function useTasksByStatus() {
  const tasks = useFilteredTasks()
  const grouped: Record<TaskStatus, Task[]> = {
    pendiente: [],
    resolviendo: [],
    demorada: [],
    pausada: [],
    pendiente_aprobacion: [],
  }
  tasks.forEach((task) => {
    grouped[task.status].push(task)
  })
  return grouped
}
