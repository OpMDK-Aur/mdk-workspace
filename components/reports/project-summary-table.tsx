'use client'

import { mockProjectSummaries } from '@/lib/time-tracking/mock-data'
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

export function ProjectSummaryTable() {
  const totalHours = mockProjectSummaries.reduce((acc, p) => acc + p.hours, 0)
  const totalBillable = mockProjectSummaries.reduce((acc, p) => acc + p.billable_hours, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Project Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="w-32">% of Total</TableHead>
              <TableHead className="text-right">Billable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockProjectSummaries.map((project) => (
              <TableRow key={project.project_id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: project.project_color }}
                    />
                    <span className="font-medium">{project.project_name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {project.hours.toFixed(1)}h
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={project.percentage} className="h-2" />
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {project.percentage.toFixed(0)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {project.billable_hours.toFixed(1)}h
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2">
              <TableCell className="font-semibold">Total</TableCell>
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
