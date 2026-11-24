import { NextResponse } from 'next/server'
import { getAureliaViewer } from '@/lib/aurelia/access'
import { getAureliaDevData } from '@/lib/aurelia/followup'

export const dynamic = 'force-dynamic'

export async function GET() {
  const viewer = await getAureliaViewer()
  if (!viewer) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!viewer.canAccess) return NextResponse.json({ error: 'Sin acceso a Aurelia' }, { status: 403 })
  const data = await getAureliaDevData(viewer.userId)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
