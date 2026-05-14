'use client'

import { useEffect, useState, useRef } from 'react'
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
import { Save, Plus, Trash2, RefreshCw, AlertCircle, Calculator, Pencil, Check, X, Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Convert decimal hours to HH:MM:SS format
const formatHoursToTime = (hours: number): string => {
  if (!hours || isNaN(hours) || hours === 0) return '00:00:00'
  const totalSeconds = Math.round(hours * 3600)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// Parse HH:MM:SS to decimal hours
const parseTimeToHours = (timeStr: string): number => {
  const parts = timeStr.split(':').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return 0
  const [h, m, s] = parts
  return h + m / 60 + s / 3600
}

interface Colaborador {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
  rol_id: string | null
  roles?: { id: string; nombre: string } | null
}

interface Cliente {
  id: string
  nombre_del_negocio: string
  fee_mdk: number | null
  fee_aurelia: number | null
  fee_consultoria: number | null
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
  
  // Edición de fees del cliente
  const [editingFeeClientId, setEditingFeeClientId] = useState<string | null>(null)
  const [editFeeMdk, setEditFeeMdk] = useState<number>(0)
  const [editFeeAurelia, setEditFeeAurelia] = useState<number>(0)
  const [editFeeConsultoria, setEditFeeConsultoria] = useState<number>(0)
  const [savingFee, setSavingFee] = useState(false)

  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

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

      // Load colaboradores with their roles
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id, nombre, apellido, email, rol_id, roles(id, nombre)')
        .eq('activo', true)
        .order('nombre')

      if (colabs) setColaboradores(colabs)

      // Load clientes with fees
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('id, nombre_del_negocio, fee_mdk, fee_aurelia, fee_consultoria')
        .order('nombre_del_negocio')

      if (clientesData) setClientes(clientesData)

      // Load metricas for selected period
      const { data: mets } = await supabase
        .from('metricas_colaboradores')
        .select(`
          *,
          colaborador:colaborador_id(id, nombre, apellido, email, rol_id, roles(id, nombre)),
          cliente:cliente_id(id, nombre_del_negocio, fee_mdk, fee_aurelia, fee_consultoria)
        `)
        .eq('mes', selectedMonth)
        .eq('anio', selectedYear)
        .order('created_at')

      if (mets) {
        setMetricas(mets.map(m => {
          const colaborador = m.colaborador as Colaborador
          const cliente = m.cliente as Cliente
          const valorHora = Number(m.valor_hora) || 150000
          const feeMdk = cliente?.fee_mdk || 0
          
          // Recalculate horas teoricas with correct role
          const horasTeoricas = calcularHorasTeoricas(feeMdk, valorHora, colaborador)
          
          return {
            ...m,
            colaborador,
            cliente,
            horas_teoricas_cliente: horasTeoricas,
            minimo_no_negociable_horas: horasTeoricas / 2,
            horas_objetivo: horasTeoricas,
            acumulado_mes_asignado: Number(m.acumulado_mes_asignado) || 0,
            valor_hora: valorHora,
          }
        }))
      }

      setIsLoading(false)
    }
    loadData()
  }, [hasAccess, selectedMonth, selectedYear, supabase])

  // Calculate horas teoricas based on formula: ((fee * %) / valor_hora)
  // PM (Project Manager) uses 7.5%, AC (Account Manager) uses 20%
  // Consultor: no automatic calculation (returns 0)
  const calcularHorasTeoricas = (fee: number, valorHora: number, colaborador?: Colaborador | null): number => {
    if (valorHora === 0) return 0
    
    // Determine percentage based on role
    const rolNombre = colaborador?.roles?.nombre?.toLowerCase() || ''
    
    // Consultores don't have automatic calculation
    const isConsultor = rolNombre.includes('consultor') || rolNombre === 'consultant'
    if (isConsultor) return 0
    
    const isAccountManager = rolNombre.includes('account') || rolNombre === 'account_manager' || rolNombre === 'account manager'
    const porcentaje = isAccountManager ? 0.20 : 0.075 // 20% for AC, 7.5% for PM and others
    
    return (fee * porcentaje) / valorHora
  }

  const handleAddRow = () => {
    if (colaboradores.length === 0 || clientes.length === 0) {
      toast.error('No hay colaboradores o clientes disponibles')
      return
    }

    const cliente = clientes[0]
    const colaborador = colaboradores[0]
    const feeMdk = cliente.fee_mdk || 0
    const horasTeoricas = calcularHorasTeoricas(feeMdk, valorHoraGlobal, colaborador)

    const newMetrica: MetricaColaborador = {
      id: crypto.randomUUID(),
      colaborador_id: colaborador.id,
      cliente_id: cliente.id,
      colaborador: colaborador,
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
      setMetricas(metricas.map(m => {
        if (m.id === metricaId) {
          const feeMdk = m.cliente?.fee_mdk || m.fee_administrado || 0
          const horasTeoricas = calcularHorasTeoricas(feeMdk, m.valor_hora, colab)
          return { 
            ...m, 
            colaborador_id: colaboradorId, 
            colaborador: colab,
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

  const handleChangeCliente = (metricaId: string, clienteId: string) => {
    const cliente = clientes.find(c => c.id === clienteId)
    if (cliente) {
      const feeMdk = cliente.fee_mdk || 0
      setMetricas(metricas.map(m => {
        if (m.id === metricaId) {
          const horasTeoricas = calcularHorasTeoricas(feeMdk, m.valor_hora, m.colaborador)
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
      const horasTeoricas = calcularHorasTeoricas(feeMdk, m.valor_hora, m.colaborador)
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

  // Abrir edición de fees del cliente
  const handleStartEditFee = (cliente: Cliente) => {
    setEditingFeeClientId(cliente.id)
    setEditFeeMdk(cliente.fee_mdk || 0)
    setEditFeeAurelia(cliente.fee_aurelia || 0)
    setEditFeeConsultoria(cliente.fee_consultoria || 0)
  }

  // Guardar fees del cliente
  const handleSaveFee = async () => {
    if (!editingFeeClientId) return
    
    setSavingFee(true)
    const { error } = await supabase
      .from('clientes')
      .update({
        fee_mdk: editFeeMdk,
        fee_aurelia: editFeeAurelia,
        fee_consultoria: editFeeConsultoria,
      })
      .eq('id', editingFeeClientId)
    
    if (error) {
      toast.error('Error al guardar fees')
      console.error('Error saving fees:', error)
    } else {
      // Actualizar clientes locales
      setClientes(clientes.map(c => 
        c.id === editingFeeClientId 
          ? { ...c, fee_mdk: editFeeMdk, fee_aurelia: editFeeAurelia, fee_consultoria: editFeeConsultoria }
          : c
      ))
      // Actualizar métricas que usan este cliente
      setMetricas(metricas.map(m => {
        if (m.cliente_id === editingFeeClientId) {
          const totalFee = editFeeMdk + editFeeAurelia + editFeeConsultoria
          return {
            ...m,
            cliente: { ...m.cliente!, fee_mdk: editFeeMdk, fee_aurelia: editFeeAurelia, fee_consultoria: editFeeConsultoria },
            fee_administrado: totalFee,
          }
        }
        return m
      }))
      toast.success('Fees actualizados')
      setEditingFeeClientId(null)
    }
    setSavingFee(false)
  }

  const handleCancelEditFee = () => {
    setEditingFeeClientId(null)
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

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Colaborador',
      'Colaborador Email',
      'Cliente',
      'Fee MDK',
      'Fee Aurelia',
      'Fee Consultoria',
      'Valor Hora',
      'H Teoricas',
      'Minimo',
      'Objetivo',
      'Acumulado',
      'Porcentaje'
    ]
    
    const rows = filteredMetricas.map(m => [
      `${m.colaborador?.nombre || ''} ${m.colaborador?.apellido || ''}`.trim(),
      m.colaborador?.email || '',
      m.cliente?.nombre_del_negocio || '',
      m.cliente?.fee_mdk || 0,
      m.cliente?.fee_aurelia || 0,
      m.cliente?.fee_consultoria || 0,
      m.valor_hora,
      m.horas_teoricas_cliente.toFixed(4),
      m.minimo_no_negociable_horas.toFixed(4),
      m.horas_objetivo.toFixed(4),
      m.acumulado_mes_asignado.toFixed(4),
      m.porcentaje_asignacion.toFixed(2)
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `colaboradores_${months[selectedMonth - 1]}_${selectedYear}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    toast.success('CSV exportado correctamente')
  }

  // Import from CSV
  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())
        
        if (lines.length < 2) {
          toast.error('El archivo CSV está vacío o no tiene datos')
          return
        }

        // Skip header row
        const dataRows = lines.slice(1)
        let updatedCount = 0
        let notFoundCount = 0

        const updatedMetricas = [...metricas]
        const newEditedRows = new Set(editedRows)

        dataRows.forEach(row => {
          // Parse CSV row (handle quoted values)
          const values: string[] = []
          let current = ''
          let inQuotes = false
          
          for (let i = 0; i < row.length; i++) {
            const char = row[i]
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim())
              current = ''
            } else {
              current += char
            }
          }
          values.push(current.trim())

          const [
            colaboradorNombre,
            colaboradorEmail,
            clienteNombre,
            feeMdk,
            feeAurelia,
            feeConsultoria,
            valorHora,
            horasTeoricas,
            minimo,
            objetivo,
            acumulado,
          ] = values

          // Find matching metrica by colaborador email and cliente name
          const metricaIndex = updatedMetricas.findIndex(m => {
            const emailMatch = m.colaborador?.email?.toLowerCase() === colaboradorEmail?.toLowerCase()
            const clienteMatch = m.cliente?.nombre_del_negocio?.toLowerCase() === clienteNombre?.toLowerCase()
            return emailMatch && clienteMatch
          })

          if (metricaIndex !== -1) {
            const m = updatedMetricas[metricaIndex]
            updatedMetricas[metricaIndex] = {
              ...m,
              valor_hora: parseFloat(valorHora) || m.valor_hora,
              horas_teoricas_cliente: parseFloat(horasTeoricas) || m.horas_teoricas_cliente,
              minimo_no_negociable_horas: parseFloat(minimo) || m.minimo_no_negociable_horas,
              horas_objetivo: parseFloat(objetivo) || m.horas_objetivo,
              acumulado_mes_asignado: parseFloat(acumulado) || m.acumulado_mes_asignado,
            }
            // Recalculate percentage
            if (updatedMetricas[metricaIndex].horas_objetivo > 0) {
              updatedMetricas[metricaIndex].porcentaje_asignacion = 
                (updatedMetricas[metricaIndex].acumulado_mes_asignado * 100) / updatedMetricas[metricaIndex].horas_objetivo
            }
            newEditedRows.add(m.id)
            updatedCount++
          } else {
            notFoundCount++
          }
        })

        setMetricas(updatedMetricas)
        setEditedRows(newEditedRows)
        
        if (updatedCount > 0) {
          toast.success(`${updatedCount} registros actualizados. Presiona "Guardar" para confirmar los cambios.`)
        }
        if (notFoundCount > 0) {
          toast.warning(`${notFoundCount} filas no encontraron coincidencia (colaborador+cliente)`)
        }
      } catch (error) {
        console.error('Error parsing CSV:', error)
        toast.error('Error al procesar el archivo CSV')
      }
    }
    reader.readAsText(file)
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

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

      {/* Detalle por cliente */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Detalle por Cliente</CardTitle>
              <CardDescription>
                {months[selectedMonth - 1]} {selectedYear} - Fórmulas: H.Teóricas = ((Fee×%)/ValorHora)/24 (PM: 7.5%, AC: 20%, Consultor: manual) | Mínimo = Objetivo/2 | % = (Acumulado×100)/Objetivo
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
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-1" />
                Exportar
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" />
                Importar
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv"
                onChange={handleImportCSV}
                className="hidden"
              />
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
                    <TableHead className="text-right w-[140px]">Fees (MDK/Aur/Cons)</TableHead>
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
                          {editingFeeClientId === m.cliente_id ? (
                            <div className="flex flex-col gap-1 items-end">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground w-8">MDK:</span>
                                <Input
                                  type="number"
                                  value={editFeeMdk}
                                  onChange={(e) => setEditFeeMdk(Number(e.target.value))}
                                  className="w-[80px] h-6 text-xs text-right"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground w-8">Aur:</span>
                                <Input
                                  type="number"
                                  value={editFeeAurelia}
                                  onChange={(e) => setEditFeeAurelia(Number(e.target.value))}
                                  className="w-[80px] h-6 text-xs text-right"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground w-8">Cons:</span>
                                <Input
                                  type="number"
                                  value={editFeeConsultoria}
                                  onChange={(e) => setEditFeeConsultoria(Number(e.target.value))}
                                  className="w-[80px] h-6 text-xs text-right"
                                />
                              </div>
                              <div className="flex gap-1 mt-1">
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="h-5 w-5"
                                  onClick={handleSaveFee}
                                  disabled={savingFee}
                                >
                                  <Check className="h-3 w-3 text-green-500" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="h-5 w-5"
                                  onClick={handleCancelEditFee}
                                  disabled={savingFee}
                                >
                                  <X className="h-3 w-3 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <div className="flex flex-col items-end text-[10px]">
                                {(m.cliente?.fee_mdk ?? 0) > 0 && (
                                  <span>MDK: ${((m.cliente?.fee_mdk || 0) / 1000).toFixed(1)}K</span>
                                )}
                                {(m.cliente?.fee_aurelia ?? 0) > 0 && (
                                  <span>Aur: ${((m.cliente?.fee_aurelia || 0) / 1000).toFixed(1)}K</span>
                                )}
                                {(m.cliente?.fee_consultoria ?? 0) > 0 && (
                                  <span>Cons: ${((m.cliente?.fee_consultoria || 0) / 1000).toFixed(1)}K</span>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => m.cliente && handleStartEditFee(m.cliente)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
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
                            type="text"
                            value={formatHoursToTime(m.horas_teoricas_cliente)}
                            onChange={(e) => handleUpdateField(m.id, 'horas_teoricas_cliente', parseTimeToHours(e.target.value))}
                            placeholder="HH:MM:SS"
                            className="w-[90px] h-8 text-xs text-right font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="text"
                            value={formatHoursToTime(m.minimo_no_negociable_horas)}
                            onChange={(e) => handleUpdateField(m.id, 'minimo_no_negociable_horas', parseTimeToHours(e.target.value))}
                            placeholder="HH:MM:SS"
                            className={cn(
                              "w-[90px] h-8 text-xs text-right font-mono",
                              getHoursColor(m.minimo_no_negociable_horas, m.horas_objetivo / 2)
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="text"
                            value={formatHoursToTime(m.horas_objetivo)}
                            onChange={(e) => handleUpdateField(m.id, 'horas_objetivo', parseTimeToHours(e.target.value))}
                            placeholder="HH:MM:SS"
                            className="w-[90px] h-8 text-xs text-right font-mono"
                          />
                        </TableCell>
                        <TableCell className={cn("text-right", getHoursColor(m.acumulado_mes_asignado, m.horas_objetivo))}>
                          <Input
                            type="text"
                            value={formatHoursToTime(m.acumulado_mes_asignado)}
                            onChange={(e) => handleUpdateField(m.id, 'acumulado_mes_asignado', parseTimeToHours(e.target.value))}
                            placeholder="HH:MM:SS"
                            className={cn(
                              "w-[90px] h-8 text-xs text-right font-mono",
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
