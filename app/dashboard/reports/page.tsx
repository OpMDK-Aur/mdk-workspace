'use client'

import { useState } from 'react'
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns'
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
import { CalendarIcon, Download, Users } from 'lucide-react'
import { mockTeamMembers, mockProjectSummaries } from '@/lib/time-tracking/mock-data'
import { toast } from 'sonner'

export default function ReportsPage() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6),
    to: new Date(),
  })
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])

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
            {mockTeamMembers.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ClientDonutChart />
            <ClientSummaryTable />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
