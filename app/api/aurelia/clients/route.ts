import { NextResponse } from 'next/server'
import { getAureliaViewer } from '@/lib/aurelia/access'
import { getAureliaClientOptions } from '@/lib/aurelia/crm-clients'

export const dynamic = 'force-dynamic'

export async function GET() {
  const viewer = await getAureliaViewer()
  if (!viewer) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!viewer.canAccess) return NextResponse.json({ error: 'Sin acceso a Aurelia' }, { status: 403 })
  try {
    const clients = await getAureliaClientOptions()
    // El listado cambia poco: se cachea en el navegador 5 minutos para no consultar el CRM en cada navegación.
    return NextResponse.json({ clients }, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (error) {
    console.error('[Aurelia] Error cargando clientes del CRM:', error)
    return NextResponse.json({ error: 'No se pudieron cargar los clientes del CRM' }, { status: 502 })
  }
}
