'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TimeEntry } from './types'

// Extended type for time entries with client_id
export interface TimeEntryWithClient extends Omit<TimeEntry, 'project_id' | 'task_id'> {
  client_id: string | null
}

interface TimerState {
  isRunning: boolean
  startedAt: string | null
  description: string
  clientId: string | null
  billable: boolean
  elapsedSeconds: number
}

interface TimerContextType {
  timer: TimerState
  entries: TimeEntryWithClient[]
  isLoading: boolean
  startTimer: () => void
  stopTimer: () => Promise<void>
  setDescription: (desc: string) => void
  setClientId: (id: string | null) => void
  toggleBillable: () => void
  continueEntry: (entry: TimeEntryWithClient) => void
  deleteEntry: (id: string) => Promise<void>
  updateEntry: (id: string, updates: Partial<TimeEntryWithClient>) => Promise<void>
  refreshEntries: () => Promise<void>
  lastEntry: TimeEntryWithClient | null
}

const TimerContext = createContext<TimerContextType | null>(null)

export function useTimer() {
  const context = useContext(TimerContext)
  if (!context) {
    throw new Error('useTimer must be used within a TimerProvider')
  }
  return context
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<TimeEntryWithClient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [timer, setTimer] = useState<TimerState>({
    isRunning: false,
    startedAt: null,
    description: '',
    clientId: null,
    billable: true,
    elapsedSeconds: 0,
  })

  // Fetch entries from Supabase on mount
  const refreshEntries = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100)

    if (error) {
      console.log('[v0] Error fetching time entries:', error.message)
      // If table doesn't exist, just use empty array
      setEntries([])
    } else {
      setEntries(data || [])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    refreshEntries()
  }, [refreshEntries])

  // Update elapsed seconds every second when timer is running
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (timer.isRunning && timer.startedAt) {
      interval = setInterval(() => {
        const start = new Date(timer.startedAt!).getTime()
        const now = Date.now()
        const elapsed = Math.floor((now - start) / 1000)
        setTimer((prev) => ({ ...prev, elapsedSeconds: elapsed }))
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [timer.isRunning, timer.startedAt])

  const startTimer = useCallback(() => {
    setTimer((prev) => ({
      ...prev,
      isRunning: true,
      startedAt: new Date().toISOString(),
      elapsedSeconds: 0,
    }))
  }, [])

  const stopTimer = useCallback(async () => {
    if (!timer.startedAt) return

    const supabase = createClient()
    const endedAt = new Date().toISOString()

    const newEntry = {
      client_id: timer.clientId,
      description: timer.description || 'No description',
      started_at: timer.startedAt,
      ended_at: endedAt,
      duration_sec: timer.elapsedSeconds,
      billable: timer.billable,
    }

    const { data, error } = await supabase
      .from('time_entries')
      .insert(newEntry)
      .select()
      .single()

    if (error) {
      console.log('[v0] Error saving time entry:', error.message)
      // Fallback to local state if DB fails
      const localEntry: TimeEntryWithClient = {
        id: `local-${Date.now()}`,
        user_id: 'user-1',
        client_id: timer.clientId,
        description: timer.description || 'No description',
        started_at: timer.startedAt,
        ended_at: endedAt,
        duration_sec: timer.elapsedSeconds,
        billable: timer.billable,
      }
      setEntries((prev) => [localEntry, ...prev])
    } else if (data) {
      setEntries((prev) => [data, ...prev])
    }

    setTimer({
      isRunning: false,
      startedAt: null,
      description: '',
      clientId: null,
      billable: true,
      elapsedSeconds: 0,
    })
  }, [timer])

  const setDescription = useCallback((desc: string) => {
    setTimer((prev) => ({ ...prev, description: desc }))
  }, [])

  const setClientId = useCallback((id: string | null) => {
    setTimer((prev) => ({ ...prev, clientId: id }))
  }, [])

  const toggleBillable = useCallback(() => {
    setTimer((prev) => ({ ...prev, billable: !prev.billable }))
  }, [])

  const continueEntry = useCallback((entry: TimeEntryWithClient) => {
    setTimer({
      isRunning: true,
      startedAt: new Date().toISOString(),
      description: entry.description,
      clientId: entry.client_id,
      billable: entry.billable,
      elapsedSeconds: 0,
    })
  }, [])

  const deleteEntry = useCallback(async (id: string) => {
    const supabase = createClient()
    
    // Optimistic update
    setEntries((prev) => prev.filter((e) => e.id !== id))

    const { error } = await supabase
      .from('time_entries')
      .delete()
      .eq('id', id)

    if (error) {
      console.log('[v0] Error deleting time entry:', error.message)
      // Refresh to restore if delete failed
      refreshEntries()
    }
  }, [refreshEntries])

  const updateEntry = useCallback(async (id: string, updates: Partial<TimeEntryWithClient>) => {
    const supabase = createClient()
    
    // Optimistic update
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    )

    const { error } = await supabase
      .from('time_entries')
      .update(updates)
      .eq('id', id)

    if (error) {
      console.log('[v0] Error updating time entry:', error.message)
      refreshEntries()
    }
  }, [refreshEntries])

  const lastEntry = entries[0] || null

  return (
    <TimerContext.Provider
      value={{
        timer,
        entries,
        isLoading,
        startTimer,
        stopTimer,
        setDescription,
        setClientId,
        toggleBillable,
        continueEntry,
        deleteEntry,
        updateEntry,
        refreshEntries,
        lastEntry,
      }}
    >
      {children}
    </TimerContext.Provider>
  )
}
