'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createClient } from '@/lib/supabase/client'

export interface TimeEntry {
  id: string
  colaborador_id: string | null
  cliente_id: string | null
  tipo_tarea_id: string | null
  descripcion: string
  iniciado_en: string
  finalizado_en: string | null
  duracion_seg: number | null
  facturable: boolean
}

interface TimerState {
  // Timer state
  isRunning: boolean
  startedAt: string | null
  currentEntryId: string | null
  description: string
  clientId: string | null
  tipoTareaId: string | null
  billable: boolean
  taskId: string | null

  // Entries (local cache)
  entries: TimeEntry[]
  isLoading: boolean

  // Actions
  startTimer: () => Promise<void>
  stopTimer: () => Promise<void>
  setDescription: (desc: string) => void
  setClientId: (id: string | null) => Promise<void>
  setTipoTareaId: (id: string | null) => void
  toggleBillable: () => void
  continueEntry: (entry: TimeEntry) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  updateEntry: (id: string, updates: Partial<TimeEntry>) => Promise<void>
  loadEntries: () => Promise<void>

  // Task-specific actions
  startTimerForTask: (taskId: string, taskTitle: string, clientId: string | null) => Promise<void>

  // Computed
  getElapsedSeconds: () => number
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      // Initial state
      isRunning: false,
      startedAt: null,
      currentEntryId: null,
      description: '',
      clientId: null,
      tipoTareaId: null,
      billable: true,
      taskId: null,
      entries: [],
      isLoading: false,

      startTimer: async () => {
        const state = get()
        const supabase = createClient()
        const startedAt = new Date().toISOString()

        const { data: { user } } = await supabase.auth.getUser()
        
        console.log('[v0] startTimer - user:', user?.id)
        console.log('[v0] startTimer - clientId:', state.clientId)
        console.log('[v0] startTimer - tipoTareaId:', state.tipoTareaId)

        const { data: newEntry, error } = await supabase
          .from('entradas_de_tiempo')
          .insert({
            colaborador_id: user?.id ?? null,
            cliente_id: state.clientId,
            tipo_tarea_id: state.tipoTareaId,
            descripcion: state.description || 'Sin descripción',
            iniciado_en: startedAt,
            finalizado_en: null,
            duracion_seg: null,
            facturable: state.billable,
          })
          .select()
          .single()

        console.log('[v0] startTimer - newEntry:', newEntry)
        console.log('[v0] startTimer - error:', error)

        if (error) {
          console.error('Error creating time entry:', error)
          return
        }

        set({
          isRunning: true,
          startedAt: startedAt,
          currentEntryId: newEntry.id,
          entries: [newEntry as TimeEntry, ...get().entries],
        })
      },

      stopTimer: async () => {
        const state = get()

        if (!state.startedAt) {
          set({ isRunning: false, startedAt: null, currentEntryId: null })
          return
        }

        const finalizado_en = new Date().toISOString()
        const startTime = new Date(state.startedAt).getTime()
        const endTime = new Date(finalizado_en).getTime()
        const duracion_seg = Math.floor((endTime - startTime) / 1000)

        const supabase = createClient()
        let entryIdToUpdate = state.currentEntryId

        if (!entryIdToUpdate) {
          const { data: runningEntries } = await supabase
            .from('entradas_de_tiempo')
            .select('id')
            .is('finalizado_en', null)
            .order('iniciado_en', { ascending: false })
            .limit(1)

          if (runningEntries && runningEntries.length > 0) {
            entryIdToUpdate = runningEntries[0].id
          }
        }

        if (entryIdToUpdate) {
          const { error } = await supabase
            .from('entradas_de_tiempo')
            .update({
              finalizado_en,
              duracion_seg,
              descripcion: state.description || 'Sin descripción',
            })
            .eq('id', entryIdToUpdate)

          if (error) {
            console.error('Error stopping time entry:', error)
          }

          set((s) => ({
            entries: s.entries.map((e) =>
              e.id === entryIdToUpdate
                ? { ...e, finalizado_en, duracion_seg, descripcion: state.description || 'Sin descripción' }
                : e
            ),
          }))
        }

        set({
          isRunning: false,
          startedAt: null,
          currentEntryId: null,
          description: '',
          clientId: null,
          tipoTareaId: null,
          billable: true,
          taskId: null,
        })
      },

