import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listAccessiblePages } from '@/lib/meta-ads/pages'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const pages = await listAccessiblePages()
    return NextResponse.json({ pages })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar las páginas' }, { status: 502 })
  }
}
