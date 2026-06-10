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

    // For now, return mock data structure
    // TODO: Integrate with Meta Graph API when credentials available
    const mockForms = [
      {
        form_id: '123456789',
        nombre: 'Formulario de Contacto',
        campana: 'Campaña Principal',
        adset: 'Ad Set 1'
      },
      {
        form_id: '987654321',
        nombre: 'Formulario de Demo',
        campana: 'Campaña Demo',
        adset: 'Ad Set 2'
      }
    ]

    return NextResponse.json({ forms: mockForms })
  } catch (error) {
    console.error('Error fetching meta forms:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
