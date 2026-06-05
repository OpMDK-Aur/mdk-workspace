import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { userId, email, password, nombre, apellido, rol_id, puesto, modulos_habilitados, activo } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

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
    if (!['master', 'administrador', 'direccion'].includes(roleName || '')) {
      return NextResponse.json({ error: 'Sin permisos para editar usuarios' }, { status: 403 })
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Update auth user if email or password changed
    const authUpdates: { email?: string; password?: string; user_metadata?: Record<string, string> } = {}
    
    if (email) {
      authUpdates.email = email
    }
    
    if (password && password.length >= 6) {
      authUpdates.password = password
    }

    if (nombre || apellido) {
      authUpdates.user_metadata = { full_name: `${nombre || ''} ${apellido || ''}`.trim() }
    }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdates)
      
      if (authError) {
        console.error('Error updating auth user:', authError)
        // Don't fail completely if auth update fails, continue with colaborador update
      }
    }

    // Update colaborador record
    const colaboradorUpdates: Record<string, unknown> = {}
    
    if (nombre !== undefined) colaboradorUpdates.nombre = nombre
    if (apellido !== undefined) colaboradorUpdates.apellido = apellido
    if (email !== undefined) colaboradorUpdates.email = email
    if (rol_id !== undefined) colaboradorUpdates.rol_id = rol_id || null
    if (puesto !== undefined) colaboradorUpdates.puesto = puesto || null
    if (modulos_habilitados !== undefined) colaboradorUpdates.modulos_habilitados = modulos_habilitados
    if (activo !== undefined) colaboradorUpdates.activo = activo

    if (Object.keys(colaboradorUpdates).length > 0) {
      const { error: colaboradorError } = await supabaseAdmin
        .from('colaboradores')
        .update(colaboradorUpdates)
        .eq('id', userId)

      if (colaboradorError) {
        console.error('Error updating colaborador:', colaboradorError)
        return NextResponse.json({ error: colaboradorError.message }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

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
    if (roleName !== 'master') {
      return NextResponse.json({ error: 'Solo Master puede eliminar usuarios' }, { status: 403 })
    }

    // Prevent self-deletion
    if (userId === user.id) {
      return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 })
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Deactivate colaborador (soft delete)
    await supabaseAdmin
      .from('colaboradores')
      .update({ activo: false })
      .eq('id', userId)

    // Optionally delete auth user completely (hard delete)
    // const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
