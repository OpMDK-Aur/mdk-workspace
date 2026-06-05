import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { slug, system_prompt, parametros, comportamiento } = await req.json()

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('agentes_config')
      .update({
        system_prompt,
        parametros,
        comportamiento,
        actualizado_por: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('slug', slug)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating agent config:', error)
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }
}
