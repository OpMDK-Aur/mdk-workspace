'use client'

import { useEffect, useState } from 'react'
import { useTimer } from '@/lib/time-tracking/timer-context'
import { mockProjects, formatDuration, formatDurationShort, getTasksByProjectId } from '@/lib/time-tracking/mock-data'
import { createClient } from '@/lib/supabase/client'
import type { Client, Project } from '@/lib/time-tracking/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Play, Square, DollarSign, Building2 } from 'lucide-react'

export function ActiveTimerBar() {
  const {
    timer,
    startTimer,
    stopTimer,
    setDescription,
    setClientId,
    setProjectId,
    setTaskId,
    toggleBillable,
    lastEntry,
  } = useTimer()

  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoadingClients, setIsLoadingClients] = useState(true)

  // Fetch clients from Supabase on mount
  useEffect(() => {
    async function fetchClients() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name')

      if (!error && data) {
        setClients(data)
      }
      setIsLoadingClients(false)
    }

    fetchClients()
  }, [])

  // Fetch projects when client changes
  useEffect(() => {
    async function fetchProjects() {
      if (!timer.clientId) {
        setProjects([])
        return
      }

      const supabase = createClient()
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('client_id', timer.clientId)
        .order('name')

      if (!error && data) {
        setProjects(data)
      }
    }

    fetchProjects()
  }, [timer.clientId])

  const availableTasks = timer.projectId
    ? getTasksByProjectId(timer.projectId)
    : []

  const selectedClient = clients.find((c) => c.id === timer.clientId)
  const selectedProject = projects.find((p) => p.id === timer.projectId)

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Description Input */}
        <div className="flex-1 min-w-0">
          <Input
            placeholder="What are you working on?"
            value={timer.description}
            onChange={(e) => setDescription(e.target.value)}
            className="border-0 bg-transparent text-base shadow-none focus-visible:ring-0 px-0"
          />
        </div>

        {/* Client Selector */}
        <Select
          value={timer.clientId || ''}
          onValueChange={(val) => setClientId(val || null)}
          disabled={isLoadingClients}
        >
          <SelectTrigger className="w-[160px] shrink-0">
            <SelectValue placeholder="Select client">
              {selectedClient && (
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ backgroundColor: selectedClient.color }}
                  >
                    {selectedClient.logo_initials}
                  </div>
                  <span className="truncate">{selectedClient.name}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ backgroundColor: client.color }}
                  >
                    {client.logo_initials}
                  </div>
                  <span>{client.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Project Selector */}
        <Select
          value={timer.projectId || ''}
          onValueChange={(val) => setProjectId(val || null)}
          disabled={!timer.clientId || projects.length === 0}
        >
          <SelectTrigger className="w-[180px] shrink-0">
            <SelectValue placeholder="Select project">
              {selectedProject && (
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: selectedProject.color }}
                  />
                  <span className="truncate">{selectedProject.name}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: project.color }}
                  />
                  <span>{project.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Task Selector */}
        <Select
          value={timer.taskId || ''}
          onValueChange={(val) => setTaskId(val || null)}
          disabled={!timer.projectId}
        >
          <SelectTrigger className="w-[160px] shrink-0">
            <SelectValue placeholder="Select task" />
          </SelectTrigger>
          <SelectContent>
            {availableTasks.map((task) => (
              <SelectItem key={task.id} value={task.id}>
                {task.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Billable Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleBillable}
          className={cn(
            'shrink-0',
            timer.billable
              ? 'text-primary hover:text-primary'
              : 'text-muted-foreground hover:text-muted-foreground'
          )}
          title={timer.billable ? 'Billable' : 'Non-billable'}
        >
          <DollarSign className="h-4 w-4" />
        </Button>

        {/* Timer Display */}
        <div className="font-mono text-xl font-semibold tabular-nums w-24 text-right shrink-0">
          {timer.isRunning
            ? formatDuration(timer.elapsedSeconds)
            : lastEntry
              ? formatDurationShort(lastEntry.duration_sec)
              : '00:00:00'}
        </div>

        {/* Start/Stop Button */}
        <Button
          onClick={timer.isRunning ? stopTimer : startTimer}
          variant={timer.isRunning ? 'destructive' : 'default'}
          size="icon"
          className={cn(
            'shrink-0 h-10 w-10 rounded-full',
            !timer.isRunning && 'bg-status-verde hover:bg-status-verde/90 text-white'
          )}
        >
          {timer.isRunning ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current ml-0.5" />
          )}
        </Button>
      </div>
    </div>
  )
}
