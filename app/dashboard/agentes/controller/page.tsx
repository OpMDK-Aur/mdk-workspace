import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { IconAlertTriangle, IconClock } from '@tabler/icons-react'
import { ControllerBoard } from '@/components/agentes/controller/controller-board'
import { ClienteConController } from '@/lib/types'

export const metadata = {
  title: 'Controller | MDK',
  description: 'Monitoreo automático de cuentas publicitarias',
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getControllerData() {
  const supabase = await createSupabaseClient()

  // 1. Fetch clientes activos con PM y AM
  const { data: clientes } = await supabase
    .from('clientes')
    .select(`
      id, 
      nombre_del_negocio,
      project_manager_id,
      account_manager_id,
      pm:project_manager_id(id, nombre_completo),
      am:account_manager_id(id, nombre_completo)
    `)
    .eq('activo', true)
    .order('nombre_del_negocio')

  // 2. Fetch configuraciones
  const { data: configuraciones } = await supabase
    .from('controller_configuracion')
    .select('*')

  // 3. Fetch conteo de alertas
  const { data: alertasCount } = await supabase
    .from('controller_alertas')
    .select('cliente_id, activa', { count: 'exact' })

  // 4. Fetch ejecuciones
  const { data: ejecuciones } = await supabase
    .from('controller_ejecuciones')
    .select('cliente_id, disparada, ejecutado_at')

  // Ensamblar datos
  const clientesConController: ClienteConController[] = (clientes || []).map((cliente) => {
    const config = configuraciones?.find((c) => c.cliente_id === cliente.id)
    const alertas = alertasCount?.filter((a) => a.cliente_id === cliente.id) || []
    const ejecutadas = ejecuciones?.filter((e) => e.cliente_id === cliente.id) || []

    const today = new Date().toISOString().split('T')[0]
    const disparadasHoy = ejecutadas.filter(
      (e) => e.disparada && e.ejecutado_at.split('T')[0] === today
    ).length

    return {
      id: cliente.id,
      nombre_del_negocio: cliente.nombre_del_negocio,
      configuracion: config || null,
      total_alertas: alertas.length,
      alertas_activas: alertas.filter((a) => a.activa).length,
      ultima_ejecucion: ejecutadas.length > 0 ? ejecutadas[ejecutadas.length - 1].ejecutado_at : null,
      alertas_disparadas_hoy: disparadasHoy,
      pm_id: cliente.project_manager_id || null,
      pm_nombre: cliente.pm?.nombre_completo || null,
      am_id: cliente.account_manager_id || null,
      am_nombre: cliente.am?.nombre_completo || null,
    }
  })

  return clientesConController
}

export default async function ControllerPage() {
  const clientesConController = await getControllerData()

  const stats = {
    totalClientes: clientesConController.length,
    clientesConfigurados: clientesConController.filter((c) => c.configuracion).length,
    alertasActivas: clientesConController.reduce((sum, c) => sum + c.alertas_activas, 0),
    alertasDisparadasHoy: clientesConController.reduce((sum, c) => sum + c.alertas_disparadas_hoy, 0),
  }

  return (
    <main className="flex-1 bg-[#0f0f0f] p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Controller</h1>
            <p className="text-sm text-gray-400">Monitoreo automático de cuentas publicitarias</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#7F77DD]/10 border border-[#7F77DD]/20">
            <IconClock className="w-4 h-4 text-[#7F77DD]" />
            <span className="text-xs font-medium text-[#7F77DD]">CRON · 08:00 AR</span>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-[#161616] border border-white/10 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Total Clientes</p>
          <p className="text-2xl font-bold text-white">{stats.totalClientes}</p>
        </div>
        <div className="bg-[#161616] border border-white/10 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Configurados</p>
          <p className="text-2xl font-bold text-white">{stats.clientesConfigurados}</p>
        </div>
        <div className="bg-[#161616] border border-white/10 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Alertas Activas</p>
          <p className="text-2xl font-bold text-white">{stats.alertasActivas}</p>
        </div>
        <div className="bg-[#161616] border border-white/10 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Disparadas Hoy</p>
          <p className="text-2xl font-bold text-red-400">{stats.alertasDisparadasHoy}</p>
        </div>
      </div>

      {/* Board */}
      <ControllerBoard clientes={clientesConController} />
    </main>
  )
}
