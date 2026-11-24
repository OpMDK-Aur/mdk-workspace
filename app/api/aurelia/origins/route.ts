import { NextResponse } from 'next/server'
import { getAureliaViewer } from '@/lib/aurelia/access'
import { getAureliaOrigins } from '@/lib/aurelia/origins'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const viewer = await getAureliaViewer()
  if (!viewer) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!viewer.canAccess) return NextResponse.json({ error: 'Sin acceso a Aurelia' }, { status: 403 })
  const data = await getAureliaOrigins()
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
