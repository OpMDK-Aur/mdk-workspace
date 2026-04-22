import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Client, Project, Task, TimeEntry } from '@/lib/time-tracking/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Clock, DollarSign, FolderOpen } from 'lucide-react'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDurationShort(seconds: number | null): string {
  if (seconds === null || seconds === 0) return '0h 0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function formatTimeRange(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt)
  const startTime = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  
  if (!endedAt) return `${startTime} - running`
  
  const end = new Date(endedAt)
  const endTime = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${startTime} - ${endTime}`
}

function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }
  
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

interface ProjectWithRelations extends Project {
  tasks: Task[]
  time_entries: TimeEntry[]
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: clientId } = await params
  const supabase = await createClient()

  // Fetch client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (clientError || !client) {
    notFound()
  }

  const typedClient = client as Client

  // Fetch projects with tasks and time entries
  const { data: projectsData } = await supabase
    .from('projects')
    .select('*, tasks(*), time_entries(*)')
    .eq('client_id', clientId)

  const projects: ProjectWithRelations[] = (projectsData || []) as ProjectWithRelations[]

  // Calculate stats
  const allEntries = projects.flatMap((p) => p.time_entries || [])
  const totalSec = allEntries.reduce((acc, e) => acc + (e.duration_sec || 0), 0)
  const billableSec = allEntries
    .filter((e) => e.billable)
    .reduce((acc, e) => acc + (e.duration_sec || 0), 0)
  
  const totalHours = typedClient.total_hours || totalSec / 3600
  const billableHours = billableSec / 3600
  const estimatedCost = totalHours * (typedClient.hourly_rate || 0)

  // Process projects with task progress
  const projectsWithProgress = projects.map((project) => {
    const tasks = project.tasks || []
    const projectEntries = project.time_entries || []
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

  // Group entries by day for display
  const groupedEntries = groupEntriesByDay(allEntries).slice(0, 5)

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
            style={{ backgroundColor: typedClient.color }}
          >
            {typedClient.logo_initials}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{typedClient.name}</h1>
            <p className="text-muted-foreground">
              {totalHours.toFixed(1)}h total tracked
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
                  {totalHours.toFixed(1)}h
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
                <div className="text-sm text-muted-foreground">Hourly Rate</div>
                <div className="text-2xl font-bold text-foreground">
                  {formatCurrency(typedClient.hourly_rate || 0)}/hr
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
                <div className="text-sm text-muted-foreground">Total Cost</div>
                <div className="text-2xl font-bold text-foreground">
                  {formatCurrency(estimatedCost)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects List */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Projects</h2>
        {projectsWithProgress.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">No projects for this client yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {projectsWithProgress.map((project) => (
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
        )}
      </div>

      {/* Time Entries */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Recent Time Entries</h2>
        <Card>
          <CardContent className="pt-6">
            {allEntries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No time entries for this client yet
              </p>
            ) : (
              <div className="space-y-4">
                {groupedEntries.map((group) => (
                  <div key={group.date}>
                    <div className="flex items-center justify-between mb-2 pb-1 border-b border-border">
                      <span className="text-sm font-medium text-foreground">{group.label}</span>
                      <span className="text-xs text-muted-foreground">{formatDurationShort(group.total)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {group.entries.map((entry) => {
                        const project = projects.find((p) => p.id === entry.project_id)
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Helper function to group entries by day
function groupEntriesByDay(entries: TimeEntry[]) {
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
      total: groupEntries.reduce((acc, e) => acc + (e.duration_sec || 0), 0),
      entries: groupEntries,
    })
  })

  return result
}
