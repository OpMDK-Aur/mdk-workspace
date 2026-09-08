import { NextResponse } from 'next/server'
import { createCrmClient } from '@/lib/supabase/crm'

export async function GET() {
  try {
    const crm = createCrmClient()
    const { data, error } = await crm.from('clients').select('*').limit(1).maybeSingle()

    if (error) {
      console.error('[CRM test] Error consultando clients:', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 502 })
    }

    console.log('[CRM test] Conexión correcta. Primer cliente:', data)
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('[CRM test] Error de conexión:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown CRM error' },
      { status: 500 },
    )
  }
}
