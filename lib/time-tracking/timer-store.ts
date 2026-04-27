'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createClient } from '@/lib/supabase/client'

export interface TimeEntry {
  id: string
  user_id: string | null
  client_id: string | null
  description: string
  started_at: string
  ended_at: string | null
  duration_sec: number | null
  billable: boolean
}

interface TimerState {
  // Timer state
  isRunning: boolean
  startedAt: string | null
  currentEntryId: string | null  // The Supabase entry id for the running timer
  description: string
  clientId: string | null
  billable: boolean
  taskId: string | null  // Task ID if timer started from a task
  
  // Entries (local cache)
  entries: TimeEntry[]
  isLoading: boolean
  
  // Actions
  startTimer: () => Promise<void>
  stopTimer: () => Promise<void>
  setDescription: (desc: string) => void
  setClientId: (id: string | null) => Promise<void>
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
      billable: true,
      taskId: null,
      entries: [],
      isLoading: false,

      startTimer: async () => {
        const state = get()
        const supabase = createClient()
        const startedAt = new Date().toISOString()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        
        // Insert into Supabase immediately with ended_at = null (running)
        const { data: newEntry, error } = await supabase
          .from('time_entries')
          .insert({
            user_id: user?.id ?? null,
            client_id: state.clientId,
            description: state.description || 'Sin descripcion',
            started_at: startedAt,
            ended_at: null,
            duration_sec: null,
            billable: state.billable,
          })
          .select()
          .single()

        if (error) {
          console.error('Error creating time entry:', error)
          return
        }

        // Update local state with the entry id and add to entries cache
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
          set({
            isRunning: false,
            startedAt: null,
            currentEntryId: null,
          })
          return
        }

        const endedAt = new Date().toISOString()
        const startTime = new Date(state.startedAt).getTime()
        const endTime = new Date(endedAt).getTime()
        const durationSec = Math.floor((endTime - startTime) / 1000)

        const supabase = createClient()
        let entryIdToUpdate = state.currentEntryId

        if (!entryIdToUpdate) {
          const { data: runningEntries } = await supabase
            .from('time_entries')
            .select('id')
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1)
          
          if (runningEntries && runningEntries.length > 0) {
            entryIdToUpdate = runningEntries[0].id
          }
        }

        if (entryIdToUpdate) {
          const { error } = await supabase
            .from('time_entries')
            .update({
              ended_at: endedAt,
              duration_sec: durationSec,
              description: state.description || 'Sin descripcion',
            })
            .eq('id', entryIdToUpdate)

          if (error) {
            console.error('Error stopping time entry:', error)
          }

          set((s) => ({
            entries: s.entries.map((e) =>
              e.id === entryIdToUpdate
                ? { ...e, ended_at: endedAt, duration_sec: durationSec, description: state.description || 'Sin descripcion' }
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
          billable: true,
          taskId: null,
        })
      },

      setDescription: (desc) => set({ description: desc }),
      
      setClientId: async (id) => {
        const state = get()
        
        // If timer is running and client changes, stop current timer first
        if (state.isRunning && state.currentEntryId && id !== state.clientId) {
          // Stop current timer
          await get().stopTimer()
          
          // Set the new client and start a new timer
          set({ clientId: id })
          await get().startTimer()
        } else {
          set({ clientId: id })
        }
      },
      
      toggleBillable: () => set((s) => ({ billable: !s.billable })),

      continueEntry: async (entry) => {
        const state = get()
        
        // If timer is running, stop it first
        if (state.isRunning && state.currentEntryId) {
          await get().stopTimer()
        }

        // Set state for the new entry
        set({
          description: entry.description,
          clientId: entry.client_id,
          billable: entry.billable,
        })

        // Start a new timer
        await get().startTimer()
      },

      startTimerForTask: async (taskId: string, taskTitle: string, clientId: string | null) => {
        const state = get()
        
        // If timer is running, stop it first
        if (state.isRunning && state.currentEntryId) {
          await get().stopTimer()
        }

        const supabase = createClient()
        const startedAt = new Date().toISOString()
        const description = `[Tarea] ${taskTitle}`
        
        const { data: { user } } = await supabase.auth.getUser()
        
        const { data: newEntry, error } = await supabase
          .from('time_entries')
          .insert({
            user_id: user?.id ?? null,
            client_id: clientId,
            description: description,
            started_at: startedAt,
            ended_at: null,
            duration_sec: null,
            billable: true,
          })
          .select()
          .single()

        if (error) {
          console.error('Error creating time entry for task:', error)
          return
        }

        // Update state atomically with all values
        set({
          description: description,
          clientId: clientId,
          billable: true,
          taskId: taskId,
          isRunning: true,
          startedAt: startedAt,
          currentEntryId: newEntry.id,
          entries: [newEntry as TimeEntry, ...get().entries],
        })
      },

      deleteEntry: async (id) => {
        // Remove from local state
        set((s) => ({
          entries: s.entries.filter((e) => e.id !== id),
        }))

        // Delete from Supabase
        const supabase = createClient()
        await supabase.from('time_entries').delete().eq('id', id)
      },

      updateEntry: async (id, updates) => {
        // Update local state
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        }))

        // Update in Supabase
        const supabase = createClient()
        await supabase.from('time_entries').update(updates).eq('id', id)
      },

      loadEntries: async () => {
        set({ isLoading: true })
        try {
          const supabase = createClient()
          
          const { data, error } = await supabase
            .from('time_entries')
            .select('*')
            .order('started_at', { ascending: false })
            .limit(100)

          if (!error && data) {
            set({ entries: data as TimeEntry[] })
            
            // Check if there's a running entry (ended_at = null) and sync local state
            const runningEntry = data.find((e) => e.ended_at === null)
            if (runningEntry) {
              set({
                isRunning: true,
                startedAt: runningEntry.started_at,
                currentEntryId: runningEntry.id,
                description: runningEntry.description,
                clientId: runningEntry.client_id,
                billable: runningEntry.billable,
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
        const startTime = new Date(state.startedAt).getTime()
        const now = Date.now()
        return Math.floor((now - startTime) / 1000)
      },
    }),
    {
      name: 'mdk-timer-storage',
      // Only persist timer state, not entries (entries come from Supabase)
      partialize: (state) => ({
        isRunning: state.isRunning,
        startedAt: state.startedAt,
        currentEntryId: state.currentEntryId,
        description: state.description,
        clientId: state.clientId,
        billable: state.billable,
        taskId: state.taskId,
      }),
    }
  )
)
