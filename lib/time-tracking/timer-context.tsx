'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { TimeEntry } from './types'
import { mockTimeEntries, mockProjects, mockTasks } from './mock-data'

interface TimerState {
  isRunning: boolean
  startedAt: string | null
  description: string
  projectId: string | null
  taskId: string | null
  billable: boolean
  elapsedSeconds: number
}

interface TimerContextType {
  timer: TimerState
  entries: TimeEntry[]
  startTimer: () => void
  stopTimer: () => void
  setDescription: (desc: string) => void
  setProjectId: (id: string | null) => void
  setTaskId: (id: string | null) => void
  toggleBillable: () => void
  continueEntry: (entry: TimeEntry) => void
  deleteEntry: (id: string) => void
  updateEntry: (id: string, updates: Partial<TimeEntry>) => void
  lastEntry: TimeEntry | null
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
  const [entries, setEntries] = useState<TimeEntry[]>(mockTimeEntries)
  const [timer, setTimer] = useState<TimerState>({
    isRunning: false,
    startedAt: null,
    description: '',
    projectId: null,
    taskId: null,
    billable: true,
    elapsedSeconds: 0,
  })

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

  const stopTimer = useCallback(() => {
    if (!timer.startedAt) return

    const newEntry: TimeEntry = {
      id: `entry-${Date.now()}`,
      user_id: 'user-1',
      project_id: timer.projectId,
      task_id: timer.taskId,
      description: timer.description || 'No description',
      started_at: timer.startedAt,
      ended_at: new Date().toISOString(),
      duration_sec: timer.elapsedSeconds,
      billable: timer.billable,
    }

    setEntries((prev) => [newEntry, ...prev])
    setTimer({
      isRunning: false,
      startedAt: null,
      description: '',
      projectId: null,
      taskId: null,
      billable: true,
      elapsedSeconds: 0,
    })
  }, [timer])

  const setDescription = useCallback((desc: string) => {
    setTimer((prev) => ({ ...prev, description: desc }))
  }, [])

  const setProjectId = useCallback((id: string | null) => {
    setTimer((prev) => ({ ...prev, projectId: id, taskId: null }))
  }, [])

  const setTaskId = useCallback((id: string | null) => {
    setTimer((prev) => ({ ...prev, taskId: id }))
  }, [])

  const toggleBillable = useCallback(() => {
    setTimer((prev) => ({ ...prev, billable: !prev.billable }))
  }, [])

  const continueEntry = useCallback((entry: TimeEntry) => {
    setTimer({
      isRunning: true,
      startedAt: new Date().toISOString(),
      description: entry.description,
      projectId: entry.project_id,
      taskId: entry.task_id,
      billable: entry.billable,
      elapsedSeconds: 0,
    })
  }, [])

  const deleteEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const updateEntry = useCallback((id: string, updates: Partial<TimeEntry>) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    )
  }, [])

  const lastEntry = entries[0] || null

  return (
    <TimerContext.Provider
      value={{
        timer,
        entries,
        startTimer,
        stopTimer,
        setDescription,
        setProjectId,
        setTaskId,
        toggleBillable,
        continueEntry,
        deleteEntry,
        updateEntry,
        lastEntry,
      }}
    >
      {children}
    </TimerContext.Provider>
  )
}
