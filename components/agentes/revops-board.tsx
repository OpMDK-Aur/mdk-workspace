'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet } from '@/components/ui/sheet'
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { 
  AlertCircle, 
  Loader2, 
  Zap,
  BarChart3
} from 'lucide-react'
import { toast } from 'sonner'
import { RevOpsDetailSheet } from './revops-detail-sheet'
import type { ClienteConRevOps, RevOpsEjecucion } from '@/lib/types/revops'

interface RevOpsBoardProps {
  clientes: ClienteConRevOps[]
}

export function RevOpsBoard({ clientes }: RevOpsBoardProps) {
  const [selectedCliente, setSelectedCliente] = useState<ClienteConRevOps | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadingAll, setLoadingAll] = useState(false)

  // Score Health Gauge Component
  const ScoreGauge = ({ score }: { score: number | null }) => {
    if (score === null) return <span className="text-xs text-muted-foreground">Sin datos</span>

    const getColor = (score: number) => {
      if (score >= 75) return { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', label: 'Excelente' }
      if (score >= 50) return { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', label: 'Bueno' }
      return { bg: 'bg-red-500/15', text: 'text-red-600 dark:text-red-400', label: 'Revisar' }
    }

    const colors = getColor(score)
    const percentage = Math.min(100, Math.max(0, score))

    return (
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12">
          <svg className="w-full h-full" viewBox="0 0 36 36">
            {/* Background circle */}
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-muted-foreground/20"
            />
            {/* Progress circle */}
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={`${percentage * 0.97} 97`}
              strokeDashoffset="24.25"
              strokeLinecap="round"
              className={cn('transition-all', colors.text)}
            />
          </svg>
          <span className={cn('absolute inset-0 flex items-center justify-center text-xs font-bold', colors.text)}>
            {Math.round(score)}
          </span>
        </div>
        <div>
          <p className={cn('text-xs font-medium', colors.text)}>
            {colors.label}
          </p>
        </div>
      </div>
    )
  }

  const handleAnalyzeClient = async (cliente: ClienteConRevOps) => {
    setLoadingId(cliente.id)
    try {
      const response = await fetch('/api/agentes/revops/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId: cliente.id }),
      })

      if (!response.ok) throw new Error('Failed to analyze')

      toast.success(`${cliente.nombre_del_negocio} analizado correctamente`)
      // En una app real, aquí refrescarías la data del cliente
    } catch (error) {
      console.error('[v0] Error analyzing client:', error)
      toast.error('Error al analizar el cliente')
    } finally {
      setLoadingId(null)
    }
  }

  const handleAnalyzeAll = async () => {
    const ghlClientes = clientes.filter(c => c.crm_type === 'ghl' || c.ghl_location_id)
    if (ghlClientes.length === 0) {
      toast.info('No hay clientes GHL para analizar')
      return
    }

    setLoadingAll(true)
    try {
      const response = await fetch('/api/agentes/revops/execute-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) throw new Error('Failed to analyze all')

      toast.success(`${ghlClientes.length} clientes analizados correctamente`)
      // En una app real, aquí refrescarías la data de todos
    } catch (error) {
      console.error('[v0] Error analyzing all:', error)
      toast.error('Error al analizar los clientes')
    } finally {
      setLoadingAll(false)
    }
  }

  const ghlCount = clientes.filter(c => c.crm_type === 'ghl' || c.ghl_location_id).length
  const withErrors = clientes.filter(c => c.ultima_ejecucion?.estado === 'error').length

  return (
    <>
      <div className="space-y-4">
        {/* Header with Analyze All Button */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Auditoría RevOps</h2>
            <p className="text-sm text-muted-foreground">
              {clientes.length} clientes • {ghlCount} GHL • {withErrors} con errores
            </p>
          </div>
          <Button
            onClick={handleAnalyzeAll}
            disabled={loadingAll || ghlCount === 0}
            className="gap-2 bg-[#7F77DD] hover:bg-[#6B63C7] text-white"
          >
            {loadingAll ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analizando ({ghlCount})...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Analizar todos ({ghlCount})
              </>
            )}
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="w-1/4">Cliente</TableHead>
                <TableHead className="w-1/6">CRM</TableHead>
                <TableHead className="w-1/5">Score de Salud</TableHead>
                <TableHead className="w-1/6">Alertas</TableHead>
                <TableHead className="w-1/6">Última ejecución</TableHead>
                <TableHead className="text-right w-1/6">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((cliente) => (
                <TableRow
                  key={cliente.id}
                  className="cursor-pointer hover:bg-muted/50 border-border/50"
                  onClick={() => {
                    setSelectedCliente(cliente)
                    setDetailOpen(true)
                  }}
                >
                  <TableCell>
                    <p className="font-medium text-foreground">{cliente.nombre_del_negocio}</p>
                  </TableCell>
                  <TableCell>
                    {cliente.crm_type && (
                      <Badge variant="outline" className="text-xs">
                        {cliente.crm_type.toUpperCase()}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <ScoreGauge score={cliente.ultima_ejecucion?.score_salud ?? null} />
                  </TableCell>
                  <TableCell>
                    {(cliente.ultima_ejecucion?.resumen?.alertas?.length ?? 0) > 0 ? (
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">
                          {cliente.ultima_ejecucion?.resumen?.alertas?.length ?? 0}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {cliente.ultima_ejecucion ? (
                      <div className="text-xs text-muted-foreground">
                        {new Date(cliente.ultima_ejecucion.ejecutado_en).toLocaleDateString('es-AR')}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Nunca</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAnalyzeClient(cliente)
                      }}
                      disabled={loadingId === cliente.id}
                      className="gap-1"
                    >
                      {loadingId === cliente.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <BarChart3 className="h-3.5 w-3.5" />
                      )}
                      Analizar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {clientes.length === 0 && (
          <div className="rounded-lg border border-dashed bg-card p-8 text-center">
            <p className="text-muted-foreground">No hay clientes para analizar</p>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <RevOpsDetailSheet
        cliente={selectedCliente}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  )
}
