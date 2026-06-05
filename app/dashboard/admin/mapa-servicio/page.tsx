'use client'

import { useState, useEffect } from 'react'
import { ServiceMapReport } from '@/components/reports/service-map-report'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import type { ClientPlan, UnidadNegocio } from '@/lib/types'
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

export default function MapaServicioPage() {
  const currentDate = new Date()
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [planFilter, setPlanFilter] = useState<ClientPlan | 'all'>('all')
  const [unidadFilter, setUnidadFilter] = useState<UnidadNegocio | 'all'>('all')
  const [pmFilter, setPmFilter] = useState<string | 'all'>('all')
  const [amFilter, setAmFilter] = useState<string | 'all'>('all')
  const [clienteFilter, setClienteFilter] = useState<string | 'all'>('all')
  const [projectManagers, setProjectManagers] = useState<Array<{ id: string; full_name: string | null; email: string; role: string }>>([])
  const [accountManagers, setAccountManagers] = useState<Array<{ id: string; full_name: string | null; email: string; role: string }>>([])
  const [clientes, setClientes] = useState<Array<{ id: string; nombre_del_negocio: string }>>([])

  // Cargar usuarios y clientes
  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      
      // Cargar Project Managers (puesto = 'Project Manager' o 'Director/a' o 'CEO')
      const { data: pmData } = await supabase
        .from('profiles')
        .select('id, full_name, email, puesto')
        .in('puesto', ['Project Manager', 'Director/a', 'CEO'])
        .order('full_name', { ascending: true })
      
      if (pmData) {
        setProjectManagers(pmData)
      }
      
      // Cargar Account Managers (puesto = 'Account Manager' o 'Director/a' o 'CEO')
      const { data: amData } = await supabase
        .from('profiles')
        .select('id, full_name, email, puesto')
        .in('puesto', ['Account Manager', 'Director/a', 'CEO'])
        .order('full_name', { ascending: true })
      
      if (amData) {
        setAccountManagers(amData)
      }
      
      // Cargar clientes
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('id, nombre_del_negocio')
        .order('nombre_del_negocio', { ascending: true })
      
      if (clientesData) {
        setClientes(clientesData)
      }
    }
    loadData()
  }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Mapa de servicio</h1>
          <p className="text-muted-foreground mt-1">
            Seguimiento de hitos y progreso de clientes
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

        {/* Plan Filter */}
        <Select value={planFilter} onValueChange={(v) => setPlanFilter(v as ClientPlan | 'all')}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los planes</SelectItem>
            <SelectItem value="Esencial">Esencial</SelectItem>
            <SelectItem value="Estrategico">Estrategico</SelectItem>
          </SelectContent>
        </Select>

        {/* Unidad Filter */}
        <Select value={unidadFilter} onValueChange={(v) => setUnidadFilter(v as UnidadNegocio | 'all')}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Unidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las unidades</SelectItem>
            <SelectItem value="MDK">MDK</SelectItem>
            <SelectItem value="Aurelia">Aurelia</SelectItem>
            <SelectItem value="Consultoria">Consultoria</SelectItem>
          </SelectContent>
        </Select>

        {/* Project Manager Filter */}
        <Select value={pmFilter} onValueChange={(v) => setPmFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Project Manager" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los PM</SelectItem>
            {projectManagers.map(pm => (
              <SelectItem key={pm.id} value={pm.id}>
                {pm.full_name || pm.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Account Manager Filter */}
        <Select value={amFilter} onValueChange={(v) => setAmFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Account Manager" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los AM</SelectItem>
            {accountManagers.map(am => (
              <SelectItem key={am.id} value={am.id}>
                {am.full_name || am.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Cliente Filter */}
        <Select value={clienteFilter} onValueChange={(v) => setClienteFilter(v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los clientes</SelectItem>
            {clientes.map(cliente => (
              <SelectItem key={cliente.id} value={cliente.id}>{cliente.nombre_del_negocio}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(pmFilter !== 'all' || amFilter !== 'all' || clienteFilter !== 'all') && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => {
              setPmFilter('all')
              setAmFilter('all')
              setClienteFilter('all')
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Service Map Report Component */}
      <ServiceMapReport 
        month={selectedMonth} 
        year={selectedYear}
        planFilter={planFilter}
        pmFilter={pmFilter}
        amFilter={amFilter}
        clienteFilter={clienteFilter}
      />
    </div>
  )
}
