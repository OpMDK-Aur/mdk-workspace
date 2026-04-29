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
import { Save, Plus, Trash2, RefreshCw, AlertCircle, Calculator } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Colaborador {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
}

interface Cliente {
  id: string
  nombre_del_negocio: string
  fee_mdk: number | null
}

interface MetricaColaborador {
  id: string
  colaborador_id: string
  cliente_id: string
  colaborador?: Colaborador
  cliente?: Cliente
  fee_administrado: number
  valor_hora: number
  horas_teoricas_cliente: number
  minimo_no_negociable_horas: number
  horas_objetivo: number
  acumulado_mes_asignado: number
  porcentaje_asignacion: number
  mes: number
  anio: number
}

// Format hours as HH:MM
function formatHoursDisplay(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

// Get color class based on percentage
function getPercentageColor(value: number): string {
  if (value >= 100) return 'bg-green-500/20 text-green-400'
  if (value >= 70) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

// Get color for hours comparison
function getHoursColor(actual: number, target: number): string {
  if (target === 0) return ''
  const percentage = (actual / target) * 100
  if (percentage >= 100) return 'bg-green-500/20 text-green-400'
  if (percentage >= 70) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

export default function ColaboradoresPage() {
  const [metricas, setMetricas] = useState<MetricaColaborador[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [editedRows, setEditedRows] = useState<Set<string>>(new Set())
  const [filterColaborador, setFilterColaborador] = useState<string>('all')
  const [valorHoraGlobal, setValorHoraGlobal] = useState<number>(150000)

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

      // Load clientes with fee_mdk
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('id, nombre_del_negocio, fee_mdk')
        .order('nombre_del_negocio')

      if (clientesData) setClientes(clientesData)

      // Load metricas for selected period
      const { data: mets } = await supabase
        .from('metricas_colaboradores')
        .select(`
          *,
          colaborador:colaborador_id(id, nombre, apellido, email),
          cliente:cliente_id(id, nombre_del_negocio, fee_mdk)
        `)
        .eq('mes', selectedMonth)
        .eq('anio', selectedYear)
        .order('created_at')

      if (mets) {
        setMetricas(mets.map(m => ({
          ...m,
          colaborador: m.colaborador as Colaborador,
          cliente: m.cliente as Cliente,
          horas_teoricas_cliente: Number(m.horas_teoricas_cliente) || 0,
          minimo_no_negociable_horas: Number(m.minimo_no_negociable_horas) || 0,
          horas_objetivo: Number(m.horas_objetivo) || 0,
          acumulado_mes_asignado: Number(m.acumulado_mes_asignado) || 0,
          valor_hora: Number(m.valor_hora) || 150000,
        })))
      }

      setIsLoading(false)
    }
    loadData()
  }, [hasAccess, selectedMonth, selectedYear, supabase])

  // Calculate horas teoricas based on formula: ((fee_mdk * 7.5%) / valor_hora) / 24
  const calcularHorasTeoricas = (feeMdk: number, valorHora: number): number => {
    if (valorHora === 0) return 0
    return ((feeMdk * 0.075) / valorHora) / 24
  }

  const handleAddRow = () => {
    if (colaboradores.length === 0 || clientes.length === 0) {
      toast.error('No hay colaboradores o clientes disponibles')
      return
    }

    const cliente = clientes[0]
    const feeMdk = cliente.fee_mdk || 0
    const horasTeoricas = calcularHorasTeoricas(feeMdk, valorHoraGlobal)

    const newMetrica: MetricaColaborador = {
      id: crypto.randomUUID(),
      colaborador_id: colaboradores[0].id,
      cliente_id: cliente.id,
      colaborador: colaboradores[0],
      cliente: cliente,
      fee_administrado: feeMdk,
      valor_hora: valorHoraGlobal,
      horas_teoricas_cliente: horasTeoricas,
      minimo_no_negociable_horas: horasTeoricas / 2,
      horas_objetivo: horasTeoricas,
      acumulado_mes_asignado: 0,
      porcentaje_asignacion: 0,
      mes: selectedMonth,
      anio: selectedYear,
    }

    setMetricas([...metricas, newMetrica])
    setEditedRows(new Set([...editedRows, newMetrica.id]))
  }

  const handleUpdateField = (id: string, field: keyof MetricaColaborador, value: number) => {
    setMetricas(metricas.map(m => {
      if (m.id === id) {
        const updated = { ...m, [field]: value }
        
        // Recalculate derived fields
        if (field === 'horas_objetivo') {
          updated.minimo_no_negociable_horas = value / 2
        }
        
        // Always recalculate percentage
        if (updated.horas_objetivo > 0) {
          updated.porcentaje_asignacion = (updated.acumulado_mes_asignado * 100) / updated.horas_objetivo
        } else {
          updated.porcentaje_asignacion = 0
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

  const handleChangeCliente = (metricaId: string, clienteId: string) => {
    const cliente = clientes.find(c => c.id === clienteId)
    if (cliente) {
      const feeMdk = cliente.fee_mdk || 0
      setMetricas(metricas.map(m => {
        if (m.id === metricaId) {
          const horasTeoricas = calcularHorasTeoricas(feeMdk, m.valor_hora)
          return { 
            ...m, 
            cliente_id: clienteId, 
            cliente: cliente,
            fee_administrado: feeMdk,
            horas_teoricas_cliente: horasTeoricas,
            horas_objetivo: horasTeoricas,
            minimo_no_negociable_horas: horasTeoricas / 2,
          }
        }
        return m
      }))
      setEditedRows(new Set([...editedRows, metricaId]))
    }
  }

  const handleRecalcularTodo = () => {
    setMetricas(metricas.map(m => {
      const feeMdk = m.cliente?.fee_mdk || m.fee_administrado || 0
      const horasTeoricas = calcularHorasTeoricas(feeMdk, m.valor_hora)
      const porcentaje = horasTeoricas > 0 ? (m.acumulado_mes_asignado * 100) / horasTeoricas : 0
      
      return {
        ...m,
        fee_administrado: feeMdk,
        horas_teoricas_cliente: horasTeoricas,
        horas_objetivo: horasTeoricas,
        minimo_no_negociable_horas: horasTeoricas / 2,
        porcentaje_asignacion: porcentaje,
      }
    }))
    setEditedRows(new Set(metricas.map(m => m.id)))
    toast.success('Valores recalculados')
  }

  const handleDeleteRow = async (id: string) => {
    const metrica = metricas.find(m => m.id === id)
    if (!metrica) return

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
          cliente_id: metrica.cliente_id,
          fee_administrado: metrica.fee_administrado,
          valor_hora: metrica.valor_hora,
          horas_teoricas_cliente: metrica.horas_teoricas_cliente,
          minimo_no_negociable_horas: metrica.minimo_no_negociable_horas,
          horas_objetivo: metrica.horas_objetivo,
          acumulado_mes_asignado: metrica.acumulado_mes_asignado,
          porcentaje_asignacion: metrica.porcentaje_asignacion,
          mes: selectedMonth,
          anio: selectedYear,
        }

        const { error } = await supabase
          .from('metricas_colaboradores')
          .upsert(payload, { onConflict: 'colaborador_id,cliente_id,mes,anio' })

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

  // Filter metricas by colaborador
  const filteredMetricas = filterColaborador === 'all' 
    ? metricas 
    : metricas.filter(m => m.colaborador_id === filterColaborador)

  // Group metricas by colaborador for totals
  const totalesPorColaborador = colaboradores.map(colab => {
    const metricasColab = metricas.filter(m => m.colaborador_id === colab.id)
    const totalFee = metricasColab.reduce((sum, m) => sum + (m.fee_administrado || 0), 0)
    const totalHorasTeoricas = metricasColab.reduce((sum, m) => sum + (m.horas_teoricas_cliente || 0), 0)
    const totalAcumulado = metricasColab.reduce((sum, m) => sum + (m.acumulado_mes_asignado || 0), 0)
    const totalObjetivo = metricasColab.reduce((sum, m) => sum + (m.horas_objetivo || 0), 0)
    const porcentaje = totalObjetivo > 0 ? (totalAcumulado * 100) / totalObjetivo : 0

    return {
      colaborador: colab,
      totalFee,
      totalHorasTeoricas,
      totalAcumulado,
      totalObjetivo,
      porcentaje,
      cantidadClientes: metricasColab.length,
    }
  }).filter(t => t.cantidadClientes > 0)

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
          <p className="text-muted-foreground">Gestiona las métricas mensuales por colaborador y cliente</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Valor hora:</span>
            <Input
              type="number"
              value={valorHoraGlobal}
              onChange={(e) => setValorHoraGlobal(Number(e.target.value))}
              className="w-[120px] text-right"
            />
          </div>
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

      {/* Resumen - todas las filas con colaborador + cliente */}
      {metricas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Resumen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Fee MDK</TableHead>
                    <TableHead className="text-right">H Teóricas</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right">Objetivo</TableHead>
                    <TableHead className="text-right">Acumulado</TableHead>
                    <TableHead className="text-right">% Asignación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metricas.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.colaborador?.nombre} {m.colaborador?.apellido || ''}</TableCell>
                      <TableCell>{m.cliente?.nombre_del_negocio || '-'}</TableCell>
                      <TableCell className="text-right">${m.fee_administrado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">{formatHoursDisplay(m.horas_teoricas_cliente)}</TableCell>
                      <TableCell className={cn("text-right", getHoursColor(m.minimo_no_negociable_horas, m.horas_objetivo / 2))}>
                        {formatHoursDisplay(m.minimo_no_negociable_horas)}
                      </TableCell>
                      <TableCell className="text-right">{formatHoursDisplay(m.horas_objetivo)}</TableCell>
                      <TableCell className={cn("text-right", getHoursColor(m.acumulado_mes_asignado, m.horas_objetivo))}>
                        {formatHoursDisplay(m.acumulado_mes_asignado)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          "px-2 py-1 rounded text-sm",
                          getPercentageColor(m.porcentaje_asignacion)
                        )}>
                          {m.porcentaje_asignacion.toFixed(2)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Fila de totales por colaborador */}
                  {totalesPorColaborador.map((t) => (
                    <TableRow key={`total-${t.colaborador.id}`} className="bg-muted/50 font-semibold border-t-2">
                      <TableCell>{t.colaborador.nombre} {t.colaborador.apellido || ''}</TableCell>
                      <TableCell className="text-muted-foreground">Total ({t.cantidadClientes} clientes)</TableCell>
                      <TableCell className="text-right">${t.totalFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">{formatHoursDisplay(t.totalHorasTeoricas)}</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className="text-right">{formatHoursDisplay(t.totalObjetivo)}</TableCell>
                      <TableCell className={cn("text-right", getHoursColor(t.totalAcumulado, t.totalObjetivo))}>
                        {formatHoursDisplay(t.totalAcumulado)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          "px-2 py-1 rounded text-sm",
                          getPercentageColor(t.porcentaje)
                        )}>
                          {t.porcentaje.toFixed(2)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detalle por cliente */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Detalle por Cliente</CardTitle>
              <CardDescription>
                {months[selectedMonth - 1]} {selectedYear} - Fórmulas: H.Teóricas = ((Fee×7.5%)/ValorHora)/24 | Mínimo = Objetivo/2 | % = (Acumulado×100)/Objetivo
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterColaborador} onValueChange={setFilterColaborador}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar colaborador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los colaboradores</SelectItem>
                  {colaboradores.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre} {c.apellido || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleRecalcularTodo}>
                <Calculator className="h-4 w-4 mr-1" />
                Recalcular
              </Button>
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
                    <TableHead className="w-[160px]">Colaborador</TableHead>
                    <TableHead className="w-[160px]">Cliente</TableHead>
                    <TableHead className="text-right w-[120px]">Fee MDK</TableHead>
                    <TableHead className="text-right w-[100px]">Valor Hora</TableHead>
                    <TableHead className="text-right w-[90px]">H Teóricas</TableHead>
                    <TableHead className="text-right w-[90px]">Mínimo</TableHead>
                    <TableHead className="text-right w-[90px]">Objetivo</TableHead>
                    <TableHead className="text-right w-[90px]">Acumulado</TableHead>
                    <TableHead className="text-right w-[80px]">%</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMetricas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No hay datos para este período. Haz clic en &quot;Agregar&quot; para comenzar.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMetricas.map((m) => (
                      <TableRow key={m.id} className={editedRows.has(m.id) ? 'bg-primary/5' : ''}>
                        <TableCell>
                          <Select 
                            value={m.colaborador_id} 
                            onValueChange={(v) => handleChangeColaborador(m.id, v)}
                          >
                            <SelectTrigger className="w-full h-8 text-xs">
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
                          <Select 
                            value={m.cliente_id} 
                            onValueChange={(v) => handleChangeCliente(m.id, v)}
                          >
                            <SelectTrigger className="w-full h-8 text-xs">
                              <SelectValue>
                                {m.cliente?.nombre_del_negocio || 'Seleccionar'}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {clientes.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.nombre_del_negocio}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm">${m.fee_administrado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={m.valor_hora}
                            onChange={(e) => handleUpdateField(m.id, 'valor_hora', Number(e.target.value))}
                            className="w-[90px] h-8 text-xs text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.5"
                            value={m.horas_teoricas_cliente}
                            onChange={(e) => handleUpdateField(m.id, 'horas_teoricas_cliente', Number(e.target.value))}
                            className="w-[80px] h-8 text-xs text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.5"
                            value={m.minimo_no_negociable_horas}
                            onChange={(e) => handleUpdateField(m.id, 'minimo_no_negociable_horas', Number(e.target.value))}
                            className={cn(
                              "w-[80px] h-8 text-xs text-right",
                              getHoursColor(m.minimo_no_negociable_horas, m.horas_objetivo / 2)
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.5"
                            value={m.horas_objetivo}
                            onChange={(e) => handleUpdateField(m.id, 'horas_objetivo', Number(e.target.value))}
                            className="w-[80px] h-8 text-xs text-right"
                          />
                        </TableCell>
                        <TableCell className={cn("text-right", getHoursColor(m.acumulado_mes_asignado, m.horas_objetivo))}>
                          <Input
                            type="number"
                            step="0.5"
                            value={m.acumulado_mes_asignado}
                            onChange={(e) => handleUpdateField(m.id, 'acumulado_mes_asignado', Number(e.target.value))}
                            className={cn(
                              "w-[80px] h-8 text-xs text-right",
                              getHoursColor(m.acumulado_mes_asignado, m.horas_objetivo)
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={cn(
                            "px-2 py-1 rounded text-xs",
                            getPercentageColor(m.porcentaje_asignacion)
                          )}>
                            {m.porcentaje_asignacion.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
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
