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

    const accessToken = process.env.META_ADS_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN no configurado' }, { status: 500 })
    }

    const { data: cliente } = await supabase
      .from('clientes')
      .select('meta_ads_account_id, meta_page_id')
      .eq('id', clienteId)
      .single()

    if (!cliente?.meta_page_id) {
      return NextResponse.json({ forms: [], warning: 'meta_page_id no configurado para este cliente' })
    }

    // Obtener Page Access Token desde me/accounts
    const accountsRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?limit=100&access_token=${accessToken}`
    )
    const accountsData = await accountsRes.json()
    const page = accountsData.data?.find((p: any) => p.id === cliente.meta_page_id)

    if (!page) {
      return NextResponse.json({ error: 'Página no encontrada. Agregala al Business Manager de MDK.' }, { status: 404 })
    }

    // Listar formularios activos de la página
    const formsRes = await fetch(
      `https://graph.facebook.com/v19.0/${cliente.meta_page_id}/leadgen_forms?fields=id,name,status&limit=50&access_token=${page.access_token}`
    )
    const formsData = await formsRes.json()

    if (formsData.error) {
      return NextResponse.json({ error: formsData.error.message }, { status: 400 })
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
