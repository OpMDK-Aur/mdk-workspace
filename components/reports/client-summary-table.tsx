'use client'

import { useState } from 'react'
import { mockClientSummaries, mockProjectSummaries, getProjectsByClientId } from '@/lib/time-tracking/mock-data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ClientSummaryTable() {
  const [expandedClients, setExpandedClients] = useState<string[]>([])
  
  const totalHours = mockClientSummaries.reduce((acc, c) => acc + c.hours, 0)
  const totalBillable = mockClientSummaries.reduce((acc, c) => acc + c.billable_hours, 0)

  const toggleExpand = (clientId: string) => {
    setExpandedClients((prev) =>
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Client Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="text-right">Projects</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="w-32">% of Total</TableHead>
              <TableHead className="text-right">Billable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockClientSummaries.map((client) => {
              const isExpanded = expandedClients.includes(client.client_id)
              const clientProjects = getProjectsByClientId(client.client_id)
              const projectSummaries = mockProjectSummaries.filter((p) =>
                clientProjects.some((cp) => cp.id === p.project_id)
              )

              return (
                <>
                  <TableRow 
                    key={client.client_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpand(client.client_id)}
                  >
                    <TableCell className="p-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                          style={{ backgroundColor: client.client_color }}
                        >
                          {client.client_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <span className="font-medium">{client.client_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {client.projects_count}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {client.hours.toFixed(1)}h
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={client.percentage} className="h-2" />
                        <span className="text-xs text-muted-foreground w-10 text-right">
                          {client.percentage.toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {client.billable_hours.toFixed(1)}h
                    </TableCell>
                  </TableRow>
                  {isExpanded && projectSummaries.map((project) => (
                    <TableRow key={project.project_id} className="bg-muted/30">
                      <TableCell></TableCell>
                      <TableCell className="pl-10">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: project.project_color }}
                          />
                          <span className="text-sm">{project.project_name}</span>
                        </div>
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                        {project.hours.toFixed(1)}h
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={(project.hours / client.hours) * 100} 
                            className="h-1.5" 
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                        {project.billable_hours.toFixed(1)}h
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )
            })}
            <TableRow className="border-t-2">
              <TableCell></TableCell>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell></TableCell>
              <TableCell className="text-right font-mono font-semibold tabular-nums">
                {totalHours.toFixed(1)}h
              </TableCell>
              <TableCell>
                <Progress value={100} className="h-2" />
              </TableCell>
              <TableCell className="text-right font-mono font-semibold tabular-nums">
                {totalBillable.toFixed(1)}h
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
