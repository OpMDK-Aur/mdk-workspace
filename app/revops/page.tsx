'use client'

import { useState, useEffect } from 'react'
import { RevOpsBoard } from '@/components/agentes/revops-board'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ClienteConRevOps } from '@/lib/types/revops'

export default function RevOpsPage() {
  const [clientes, setClientes] = useState<ClienteConRevOps[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchClientes = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/agentes/revops')
        if (!response.ok) throw new Error('Error al cargar clientes')
        const data = await response.json()
        setClientes(data)
      } catch (error) {
        console.error('[v0] Error fetching RevOps clientes:', error)
        toast.error('Error al cargar los datos de RevOps')
      } finally {
        setLoading(false)
      }
    }

    fetchClientes()
  }, [])

  return (
    <div className="min-h-dvh bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Dashboard RevOps</h1>
          <p className="text-muted-foreground">
            Monitoreo de salud de clientes, tareas, conversaciones y métricas de embudo
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : clientes.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No hay clientes disponibles para RevOps</p>
          </div>
        ) : (
          <RevOpsBoard clientes={clientes} />
        )}
      </div>
    </div>
  )
}
