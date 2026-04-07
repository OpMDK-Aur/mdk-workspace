'use client'

import { useMemo, useState } from 'react'
import type { ConversionResult } from '@/app/api/google-ads/conversions/route'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react'

interface ConversionsTableProps {
  data: ConversionResult[]
}

type SortDir = 'asc' | 'desc' | null

export function ConversionsTable({ data }: ConversionsTableProps) {
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return data.filter(r => !q || r.conversionName.toLowerCase().includes(q))
  }, [data, search])

  const sorted = useMemo(() => {
    if (!sortDir) return filtered
    return [...filtered].sort((a, b) =>
      sortDir === 'desc' ? b.conversions - a.conversions : a.conversions - b.conversions
    )
  }, [filtered, sortDir])

  const cycleSort = () => {
    setSortDir(prev => (prev === 'desc' ? 'asc' : prev === 'asc' ? null : 'desc'))
  }

  const SortIcon = sortDir === 'desc' ? ArrowDown : sortDir === 'asc' ? ArrowUp : ArrowUpDown

  // Extract resource ID from resource name string
  function resourceId(action: string): string {
    const parts = action.split('/')
    return parts[parts.length - 1] ?? action
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre de conversion..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Sin resultados</p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? `No se encontraron conversiones para "${search}"` : 'No hay datos de conversiones para los ultimos 30 dias'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[45%]">Nombre de conversion</TableHead>
                <TableHead className="w-[35%]">ID de conversion</TableHead>
                <TableHead className="w-[20%]">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cycleSort}
                    className="h-auto p-0 font-semibold text-xs hover:bg-transparent gap-1.5"
                  >
                    Conversiones
                    <SortIcon className="h-3.5 w-3.5" />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row, i) => (
                <TableRow key={`${row.conversionAction}-${i}`} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-sm py-3">
                    {row.conversionName}
                  </TableCell>
                  <TableCell className="py-3">
                    {row.conversionAction ? (
                      <Badge variant="secondary" className="text-xs font-mono">
                        {resourceId(row.conversionAction)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 tabular-nums font-semibold text-sm">
                    {row.conversions % 1 === 0
                      ? row.conversions.toLocaleString('es-AR')
                      : row.conversions.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
