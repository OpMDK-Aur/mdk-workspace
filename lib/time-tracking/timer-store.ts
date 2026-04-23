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
  description: string
  clientId: string | null
  billable: boolean
  
  // Entries (local cache)
  entries: TimeEntry[]
  isLoading: boolean
  
  // Actions
  startTimer: () => void
  stopTimer: () => Promise<void>
  setDescription: (desc: string) => void
  setClientId: (id: string | null) => void
  toggleBillable: () => void
  continueEntry: (entry: TimeEntry) => void
  deleteEntry: (id: string) => Promise<void>
  updateEntry: (id: string, updates: Partial<TimeEntry>) => Promise<void>
  loadEntries: () => Promise<void>
  
  // Computed
  getElapsedSeconds: () => number
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      // Initial state
      isRunning: false,
      startedAt: null,
      description: '',
      clientId: null,
      billable: true,
      entries: [],
      isLoading: false,

      startTimer: () => {
        set({
          isRunning: true,
          startedAt: new Date().toISOString(),
        })
      },

      stopTimer: async () => {
        const state = get()
        if (!state.startedAt) return

        const endedAt = new Date().toISOString()
        const startTime = new Date(state.startedAt).getTime()
        const endTime = new Date(endedAt).getTime()
        const durationSec = Math.floor((endTime - startTime) / 1000)

        const newEntry: TimeEntry = {
          id: `temp-${Date.now()}`,
          user_id: null,
          client_id: state.clientId,
          description: state.description || 'Sin descripción',
          started_at: state.startedAt,
          ended_at: endedAt,
          duration_sec: durationSec,
          billable: state.billable,
        }

        // Add to local entries immediately
        set((s) => ({
          entries: [newEntry, ...s.entries],
          isRunning: false,
          startedAt: null,
          description: '',
          clientId: null,
          billable: true,
        }))

        // Save to Supabase
        try {
          const supabase = createClient()
          const { data, error } = await supabase
            .from('time_entries')
            .insert({
              client_id: state.clientId,
              description: state.description || 'Sin descripción',
              started_at: state.startedAt,
              ended_at: endedAt,
              duration_sec: durationSec,
              billable: state.billable,
            })
            .select()
            .single()

          if (!error && data) {
            // Replace temp entry with real one
            set((s) => ({
              entries: s.entries.map((e) =>
                e.id === newEntry.id ? { ...data } : e
              ),
            }))
          }
        } catch (err) {
          console.error('Error saving time entry:', err)
        }
      },

      setDescription: (desc) => set({ description: desc }),
      
      setClientId: (id) => set({ clientId: id }),
      
      toggleBillable: () => set((s) => ({ billable: !s.billable })),

      continueEntry: (entry) => {
        set({
          isRunning: true,
          startedAt: new Date().toISOString(),
          description: entry.description,
          clientId: entry.client_id,
          billable: entry.billable,
        })
      },

      deleteEntry: async (id) => {
        // Remove from local state
        set((s) => ({
          entries: s.entries.filter((e) => e.id !== id),
        }))

        // Delete from Supabase if it's a real entry
        if (!id.startsWith('temp-')) {
          try {
            const supabase = createClient()
            await supabase.from('time_entries').delete().eq('id', id)
          } catch (err) {
            console.error('Error deleting entry:', err)
          }
        }
      },

      updateEntry: async (id, updates) => {
        // Update local state
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        }))

        // Update in Supabase if it's a real entry
        if (!id.startsWith('temp-')) {
          try {
            const supabase = createClient()
            await supabase.from('time_entries').update(updates).eq('id', id)
          } catch (err) {
            console.error('Error updating entry:', err)
          }
        }
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
        description: state.description,
        clientId: state.clientId,
        billable: state.billable,
      }),
    }
  )
)
