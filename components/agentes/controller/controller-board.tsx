'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClienteConController } from '@/lib/types'
import { IconBrandMeta, IconBrandGoogle, IconCalendar } from '@tabler/icons-react'
import { ControllerConfigSheet } from './controller-config-sheet'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export interface ControllerBoardProps {
  clientes: ClienteConController[]
}

type FilterState = 'todos' | 'configurados' | 'sin-configurar'

export function ControllerBoard({ clientes }: ControllerBoardProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterState>('todos')
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const filtered = clientes.filter((c) => {
    const matchSearch = c.nombre_del_negocio.toLowerCase().includes(search.toLowerCase())
    const matchFilter =
      filter === 'todos' ||
      (filter === 'configurados' && c.configuracion) ||
      (filter === 'sin-configurar' && !c.configuracion)
    return matchSearch && matchFilter
  })

  const selectedCliente = clientes.find((c) => c.id === selectedClienteId)

  return (
    <>
      {/* Controles */}
      <div className="bg-[#161616] border border-white/10 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-[#0f0f0f] border-white/10 text-white placeholder:text-gray-500"
          />
        </div>
        <div className="flex gap-2">
          {(['todos', 'configurados', 'sin-configurar'] as FilterState[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className={filter === f ? 'bg-[#7F77DD] hover:bg-[#7F77DD]/90' : ''}
            >
              {f === 'todos' && 'Todos'}
              {f === 'configurados' && 'Configurados'}
              {f === 'sin-configurar' && 'Sin configurar'}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-[#161616] border border-white/10 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 bg-[#0f0f0f]/50">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Plataformas</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Alertas</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Última ejecución</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Disparadas hoy</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-400">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((cliente) => (
              <tr key={cliente.id} className="border-b border-white/10 hover:bg-[#0f0f0f]/50">
                <td className="px-6 py-4 text-sm text-white font-medium">{cliente.nombre_del_negocio}</td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    {cliente.configuracion?.meta_ad_account_id && (
                      <Badge className="bg-[#1877F2]/20 text-[#1877F2] border-0 flex items-center gap-1">
                        <IconBrandMeta className="w-3 h-3" />
                        META
                      </Badge>
                    )}
                    {cliente.configuracion?.google_customer_id && (
                      <Badge className="bg-[#EA4335]/20 text-[#EA4335] border-0 flex items-center gap-1">
                        <IconBrandGoogle className="w-3 h-3" />
                        GOOGLE
                      </Badge>
                    )}
                    {!cliente.configuracion && (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-300">
                  {cliente.alertas_activas > 0 ? (
                    <span>{cliente.alertas_activas} / {cliente.total_alertas}</span>
                  ) : (
                    <span className="text-gray-500">0 / {cliente.total_alertas}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-400">
                  {cliente.ultima_ejecucion ? (
                    <div className="flex items-center gap-1">
                      <IconCalendar className="w-4 h-4" />
                      {formatDistanceToNow(new Date(cliente.ultima_ejecucion), { locale: es, addSuffix: true })}
                    </div>
                  ) : (
                    <span>—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm">
                  {cliente.alertas_disparadas_hoy > 0 ? (
                    <span className="text-red-400 font-medium">{cliente.alertas_disparadas_hoy}</span>
                  ) : (
                    <span className="text-gray-500">0</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <Badge
                    variant={cliente.configuracion ? 'default' : 'secondary'}
                    className={
                      cliente.configuracion
                        ? 'bg-green-500/20 text-green-400 border-0'
                        : 'bg-gray-500/20 text-gray-400 border-0'
                    }
                  >
                    {cliente.configuracion ? 'Configurado' : 'Sin configurar'}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedClienteId(cliente.id)
                      setIsSheetOpen(true)
                    }}
                  >
                    {cliente.configuracion ? 'Editar' : 'Configurar'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sheet */}
      {selectedCliente && (
        <ControllerConfigSheet
          isOpen={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          clienteId={selectedCliente.id}
          clienteNombre={selectedCliente.nombre_del_negocio}
          configuracion={selectedCliente.configuracion}
        />
      )}
    </>
  )
}
