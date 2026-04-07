import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const plan = searchParams.get('plan')

    // Get user profile to check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    let query = supabase.from('clients').select('*')

    // If not direccion, filter by user access
    if (profile?.role !== 'direccion') {
      const { data: access } = await supabase
        .from('user_client_access')
        .select('client_id')
        .eq('user_id', user.id)

      const clientIds = access?.map(a => a.client_id) || []
      if (clientIds.length > 0) {
        query = query.in('id', clientIds)
      } else {
        return NextResponse.json({ clients: [] })
      }
    }

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }
    if (plan) {
      query = query.eq('plan', plan)
    }

    const { data: clients, error } = await query.order('business_name')

    if (error) {
      console.error('Error fetching clients:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ clients })
  } catch (error) {
    console.error('Clients API Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      business_name,
      contact_name,
      contact_lastname,
      phone,
      status,
      plan,
      google_ads_customer_id,
      meta_ads_account_id,
      fee_mdk,
      fee_aurelia,
    } = body

    if (!business_name) {
      return NextResponse.json(
        { error: 'business_name is required' },
        { status: 400 }
      )
    }

    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        business_name,
        contact_name,
        contact_lastname,
        phone,
        status,
        plan: plan || 'Esencial',
        google_ads_customer_id,
        meta_ads_account_id,
        fee_mdk,
        fee_aurelia,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating client:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log activity
    await supabase.from('activity_log').insert({
      user_id: user.id,
      client_id: client.id,
      action: 'create_client',
      description: `Cliente ${business_name} creado`,
    })

    return NextResponse.json({ client })
  } catch (error) {
    console.error('Create Client Error:', error)
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    )
  }
}
