import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cuentas_publicitarias')
    .select('id, plataforma, id_cuenta, nombre_cuenta, activo')
    .eq('cliente_id', clientId)
    .eq('activo', true)
    .order('plataforma', { ascending: true })

  if (error) {
    console.error('[analista/cuentas] Error:', error)
    return NextResponse.json({ error: 'No se pudieron obtener las cuentas publicitarias' }, { status: 500 })
  }

  return NextResponse.json({ cuentas: data || [] })
}