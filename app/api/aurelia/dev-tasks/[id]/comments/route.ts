import { NextResponse } from 'next/server'
import { getAureliaViewer } from '@/lib/aurelia/access'
import { getDevTaskComments } from '@/lib/aurelia/followup'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getAureliaViewer()
  if (!viewer) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!viewer.canAccess) return NextResponse.json({ error: 'Sin acceso a Aurelia' }, { status: 403 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Tarea inválida' }, { status: 400 })
  const data = await getDevTaskComments(id, viewer.userId)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
