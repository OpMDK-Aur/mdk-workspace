'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Save, Plus, Trash2, RefreshCw, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Colaborador {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
}

interface MetricaColaborador {
  id: string
  colaborador_id: string
  colaborador?: Colaborador
  fee_administrado: number
  horas_teoricas_cliente: string // interval as string
  minimo_no_negociable_horas: string
  horas_objetivo: string
  acumulado_mes_asignado: string
  porcentaje_asignacion: number
  mes: number
  anio: number
}

// Parse interval string (HH:MM:SS or PostgreSQL interval format) to display format
function parseInterval(interval: string | null): string {
  if (!interval) return '0:00:00'
  // Handle PostgreSQL interval format like "15:00:00" or "1 day 02:00:00"
  const match = interval.match(/(\d+):(\d+):(\d+)/)
  if (match) {
    return `${parseInt(match[1])}:${match[2]}:${match[3]}`
  }
  return '0:00:00'
}

// Format interval for display
function formatHours(interval: string | null): string {
  const parsed = parseInterval(interval)
  const [h, m, s] = parsed.split(':').map(Number)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Parse hours input to interval format
function hoursToInterval(input: string): string {
  // Accept formats like "15:00", "15:00:00", "15"
  const parts = input.split(':').map(p => parseInt(p) || 0)
  const hours = parts[0] || 0
  const minutes = parts[1] || 0
  const seconds = parts[2] || 0
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Get color class based on percentage
function getPercentageColor(value: number, threshold: number): string {
  if (value >= threshold) return 'bg-green-500/20 text-green-400'
  if (value >= threshold * 0.7) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

// Get color for hours comparison
function getHoursColor(actual: string, target: string): string {
  const actualParts = parseInterval(actual).split(':').map(Number)
  const targetParts = parseInterval(target).split(':').map(Number)
  const actualMinutes = actualParts[0] * 60 + actualParts[1]
  const targetMinutes = targetParts[0] * 60 + targetParts[1]
  
  if (actualMinutes >= targetMinutes) return 'bg-green-500/20 text-green-400'
  if (actualMinutes >= targetMinutes * 0.7) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

export default function ColaboradoresPage() {
  const [metricas, setMetricas] = useState<MetricaColaborador[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [editedRows, setEditedRows] = useState<Set<string>>(new Set())

  const supabase = createClient()

  // Check access
  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setHasAccess(false)
        return
      }

      const { data: colab } = await supabase
        .from('colaboradores')
        .select('email')
        .eq('id', user.id)
        .single()

      const allowedEmails = ['operaciones@madketing.io', 'direccion@madketing.io']
      setHasAccess(colab?.email ? allowedEmails.includes(colab.email) : false)
    }
    checkAccess()
  }, [supabase])

  // Load data
  useEffect(() => {
    if (hasAccess !== true) return

    async function loadData() {
      setIsLoading(true)

      // Load colaboradores
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id, nombre, apellido, email')
        .eq('activo', true)
        .order('nombre')

      if (colabs) setColaboradores(colabs)

      // Load metricas for selected period
      const { data: mets } = await supabase
        .from('metricas_colaboradores')
        .select(`
          *,
          colaborador:colaborador_id(id, nombre, apellido, email)
        `)
        .eq('mes', selectedMonth)
        .eq('anio', selectedYear)
        .order('created_at')

      if (mets) {
        setMetricas(mets.map(m => ({
          ...m,
          colaborador: m.colaborador as Colaborador
        })))
      }

      setIsLoading(false)
    }
    loadData()
  }, [hasAccess, selectedMonth, selectedYear, supabase])

  const handleAddRow = async () => {
    // Find a colaborador not already in the list
    const existingIds = metricas.map(m => m.colaborador_id)
    const availableColab = colaboradores.find(c => !existingIds.includes(c.id))

    if (!availableColab) {
      toast.error('Todos los colaboradores ya tienen métricas para este período')
      return
    }

    const newMetrica: MetricaColaborador = {
      id: crypto.randomUUID(),
      colaborador_id: availableColab.id,
      colaborador: availableColab,
      fee_administrado: 0,
      horas_teoricas_cliente: '0:00:00',
      minimo_no_negociable_horas: '0:00:00',
      horas_objetivo: '0:00:00',
      acumulado_mes_asignado: '0:00:00',
      porcentaje_asignacion: 0,
      mes: selectedMonth,
      anio: selectedYear,
    }

    setMetricas([...metricas, newMetrica])
    setEditedRows(new Set([...editedRows, newMetrica.id]))
  }

  const handleUpdateField = (id: string, field: keyof MetricaColaborador, value: unknown) => {
    setMetricas(metricas.map(m => {
      if (m.id === id) {
        const updated = { ...m, [field]: value }
        
        // Auto-calculate percentage if relevant fields change
        if (['acumulado_mes_asignado', 'horas_objetivo'].includes(field)) {
          const acumParts = parseInterval(updated.acumulado_mes_asignado).split(':').map(Number)
          const objParts = parseInterval(updated.horas_objetivo).split(':').map(Number)
          const acumMinutes = acumParts[0] * 60 + acumParts[1]
          const objMinutes = objParts[0] * 60 + objParts[1]
          updated.porcentaje_asignacion = objMinutes > 0 ? Math.round((acumMinutes / objMinutes) * 10000) / 100 : 0
        }
        
        return updated
      }
      return m
    }))
    setEditedRows(new Set([...editedRows, id]))
  }

  const handleChangeColaborador = (metricaId: string, colaboradorId: string) => {
    const colab = colaboradores.find(c => c.id === colaboradorId)
    if (colab) {
      setMetricas(metricas.map(m => 
        m.id === metricaId 
          ? { ...m, colaborador_id: colaboradorId, colaborador: colab }
          : m
      ))
      setEditedRows(new Set([...editedRows, metricaId]))
    }
  }

  const handleDeleteRow = async (id: string) => {
    const metrica = metricas.find(m => m.id === id)
    if (!metrica) return

    // Check if it exists in DB (not a new row)
    const { data } = await supabase
      .from('metricas_colaboradores')
      .select('id')
      .eq('id', id)
      .single()

    if (data) {
      const { error } = await supabase
        .from('metricas_colaboradores')
        .delete()
        .eq('id', id)

      if (error) {
        toast.error('Error al eliminar')
        return
      }
    }

    setMetricas(metricas.filter(m => m.id !== id))
    const newEdited = new Set(editedRows)
    newEdited.delete(id)
    setEditedRows(newEdited)
    toast.success('Fila eliminada')
  }

  const handleSave = async () => {
    setIsSaving(true)

    try {
      for (const id of editedRows) {
        const metrica = metricas.find(m => m.id === id)
        if (!metrica) continue

        const payload = {
          id: metrica.id,
          colaborador_id: metrica.colaborador_id,
          fee_administrado: metrica.fee_administrado,
          horas_teoricas_cliente: hoursToInterval(metrica.horas_teoricas_cliente),
          minimo_no_negociable_horas: hoursToInterval(metrica.minimo_no_negociable_horas),
          horas_objetivo: hoursToInterval(metrica.horas_objetivo),
          acumulado_mes_asignado: hoursToInterval(metrica.acumulado_mes_asignado),
          porcentaje_asignacion: metrica.porcentaje_asignacion,
          mes: selectedMonth,
          anio: selectedYear,
        }

        const { error } = await supabase
          .from('metricas_colaboradores')
          .upsert(payload, { onConflict: 'colaborador_id,mes,anio' })

        if (error) {
          console.error('Error saving:', error)
          toast.error(`Error al guardar: ${error.message}`)
          setIsSaving(false)
          return
        }
      }

      setEditedRows(new Set())
      toast.success('Cambios guardados')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al guardar cambios')
    }

    setIsSaving(false)
  }

  if (hasAccess === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (hasAccess === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Acceso restringido</h1>
        <p className="text-muted-foreground">No tienes permisos para ver esta página.</p>
      </div>
    )
  }

  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Métricas de Colaboradores</h1>
          <p className="text-muted-foreground">Gestiona las métricas mensuales del equipo</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((month, i) => (
                <SelectItem key={i} value={String(i + 1)}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026].map(year => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Equipo</CardTitle>
              <CardDescription>
                {months[selectedMonth - 1]} {selectedYear}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleAddRow}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
              <Button 
                size="sm" 
                onClick={handleSave} 
                disabled={editedRows.size === 0 || isSaving}
              >
                <Save className="h-4 w-4 mr-1" />
                {isSaving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Equipo</TableHead>
                    <TableHead className="text-right">Fee administrado</TableHead>
                    <TableHead className="text-right">H teóricas por cliente</TableHead>
                    <TableHead className="text-right">Mínimo no negociable</TableHead>
                    <TableHead className="text-right">Horas Objetivo</TableHead>
                    <TableHead className="text-right">Acumulado del mes</TableHead>
                    <TableHead className="text-right">% de asignación</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metricas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No hay datos para este período. Haz clic en &quot;Agregar&quot; para comenzar.
                      </TableCell>
                    </TableRow>
                  ) : (
                    metricas.map((m) => (
                      <TableRow key={m.id} className={editedRows.has(m.id) ? 'bg-primary/5' : ''}>
                        <TableCell>
                          <Select 
                            value={m.colaborador_id} 
                            onValueChange={(v) => handleChangeColaborador(m.id, v)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                {m.colaborador ? `${m.colaborador.nombre} ${m.colaborador.apellido || ''}`.trim() : 'Seleccionar'}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {colaboradores.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.nombre} {c.apellido || ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={m.fee_administrado}
                            onChange={(e) => handleUpdateField(m.id, 'fee_administrado', parseFloat(e.target.value) || 0)}
                            className="text-right w-[140px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={formatHours(m.horas_teoricas_cliente)}
                            onChange={(e) => handleUpdateField(m.id, 'horas_teoricas_cliente', e.target.value)}
                            className="text-right w-[100px]"
                            placeholder="0:00:00"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={formatHours(m.minimo_no_negociable_horas)}
                            onChange={(e) => handleUpdateField(m.id, 'minimo_no_negociable_horas', e.target.value)}
                            className={cn(
                              "text-right w-[100px]",
                              getHoursColor(m.acumulado_mes_asignado, m.minimo_no_negociable_horas)
                            )}
                            placeholder="0:00:00"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={formatHours(m.horas_objetivo)}
                            onChange={(e) => handleUpdateField(m.id, 'horas_objetivo', e.target.value)}
                            className="text-right w-[100px]"
                            placeholder="0:00:00"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={formatHours(m.acumulado_mes_asignado)}
                            onChange={(e) => handleUpdateField(m.id, 'acumulado_mes_asignado', e.target.value)}
                            className={cn(
                              "text-right w-[100px]",
                              getHoursColor(m.acumulado_mes_asignado, m.horas_objetivo)
                            )}
                            placeholder="0:00:00"
                          />
                        </TableCell>
                        <TableCell>
                          <div className={cn(
                            "text-right px-2 py-1 rounded text-sm font-medium",
                            getPercentageColor(m.porcentaje_asignacion, 100)
                          )}>
                            {m.porcentaje_asignacion.toFixed(2)}%
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteRow(m.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