      setDescription: (desc) => set({ description: desc }),

      setTipoTareaId: (id) => set({ tipoTareaId: id }),

      setClientId: async (id) => {
        const state = get()
        if (state.isRunning && state.currentEntryId && id !== state.clientId) {
          await get().stopTimer()
          set({ clientId: id })
          await get().startTimer()
        } else {
          set({ clientId: id })
        }
      },

      toggleBillable: () => set((s) => ({ billable: !s.billable })),

      continueEntry: async (entry) => {
        const state = get()
        if (state.isRunning && state.currentEntryId) {
          await get().stopTimer()
        }
        set({
          description: entry.descripcion,
          clientId: entry.cliente_id,
          tipoTareaId: entry.tipo_tarea_id,
          billable: entry.facturable,
        })
        await get().startTimer()
      },

      startTimerForTask: async (taskId: string, taskTitle: string, clientId: string | null) => {
        const state = get()
        if (state.isRunning && state.currentEntryId) {
          await get().stopTimer()
        }

        const supabase = createClient()
        const startedAt = new Date().toISOString()
        const descripcion = `[Tarea] ${taskTitle}`

        const { data: { user } } = await supabase.auth.getUser()

        const { data: newEntry, error } = await supabase
          .from('entradas_de_tiempo')
          .insert({
            colaborador_id: user?.id ?? null,
            cliente_id: clientId,
            tipo_tarea_id: null,
            descripcion,
            iniciado_en: startedAt,
            finalizado_en: null,
            duracion_seg: null,
            facturable: true,
          })
          .select()
          .single()

        if (error) {
          console.error('Error creating time entry for task:', error)
          return
        }

        set({
          description: descripcion,
          clientId: clientId,
          tipoTareaId: null,
          billable: true,
          taskId: taskId,
          isRunning: true,
          startedAt: startedAt,
          currentEntryId: newEntry.id,
          entries: [newEntry as TimeEntry, ...get().entries],
        })
      },

      deleteEntry: async (id) => {
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
        const supabase = createClient()
        await supabase.from('entradas_de_tiempo').delete().eq('id', id)
      },

      updateEntry: async (id, updates) => {
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        }))
        const supabase = createClient()
        await supabase.from('entradas_de_tiempo').update(updates).eq('id', id)
      },

      loadEntries: async () => {
        set({ isLoading: true })
        try {
          const supabase = createClient()
          
          console.log('[v0] loadEntries - fetching from entradas_de_tiempo...')
          
          const { data, error } = await supabase
            .from('entradas_de_tiempo')
            .select('*')
            .order('iniciado_en', { ascending: false })
            .limit(100)

          console.log('[v0] loadEntries - data:', data)
          console.log('[v0] loadEntries - error:', error)

          if (!error && data) {
            // Filter out entries with invalid iniciado_en
            const validEntries = data.filter((e) => e.iniciado_en && !isNaN(new Date(e.iniciado_en).getTime()))
            console.log('[v0] loadEntries - validEntries count:', validEntries.length)
            set({ entries: validEntries as TimeEntry[] })

            const runningEntry = validEntries.find((e) => e.finalizado_en === null)
            if (runningEntry) {
              set({
                isRunning: true,
                startedAt: runningEntry.iniciado_en,
                currentEntryId: runningEntry.id,
                description: runningEntry.descripcion,
                clientId: runningEntry.cliente_id,
                tipoTareaId: runningEntry.tipo_tarea_id,
                billable: runningEntry.facturable,
              })
            }
          }
        } catch (err) {
          console.error('Error loading entries:', err)
        } finally {
          set({ isLoading: false })
        }
      },

      getElapsedSeconds: () => {
        const state = get()
        if (!state.isRunning || !state.startedAt) return 0
        return Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000)
      },
    }),
    {
      name: 'mdk-timer-storage',
      partialize: (state) => ({
        isRunning: state.isRunning,
        startedAt: state.startedAt,
        currentEntryId: state.currentEntryId,
        description: state.description,
        clientId: state.clientId,
        tipoTareaId: state.tipoTareaId,
        billable: state.billable,
        taskId: state.taskId,
      }),
    }
  )
)
