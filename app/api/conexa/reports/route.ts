import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  let query = supabase.from('conexa_reports').select('*').order('created_at', { ascending: false }).limit(50)
  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const reports = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    html: row.html,
    clientName: row.client_name,
    createdAt: row.created_at,
  }))
  return NextResponse.json({ reports })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { clientId, clientName, title, content, html } = body
  if (!clientName || !title || !content) {
    return NextResponse.json({ error: 'clientName, title y content son requeridos' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('conexa_reports')
    .insert({ client_id: clientId ?? null, client_name: clientName, title, content, html: html ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    report: { id: data.id, title: data.title, content: data.content, html: data.html, clientName: data.client_name, createdAt: data.created_at },
  })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  const { error } = await supabase.from('conexa_reports').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
