import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { user_id, client_ids } = body

    // Verify the current user is authenticated and has permission
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Check if current user has admin privileges
    const { data: currentUser } = await supabase
      .from('colaboradores')
      .select('rol_id, roles(nombre)')
      .eq('id', user.id)
      .single()

    const roleName = (currentUser?.roles as { nombre: string } | null)?.nombre?.toLowerCase()
    if (!['master', 'administrador', 'direccion', 'project_manager', 'account_manager'].includes(roleName || '')) {
      return NextResponse.json({ error: 'Sin permisos para asignar clientes' }, { status: 403 })
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Delete existing assignments for this user
    const { error: deleteError } = await supabaseAdmin
      .from('user_client_access')
      .delete()
      .eq('user_id', user_id)

    if (deleteError) {
      console.error('Error deleting client access:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 400 })
    }

    // Insert new assignments
    if (client_ids && client_ids.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('user_client_access')
        .insert(
          client_ids.map((clientId: string) => ({
            user_id,
            client_id: clientId,
            access_level: 'read',
          }))
        )

      if (insertError) {
        console.error('Error inserting client access:', insertError)
        return NextResponse.json({ error: insertError.message }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating user client access:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// Toggle single client assignment
export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { user_id, client_id, action } = body // action: 'add' | 'remove'

    // Verify the current user is authenticated and has permission
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Check if current user has admin privileges
    const { data: currentUser } = await supabase
      .from('colaboradores')
      .select('rol_id, roles(nombre)')
      .eq('id', user.id)
      .single()

    const roleName = (currentUser?.roles as { nombre: string } | null)?.nombre?.toLowerCase()
    if (!['master', 'administrador', 'direccion', 'project_manager', 'account_manager'].includes(roleName || '')) {
      return NextResponse.json({ error: 'Sin permisos para asignar clientes' }, { status: 403 })
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (action === 'remove') {
      const { error } = await supabaseAdmin
        .from('user_client_access')
        .delete()
        .eq('user_id', user_id)
        .eq('client_id', client_id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    } else {
      const { error } = await supabaseAdmin
        .from('user_client_access')
        .insert({ user_id, client_id, access_level: 'read' })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error toggling user client access:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
