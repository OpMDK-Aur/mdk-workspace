import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password, nombre, apellido, rol_id, puesto, departamento_id, modulos_habilitados, client_ids } = body

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
      return NextResponse.json({ error: 'Sin permisos para crear usuarios' }, { status: 403 })
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Create user with admin API (doesn't log in as the new user)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${nombre} ${apellido}`.trim() },
    })

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    const newUserId = newUser.user.id

    // Create colaborador record
    const { error: colaboradorError } = await supabaseAdmin
      .from('colaboradores')
      .upsert({
        id: newUserId,
        email,
        nombre,
        apellido,
        rol_id: rol_id || null,
        puesto: puesto || null,
        departamento_id: departamento_id || null,
        modulos_habilitados: modulos_habilitados || ['dashboard'],
        activo: true,
        onboarding_completado: true,
      })

    if (colaboradorError) {
      console.error('Error creating colaborador:', colaboradorError)
    }

    // Assign clients if provided
    if (client_ids && client_ids.length > 0) {
      await supabaseAdmin.from('user_client_access').insert(
        client_ids.map((clientId: string) => ({
          user_id: newUserId,
          client_id: clientId,
          access_level: 'read',
        }))
      )
    }

    return NextResponse.json({ success: true, userId: newUserId })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
