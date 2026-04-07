'use client'

import type { Client } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClientsTableProps {
  clients: Client[]
}

function formatCurrency(value: number | null): string {
  if (!value) return '-'
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

// Simulated ROAS data
const clientRoasData: Record<string, number> = {
  'Mundos E': 3.4,
  'ADT': 4.8,
  'VN Global': 5.1,
  'Nobis': 4.0,
  'Pire Rayen': 3.8,
  'Biblos': 2.9,
  'Corralón Tronador': 4.2,
  'Del Sur Autos': 3.1,
}

function getStatusLabel(status: string | null) {
  switch (status) {
    case 'verde':
      return { label: 'Óptimo', className: 'bg-status-verde/10 text-status-verde border-status-verde/20' }
    case 'amarillo':
      return { label: 'Atención', className: 'bg-status-amarillo/10 text-status-amarillo border-status-amarillo/20' }
    case 'naranja':
      return { label: 'Alerta', className: 'bg-status-naranja/10 text-status-naranja border-status-naranja/20' }
    case 'rojo':
      return { label: 'Crítico', className: 'bg-status-rojo/10 text-status-rojo border-status-rojo/20' }
    default:
      return { label: '-', className: 'bg-muted text-muted-foreground' }
  }
}

export function ClientsTable({ clients }: ClientsTableProps) {
  const displayClients = clients
    .filter(c => c.fee_mdk && c.fee_mdk > 500000)
    .slice(0, 6)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Estado de clientes</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-primary gap-1">
            <Plus className="h-3 w-3" />
            Generar alertas
          </Button>
          <Button variant="ghost" size="sm">
            <Download className="h-4 w-4 mr-1" />
            Exportar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
              <TableHead className="text-right">Inversión</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayClients.map((client) => {
              const status = getStatusLabel(client.status)
              const roas = clientRoasData[client.business_name] || (3 + Math.random() * 2)
              
              return (
                <TableRow key={client.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">{client.business_name}</TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">{client.plan}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {roas.toFixed(1)}x
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(client.fee_mdk)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('font-medium', status.className)}>
                      {status.label}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
