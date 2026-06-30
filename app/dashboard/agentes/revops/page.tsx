import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { RevOpsBoard } from '@/components/agentes/revops-board'
import type { ClienteConRevOps, RevOpsEjecucion } from '@/lib/types/revops'

export const metadata = {
  title: 'RevOps | MDK',
  description: 'Auditoría de uso del CRM y proceso comercial de los clientes',
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getRevOpsData(): Promise<{ clientes: ClienteConRevOps[]; error: string | null }> {
  const supabase = await createSupabaseClient()

  const { data: clientes, error: clientesError } = await supabase
    .from('clientes')
    .select('id, nombre_del_negocio, crm_type, ghl_location_id, activo')
    .eq('activo', true)
    .order('nombre_del_negocio')

  if (clientesError) {
    return { clientes: [], error: clientesError.message }
  }

  const { data: ejecuciones } = await supabase
    .from('revops_ejecuciones')
    .select('*')
    .order('ejecutado_en', { ascending: false })

  const result = (clientes || []).map((cliente) => {
    const ultima = (ejecuciones || []).find((e) => e.cliente_id === cliente.id) as RevOpsEjecucion | undefined
    return {
      id: cliente.id,
      nombre_del_negocio: cliente.nombre_del_negocio,
      crm_type: cliente.crm_type,
      ghl_location_id: cliente.ghl_location_id,
      ultima_ejecucion: ultima ?? null,
    }
  })

  return { clientes: result, error: null }
}

export default async function RevOpsPage() {
  const { clientes, error } = await getRevOpsData()

  if (error) {
    return (
      <main className="flex-1 bg-background p-8">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          Error al cargar clientes: {error}
        </div>
      </main>
    )
  }

  const conGhl = clientes.filter((c) => c.crm_type === 'ghl' && c.ghl_location_id)
  const analizados = clientes.filter((c) => c.ultima_ejecucion)
  const conAlertas = clientes.filter((c) => (c.ultima_ejecucion?.resumen?.alertas?.length ?? 0) > 0)
  const scorePromedio = (() => {
    const conScore = clientes.filter((c) => c.ultima_ejecucion?.score_salud != null)
    if (conScore.length === 0) return null
    return Math.round(conScore.reduce((s, c) => s + (c.ultima_ejecucion!.score_salud as number), 0) / conScore.length)
  })()

  return (
    <main className="flex-1 bg-background p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-1">RevOps</h1>
        <p className="text-sm text-muted-foreground">
          Auditoría del uso del CRM y la calidad del proceso comercial de cada cliente
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Clientes con GHL</p>
          <p className="text-2xl font-bold text-foreground">{conGhl.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Analizados</p>
          <p className="text-2xl font-bold text-foreground">{analizados.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Con alertas</p>
          <p className="text-2xl font-bold text-destructive">{conAlertas.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Score promedio</p>
          <p className="text-2xl font-bold text-foreground">{scorePromedio ?? '—'}</p>
        </div>
      </div>

      <RevOpsBoard clientes={clientes} />
    </main>
  )
}
