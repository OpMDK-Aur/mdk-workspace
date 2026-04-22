'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { 
  mockClients, 
  mockProjects, 
  mockTimeEntries,
  getProjectsByClientId,
  getTasksByClientId,
  getEntriesByClientId 
} from '@/lib/time-tracking/mock-data'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Building2, FolderOpen, Clock } from 'lucide-react'

function getWeekStart() {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
  return new Date(now.setDate(diff))
}

function getMonthStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export default function TimeClientsPage() {
  const clientStats = useMemo(() => {
    const weekStart = getWeekStart()
    const monthStart = getMonthStart()
    
    return mockClients.map((client) => {
      const projects = getProjectsByClientId(client.id)
      const tasks = getTasksByClientId(client.id)
      const entries = getEntriesByClientId(mockTimeEntries, client.id)
      
      // Calculate hours
      const totalSec = entries.reduce((acc, e) => acc + (e.duration_sec || 0), 0)
      const weeklyEntries = entries.filter((e) => new Date(e.started_at) >= weekStart)
      const weeklySec = weeklyEntries.reduce((acc, e) => acc + (e.duration_sec || 0), 0)
      const monthlyEntries = entries.filter((e) => new Date(e.started_at) >= monthStart)
      const monthlySec = monthlyEntries.reduce((acc, e) => acc + (e.duration_sec || 0), 0)
      
      // Calculate estimated hours
      const estimatedHours = tasks.reduce((acc, t) => acc + (t.estimated_h || 0), 0)
      const actualHours = totalSec / 3600
      const progress = estimatedHours > 0 ? (actualHours / estimatedHours) * 100 : 0
      
      return {
        client,
        projectCount: projects.length,
        weeklyHours: weeklySec / 3600,
        monthlyHours: monthlySec / 3600,
        estimatedHours,
        actualHours,
        progress: Math.min(progress, 100),
      }
    })
  }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track time across your clients
          </p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Clients</div>
                <div className="text-2xl font-bold text-foreground">{mockClients.length}</div>
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
                <div className="text-sm text-muted-foreground">Active Projects</div>
                <div className="text-2xl font-bold text-foreground">{mockProjects.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">This Week</div>
                <div className="text-2xl font-bold text-foreground">
                  {clientStats.reduce((acc, c) => acc + c.weeklyHours, 0).toFixed(1)}h
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clientStats.map(({ client, projectCount, weeklyHours, monthlyHours, estimatedHours, actualHours, progress }) => (
          <Link key={client.id} href={`/dashboard/time/clients/${client.id}`}>
            <Card className="hover:border-primary/30 transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                {/* Client Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ backgroundColor: client.color }}
                  >
                    {client.logo_initials}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{client.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {projectCount} active project{projectCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Hours Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-muted-foreground">This Week</div>
                    <div className="text-lg font-semibold text-foreground">{weeklyHours.toFixed(1)}h</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">This Month</div>
                    <div className="text-lg font-semibold text-foreground">{monthlyHours.toFixed(1)}h</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Estimated vs Actual</span>
                    <span>{actualHours.toFixed(1)}h / {estimatedHours}h</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
