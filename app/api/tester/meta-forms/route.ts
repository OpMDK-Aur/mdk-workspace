import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const clienteId = searchParams.get('cliente_id')

    if (!clienteId) {
      return NextResponse.json({ error: 'cliente_id required' }, { status: 400 })
    }

    // Get Meta Ads account ID from client
    const { data: cliente } = await supabase
      .from('clientes')
      .select('meta_ads_account_id, meta_page_id')
      .eq('id', clienteId)
      .single()

    if (!cliente?.meta_page_id) {
      return NextResponse.json({ forms: [], warning: 'meta_page_id no configurado para este cliente' })
    }

    const accessToken = process.env.META_ADS_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN no configurado' }, { status: 500 })
    }

    // 1. Obtener Page Access Token desde me/accounts
    const accountsRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
    )
    const accountsData = await accountsRes.json()
    const page = accountsData.data?.find((p: any) => p.id === cliente.meta_page_id)

    if (!page) {
      return NextResponse.json({ error: 'Página no encontrada en las cuentas del token' }, { status: 404 })
    }

    // 2. Listar formularios activos de la página
    const formsRes = await fetch(
      `https://graph.facebook.com/v19.0/${cliente.meta_page_id}/leadgen_forms?fields=id,name,status&access_token=${page.access_token}`
    )
    const formsData = await formsRes.json()

    if (formsData.error) {
      console.error('[Tester] Meta API error:', JSON.stringify(formsData.error))
      return NextResponse.json({ 
        error: formsData.error.message,
        code: formsData.error.code,
        type: formsData.error.type 
      }, { status: 400 })
    }

    const forms = (formsData.data || [])
      .filter((f: any) => f.status === 'ACTIVE')
      .map((f: any) => ({
        form_id: f.id,
        nombre: f.name,
        campana: 'Lead Ads',
        adset: page.name,
      }))

    return NextResponse.json({ forms })
  } catch (error) {
    console.error('Error fetching meta forms:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
