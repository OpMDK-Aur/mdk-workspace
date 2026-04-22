'use client'

import type { ClientSummary } from '@/lib/time-tracking/types'
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

interface ClientSummaryTableProps {
  clientSummaries?: ClientSummary[]
}

export function ClientSummaryTable({ clientSummaries = [] }: ClientSummaryTableProps) {
  const totalHours = clientSummaries.reduce((acc, c) => acc + c.hours, 0)
  const totalBillable = clientSummaries.reduce((acc, c) => acc + c.billable_hours, 0)

  if (clientSummaries.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Client Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">No client data available</p>
        </CardContent>
      </Card>
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
              <TableHead>Client</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="w-32">% of Total</TableHead>
              <TableHead className="text-right">Billable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientSummaries.map((client) => (
              <TableRow key={client.client_id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                      style={{ backgroundColor: client.client_color }}
                    >
                      {client.client_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-medium">{client.client_name}</span>
                  </div>
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
