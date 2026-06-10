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
      .select('meta_ads_account_id')
      .eq('id', clienteId)
      .single()

    if (!cliente?.meta_ads_account_id) {
      return NextResponse.json({ forms: [] })
    }

    const accessToken = process.env.META_ADS_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN no configurado' }, { status: 500 })
    }

    const accountId = cliente.meta_ads_account_id

    // 1. Traer ads activos con formularios de lead gen
    const url = new URL(`https://graph.facebook.com/v19.0/act_${accountId}/ads`)
    url.searchParams.set('fields', 'name,creative{lead_gen_form_id},adset{name},campaign{name}')
    url.searchParams.set('effective_status', JSON.stringify(['ACTIVE']))
    url.searchParams.set('limit', '100')
    url.searchParams.set('access_token', accessToken)

    const adsRes = await fetch(url.toString())
    const adsData = await adsRes.json()

    if (adsData.error) {
      return NextResponse.json({ error: adsData.error.message }, { status: 400 })
    }

    // 2. Extraer form_ids únicos
    const formMap = new Map<string, { campana: string; adset: string }>()
    for (const ad of adsData.data || []) {
      const formId = ad.creative?.lead_gen_form_id
      if (formId && !formMap.has(formId)) {
        formMap.set(formId, {
          campana: ad.campaign?.name || 'Sin campaña',
          adset: ad.adset?.name || 'Sin ad set',
        })
      }
    }

    if (formMap.size === 0) {
      return NextResponse.json({ forms: [] })
    }

    // 3. Obtener nombre de cada formulario
    const forms = await Promise.all(
      Array.from(formMap.entries()).map(async ([formId, meta]) => {
        const formRes = await fetch(
          `https://graph.facebook.com/v19.0/${formId}?fields=name&access_token=${accessToken}`
        )
        const formData = await formRes.json()
        return {
          form_id: formId,
          nombre: formData.name || formId,
          campana: meta.campana,
          adset: meta.adset,
        }
      })
    )

    return NextResponse.json({ forms })
  } catch (error) {
    console.error('Error fetching meta forms:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
