'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ServiceMapReport } from '@/components/reports/service-map-report'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ClientPlan, UnidadNegocio } from '@/lib/types'

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

// Check if user is Master
async function checkMasterAccess() {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No user found')
  
  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('id, rol_id, roles(nombre)')
    .eq('email', user.email)
    .single()
  
  const roleName = (colaborador?.roles as { nombre: string } | null)?.nombre || ''
  console.log('[v0] Mapa Servicio - User role:', roleName, 'Email:', user.email)
  
  // Allow Master role (check case-insensitive)
  if (roleName.toLowerCase() !== 'master') {
    throw new Error('Unauthorized')
  }
  
  return { authorized: true }
}

export default function MapaServicioPage() {
  const router = useRouter()
  const currentDate = new Date()
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [planFilter, setPlanFilter] = useState<ClientPlan | 'all'>('all')
  const [unidadFilter, setUnidadFilter] = useState<UnidadNegocio | 'all'>('all')

  // Check access
  const { data, error, isLoading } = useSWR('mapa-servicio-access', checkMasterAccess)

  // Redirect if unauthorized
  useEffect(() => {
    if (error?.message === 'Unauthorized') {
      router.push('/dashboard')
    }
  }, [error, router])

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && error.message !== 'Unauthorized') {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-destructive">Error: {error.message}</div>
      </div>
    )
  }

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
      </div>

      {/* Service Map Report Component */}
      <ServiceMapReport month={selectedMonth} year={selectedYear} />
    </div>
  )
}
