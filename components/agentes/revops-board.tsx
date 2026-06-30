// components/agentes/revops/revops-board.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ClienteConRevOps } from '@/lib/types'
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
import { Loader2, PlayCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { RevOpsDetailSheet } from './revops-detail-sheet'

interface RevOpsBoardProps {
  clientes: ClienteConRevOps[]
}

function scoreColor(score: number | null | undefined) {
  if (score == null) return 'bg-muted text-muted-foreground'
  if (score >= 75) return 'bg-emerald-500/15 text-emerald-500'
  if (score >= 50) return 'bg-amber-500/15 text-amber-500'
  return 'bg-red-500/15 text-red-500'
}

export function RevOpsBoard({ clientes: initial }: RevOpsBoardProps) {
  const router = useRouter()
  const [clientes, setClientes] = useState(initial)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadingAll, setLoadingAll] = useState(false)
  const [progresoTodos, setProgresoTodos] = useState<{ actual: number; total: number } | null>(null)
  const [detalleId, setDetalleId] = useState<string | null>(null)

  // Derivado del estado en vivo: si "clientes" se actualiza con un análisis
  // nuevo mientras el panel está abierto, el panel se refresca solo.
  const detalleCliente = detalleId ? clientes.find((c) => c.id === detalleId) ?? null : null

  const analizarUnCliente = async (clienteId: string) => {
    const res = await fetch('/api/agentes/revops/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId }),
    })
    const ejecucion = await res.json()
    if (!res.ok) throw new Error(ejecucion.error || 'Error al analizar')

    setClientes((prev) => prev.map((c) => (c.id === clienteId ? { ...c, ultima_ejecucion: ejecucion } : c)))
    return ejecucion
  }

  const handleAnalizar = async (clienteId: string) => {
    setLoadingId(clienteId)
    try {
      await analizarUnCliente(clienteId)
      toast.success('Análisis completado')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al analizar el cliente')
    } finally {
      setLoadingId(null)
    }
  }

  const handleAnalizarTodos = async () => {
    const elegiblesActual = clientes.filter((c) => c.crm_type === 'ghl' && c.ghl_location_id)
    if (elegiblesActual.length === 0) return

    setLoadingAll(true)
    setProgresoTodos({ actual: 0, total: elegiblesActual.length })

    let exitosos = 0
    let fallidos = 0

    // Secuencial a propósito (no Promise.all): cada cliente ya hace 50-80 llamadas
    // a GHL por su cuenta. Correrlos en paralelo dispararía rate limits en cadena.
    // Como beneficio extra, cada fila se actualiza apenas termina su análisis,
    // sin esperar a que terminen todas.
    for (let i = 0; i < elegiblesActual.length; i++) {
      const cliente = elegiblesActual[i]
      try {
        await analizarUnCliente(cliente.id)
        exitosos++
      } catch {
        fallidos++
      } finally {
        setProgresoTodos({ actual: i + 1, total: elegiblesActual.length })
      }
    }

    setLoadingAll(false)
    setProgresoTodos(null)
    toast.success(`Análisis completado: ${exitosos} ok${fallidos > 0 ? `, ${fallidos} con error` : ''}`)
    router.refresh()
  }

  const elegibles = clientes.filter((c) => c.crm_type === 'ghl' && c.ghl_location_id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3">
        {progresoTodos && (
          <span className="text-sm text-muted-foreground">
            Analizando {progresoTodos.actual} de {progresoTodos.total}...
          </span>
        )}
        <Button
          onClick={handleAnalizarTodos}
          disabled={loadingAll || elegibles.length === 0}
          className="bg-[#7F77DD] hover:bg-[#6B63C7] gap-2"
        >
          {loadingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Analizar todos los clientes GHL ({elegibles.length})
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>CRM</TableHead>
              <TableHead>Score salud</TableHead>
              <TableHead>Alertas</TableHead>
              <TableHead>Última ejecución</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.map((cliente) => {
              const esGhl = cliente.crm_type === 'ghl' && !!cliente.ghl_location_id
              const ejecucion = cliente.ultima_ejecucion
              return (
                <TableRow
                  key={cliente.id}
                  className={ejecucion ? 'cursor-pointer hover:bg-muted/30' : ''}
                  onClick={() => ejecucion && setDetalleId(cliente.id)}
                >
                  <TableCell className="font-medium">{cliente.nombre_del_negocio}</TableCell>
                  <TableCell>
                    {esGhl ? (
                      <Badge variant="outline">GHL</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        {cliente.crm_type || 'Sin CRM'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {loadingId === cliente.id || (loadingAll && esGhl && !ejecucion) ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Analizando...
                      </span>
                    ) : ejecucion?.estado === 'error' ? (
                      <span className="text-xs text-destructive">{ejecucion.error_detalle}</span>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-sm font-semibold ${scoreColor(ejecucion?.score_salud)}`}>
                        {ejecucion?.score_salud ?? '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {ejecucion?.resumen?.alertas?.length ? (
                      <Badge className="bg-red-500/15 text-red-500 hover:bg-red-500/15">
                        {ejecucion.resumen.alertas.length}
                      </Badge>
                    ) : ejecucion ? (
                      <span className="text-xs text-muted-foreground">Sin alertas</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {ejecucion ? new Date(ejecucion.ejecutado_en).toLocaleString('es-AR') : 'Nunca'}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!esGhl || loadingId === cliente.id || loadingAll}
                      onClick={() => handleAnalizar(cliente.id)}
                      className="gap-1.5"
                    >
                      {loadingId === cliente.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PlayCircle className="h-3.5 w-3.5" />
                      )}
                      Analizar
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <RevOpsDetailSheet
        cliente={detalleCliente}
        open={!!detalleCliente}
        onOpenChange={(open) => !open && setDetalleId(null)}
      />
    </div>
  )
}