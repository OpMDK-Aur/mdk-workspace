'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { format, subDays } from 'date-fns'
import { DateRange } from 'react-day-picker'
import { HoursChart } from '@/components/reports/hours-chart'
import { ProjectSummaryTable } from '@/components/reports/project-summary-table'
import { ClientDonutChart } from '@/components/reports/client-donut-chart'
import { ClientSummaryTable } from '@/components/reports/client-summary-table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CalendarIcon, Download, Users, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Client, Project, ClientSummary, ProjectSummary, User } from '@/lib/time-tracking/types'
import { mockProjectSummaries } from '@/lib/time-tracking/mock-data'
import { toast } from 'sonner'

// Fetcher for SWR
async function fetchReportsData() {
  const supabase = createClient()
  
  const [clientsRes, projectsRes, usersRes] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('projects').select('*'),
    supabase.from('users').select('*').order('full_name'),
  ])

  return {
    clients: (clientsRes.data || []) as Client[],
    projects: (projectsRes.data || []) as Project[],
    users: (usersRes.data || []) as User[],
  }
}

export default function ReportsPage() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6),
    to: new Date(),
  })
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])

  // Fetch data with SWR
  const { data, isLoading } = useSWR('reports-data', fetchReportsData)

  const clients = data?.clients || []
  const projects = data?.projects || []
  const users = data?.users || []

  // Calculate client summaries from real data
  const clientSummaries: ClientSummary[] = useMemo(() => {
    const totalHoursAll = clients.reduce((acc, c) => acc + (c.total_hours || 0), 0)
    
    return clients.map((client) => {
      const clientProjects = projects.filter((p) => p.client_id === client.id)
      return {
        client_id: client.id,
        client_name: client.name,
        client_color: client.color,
        projects_count: clientProjects.length,
        hours: client.total_hours || 0,
        percentage: totalHoursAll > 0 ? ((client.total_hours || 0) / totalHoursAll) * 100 : 0,
        billable_hours: client.total_hours || 0, // Assuming all client hours are billable
      }
    })
  }, [clients, projects])

  // Create client -> project mapping
  const clientProjectMap: Record<string, string[]> = useMemo(() => {
    const map: Record<string, string[]> = {}
    projects.forEach((project) => {
      if (project.client_id) {
        if (!map[project.client_id]) {
          map[project.client_id] = []
        }
        map[project.client_id].push(project.id)
      }
    })
    return map
  }, [projects])

  // Project summaries (still using mock data for now, can be extended)
  const projectSummaries = mockProjectSummaries

  const totalHours = mockProjectSummaries.reduce((acc, p) => acc + p.hours, 0)
  const billableHours = mockProjectSummaries.reduce((acc, p) => acc + p.billable_hours, 0)
  const billablePercentage = totalHours > 0 ? (billableHours / totalHours) * 100 : 0

  const handleExport = () => {
    toast.success('Export started', {
      description: 'Your report will be downloaded shortly.',
    })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Analyze your time tracking data
          </p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Date Range Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'justify-start text-left font-normal w-[280px]',
                !date && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, 'LLL dd, y')} - {format(date.to, 'LLL dd, y')}
                  </>
                ) : (
                  format(date.from, 'LLL dd, y')
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={setDate}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        {/* Team Member Filter */}
        <Select
          value={selectedMembers.length > 0 ? selectedMembers[0] : 'all'}
          onValueChange={(val) => setSelectedMembers(val === 'all' ? [] : [val])}
        >
          <SelectTrigger className="w-[200px]">
            <Users className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All team members" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All team members</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Hours</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {totalHours.toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Billable Hours</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {billableHours.toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Billable %</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {billablePercentage.toFixed(0)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Tables with Tabs */}
      <Tabs defaultValue="by-project" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="by-project">By Project</TabsTrigger>
          <TabsTrigger value="by-client">By Client</TabsTrigger>
        </TabsList>
        
        <TabsContent value="by-project">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HoursChart />
            <ProjectSummaryTable />
          </div>
        </TabsContent>
        
        <TabsContent value="by-client">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ClientDonutChart clientSummaries={clientSummaries} />
              <ClientSummaryTable 
                clientSummaries={clientSummaries}
                projectSummaries={projectSummaries}
                clientProjectMap={clientProjectMap}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
