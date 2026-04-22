'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  mockClients,
  mockTimeEntries,
  getClientById,
  getProjectsByClientId,
  getTasksByProjectId,
  getEntriesByClientId,
  formatDurationShort,
} from '@/lib/time-tracking/mock-data'
import { useTimer } from '@/lib/time-tracking/timer-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Clock, FolderOpen, DollarSign } from 'lucide-react'
import { EntriesList } from '@/components/time-entries/entries-list'

export default function ClientDetailPage() {
  const params = useParams()
  const clientId = params.id as string
  const { entries } = useTimer()
  
  const client = getClientById(clientId)
  
  const clientData = useMemo(() => {
    if (!client) return null
    
    const projects = getProjectsByClientId(clientId)
    // Combine mock entries with any new entries from context
    const allEntries = [...mockTimeEntries, ...entries.filter(e => !mockTimeEntries.some(m => m.id === e.id))]
    const clientEntries = getEntriesByClientId(allEntries, clientId)
    
    const totalSec = clientEntries.reduce((acc, e) => acc + (e.duration_sec || 0), 0)
    const billableSec = clientEntries
      .filter((e) => e.billable)
      .reduce((acc, e) => acc + (e.duration_sec || 0), 0)
    
    const projectsWithTasks = projects.map((project) => {
      const tasks = getTasksByProjectId(project.id)
      const projectEntries = clientEntries.filter((e) => e.project_id === project.id)
      const projectSec = projectEntries.reduce((acc, e) => acc + (e.duration_sec || 0), 0)
      
      const tasksWithHours = tasks.map((task) => {
        const taskEntries = projectEntries.filter((e) => e.task_id === task.id)
        const trackedSec = taskEntries.reduce((acc, e) => acc + (e.duration_sec || 0), 0)
        const trackedHours = trackedSec / 3600
        const progress = task.estimated_h ? (trackedHours / task.estimated_h) * 100 : 0
        
        return {
          ...task,
          trackedHours,
          progress: Math.min(progress, 100),
        }
      })
      
      return {
        ...project,
        tasks: tasksWithHours,
        totalHours: projectSec / 3600,
      }
    })
    
    return {
      client,
      projects: projectsWithTasks,
      totalHours: totalSec / 3600,
      billableHours: billableSec / 3600,
      entries: clientEntries,
    }
  }, [client, clientId, entries])
  
  if (!client || !clientData) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-foreground">Client not found</h2>
          <p className="text-muted-foreground mt-2">The client you are looking for does not exist.</p>
          <Link href="/dashboard/time/clients">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Clients
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link 
          href="/dashboard/time/clients" 
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Clients
        </Link>
        
        <div className="flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0"
            style={{ backgroundColor: client.color }}
          >
            {client.logo_initials}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
            <p className="text-muted-foreground">
              {clientData.totalHours.toFixed(1)}h total tracked
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Hours</div>
                <div className="text-2xl font-bold text-foreground">
                  {clientData.totalHours.toFixed(1)}h
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Billable Hours</div>
                <div className="text-2xl font-bold text-foreground">
                  {clientData.billableHours.toFixed(1)}h
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FolderOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Projects</div>
                <div className="text-2xl font-bold text-foreground">
                  {clientData.projects.length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects List */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Projects</h2>
        <div className="space-y-4">
          {clientData.projects.map((project) => (
            <Card key={project.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <CardTitle className="text-base font-medium">
                      {project.name}
                    </CardTitle>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {project.totalHours.toFixed(1)}h tracked
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {project.tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-foreground truncate">
                            {task.name}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {task.trackedHours.toFixed(1)}h / {task.estimated_h || 0}h
                          </span>
                        </div>
                        <Progress value={task.progress} className="h-1.5" />
                      </div>
                    </div>
                  ))}
                  {project.tasks.length === 0 && (
                    <p className="text-sm text-muted-foreground">No tasks for this project</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Time Entries */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Recent Time Entries</h2>
        <Card>
          <CardContent className="pt-6">
            <ClientEntriesList entries={clientData.entries} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Simplified entries list for client detail page
import type { TimeEntry } from '@/lib/time-tracking/types'
import { getProjectById, formatTimeRange, getDayLabel, calculateDayTotal } from '@/lib/time-tracking/mock-data'

function ClientEntriesList({ entries }: { entries: TimeEntry[] }) {
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, TimeEntry[]>()
    
    const sorted = [...entries].sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    )

    sorted.forEach((entry) => {
      const dateKey = new Date(entry.started_at).toDateString()
      const existing = groups.get(dateKey) || []
      groups.set(dateKey, [...existing, entry])
    })

    const result: { date: string; label: string; total: number; entries: TimeEntry[] }[] = []
    groups.forEach((groupEntries, dateKey) => {
      result.push({
        date: dateKey,
        label: getDayLabel(dateKey),
        total: calculateDayTotal(groupEntries),
        entries: groupEntries,
      })
    })

    return result.slice(0, 5) // Show only last 5 days
  }, [entries])

  if (entries.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        No time entries for this client yet
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {groupedEntries.map((group) => (
        <div key={group.date}>
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-border">
            <span className="text-sm font-medium text-foreground">{group.label}</span>
            <span className="text-xs text-muted-foreground">{formatDurationShort(group.total)}</span>
          </div>
          <div className="space-y-1.5">
            {group.entries.map((entry) => {
              const project = entry.project_id ? getProjectById(entry.project_id) : null
              return (
                <div key={entry.id} className="flex items-center gap-3 py-1.5">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: project?.color || '#9ca3af' }}
                  />
                  <span className="text-sm text-foreground flex-1 truncate">
                    {entry.description}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatTimeRange(entry.started_at, entry.ended_at)}
                  </span>
                  <span className="text-xs font-mono text-foreground shrink-0">
                    {formatDurationShort(entry.duration_sec)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
