'use client'

import { useState, useMemo, useEffect } from 'react'
import useSWR from 'swr'
import { startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay, format } from 'date-fns'
import { HoursChart } from '@/components/reports/hours-chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const MONTHS = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
]

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface TimeEntry {
  id: string
  cliente_id: string | null
  descripcion: string | null
  iniciado_en: string
  finalizado_en: string | null
  duracion_seg: number | null
  facturable: boolean
  colaborador_id: string | null
}

interface ClientMap {
  [key: string]: string
}

// Fetcher for SWR - gets current user's entries only
async function fetchMyHoursData() {
  const supabase = createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No user found')
  
  // Get colaborador id from email
  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('id')
    .eq('email', user.email)
    .single()
  
  if (!colaborador) throw new Error('No colaborador found')
  
  // Fetch only this user's entries
  const [entriesRes, clientsRes] = await Promise.all([
    supabase
      .from('entradas_de_tiempo')
      .select('*')
      .eq('colaborador_id', colaborador.id)
      .order('iniciado_en', { ascending: false }),
    supabase.from('clientes').select('id, nombre_del_negocio, business_name'),
  ])

  // Create client name map
  const clientMap: ClientMap = {}
  clientsRes.data?.forEach(c => {
    clientMap[c.id] = c.nombre_del_negocio || c.business_name || 'Sin nombre'
  })

  return {
    entries: (entriesRes.data || []) as TimeEntry[],
    clientMap,
    colaboradorId: colaborador.id,
  }
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

export default function MisHorasPage() {
  const currentDate = new Date()
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())

  // Fetch data with SWR
  const { data, isLoading } = useSWR('my-hours-data', fetchMyHoursData)

  const allEntries = data?.entries || []
  const clientMap = data?.clientMap || {}

  // Filter entries by month/year
  const filteredEntries = useMemo(() => {
    const monthStart = startOfMonth(new Date(selectedYear, selectedMonth - 1))
    const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth - 1))
    
    return allEntries.filter((entry) => {
      const entryDate = new Date(entry.iniciado_en)
      return isWithinInterval(entryDate, {
        start: monthStart,
        end: monthEnd,
      })
    })
  }, [allEntries, selectedMonth, selectedYear])

  // Calculate totals
  const totalHours = filteredEntries.reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
  const billableHours = filteredEntries.filter((e) => e.facturable).reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
  const billablePercentage = totalHours > 0 ? (billableHours / totalHours) * 100 : 0

  // Calculate daily hours for the chart
  const dailyHours = useMemo(() => {
    const monthStart = startOfMonth(new Date(selectedYear, selectedMonth - 1))
    const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth - 1))
    
    const days: { date: string, hours: number, billableHours: number }[] = []
    const currentDate = new Date(monthStart)
    
    while (currentDate <= monthEnd) {
      const dayStart = startOfDay(currentDate)
      const dayEnd = endOfDay(currentDate)
      
      const dayEntries = filteredEntries.filter((entry) => {
        const entryDate = new Date(entry.iniciado_en)
        return isWithinInterval(entryDate, { start: dayStart, end: dayEnd })
      })
      
      const hours = dayEntries.reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
      const billable = dayEntries.filter((e) => e.facturable).reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
      
      days.push({
        date: format(currentDate, 'd'),
        hours: Math.round(hours * 10) / 10,
        billableHours: Math.round(billable * 10) / 10,
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return days
  }, [selectedMonth, selectedYear, filteredEntries])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Mis horas</h1>
          <p className="text-muted-foreground mt-1">
            Visualiza tus entradas de tiempo
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Month Selector */}
        <Select
          value={selectedMonth.toString()}
          onValueChange={(val) => setSelectedMonth(parseInt(val))}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((month) => (
              <SelectItem key={month.value} value={month.value.toString()}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Year Selector */}
        <Select
          value={selectedYear.toString()}
          onValueChange={(val) => setSelectedYear(parseInt(val))}
        >
          <SelectTrigger className="w-[100px]">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total de horas</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {totalHours.toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Horas facturables</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {billableHours.toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">% Facturable</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {billablePercentage.toFixed(0)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Hours Chart */}
          <div className="mb-6">
            <HoursChart data={dailyHours} />
          </div>

          {/* Entries Table */}
          <Card>
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold">Entradas del mes</h2>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Descripcion</TableHead>
                    <TableHead className="text-right">Duracion</TableHead>
                    <TableHead className="text-center">Facturable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No hay entradas para este periodo
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(entry.iniciado_en), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell>
                          {entry.cliente_id ? clientMap[entry.cliente_id] || 'Sin cliente' : 'Sin cliente'}
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate">
                          {entry.descripcion || '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatDuration(entry.duracion_seg)}
                        </TableCell>
                        <TableCell className="text-center">
                          {entry.facturable ? (
                            <span className="text-status-verde">Si</span>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
